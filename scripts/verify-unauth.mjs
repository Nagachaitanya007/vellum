#!/usr/bin/env node
/**
 * Signed-out HTTP checks against a running Vellum server.
 * Skips (exit 0) when nothing is listening so `npm test` stays hermetic.
 */
const base = (process.env.VERIFY_UNAUTH_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

function isUnauthorized(payload) {
  if (!payload || typeof payload !== "object") return false;
  const err = payload;
  return err.status === 401 || err.message === "Unauthorized" || err.ok === false;
}

async function probe() {
  try {
    const res = await fetch(`${base}/api/auth/get-session`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (res.status !== 200) {
      throw new Error(`get-session expected HTTP 200, got ${res.status}`);
    }
    if (body !== null && body !== undefined && typeof body === "object" && (body.user || body.session)) {
      throw new Error("get-session returned a session while signed out");
    }
    return true;
  } catch (err) {
    if (err && (err.name === "TimeoutError" || err.code === "ECONNREFUSED" || err.cause?.code === "ECONNREFUSED")) {
      return false;
    }
    if (err instanceof TypeError && String(err.message).includes("fetch")) return false;
    throw err;
  }
}

async function vaultRpc() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
    const result = await page.evaluate(async () => {
      const api = await import("/src/lib/notes/api.ts");
      const out = { load: null, save: null };
      try {
        await api.loadVault();
        out.load = "unexpected-ok";
      } catch (err) {
        out.load = JSON.stringify({
          ok: false,
          name: err?.name,
          message: err?.message,
          status: err?.status,
        });
      }
      try {
        await api.saveVaultChanges({
          data: {
            userId: "victim",
            notes: [
              {
                id: "n1",
                title: "hijack",
                content: "nope",
                folderId: null,
                pinned: false,
                kind: "markdown",
                drawing: { strokes: [] },
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          },
        });
        out.save = "unexpected-ok";
      } catch (err) {
        out.save = JSON.stringify({
          ok: false,
          name: err?.name,
          message: err?.message,
          status: err?.status,
        });
      }
      return out;
    });
    const load = JSON.parse(result.load);
    const save = JSON.parse(result.save);
    if (!isUnauthorized(load)) {
      throw new Error(`loadVault signed-out: ${result.load}`);
    }
    if (!isUnauthorized(save)) {
      throw new Error(`saveVaultChanges signed-out: ${result.save}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  let up = false;
  try {
    up = await probe();
  } catch (err) {
    console.error("[verify-unauth] get-session failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (!up) {
    console.log("[verify-unauth] skip — no server on", base);
    return;
  }
  const src = await fetch(`${base}/src/lib/notes/api.ts`, { method: "GET", signal: AbortSignal.timeout(2500) });
  if (!src.ok) {
    console.log("[verify-unauth] ok — signed-out get-session is empty (vault RPC skipped; no /src modules)");
    return;
  }
  await vaultRpc();
  console.log("[verify-unauth] ok — signed-out get-session is empty; vault RPC is Unauthorized");
}

main().catch((err) => {
  console.error("[verify-unauth] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
