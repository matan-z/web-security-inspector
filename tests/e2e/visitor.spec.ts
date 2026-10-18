import { test, expect } from "@playwright/test";
import { createHash, createHmac } from "node:crypto";
import { createDemoResult } from "../../src/lib/inspection/demo";

test("missing OAuth or storage configuration explains why login is disabled", async ({
  page,
  baseURL,
}) => {
  let flags = { authenticated: false, loginConfigured: false, storageConfigured: false };
  await page.route("**/api/account/session", (route) => route.fulfill({ json: flags }));
  for (const [oauth, storage] of [
    [false, false],
    [true, false],
    [false, true],
  ]) {
    flags = { authenticated: false, loginConfigured: oauth, storageConfigured: storage };
    await page.goto("/");
    const setup = page.getByRole("region", { name: "自社ドメインの確認" });
    await expect(
      setup.getByRole("button", { name: "GitHubでログイン", exact: true }),
    ).toBeDisabled();
    await expect(
      setup.getByText("運営者の初期設定が未完了のため、GitHubログインを利用できません。", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(setup.getByText("GitHubログインの初期設定：未完了", { exact: true })).toHaveCount(
      oauth ? 0 : 1,
    );
    await expect(setup.getByText("ドメイン情報の保存先：未接続", { exact: true })).toHaveCount(
      storage ? 0 : 1,
    );
  }
  await page.getByText("運営者向け：ログインを有効にする設定手順", { exact: true }).click();
  await expect(
    page.getByText(`Authorization callback URL：${baseURL}/api/auth/github/callback`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("プロジェクト直下の.env.localに設定", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHubのOAuth App作成画面を開く" })).toHaveAttribute(
    "href",
    "https://github.com/settings/applications/new",
  );
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

test("GitHub login starts a real state/PKCE handshake without visiting the provider", async ({
  page,
  context,
}) => {
  let authorization: URL | null = null;
  await page.route("https://github.com/login/oauth/authorize**", (route) => {
    authorization = new URL(route.request().url());
    return route.fulfill({
      contentType: "text/html",
      body: "<p>Mock GitHub authorization boundary</p>",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "GitHubでログイン", exact: true }).click();
  await expect(page.getByText("Mock GitHub authorization boundary")).toBeVisible();
  const url = authorization as unknown as URL;
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toHaveLength(43);
  expect(url.searchParams.get("scope")).toBe("");
  expect(url.searchParams.get("state")).toHaveLength(64);
  const stateCookie = (await context.cookies()).find((cookie) => cookie.name === "wsi_oauth");
  expect(stateCookie?.httpOnly).toBe(true);
  expect(stateCookie?.sameSite).toBe("Lax");
});

test("visitor registers a domain, confirms DNS, scans and logs out with private data cleared", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  // Provider authentication and remote Blob/DNS are represented by test fixtures.
  // The production session endpoint validates this test-signed cookie itself.
  const payload = Buffer.from(
    JSON.stringify({
      userId: createHash("sha256").update("github:123").digest("hex"),
      exp: Math.floor(Date.now() / 1000) + 3600,
      nonce: "a".repeat(32),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", "e2e-only-session-secret-never-use-in-production")
    .update(`wsi-visitor-v1:${baseURL}:session:${payload}`)
    .digest("base64url");
  await context.addCookies([
    {
      name: "wsi_visitor",
      value: `${payload}.${signature}`,
      url: baseURL!,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  let domains: {
    host: string;
    recordName: string;
    recordValue: string;
    verifiedAt: string | null;
    expiresAt: string | null;
  }[] = [];
  let verifySuccess = false;
  await page.route("**/api/account/domains", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "add")
        domains = [
          {
            host: "owned.example",
            recordName: "_wsi.owned.example",
            recordValue: `wsi-verification=${"f".repeat(64)}`,
            verifiedAt: null,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ];
      if (body.action === "verify") {
        domains[0].verifiedAt = verifySuccess ? new Date().toISOString() : null;
        domains[0].expiresAt = verifySuccess ? null : new Date(Date.now() + 86400000).toISOString();
      }
      if (body.action === "remove") domains = [];
    }
    await route.fulfill({
      json: {
        domains,
        limits: {
          remainingScans: 5,
          dailyRemaining: 30,
          resetsAt: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });
  });
  await page.goto("/");
  const setup = page.getByRole("region", { name: "自社ドメインの確認" });
  await expect(setup.getByText("ログイン済み", { exact: true })).toBeVisible();
  await setup.getByLabel("自社のドメインまたはURL").fill("owned.example");
  await expect(setup.getByRole("button", { name: "確認コードを発行" })).toBeDisabled();
  await setup
    .getByRole("checkbox", { name: "このドメインを管理する権限と、サイトを診断する許可があります" })
    .check();
  await setup.getByRole("button", { name: "確認コードを発行" }).click();
  await expect(setup.getByText("_wsi.owned.example", { exact: true })).toBeVisible();
  await expect(setup.getByText("未確認", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "診断を開始", exact: true })).toBeDisabled();
  await setup.getByRole("button", { name: "DNSを確認", exact: true }).click();
  await expect(setup.getByRole("alert")).toContainText("TXTレコードが一致しません");
  await expect(page.getByRole("button", { name: "診断を開始", exact: true })).toBeDisabled();
  verifySuccess = true;
  await setup.getByRole("button", { name: "DNSを確認", exact: true }).click();
  await expect(setup.getByText("確認済み", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/visitor-settings-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(setup.getByText("確認済み", { exact: true })).toBeVisible();
  await page.getByLabel("診断対象のURL", { exact: true }).fill("https://owned.example/");
  await page
    .getByRole("checkbox", { name: "このサイトの所有者、または診断の許可を得ています" })
    .check();
  const result = {
    ...createDemoResult(),
    mode: "live",
    url: "https://owned.example/private-project",
  };
  result.checks[0].observed = '<img src=x onerror="window.injected=true">';
  await page.route("**/api/visitor/inspect", (route) => route.fulfill({ json: result }));
  await page.getByRole("button", { name: "診断を開始", exact: true }).click();
  await expect(page.getByRole("region", { name: "診断結果" })).toBeVisible();
  await page.getByRole("button", { name: /^HTTPS/ }).click();
  await expect(page.getByText(result.checks[0].observed, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await setup.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(setup.getByRole("button", { name: "GitHubでログイン", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "診断結果" })).toHaveCount(0);
  await expect(page.getByLabel("診断対象のURL", { exact: true })).toHaveValue("");
  expect((await (await page.request.get("/api/account/session")).json()).authenticated).toBe(false);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

test("visitor APIs reject unauthenticated, forged and cross-origin operations", async ({
  request,
  baseURL,
}) => {
  expect((await request.get("/api/account/domains")).status()).toBe(401);
  for (const cookie of ["", "wsi_visitor=forged"]) {
    const response = await request.post("/api/visitor/inspect", {
      headers: { Origin: baseURL!, Cookie: cookie },
      data: { url: "https://unapproved.example", authorized: true },
    });
    expect(response.status()).toBe(401);
  }
  const foreign = await request.post("/api/account/domains", {
    headers: { Origin: "https://attacker.example" },
    data: { action: "add", host: "example.com", authorized: true },
  });
  expect(foreign.status()).toBe(403);
});
