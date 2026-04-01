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
  test("admin puede cambiar el rol de otro usuario", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.setRole({
      userId: regularUserId,
      role: "admin",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { role: string } })?.user?.role).toBe("admin");
  });

  test("usuario sin permiso recibe error al intentar cambiar rol", async () => {
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

  test("setRole acepta un array de roles y los guarda separados por coma", async () => {
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
  test("admin puede banear un usuario", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.banUser({
      userId: regularUserId,
      banReason: "spam",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { banned: boolean } })?.user?.banned).toBe(true);
  });

  test("admin no puede banearse a sí mismo", async () => {
    const { client, adminHeaders, adminUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.banUser({
      userId: adminUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("admin puede desbanear un usuario previamente baneado", async () => {
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
  test("admin puede deshabilitar un usuario", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.disableUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { user: { isActive: boolean } })?.user?.isActive).toBe(false);
  });

  test("admin no puede deshabilitarse a sí mismo", async () => {
    const { client, adminHeaders, adminUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.disableUser({
      userId: adminUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("admin puede rehabilitar un usuario deshabilitado", async () => {
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
  test("admin puede crear un usuario con rol personalizado", async () => {
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

  test("crear usuario con email duplicado retorna error", async () => {
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

  test("sin autenticación retorna 401", async () => {
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
  test("admin puede listar usuarios y obtiene total", async () => {
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

  test("usuario sin permiso no puede listar usuarios", async () => {
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
  test("admin puede obtener datos de un usuario por ID", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.getUser({
      query: { id: regularUserId },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { id: string })?.id).toBe(regularUserId);
  });

  test("retorna 404 para ID inexistente", async () => {
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
  test("admin puede eliminar un usuario", async () => {
    const { client, adminHeaders, regularUserId } = await setupAdminAndUser();

    const res = await client.extendedAdmin.removeUser({
      userId: regularUserId,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
  });

  test("admin no puede eliminarse a sí mismo", async () => {
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
// El endpoint está registrado en /extended-admin/has-permission, así que el método
// del cliente es client.extendedAdmin.hasPermission (derivado del path, no de la clave).

describe("hasPermission", () => {
  test("admin tiene permiso para user:ban", async () => {
    const { client, adminHeaders } = await setupAdminAndUser();

    const res = await client.extendedAdmin.hasPermission({
      permissions: { user: ["ban"] },
      permission: undefined,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
  });

  test("user regular no tiene permiso para user:ban", async () => {
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

  test("retorna 400 si se pasa permission (singular) en lugar de permissions", async () => {
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
