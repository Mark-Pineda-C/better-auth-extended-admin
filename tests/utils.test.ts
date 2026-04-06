import { describe, expect, test } from "bun:test";
import { parseRoles } from "../src/routes/admin-routes";
import { hasPermission, invalidateRoleCache } from "../src/has-permission";
import { defaultAc, defaultRoles } from "../src/access";

// ─── parseRoles ──────────────────────────────────────────────────────────────

describe("parseRoles", () => {
  test("returns the string as is if it is already a string", () => {
    expect(parseRoles("admin")).toBe("admin");
  });

  test("converts an array of one element to a string", () => {
    expect(parseRoles(["editor"])).toBe("editor");
  });

  test("converts an array of multiple roles to a string separated by comma", () => {
    expect(parseRoles(["admin", "editor"])).toBe("admin,editor");
  });

  test("converts an array of three roles to a string separated by comma", () => {
    expect(parseRoles(["admin", "editor", "viewer"])).toBe("admin,editor,viewer");
  });

  test("handles empty array", () => {
    expect(parseRoles([])).toBe("");
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe("hasPermission", () => {
  const baseOpts = { adminRoles: ["admin"] as string[] };

  test("admin has permission for user:create", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(true);
  });

  test("admin has permission for user:ban", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("admin has permission for session:list", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { session: ["list"] },
    });
    expect(result).toBe(true);
  });

  test("user does not have permission for user:create", async () => {
    const result = await hasPermission({
      userId: "u2",
      role: "user",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("user does not have permission for user:ban", async () => {
    const result = await hasPermission({
      userId: "u2",
      role: "user",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(false);
  });

  test("user included in adminUserIds has permission even if their role is user", async () => {
    const result = await hasPermission({
      userId: "superuser-id",
      role: "user",
      options: { ...baseOpts, adminUserIds: ["superuser-id"] },
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("returns false if no permissions are passed", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: undefined,
    });
    expect(result).toBe(false);
  });

  test("multi-role: user with role admin,user has admin permission", async () => {
    const result = await hasPermission({
      userId: "u3",
      role: "admin,user",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("unknown role returns false", async () => {
    const result = await hasPermission({
      userId: "u4",
      role: "unknown-role",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("uses defaultRole when role is undefined", async () => {
    const result = await hasPermission({
      userId: "u5",
      role: undefined,
      options: { ...baseOpts, defaultRole: "user" },
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("custom role with custom permissions works", async () => {
    const editorRole = defaultAc.newRole({ user: ["list", "get"] });
    const result = await hasPermission({
      userId: "u6",
      role: "editor",
      options: { ...baseOpts, roles: { ...defaultRoles, editor: editorRole } },
      permissions: { user: ["list"] },
    });
    expect(result).toBe(true);
  });

  test("custom role does not have permissions that were not assigned", async () => {
    const editorRole = defaultAc.newRole({ user: ["list", "get"] });
    const result = await hasPermission({
      userId: "u6",
      role: "editor",
      options: { ...baseOpts, roles: { ...defaultRoles, editor: editorRole } },
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(false);
  });
});

// ─── invalidateRoleCache ─────────────────────────────────────────────────────

describe("invalidateRoleCache", () => {
  test("can be called multiple times without error", () => {
    expect(() => {
      invalidateRoleCache();
      invalidateRoleCache();
    }).not.toThrow();
  });
});
