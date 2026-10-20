import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
} from "pdf-lib";
import { createDemoResult } from "./demo";
import { createInspectionPdf } from "./pdf";
import { EXAMPLE_NOTE } from "./report-notes";

// Read the actual text operators using the embedded font's Unicode map.
// This report uses one font, bfchar mappings, and hexadecimal Tj operators.
function reportText(doc: PDFDocument, unicode: PDFRawStream) {
  const cmap = Buffer.from(decodePDFRawStream(unicode).decode()).toString();
  const characters = new Map(
    [...cmap.matchAll(/<([\da-f]{4})>\s+<([\da-f]+)>/gi)].map(([, glyph, value]) => [
      glyph.toUpperCase(),
      (value.match(/.{4}/g) ?? []).map((unit) => String.fromCharCode(parseInt(unit, 16))).join(""),
    ]),
  );
  return doc
    .getPages()
    .map((page) => {
      const contents = page.node.Contents();
      if (!(contents instanceof PDFArray)) throw new Error("Missing page contents");
      return contents
        .asArray()
        .map((ref) => {
          const stream = doc.context.lookup(ref);
          if (!(stream instanceof PDFRawStream)) throw new Error("Missing text stream");
          const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString();
          return [...operators.matchAll(/<([\da-f]+)>\s+Tj/gi)]
            .map(([, hex]) =>
              (hex.match(/.{4}/g) ?? [])
                .map((id) => characters.get(id.toUpperCase()) ?? "�")
                .join(""),
            )
            .join("\n");
        })
        .join("\n");
    })
    .join("\n");
}

describe("PDF report generation", () => {
  it("creates a readable A4 PDF with an embedded Unicode font and reference links", async () => {
    const font = await readFile("public/fonts/MPLUS1p-Regular.ttf");
    const result = createDemoResult();
    const bytes = await createInspectionPdf(result, font);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("demo.example.com 診断結果");
    expect(doc.getSubject()).toBe("デモデータ・実サイトへの通信なし");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1 + result.checks.length);
    const pages = doc.getPages();
    for (const page of pages) {
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
    const resources = pages[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    const embedded = resources.lookup(resources.keys()[0], PDFDict);
    const unicode = embedded.lookup(PDFName.of("ToUnicode"));
    expect(unicode).toBeInstanceOf(PDFRawStream);
    if (!(unicode instanceof PDFRawStream)) throw new Error("Missing Unicode map");
    expect(unicode.getContentsSize()).toBeGreaterThan(0);
    const descendant = embedded.lookup(PDFName.of("DescendantFonts"), PDFArray).lookup(0, PDFDict);
    const descriptor = descendant.lookup(PDFName.of("FontDescriptor"), PDFDict);
    const fontFile = descriptor.lookup(PDFName.of("FontFile2"));
    expect(fontFile).toBeInstanceOf(PDFRawStream);
    if (!(fontFile instanceof PDFRawStream)) throw new Error("Missing embedded TrueType program");
    // Regression: an apparently valid subset PDF had readable text extraction
    // but missing visible glyphs. Embed the complete, original TrueType program.
    expect(Buffer.from(decodePDFRawStream(fontFile).decode())).toEqual(font);
    expect(pages.filter((p) => p.node.Annots()?.size())).toHaveLength(result.checks.length);

    // Check details in the exported PDF itself, including the CSP explanation,
    // observed policy, risk, recommendation, example, and official reference.
    const compact = (value: string) => value.replace(/\s/g, "");
    const text = compact(reportText(doc, unicode));
    for (const label of [
      "概要",
      "確認した設定値",
      "この設定の意味",
      "想定されるリスク",
      "推奨する改善方法",
      "設定例",
      "公式ドキュメントで詳しく読む",
      EXAMPLE_NOTE,
    ]) {
      expect(text).toContain(compact(label));
    }
    const referenceLinks = pages.flatMap((page) =>
      (page.node.Annots()?.asArray() ?? []).map((ref) => {
        const annotation = doc.context.lookup(ref, PDFDict);
        return annotation
          .lookup(PDFName.of("A"), PDFDict)
          .lookup(PDFName.of("URI"), PDFString)
          .decodeText();
      }),
    );
    for (const check of result.checks) {
      for (const value of [
        check.name,
        check.summary,
        check.observed,
        check.meaning,
        check.risk,
        check.recommendation,
        check.example,
        check.reference,
      ]) {
        if (value) expect(text).toContain(compact(value));
      }
      expect(referenceLinks).toContain(check.reference);
    }
  }, 20_000);

  it("honors cancellation before creating or exporting a report", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createInspectionPdf(createDemoResult(), new Uint8Array(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
