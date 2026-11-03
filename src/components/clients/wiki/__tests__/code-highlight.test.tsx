// @vitest-environment jsdom
/**
 * Syntax colours shared by the version viewer and the compare view, including colours that
 * survive an emphasis range cutting through a token.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { HighlightedLine, NumberedCode, segmentLine, tokenLines } from "../code-highlight";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  document.body.innerHTML = "";
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => createRoot(host).render(node));
  return host;
}

describe("segmentLine", () => {
  const line = "  Serial.begin(115200);";

  it("gives back the line exactly, with and without a mark", () => {
    expect(segmentLine(line, null).map((s) => s.v).join("")).toBe(line);
    expect(segmentLine(line, { start: 15, end: 21 }).map((s) => s.v).join("")).toBe(line);
  });

  it("splits a token the mark cuts through, keeping its colour on both sides", () => {
    // Mark "1520": cuts the number token 115200 in two places.
    const segs = segmentLine(line, { start: 16, end: 20 }).filter((s) => s.t === "num");
    expect(segs).toEqual([
      { t: "num", v: "1", marked: false },
      { t: "num", v: "1520", marked: true },
      { t: "num", v: "0", marked: false },
    ]);
  });

  it("marks exactly the range", () => {
    const marked = segmentLine(line, { start: 15, end: 21 }).filter((s) => s.marked).map((s) => s.v).join("");
    expect(marked).toBe("115200");
  });
});

describe("tokenLines", () => {
  it("colours every line of a block comment, and ends cleanly on a final newline", () => {
    const lines = tokenLines("/* one\n two */\nint x;\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].map((t) => t.t)).toEqual(["com"]);
    expect(lines[1].map((t) => t.t)).toEqual(["com"]);
    expect(lines[2].map((t) => t.t)).toContain("kw");
  });
});

describe("rendering", () => {
  it("draws a mark around the changed part, with the colour inside it", async () => {
    const host = await render(<HighlightedLine text="  Serial.begin(115200);" mark={{ start: 15, end: 21 }} />);
    const mark = host.querySelector("mark")!;
    expect(mark.textContent).toBe("115200");
    expect(mark.querySelector(".wch-num")).not.toBeNull();
  });

  it("numbers every line", async () => {
    const host = await render(<NumberedCode code={"a\nb\nc\n"} />);
    expect(host.querySelector("[data-line-numbers]")?.textContent).toBe("1\n2\n3");
  });
});
