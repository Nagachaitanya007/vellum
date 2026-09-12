import { createServerFn } from "@tanstack/react-start";

/** Public, secret-free snapshot so the login page can explain missing config. */
export const getAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { isRemoteDatabase } = await import("../db");
  const { googleAuthConfigured } = await import("./server");
  return {
    googleConfigured: googleAuthConfigured,
    remoteDatabase: isRemoteDatabase(),
  };
});
