import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins/bearer";
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { parseSetCookieHeader } from "better-auth/cookies";
import { username } from "better-auth/plugins/username";
import { extendedAdmin } from "../src/extended-admin";
import { extendedAdminClient } from "../src/client";
import type { AdminOptions } from "../src/types";
import { invalidateRoleCache } from "../src/has-permission";
import { invalidateModuleCache } from "../src/module-store";

export const TEST_SECRET =
  "test-secret-1234567890abcdef-long-enough-for-security";
export const BASE_URL = "http://localhost:3000";

export type TestDB = Record<string, Record<string, unknown>[]>;

/**
 * Creates a fully functional in-memory auth instance with the admin plugin.
 * No SQLite or migrations needed — uses better-auth's memoryAdapter.
 * Each call returns a fresh isolated instance.
 */
export function createTestInstance(options: Omit<AdminOptions, "ac"> & { ac?: AdminOptions["ac"] } = {}) {
  invalidateRoleCache();
  invalidateModuleCache();

  // memoryAdapter requires tables to be pre-initialized before any read operations
  const db: TestDB = {
    user: [],
    session: [],
    account: [],
    verification: [],
    globalRole: [],
    globalModule: [],
  };

  const auth = betterAuth({
    baseURL: BASE_URL,
    secret: TEST_SECRET,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    logger: { level: "error" as const },
    plugins: [bearer(), username(), extendedAdmin({ adminRoles: ["admin"], ...options })],
  });

  const customFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> =>
    auth.handler(new Request(url as string, init));

  const client = createAuthClient({
    baseURL: `${BASE_URL}/api/auth`,
    fetchOptions: { customFetchImpl: customFetch as never },
    plugins: [usernameClient(), extendedAdminClient()],
  });

  async function signUpUser(email: string, password: string, name: string, extraHeaders?: Headers | string[][] | Record<string, string>) {
    const headers = new Headers(extraHeaders);
    const res = await client.signUp.email({
      email,
      password,
      name,
      fetchOptions: {
        headers: Object.fromEntries(headers.entries()),
        onSuccess(context) {
          const cookie = parseSetCookieHeader(
            context.response.headers.get("set-cookie") ?? "",
          ).get("better-auth.session_token")?.value;
          if (cookie) headers.set("cookie", `better-auth.session_token=${cookie}`);
        },
      },
    });
    return { data: res.data, headers };
  }

  async function signInUser(email: string, password: string, extraHeaders?: Headers | string[][] | Record<string, string>) {
    const headers = new Headers(extraHeaders);
    const res = await client.signIn.email({
      email,
      password,
      fetchOptions: {
        onSuccess(context) {
          const cookie = parseSetCookieHeader(
            context.response.headers.get("set-cookie") ?? "",
          ).get("better-auth.session_token")?.value;
          if (cookie) headers.set("cookie", `better-auth.session_token=${cookie}`);
        },
      },
    });
    return { data: res.data, headers };
  }

  async function signUpUserWithUsername(
    email: string,
    password: string,
    name: string,
    usernameValue: string,
    extraHeaders?: Headers | string[][] | Record<string, string>,
  ) {
    const headers = new Headers(extraHeaders);
    const res = await client.signUp.email({
      email,
      password,
      name,
      username: usernameValue,
      fetchOptions: {
        headers: Object.fromEntries(headers.entries()),
        onSuccess(context) {
          const cookie = parseSetCookieHeader(
            context.response.headers.get("set-cookie") ?? "",
          ).get("better-auth.session_token")?.value;
          if (cookie) headers.set("cookie", `better-auth.session_token=${cookie}`);
        },
      },
    });
    return { data: res.data, headers, error: res.error };
  }

  async function signInUserByUsername(
    usernameValue: string,
    password: string,
    extraHeaders?: Headers | string[][] | Record<string, string>,
  ) {
    const headers = new Headers(extraHeaders);
    const res = await client.signIn.username({
      username: usernameValue,
      password,
      fetchOptions: {
        headers: Object.fromEntries(headers.entries()),
        onSuccess(context) {
          const cookie = parseSetCookieHeader(
            context.response.headers.get("set-cookie") ?? "",
          ).get("better-auth.session_token")?.value;
          if (cookie) headers.set("cookie", `better-auth.session_token=${cookie}`);
        },
      },
    });
    return { data: res.data, headers, error: res.error };
  }

  /**
   * Creates an admin user, signs in, and returns headers with session cookie.
   * The user is set to role "admin" via a direct DB update after sign-up.
   */
  async function createAdminUser(
    email = "admin@test.com",
    password = "adminpassword123",
    name = "Admin User",
  ) {
    await signUpUser(email, password, name);

    // Promote to admin directly in the memory store
    const userTable = db["user"] as Array<Record<string, unknown>> | undefined;
    if (userTable) {
      const user = userTable.find((u) => u["email"] === email);
      if (user) user["role"] = "admin";
    }

    const { headers } = await signInUser(email, password);
    return { email, password, headers };
  }

  return {
    auth,
    client,
    db,
    customFetch,
    signUpUser,
    signUpUserWithUsername,
    signInUser,
    signInUserByUsername,
    createAdminUser,
  };
}
