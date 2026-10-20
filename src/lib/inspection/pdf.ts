import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFString, PageSizes, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfFilename, pdfInspectionDate } from "./pdf-filename";
import {
  DEMO_NOTICE,
  EXAMPLE_NOTE,
  httpStatusNotice,
  REDIRECT_NOTICE,
  REPORT_SCOPE_NOTE,
  SCORE_DISCLAIMER,
} from "./report-notes";
import { STATUS_LABELS, summarize, type CheckStatus, type InspectionResult } from "./types";

const MARGIN = 44;
const BOTTOM = 60;
const BODY_SIZE = 10;
const LEADING = 16;
const INK = rgb(0.12, 0.17, 0.23);
const MUTED = rgb(0.35, 0.4, 0.46);
const ACCENT = rgb(0.04, 0.4, 0.5);
const BORDER = rgb(0.83, 0.87, 0.89);
const CODE_BG = rgb(0.95, 0.97, 0.98);
// The same green / amber / red hues as the UI, darkened for white paper.
const COLORS = {
  pass: rgb(0.08, 0.43, 0.3),
  warn: rgb(0.56, 0.35, 0.04),
  fail: rgb(0.68, 0.17, 0.24),
  na: MUTED,
  unknown: MUTED,
};

/** Character-level wrapping also handles long header values and unbroken URLs. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  const widths = new Map<string, number>();
  for (const paragraph of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let line = "";
    let measured = 0;
    for (const char of paragraph.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")) {
      let advance = widths.get(char);
      if (advance === undefined) {
        advance = font.widthOfTextAtSize(char, size);
        widths.set(char, advance);
      }
      if (line && measured + advance > width) {
        lines.push(line);
        line = "";
        measured = 0;
      }
      line += char;
      measured += advance;
    }
    lines.push(line);
  }
  return lines;
}

class ReportLayout {
  page!: PDFPage;
  y = 0;
  continuation = "診断概要";
  readonly width = PageSizes.A4[0] - MARGIN * 2;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly signal?: AbortSignal,
  ) {}

  newPage(continued = false) {
    this.signal?.throwIfAborted();
    this.page = this.doc.addPage(PageSizes.A4);
    const height = this.page.getHeight();
    this.page.drawText("Web Security Inspector", {
      x: MARGIN,
      y: height - 33,
      size: 10,
      font: this.font,
      color: ACCENT,
    });
    this.page.drawLine({
      start: { x: MARGIN, y: height - 44 },
      end: { x: MARGIN + this.width, y: height - 44 },
      color: BORDER,
      thickness: 0.7,
    });
    this.y = height - 65;
    if (continued) this.text(`${this.continuation}（続き）`, 11, ACCENT);
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage(true);
  }

  text(value: string, size = BODY_SIZE, color = INK) {
    for (const line of wrap(value, this.font, size, this.width - 2)) {
      this.ensure(size + 7);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        font: this.font,
        size,
        color,
      });
      this.y -= size + 7;
    }
    this.y -= 5;
  }

  field(label: string, value: string, code = false, uri?: string) {
    const padding = code ? 10 : 0;
    const size = code ? 9 : BODY_SIZE;
    const lines = wrap(value, this.font, size, this.width - 2 * padding - 2);
    const labelHeight = 22;
    const totalHeight = labelHeight + lines.length * LEADING + padding * 2 + 12;
    // Keep a field together whenever it fits on a fresh page.
    const freshCapacity = PageSizes.A4[1] - 100 - BOTTOM;
    this.ensure(Math.min(totalHeight, freshCapacity));
    let offset = 0;
    do {
      this.ensure(labelHeight + LEADING + padding * 2);
      this.text(offset ? `${label}（続き）` : label, 10, ACCENT);
      const count = Math.max(1, Math.floor((this.y - BOTTOM - 2 * padding) / LEADING));
      const chunk = lines.slice(offset, offset + count);
      const height = chunk.length * LEADING + padding * 2;
      if (code) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - height,
          width: this.width,
          height,
          color: CODE_BG,
          borderColor: BORDER,
          borderWidth: 0.5,
        });
      }
      for (let index = 0; index < chunk.length; index++) {
        const line = chunk[index];
        const x = MARGIN + padding;
        const y = this.y - padding - size - index * LEADING;
        this.page.drawText(line, { x, y, size, font: this.font, color: uri ? ACCENT : INK });
        if (uri && line) {
          const link = this.doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [x, y - 2, x + this.font.widthOfTextAtSize(line, size), y + size],
            Border: [0, 0, 0],
            A: { Type: "Action", S: "URI", URI: PDFString.of(uri) },
          });
          this.page.node.addAnnot(this.doc.context.register(link));
        }
      }
      this.y -= height + 12;
      offset += chunk.length;
      if (offset < lines.length) this.newPage(true);
    } while (offset < lines.length);
  }

  footer() {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: MARGIN, y: 42 },
        end: { x: MARGIN + this.width, y: 42 },
        color: BORDER,
        thickness: 0.5,
      });
      page.drawText("Web Security Inspector / 設定診断レポート", {
        x: MARGIN,
        y: 25,
        size: 8,
        font: this.font,
        color: MUTED,
      });
      const number = `${index + 1} / ${pages.length}`;
      page.drawText(number, {
        x: MARGIN + this.width - this.font.widthOfTextAtSize(number, 8),
        y: 25,
        size: 8,
        font: this.font,
        color: MUTED,
      });
    });
  }
}

export async function createInspectionPdf(
  result: InspectionResult,
  fontBytes: ArrayBuffer | Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full TrueType embedding preserves Japanese glyphs across PDF viewers.
  // fontkit subsetting can leave missing outlines despite a valid Unicode map.
  const font = await doc.embedFont(fontBytes, { subset: false });
  doc.setTitle(`${new URL(result.url).hostname} 診断結果`);
  doc.setCreator("Web Security Inspector");
  doc.setSubject(result.mode === "demo" ? "デモデータ・実サイトへの通信なし" : "実サイト診断");
  doc.setLanguage("ja-JP");
  const layout = new ReportLayout(doc, font, signal);
  const { counts, score, evaluated } = summarize(result.checks);
  layout.newPage();
  layout.text("Webサイト セキュリティ診断結果", 20);
  layout.text(
    result.mode === "demo" ? "デモデータ・実サイトへの通信なし" : "実サイト診断",
    11,
    ACCENT,
  );
  layout.y -= 10;
  layout.field("対象URL", result.url);
  layout.field(
    result.mode === "demo" ? "サンプル日時（架空の診断条件）" : "診断日時",
    pdfInspectionDate(result.inspectedAt),
  );
  layout.text(
    `HTTP ${result.httpStatus}  /  応答時間 ${result.durationMs} ms  /  全${result.checks.length}項目`,
    9,
    MUTED,
  );
  layout.y -= 6;
  layout.text(`参考スコア  ${score === null ? "評価対象なし" : `${score} / 100`}`, 20, ACCENT);
  layout.text(`判定できた${evaluated}項目の参考スコアです。${SCORE_DISCLAIMER}。`, 9, MUTED);
  layout.y -= 8;
  for (const status of ["pass", "warn", "fail", "na", "unknown"] as CheckStatus[]) {
    layout.text(`${STATUS_LABELS[status]}：${counts[status]}項目`, 11, COLORS[status]);
  }
  layout.y -= 8;
  if (result.mode === "demo") layout.field("デモについて", DEMO_NOTICE);
  if (result.redirected) layout.field("リダイレクトについて", REDIRECT_NOTICE);
  if (result.httpStatus < 200 || result.httpStatus >= 400)
    layout.field("HTTPステータスについて", httpStatusNotice(result.httpStatus));
  layout.field("診断範囲・参考スコアについて", REPORT_SCOPE_NOTE);

  for (const [index, check] of result.checks.entries()) {
    // Yield between checks, allowing the busy UI, logout, and cancellation to run.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    layout.continuation = check.name;
    layout.newPage();
    layout.text(`検査項目 ${index + 1} / ${result.checks.length}`, 9, MUTED);
    layout.text(check.name, 17);
    layout.text(check.subtitle, 10, MUTED);
    const severity = { high: "高", medium: "中", low: "低" }[check.severity];
    layout.text(
      `判定：${STATUS_LABELS[check.status]}  /  重要度：${severity}`,
      11,
      COLORS[check.status],
    );
    layout.y -= 8;
    layout.field("概要", check.summary);
    layout.field("確認した設定値", check.observed, true);
    layout.field("この設定の意味", check.meaning);
    layout.field("想定されるリスク", check.risk);
    layout.field("推奨する改善方法", check.recommendation);
    if (check.example) {
      layout.field("設定例", check.example, true);
      layout.text(EXAMPLE_NOTE, 9, MUTED);
    }
    let uri: string | undefined;
    try {
      const url = new URL(check.reference);
      if (["https:", "http:"].includes(url.protocol)) uri = url.href;
    } catch {
      /* Invalid links are rendered as text only. */
    }
    layout.field("公式ドキュメントで詳しく読む", check.reference, false, uri);
  }
  layout.footer();
  signal?.throwIfAborted();
  return doc.save();
}

export async function downloadInspectionPdf(result: InspectionResult, signal: AbortSignal) {
  const response = await fetch("/fonts/MPLUS1p-Regular.ttf", {
    signal,
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("PDF用フォントを取得できませんでした。");
  const bytes = await createInspectionPdf(result, await response.arrayBuffer(), signal);
  signal.throwIfAborted();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = pdfFilename(result);
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give mobile browsers time to start consuming the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
