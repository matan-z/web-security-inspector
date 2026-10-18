import { expect, test } from "@playwright/test";
import { createDemoResult } from "../../src/lib/inspection/demo";

test("administrator can register, reload and delete domains in the browser", async ({
  page,
}, testInfo) => {
  // The login/session endpoints are real. Only the remote Blob boundary is
  // represented by these settings responses; no external service is contacted.
  let settings = {
    hosts: [] as string[],
    revision: null as string | null,
    updatedAt: null as string | null,
  };
  let version = 0;
  await page.route("**/api/admin/hosts", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      settings = {
        hosts: body.hosts.map(
          (host: string) => new URL(host.includes("://") ? host : `https://${host}`).hostname,
        ),
        revision: `v${++version}`,
        updatedAt: new Date().toISOString(),
      };
    }
    await route.fulfill({ json: settings });
  });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "許可ドメインの管理" });
  await setup
    .getByLabel("管理者パスワード", { exact: true })
    .fill("a-wrong-password-with-more-than-32-characters");
  await setup.getByRole("button", { name: "管理者ログイン", exact: true }).click();
  await expect(setup.getByRole("alert")).toContainText("管理者パスワードを確認してください");
  await setup
    .getByLabel("管理者パスワード", { exact: true })
    .fill("e2e-only-password-never-use-this-in-production");
  await setup.getByRole("button", { name: "管理者ログイン", exact: true }).click();
  await expect(
    setup.getByText("まだドメインが登録されていません。", { exact: false }),
  ).toBeVisible();
  await setup.getByLabel("許可するドメインまたはURL").fill("https://owned.example/path");
  await expect(setup.getByRole("button", { name: "追加して保存" })).toBeDisabled();
  await setup
    .getByRole("checkbox", { name: "追加するドメインを所有している、または診断の許可を得ています" })
    .check();
  await setup.getByRole("button", { name: "追加して保存" }).click();
  await expect(setup.getByText("owned.example", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/admin-settings-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(setup.getByText("owned.example", { exact: true })).toBeVisible();
  await page.getByLabel("診断対象のURL", { exact: true }).fill("https://owned.example/");
  await page
    .getByRole("checkbox", { name: "このサイトの所有者、または診断の許可を得ています" })
    .check();
  await expect(page.getByRole("button", { name: "診断を開始", exact: true })).toBeEnabled();
  await page.route("**/api/inspect", (route) =>
    route.fulfill({
      status: 502,
      json: {
        error: { code: "CONNECTION_FAILED", message: "判定不可：診断先に接続できませんでした。" },
      },
    }),
  );
  await page.getByRole("button", { name: "診断を開始", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "サイトを診断する", exact: true }).getByRole("alert"),
  ).toContainText("判定不可");
  await expect(page.getByText("デモデータ", { exact: true })).toHaveCount(0);
  const result = {
    ...createDemoResult(),
    mode: "live",
    url: "https://owned.example/internal-project",
  };
  await page.route("**/api/inspect", (route) => route.fulfill({ json: result }));
  await page.getByRole("button", { name: "診断を開始", exact: true }).click();
  await expect(page.getByRole("region", { name: "診断結果" })).toBeVisible();
  await expect(page.getByText(result.url, { exact: true })).toBeVisible();
  await setup.getByRole("button", { name: "owned.exampleを削除", exact: true }).click();
  await expect(setup.getByText("owned.example", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "診断を開始", exact: true })).toBeDisabled();
  await setup.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(setup.getByLabel("管理者パスワード", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "診断結果" })).toHaveCount(0);
  await expect(page.getByLabel("診断対象のURL", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("checkbox", { name: "このサイトの所有者、または診断の許可を得ています" }),
  ).not.toBeChecked();
  expect((await (await page.request.get("/api/admin/session")).json()).authenticated).toBe(false);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
});

test("first-time Vercel setup has browser instructions without local commands", async ({
  page,
}) => {
  await page.route("**/api/admin/session", (route) =>
    route.fulfill({
      json: { authenticated: false, authConfigured: false, storageConfigured: false },
    }),
  );
  await page.goto("/");
  const setup = page.getByRole("region", { name: "許可ドメインの管理" });
  await expect(setup.getByText("初回だけ：Vercelダッシュボードで準備する")).toBeVisible();
  await expect(setup.getByText("Private Blobを接続", { exact: true })).toBeVisible();
  await expect(setup.getByRole("link", { name: "Vercelダッシュボードを開く" })).toBeVisible();
  await expect(setup).not.toContainText(".env.local");
  await expect(setup).not.toContainText("npm run");
  await expect(setup.getByRole("button", { name: "管理者ログイン", exact: true })).toBeDisabled();
});
