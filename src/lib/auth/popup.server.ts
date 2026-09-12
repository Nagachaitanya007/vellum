/**
 * Live-preview sign-in popup — server-only (NEVER import from the client).
 *
 * Used only inside the Grok sandbox iframe (partitioned cookies). Standalone
 * production uses a normal full-page Google redirect and never hits this path.
 *
 * Phase 1 (`?providerId=…`): start Google OAuth server-side and 302 to Google.
 * Phase 2 (`?done=1`): post the session token to the opener and close.
 *
 * Wired by the Vite `authPopupPlugin` in `vite.config.ts` during `npm run dev`.
 */
import { auth, SESSION_TOKEN_COOKIE } from "./server";

type PopupMessage = {
  source: "vellum-auth-popup";
  token: string | null;
  error?: string;
};

export async function handleAuthPopupRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const done = url.searchParams.get("done") === "1";

  if (done) {
    const errored = url.searchParams.has("error");
    const token = errored ? null : readCookie(request, SESSION_TOKEN_COOKIE);
    const message: PopupMessage = {
      source: "vellum-auth-popup",
      token,
      ...(errored ? { error: url.searchParams.get("error") ?? "sign_in_failed" } : {}),
    };
    return new Response(completionHtml(message), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const providerId = url.searchParams.get("providerId")?.trim() || "google";
  if (providerId !== "google") {
    return new Response("Unsupported provider", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const back = `${url.origin}/auth/popup?done=1`;
  try {
    const apiRes = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: back,
        errorCallbackURL: `${back}&error=1`,
        disableRedirect: true,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      return completionResponse({
        source: "vellum-auth-popup",
        token: null,
        error: detail || `oauth_init_failed_${apiRes.status}`,
      });
    }

    const body = (await apiRes.json().catch(() => null)) as { url?: string } | null;
    const location = body?.url;
    if (!location) {
      return completionResponse({
        source: "vellum-auth-popup",
        token: null,
        error: "oauth_init_missing_url",
      });
    }

    const headers = new Headers({ location, "cache-control": "no-store" });
    for (const cookie of apiRes.headers.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_init_threw";
    return completionResponse({
      source: "vellum-auth-popup",
      token: null,
      error: message,
    });
  }
}

function completionResponse(message: PopupMessage): Response {
  return new Response(completionHtml(message), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function completionHtml(message: PopupMessage): string {
  const payload = JSON.stringify(message).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Signing in…</title>
<style>
  html,body{margin:0;min-height:100%;background:#0b0b0c;color:#a1a1aa;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
</style>
</head>
<body>
<main><p>Signing you in…</p></main>
<script type="application/json" id="vellum-auth-popup-msg">${payload}</script>
<script>
(function () {
  var el = document.getElementById("vellum-auth-popup-msg");
  var msg = { source: "vellum-auth-popup", token: null };
  try { if (el && el.textContent) msg = JSON.parse(el.textContent); } catch (e) {}
  try {
    if (window.opener) window.opener.postMessage(msg, window.location.origin);
  } catch (e) {}
  try { window.close(); } catch (e) {}
})();
</script>
</body>
</html>`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
