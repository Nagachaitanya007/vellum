import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions — verified user id for per-user data.
 *
 * Deployed / standalone: the session cookie is same-origin and sent automatically.
 * Optional live-preview iframe: cookies are partitioned, so the client hook
 * forwards a bearer token. Call sites do not thread it themselves.
 *
 *   export const listNotes = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       const sql = await getSql();
 *       return sql`select * from notes where user_id = ${context.userId}`;
 *     });
 *
 * Signed out with auth on → throws UnauthorizedError.
 * Auth disabled + remote Turso → refuse (fail closed).
 * Auth disabled + local file DB → shared dev user (local only).
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("./client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    assertSameSiteRequest();
    const userId = await requireUserId(context.bearerToken);
    return next({ context: { userId } });
  });
