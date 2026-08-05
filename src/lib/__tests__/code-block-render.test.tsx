import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { codeSnippetSection } from "@/lib/sections/code-snippet";

const FIELDS = [
  "customer_id,make,model,variant,year",
  "registration_number,chassis_number,serial_number",
  "vehicle_type,warranty_status,warranty_expiry,ref_id",
].join("\n");

function render(data: Record<string, unknown>) {
  const P = codeSnippetSection.Preview as unknown as (p: Record<string, unknown>) => ReactElement;
  return renderToStaticMarkup(<P data={data} proposal={{}} section={{}} editable={false} onChange={() => {}} />);
}

describe("code block", () => {
  it("renders every field name from a real ingestion field list", () => {
    const html = render({ language: "CSV", filename: "vehicles.csv", code: FIELDS });
    for (const field of ["customer_id","make","model","variant","year","registration_number","chassis_number","serial_number","vehicle_type","warranty_status","warranty_expiry","ref_id"]) {
      expect(html, field).toContain(field);
    }
    expect(html).toContain("vehicles.csv");
  });

  it("wraps by default, so nothing is clipped when printed", () => {
    expect(render({ code: FIELDS })).toContain("whitespace-pre-wrap");
  });

  it("scrolls instead when wrapping is turned off", () => {
    expect(render({ code: FIELDS, wrapLines: false })).toContain("overflow-x-auto");
  });

  it("hides the copy button in print", () => {
    expect(render({ code: FIELDS })).toContain("print:hidden");
  });

  it("shows line numbers only when asked", () => {
    expect(render({ code: FIELDS, showLineNumbers: true })).toContain("select-none");
    expect(render({ code: FIELDS })).not.toContain("select-none");
  });

  it("prompts rather than rendering an empty frame", () => {
    expect(render({ code: "   " })).toContain("Empty block");
  });
});
