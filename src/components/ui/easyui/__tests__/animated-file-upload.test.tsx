// @vitest-environment jsdom
/**
 * EasyUI's Animated File Upload as Foundry uses it: the real upload decides the outcome
 * (no simulated "Ready"), a failure shows the server's message, and a picked file that is
 * removed is reported back.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AnimatedFileUpload } from "../animated-file-upload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return host;
}

async function choose(host: HTMLElement, file: File) {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const pdf = () => new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" });

describe("AnimatedFileUpload", () => {
  it("shows Ready only once the real upload resolves", async () => {
    let finish!: () => void;
    const handler = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const host = mount(<AnimatedFileUpload uploadHandler={handler} />);
    await choose(host, pdf());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("Ready");
    await act(async () => finish());
    expect(host.textContent).toContain("Ready");
  });

  it("shows the server's message when the upload fails", async () => {
    const host = mount(<AnimatedFileUpload uploadHandler={async () => Promise.reject(new Error("That file doesn't look like a real .pdf"))} />);
    await choose(host, pdf());
    expect(host.textContent).toContain("doesn't look like a real .pdf");
  });

  it("refuses an oversized file without uploading it", async () => {
    const handler = vi.fn(async () => undefined);
    const host = mount(<AnimatedFileUpload uploadHandler={handler} maxSize={4} />);
    await choose(host, pdf());
    expect(handler).not.toHaveBeenCalled();
    expect(host.textContent).toContain("exceeds maximum allowed size");
  });

  it("tells a picker when its file is taken back out", async () => {
    const removed = vi.fn();
    const host = mount(<AnimatedFileUpload uploadHandler={async () => undefined} onFileRemoved={removed} />);
    await choose(host, pdf());
    const remove = host.querySelector('button[aria-label="Remove contract.pdf"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(removed).toHaveBeenCalledWith(expect.objectContaining({ name: "contract.pdf" }));
  });
});
