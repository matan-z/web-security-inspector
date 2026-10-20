import type { InspectionResult } from "./types";

function dateParts(inspectedAt: string) {
  const date = new Date(inspectedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("診断日時が正しくありません。");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === name)!.value;
  return {
    year: part("year").padStart(4, "0"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

export function pdfFilename(result: Pick<InspectionResult, "url" | "inspectedAt">): string {
  const { year, month, day, hour, minute } = dateParts(result.inspectedAt);
  const host =
    new URL(result.url).hostname
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
      .replace(/[.\s]+$/g, "")
      .slice(0, 160) || "site";
  return `${year}-${month}${day}-${hour}${minute}_${host}_診断結果.pdf`;
}

export function pdfInspectionDate(inspectedAt: string): string {
  const { year, month, day, hour, minute, second } = dateParts(inspectedAt);
  return `${year}/${month}/${day} ${hour}:${minute}:${second} JST (Asia/Tokyo)`;
}
