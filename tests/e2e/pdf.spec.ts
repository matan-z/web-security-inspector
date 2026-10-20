import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

test("PDF downloads all checks from a filtered demo without another inspection", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(60_000);
  const unexpected: string[] = [];
  let fontRequests = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith(baseURL!) ||
      /\/api\/(visitor\/)?inspect(?:\?|$)/.test(request.url()) ||
      request.method() === "POST"
    )
      unexpected.push(request.url());
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/fonts/MPLUS1p-Regular.ttf", async (route) => {
    fontRequests++;
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "デモを試す", exact: false }).last().click();
  await expect(page.getByRole("button", { name: "PDFをダウンロード", exact: true })).toBeVisible();
  expect(fontRequests).toBe(0);
  await page.getByRole("button", { name: /改善が必要/ }).click();
  await page.getByLabel("カテゴリで絞り込む").selectOption("cookies");
  await expect(page.getByRole("button", { name: /^HTTPS/ })).toHaveCount(0);
  const downloading = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: "PDFをダウンロード", exact: true }).click();
  const busy = page.getByRole("button", { name: "PDF作成中…", exact: true });
  await expect(busy).toBeDisabled();
  await expect.poll(() => fontRequests).toBe(1);
  await busy.evaluate((button: HTMLButtonElement) => button.click());
  expect(fontRequests).toBe(1);
  release();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("2026-1001-1200_demo.example.com_診断結果.pdf");
  const saved = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  const pdf = await PDFDocument.load(await readFile(saved));
  expect(pdf.getTitle()).toBe("demo.example.com 診断結果");
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(12);
  expect(pdf.getPages().filter((p) => p.node.Annots()?.size())).toHaveLength(11);
  await expect(page.getByRole("button", { name: "PDFをダウンロード", exact: true })).toBeEnabled();
  await page
    .getByRole("region", { name: "診断結果" })
    .screenshot({ path: testInfo.outputPath("pdf-download.png") });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
  const jsonEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONをダウンロード" }).click();
  const jsonDownload = await jsonEvent;
  expect(JSON.parse(await readFile((await jsonDownload.path())!, "utf8")).checks).toHaveLength(11);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("PDF font failure displays a Japanese error and allows retry", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/fonts/MPLUS1p-Regular.ttf", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "デモを試す", exact: false }).last().click();
  await page.getByRole("button", { name: "PDFをダウンロード", exact: true }).click();
  const report = page.getByRole("region", { name: "診断結果" });
  await expect(report.getByRole("alert")).toContainText("PDFを作成できませんでした。");
  await expect(page.getByRole("button", { name: "PDFをダウンロード", exact: true })).toBeEnabled();
  await page.unroute("**/fonts/MPLUS1p-Regular.ttf");
  const download = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: "PDFをダウンロード", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("2026-1001-1200_demo.example.com_診断結果.pdf");
  await expect(report.getByRole("alert")).toHaveCount(0);
});
