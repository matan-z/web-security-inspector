import { describe, expect, it } from "vitest";
import { pdfFilename, pdfInspectionDate } from "./pdf-filename";

describe("PDF filename and report timestamp", () => {
  it("uses the inspection time in JST and the full hostname, excluding paths", () => {
    const result = {
      inspectedAt: "2026-10-20T05:30:59.000Z",
      url: "https://shop.example.com/private/path",
    };
    expect(pdfFilename(result)).toBe("2026-1020-1430_shop.example.com_診断結果.pdf");
    expect(pdfInspectionDate(result.inspectedAt)).toBe("2026/10/20 14:30:59 JST (Asia/Tokyo)");
  });

  it("handles the JST year boundary, midnight, and zero padding", () => {
    expect(pdfFilename({ url: "https://example.com", inspectedAt: "2025-12-31T15:00:00Z" })).toBe(
      "2026-0101-0000_example.com_診断結果.pdf",
    );
    expect(
      pdfFilename({ url: "https://www.example.com", inspectedAt: "2026-01-02T18:04:00Z" }),
    ).toBe("2026-0103-0304_www.example.com_診断結果.pdf");
  });

  it("replaces filename-unsafe hostname characters and rejects invalid timestamps", () => {
    expect(
      pdfFilename({ url: "https://[2001:db8::1]/", inspectedAt: "2026-10-20T05:30:00Z" }),
    ).toBe("2026-1020-1430_[2001_db8__1]_診断結果.pdf");
    expect(() => pdfFilename({ url: "https://example.com", inspectedAt: "invalid" })).toThrow();
  });
});
