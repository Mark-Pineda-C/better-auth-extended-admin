import { describe, expect, test } from "bun:test";
import { createTestInstance } from "./setup";
import { defaultAc } from "../src/access";
import { invalidateModuleCache } from "../src/module-store";

// Para dynamic roles se requiere ac + dynamicRoles.enabled: true
function createDynamicInstance() {
  return createTestInstance({
    ac: defaultAc,
    dynamicRoles: { enabled: true },
    dynamicModules: { enabled: true },
  });
}

async function setupDynamicAdmin() {
  const instance = createDynamicInstance();
  const admin = await instance.createAdminUser();
  return { ...instance, adminHeaders: admin.headers };
}

function seedRawModuleWithMixedCase(
  db: ReturnType<typeof createTestInstance>["db"],
  key: string,
) {
  const table = db.globalModule as Array<Record<string, unknown>>;
  table.push({
    id: `mod-${key}-${Date.now()}-${Math.random()}`,
    key,
    name: key,
    origins: JSON.stringify([`http://${key.toLowerCase()}.example.com`]),
    denyMessage: null,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  invalidateModuleCache();
}

// ─── createRole ───────────────────────────────────────────────────────────────

describe("createRole", () => {
  test("admin can create a dynamic role", async () => {
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

  test("the role name is normalized to lowercase", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "UPPERCASE_ROLE",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as unknown as { role: { name: string } })?.role?.name).toBe("uppercase_role");
  });

  test("cannot create a role with the same name as a static role (admin)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "admin",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("cannot create a role with the same name as a static role (user)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "user",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("cannot create a role with a duplicate name", async () => {
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

  test("maximumRoles is respected when the limit is reached", async () => {
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

  test("permissions are returned as an object (not a string JSON)", async () => {
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

  test("rejects permissions.module with references to nonexistent modules", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.createRole({
      name: "invalid-module-ref",
      permissions: { module: ["no-existe"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("accepts permissions.module when DB module key casing differs", async () => {
    const { client, adminHeaders, db } = await setupDynamicAdmin();
    seedRawModuleWithMixedCase(db, "EditorPanel");

    const res = await client.extendedAdmin.createRole({
      name: "case-insensitive-module-ref",
      permissions: { module: ["editorpanel"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { role: { name: string } })?.role?.name).toBe(
      "case-insensitive-module-ref",
    );
  });

  test("legacy mode allows permissions.module without module table validation", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
    });
    const admin = await instance.createAdminUser();

    const res = await instance.client.extendedAdmin.createRole({
      name: "legacy-module-ref",
      permissions: { module: ["missing-module"] },
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    expect(res.error).toBeNull();
    expect((res.data as { role: { name: string } })?.role?.name).toBe(
      "legacy-module-ref",
    );
  });

  test("user without permission receives 403", async () => {
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
  test("admin can update permissions of an existing role", async () => {
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

  test("admin can rename a role", async () => {
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

  test("updating a nonexistent role returns 404", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.updateRole({
      name: "does-not-exist",
      data: { permissions: { user: ["list"] } },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });

  test("rejects update of permissions.module with nonexistent module", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    await client.extendedAdmin.createModule({
      key: "editorpanel",
      name: "Editor",
      origins: ["http://editor.example.com"],
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    await client.extendedAdmin.createRole({
      name: "mod-role",
      permissions: { module: ["editorpanel"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.updateRole({
      name: "mod-role",
      data: { permissions: { module: ["missingmodule"] } },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("accepts updateRole module refs when DB module key casing differs", async () => {
    const { client, adminHeaders, db } = await setupDynamicAdmin();
    seedRawModuleWithMixedCase(db, "UserPanel");

    await client.extendedAdmin.createRole({
      name: "update-case-insensitive",
      permissions: { user: ["list"] },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    const res = await client.extendedAdmin.updateRole({
      name: "update-case-insensitive",
      data: { permissions: { module: ["userpanel"] } },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).toBeNull();
    const modulePerms = (
      res.data as { role: { permissions: Record<string, string[]> } }
    )?.role?.permissions?.module;
    expect(modulePerms).toEqual(["userpanel"]);
  });
});

// ─── deleteRole ───────────────────────────────────────────────────────────────

describe("deleteRole", () => {
  test("admin can delete a dynamic role without users assigned", async () => {
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

  test("cannot delete a static role (admin)", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.deleteRole({
      name: "admin",
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(400);
  });

  test("cannot delete a nonexistent role", async () => {
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
  test("admin can list dynamic roles", async () => {
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
  test("admin can get a role by name", async () => {
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

  test("returns 404 for a nonexistent role", async () => {
    const { client, adminHeaders } = await setupDynamicAdmin();

    const res = await client.extendedAdmin.getRole({
      query: { name: "not-a-role" },
      fetchOptions: { headers: Object.fromEntries(adminHeaders.entries()) },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(404);
  });
});
