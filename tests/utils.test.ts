import { describe, expect, test } from "bun:test";
import { parseRoles } from "../src/routes/admin-routes";
import { hasPermission, invalidateRoleCache } from "../src/has-permission";
import { defaultAc, defaultRoles } from "../src/access";

// ─── parseRoles ──────────────────────────────────────────────────────────────

describe("parseRoles", () => {
  test("retorna el string tal cual si ya es string", () => {
    expect(parseRoles("admin")).toBe("admin");
  });

  test("convierte array de un elemento a string", () => {
    expect(parseRoles(["editor"])).toBe("editor");
  });

  test("convierte array de múltiples roles a string separado por coma", () => {
    expect(parseRoles(["admin", "editor"])).toBe("admin,editor");
  });

  test("convierte array de tres roles a string separado por coma", () => {
    expect(parseRoles(["admin", "editor", "viewer"])).toBe("admin,editor,viewer");
  });

  test("maneja array vacío", () => {
    expect(parseRoles([])).toBe("");
  });
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe("hasPermission", () => {
  const baseOpts = { adminRoles: ["admin"] as string[] };

  test("admin tiene permiso para user:create", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(true);
  });

  test("admin tiene permiso para user:ban", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("admin tiene permiso para session:list", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: { session: ["list"] },
    });
    expect(result).toBe(true);
  });

  test("user NO tiene permiso para user:create", async () => {
    const result = await hasPermission({
      userId: "u2",
      role: "user",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("user NO tiene permiso para user:ban", async () => {
    const result = await hasPermission({
      userId: "u2",
      role: "user",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(false);
  });

  test("user incluido en adminUserIds tiene permiso aunque su role sea user", async () => {
    const result = await hasPermission({
      userId: "superuser-id",
      role: "user",
      options: { ...baseOpts, adminUserIds: ["superuser-id"] },
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("retorna false si no se pasan permissions", async () => {
    const result = await hasPermission({
      userId: "u1",
      role: "admin",
      options: baseOpts,
      permissions: undefined,
    });
    expect(result).toBe(false);
  });

  test("multi-rol: usuario con role admin,user tiene permiso admin", async () => {
    const result = await hasPermission({
      userId: "u3",
      role: "admin,user",
      options: baseOpts,
      permissions: { user: ["ban"] },
    });
    expect(result).toBe(true);
  });

  test("rol desconocido retorna false", async () => {
    const result = await hasPermission({
      userId: "u4",
      role: "unknown-role",
      options: baseOpts,
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("usa defaultRole cuando role es undefined", async () => {
    const result = await hasPermission({
      userId: "u5",
      role: undefined,
      options: { ...baseOpts, defaultRole: "user" },
      permissions: { user: ["create"] },
    });
    expect(result).toBe(false);
  });

  test("rol personalizado con permisos customizados funciona", async () => {
    const editorRole = defaultAc.newRole({ user: ["list", "get"] });
    const result = await hasPermission({
      userId: "u6",
      role: "editor",
      options: { ...baseOpts, roles: { ...defaultRoles, editor: editorRole } },
      permissions: { user: ["list"] },
    });
    expect(result).toBe(true);
  });

  test("rol personalizado no tiene permisos que no se le asignaron", async () => {
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
  test("se puede llamar múltiples veces sin error", () => {
    expect(() => {
      invalidateRoleCache();
      invalidateRoleCache();
    }).not.toThrow();
  });
});
