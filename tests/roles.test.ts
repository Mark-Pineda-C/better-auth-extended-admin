import { describe, expect, test } from "bun:test";
import { createTestInstance } from "./setup";
import { defaultAc } from "../src/access";

// Para dynamic roles se requiere ac + dynamicRoles.enabled: true
function createDynamicInstance() {
  return createTestInstance({
    ac: defaultAc,
    dynamicRoles: { enabled: true },
  });
}

async function setupDynamicAdmin() {
  const instance = createDynamicInstance();
  const admin = await instance.createAdminUser();
  return { ...instance, adminHeaders: admin.headers };
}

// ─── createRole ───────────────────────────────────────────────────────────────

describe("createRole", () => {
  test("admin puede crear un rol dinámico", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "moderator",
      permissions: { user: ["list", "get"] },
      description: "Can list and view users",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { success: boolean; role: { name: string } })?.success).toBe(true);
    expect((res.data as unknown as { role: { name: string } })?.role?.name).toBe("moderator");
  });

  test("el nombre del rol se normaliza a minúsculas", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "UPPERCASE_ROLE",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { role: { name: string } })?.role?.name).toBe("uppercase_role");
  });

  test("no se puede crear un rol con nombre igual a un rol estático (admin)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "admin",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("no se puede crear un rol con nombre igual a un rol estático (user)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "user",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("no se puede crear un rol con nombre duplicado", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "unique-role",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.createRole({
      name: "unique-role",
      permissions: { user: ["get"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("se respeta maximumRoles cuando se alcanza el límite", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true, maximumRoles: 1 },
    });
    const admin = await instance.createAdminUser();
    const { client, adminHeaders } = { ...instance, adminHeaders: admin.headers };

    await client.extendedAdmin.createRole({
      name: "role-one",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.createRole({
      name: "role-two",
      permissions: { user: ["get"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("permisos se devuelven como objeto (no string JSON)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const perms = { user: ["list", "get"] };
    const res = await client.extendedAdmin.createRole({
      name: "viewer",
      permissions: perms,
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const role = (res.data as { role: { permissions: unknown } })?.role;
    expect(typeof role?.permissions).toBe("object");
    expect(role?.permissions).toEqual(perms);
  });

  test("usuario sin permiso recibe 403", async () => {
    const { client, signInUser } = await setupDynamicAdmin();
    const { headers } = await signInUser("admin@test.com", "adminpassword123");

    // Reset the user back to "user" role to test
    const instance = createDynamicInstance();
    await instance.signUpUser("noperm@test.com", "password123", "No Perm");
    const { headers: noPermHeaders } = await instance.signInUser("noperm@test.com", "password123");

    const res = await instance.client.extendedAdmin.createRole({
      name: "blocked-role",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(noPermHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });
});

// ─── updateRole ───────────────────────────────────────────────────────────────

describe("updateRole", () => {
  test("admin puede actualizar permisos de un rol existente", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "to-update",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.updateRole({
      name: "to-update",
      data: { permissions: { user: ["list", "get", "ban"] } },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
    const perms = (res.data as { role: { permissions: Record<string, string[]> } } | null)?.role?.permissions;
    expect(perms?.user).toContain("ban");
  });

  test("admin puede renombrar un rol", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "old-name",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.updateRole({
      name: "old-name",
      data: { newName: "new-name" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { role: { name: string } })?.role?.name).toBe("new-name");
  });

  test("actualizar un rol inexistente retorna 404", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.updateRole({
      name: "does-not-exist",
      data: { permissions: { user: ["list"] } },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });
});

// ─── deleteRole ───────────────────────────────────────────────────────────────

describe("deleteRole", () => {
  test("admin puede eliminar un rol dinámico sin usuarios asignados", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "to-delete",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.deleteRole({
      name: "to-delete",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { success: boolean })?.success).toBe(true);
  });

  test("no se puede eliminar un rol estático (admin)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.deleteRole({
      name: "admin",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("no se puede eliminar un rol inexistente", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.deleteRole({
      name: "ghost-role",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });
});

// ─── listRoles ────────────────────────────────────────────────────────────────

describe("listRoles", () => {
  test("admin puede listar roles dinámicos", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "role-a",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    await client.extendedAdmin.createRole({
      name: "role-b",
      permissions: { user: ["get"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.listRoles({
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    const roles = res.data as Array<{ name: string; permissions: unknown }>;
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBeGreaterThanOrEqual(2);
    expect(typeof roles[0]?.permissions).toBe("object");
  });
});

// ─── getRole ──────────────────────────────────────────────────────────────────

describe("getRole", () => {
  test("admin puede obtener un rol por nombre", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createRole({
      name: "findme",
      permissions: { user: ["list"] },
      description: "A findable role",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.getRole({
      query: { name: "findme" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { name: string })?.name).toBe("findme");
    expect((res.data as { permissions: unknown })?.permissions).toBeDefined();
  });

  test("retorna 404 para un rol inexistente", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.getRole({
      query: { name: "not-a-role" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });
});
