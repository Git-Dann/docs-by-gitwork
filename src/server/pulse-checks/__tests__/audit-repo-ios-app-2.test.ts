import { describe, it, expect } from "vitest";
import { evaluateIosChecks } from "../ios-app";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const urlCache = (files: Record<string, string>) =>
  evaluateIosChecks(snapshot(files)).find((c) => c.checkKey === "ios_url_cache")!;

// Taken from NetNewsWire Modules/RSWeb/Sources/RSWeb/WebServices/URLSession+Webservice.swift
const NNW_SESSION = `import Foundation
extension URLSession {
	public static func makeWebserviceSession() -> URLSession {
		let sessionConfiguration = URLSessionConfiguration.default
		sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
		sessionConfiguration.timeoutIntervalForRequest = 60.0
		sessionConfiguration.httpCookieStorage = nil
		sessionConfiguration.urlCache = nil
		return URLSession(configuration: sessionConfiguration)
	}
}
`;

// Taken from NetNewsWire HTTPRequestHeader.swift / HTTPConditionalGetInfo.swift
const NNW_CONDITIONAL_GET = `public struct HTTPRequestHeader {
	public static let ifModifiedSince = "If-Modified-Since"
	public static let ifNoneMatch = "If-None-Match" // Etag
}
public struct HTTPConditionalGetInfo {
	public func addRequestHeadersToURLRequest(_ urlRequest: inout URLRequest) {
		if let etag = etag {
			urlRequest.addValue(etag, forHTTPHeaderField: HTTPRequestHeader.ifNoneMatch)
		}
	}
}
`;

describe("ios_url_cache — a disabled cache is not a configured cache", () => {
  it("no longer PASSes urlCache = nil + reloadIgnoringLocalCacheData as 'cache policy configured'", () => {
    const c = urlCache({ "RSWeb/URLSession+Webservice.swift": NNW_SESSION });
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/explicitly disabled/);
  });

  it("PASSes a deliberate no-cache design that revalidates with conditional GET, and says so", () => {
    const c = urlCache({
      "RSWeb/URLSession+Webservice.swift": NNW_SESSION,
      "RSWeb/HTTPConditionalGetInfo.swift": NNW_CONDITIONAL_GET,
    });
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/conditional GET/);
    expect(c.detail).not.toMatch(/cache policy is configured/);
  });

  it("still PASSes a real on-disk URLCache (must not regress)", () => {
    const c = urlCache({
      "App/APIClient.swift": `final class APIClient {
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 20_000_000, diskCapacity: 200_000_000, diskPath: "api")
        config.requestCachePolicy = .returnCacheDataElseLoad
        return URLSession(configuration: config)
    }()
}`,
    });
    expect(c.status).toBe("PASS");
  });

  it("still WARNs a URLSession.shared-only app, without claiming an unobserved 'refetched constantly' consequence", () => {
    // Shape of IceCubesApp MastodonClient.swift
    const c = urlCache({
      "NetworkClient/MastodonClient.swift": `public final class MastodonClient {
  private let urlSession: URLSession
  public init(server: String) {
    urlSession = URLSession.shared
  }
  public func get(_ request: URLRequest) async throws -> Data {
    let (data, _) = try await urlSession.data(for: request)
    return data
  }
}`,
    });
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/No URLCache or URLSessionConfiguration cache sizing found/);
    expect(c.detail).not.toMatch(/memory-biased|refetched constantly/);
    expect(c.detail).toMatch(/Cache-Control/);
  });

  it("does not treat a per-request reloadIgnoringLocalCacheData as the app disabling its cache", () => {
    const c = urlCache({
      "App/Refresh.swift": `import Foundation
func refresh(_ u: URL, etag: String) async throws -> Data {
  var r = URLRequest(url: u, cachePolicy: .reloadIgnoringLocalCacheData)
  r.setValue(etag, forHTTPHeaderField: "If-None-Match")
  let (data, _) = try await URLSession.shared.data(for: r)
  return data
}`,
    });
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/No URLCache or URLSessionConfiguration cache sizing found/);
    expect(c.detail).not.toMatch(/explicitly disabled/);
  });
});
