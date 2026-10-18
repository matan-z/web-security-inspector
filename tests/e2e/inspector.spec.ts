import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("demo, details, filters and JSON export work without an inspection request", async ({
  page,
  baseURL,
}, testInfo) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/inspect") || !request.url().startsWith(baseURL!))
      requests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Webサイトの安全を");
  await expect(page.getByRole("button", { name: "診断を開始" })).toBeDisabled();
  const setup = page.getByRole("region", { name: "許可ドメインの管理" });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole("heading", { name: "ブラウザで許可ドメインを管理" })).toBeVisible();
  await expect(setup.getByLabel("管理者パスワード", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("ログインと許可ドメインの登録が必要");
  await page.screenshot({
    path: `docs/screenshots/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "デモを試す", exact: false }).last().click();
  await expect(page.getByText("デモデータ", { exact: true })).toBeVisible();
  await expect(
    page.getByText("外部サイトへの通信は行っていません。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Content-Security-Policy/ }).click();
  await expect(page.getByText("推奨する改善方法", { exact: true })).toBeVisible();
  await expect(page.getByText("想定されるリスク", { exact: true })).toBeVisible();
  await page.getByRole("region", { name: "診断結果" }).screenshot({
    path: `docs/screenshots/demo-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: /改善が必要/ }).click();
  await expect(page.getByRole("button", { name: /^HTTPS/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cookie \/ Secure/ })).toBeVisible();
  await page.getByLabel("カテゴリで絞り込む").selectOption("cookies");
  await expect(page.getByRole("button", { name: /Content-Security-Policy/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^すべて/ }).click();
  await page.getByLabel("カテゴリで絞り込む").selectOption("all");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONをダウンロード" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const data = JSON.parse(await readFile(file!, "utf8"));
  expect(data.mode).toBe("demo");
  expect(data.checks).toHaveLength(11);
  expect(JSON.stringify(data)).not.toContain("DEMO_VALUE");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    window: window.innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.window);
  for (const viewportWidth of [320, 768, 1024]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewportWidth,
    );
  }
});

test("guide and about are available and preserve the dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "セキュリティガイド", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1. まず、接続を保護する" })).toBeVisible();
  await page.getByRole("button", { name: "このツールについて", exact: true }).click();
  await expect(page.getByRole("heading", { name: "データの取り扱い" })).toBeVisible();
  await page.getByRole("button", { name: "ダッシュボード", exact: true }).click();
  await expect(page.getByRole("heading", { name: "サイトを診断する" })).toBeVisible();
});

test("real API refuses unauthenticated requests and rejects foreign origins", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/inspect", {
    headers: { Origin: baseURL! },
    data: { url: "https://unapproved.example", authorized: true },
  });
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("ADMIN_REQUIRED");
  const foreign = await request.post("/api/inspect", {
    headers: { Origin: "https://attacker.example" },
    data: { url: "https://example.com", authorized: true },
  });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).error.code).toBe("ORIGIN_REJECTED");
});
