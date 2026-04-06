import { extendedAdmin } from './../src/extended-admin';
import { describe, expect, test, beforeAll } from "bun:test";
import { createTestInstance } from "./setup";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function setupAdminAndUser() {
  const instance = createTestInstance();
  const { createAdminUser, signUpUser, signInUser, client } = instance;

  const admin = await createAdminUser();
  await signUpUser("regular@test.com", "password123", "Regular User");
  // Get regular user ID from DB
  const db = instance.db as Record<string, Array<Record<string, unknown>>>;
  const users = db["user"] ?? [];
  const regularUser = users.find((u) => u["email"] === "regular@test.com");
  const adminUser = users.find((u) => u["email"] === "admin@test.com");

  return {
    ...instance,
    adminHeaders: admin.headers,
    regularUserId: String(regularUser?.["id"] ?? ""),
    adminUserId: String(adminUser?.["id"] ?? ""),
  };
}

// ─── setRole ──────────────────────────────────────────────────────────────────

describe("setRole", () => {
  test("admin can change the role of another user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.setRole({
      userId: regularUserId,
      role: "admin",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { role: string } })?.user?.role).toBe("admin");
  });

  test("user without permission receives error when trying to change role", async () => {
    const { client, signInUser, regularUserId } = await setupAdminAndUser();
    const { headers } = await signInUser("regular@test.com", "password123");

    const res = await client.extendedAdmin.setRole({
      userId: regularUserId,
      role: "admin",
      fetchOptions: { headers: Object.fromEntries(headers.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("setRole accepts an array of roles and saves them separated by comma", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.setRole({
      userId: regularUserId,
      role: ["editor", "viewer"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { role: string } })?.user?.role).toBe("editor,viewer");
  });
});

// ─── banUser / unbanUser ──────────────────────────────────────────────────────

describe("banUser / unbanUser", () => {
  test("admin can ban a user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.banUser({
      userId: regularUserId,
      banReason: "spam",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { banned: boolean } })?.user?.banned).toBe(true);
  });

  test("admin cannot ban themselves", async () => {
    const { client, adminHeaders, adminUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.banUser({
      userId: adminUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("admin can unban a previously banned user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    await client.extendedAdmin.banUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.unbanUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { banned: boolean } })?.user?.banned).toBe(false);
  });
});

// ─── enableUser / disableUser ─────────────────────────────────────────────────

describe("enableUser / disableUser", () => {
  test("admin can disable a user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.disableUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { isActive: boolean } })?.user?.isActive).toBe(false);
  });

  test("admin cannot disable themselves", async () => {
    const { client, adminHeaders, adminUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.disableUser({
      userId: adminUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("admin can reenable a disabled user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    await client.extendedAdmin.disableUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.enableUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { isActive: boolean } })?.user?.isActive).toBe(true);
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe("createUser", () => {
  test("admin can create a user with a custom role", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.createUser({
      email: "newuser@test.com",
      password: "newpassword123",
      name: "New User",
      role: "editor",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { email: string; role: string } })?.user?.email).toBe("newuser@test.com");
    expect((res.data as unknown as { user: { role: string } })?.user?.role).toBe("editor");
  });

  test("creating a user with a duplicate email returns an error", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    await client.extendedAdmin.createUser({
      email: "duplicate@test.com",
      name: "First",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.createUser({
      email: "duplicate@test.com",
      name: "Second",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("without authentication returns 401", async () => {
    const { client } = await setupAdminAndUser();

    const res = await client.extendedAdmin.createUser({
      email: "anon@test.com",
      name: "Anon",
      fetchOptions: { headers: { origin: "http://localhost:3000" } },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(401);
  });
});

// ─── listUsers ────────────────────────────────────────────────────────────────

describe("listUsers", () => {
  test("admin can list users and get total", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.listUsers({
      query: {},
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    const data = res.data as { users: unknown[]; total: number };
    expect(Array.isArray(data?.users)).toBe(true);
    expect(typeof data?.total).toBe("number");
    expect(data.total).toBeGreaterThanOrEqual(2);
  });

  test("user without permission cannot list users", async () => {
    const { client, signInUser } = await setupAdminAndUser();
    const { headers } = await signInUser("regular@test.com", "password123");

    const res = await client.extendedAdmin.listUsers({
      query: {},
      fetchOptions: { headers: Object.fromEntries(headers.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });
});

// ─── getUser ──────────────────────────────────────────────────────────────────

describe("getUser", () => {
  test("admin can get user data by ID", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.getUser({
      query: { id: regularUserId },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { id: string })?.id).toBe(regularUserId);
  });

  test("returns 404 for non-existent ID", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.getUser({
      query: { id: "non-existent-id" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });
});

// ─── removeUser ───────────────────────────────────────────────────────────────

describe("removeUser", () => {
  test("admin can remove a user", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.removeUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
  });

  test("admin cannot remove themselves", async () => {
    const { client, adminHeaders, adminUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.removeUser({
      userId: adminUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────
// The endpoint is registered in /extended-admin/has-permission, so the method
// of the client is client.extendedAdmin.hasPermission (derived from the path, not the key).

describe("hasPermission", () => {
  test("admin has permission for user:ban", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.hasPermission({
      permissions: { user: ["ban"] },
      permission: undefined,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
  });

  test("regular user does not have permission for user:ban", async () => {
    const { client, signInUser } = await setupAdminAndUser();
    const { headers } = await signInUser("regular@test.com", "password123");

    const res = await client.extendedAdmin.hasPermission({
      permissions: { user: ["ban"] },
      permission: undefined,
      fetchOptions: { headers: Object.fromEntries(headers.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(false);
  });

  test("returns 400 if permission (singular) is passed instead of permissions", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.hasPermission({
      permission: { user: ["ban"] } as never,
      permissions: undefined,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });
});
