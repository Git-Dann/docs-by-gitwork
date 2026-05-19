"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-[8px] bg-[#4f46e5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338ca] transition"
    >
      Download PDF
    </button>
  );
}
