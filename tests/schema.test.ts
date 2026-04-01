import { describe, expect, test } from "bun:test";
import { schema } from "../src/schema";
import { extendedAdmin } from "../src/extended-admin";

describe("schema — estructura de campos", () => {
  describe("user", () => {
    test("tiene campo role: string, no requerido, no como input", () => {
      expect(schema.user.fields.role.type).toBe("string");
      expect(schema.user.fields.role.required).toBe(false);
      expect(schema.user.fields.role.input).toBe(false);
    });

    test("tiene campo banned: boolean con default false", () => {
      expect(schema.user.fields.banned.type).toBe("boolean");
      expect(schema.user.fields.banned.defaultValue).toBe(false);
      expect(schema.user.fields.banned.input).toBe(false);
    });

    test("tiene campo banReason: string, no requerido", () => {
      expect(schema.user.fields.banReason.type).toBe("string");
      expect(schema.user.fields.banReason.required).toBe(false);
    });

    test("tiene campo banExpires: date, no requerido", () => {
      expect(schema.user.fields.banExpires.type).toBe("date");
      expect(schema.user.fields.banExpires.required).toBe(false);
    });

    test("tiene campo isActive: boolean con default true", () => {
      expect(schema.user.fields.isActive.type).toBe("boolean");
      expect(schema.user.fields.isActive.defaultValue).toBe(true);
      expect(schema.user.fields.isActive.required).toBe(false);
    });
  });

  describe("session", () => {
    test("tiene campo impersonatedBy: string, no requerido", () => {
      expect(schema.session.fields.impersonatedBy.type).toBe("string");
      expect(schema.session.fields.impersonatedBy.required).toBe(false);
    });
  });

  describe("globalRole", () => {
    test("tiene campo name: string requerido", () => {
      expect(schema.globalRole.fields.name.type).toBe("string");
      expect(schema.globalRole.fields.name.required).toBe(true);
    });

    test("tiene campo permissions: string requerido", () => {
      expect(schema.globalRole.fields.permissions.type).toBe("string");
      expect(schema.globalRole.fields.permissions.required).toBe(true);
    });

    test("tiene campo description: string no requerido", () => {
      expect(schema.globalRole.fields.description.type).toBe("string");
      expect(schema.globalRole.fields.description.required).toBe(false);
    });

    test("tiene campos createdAt y updatedAt como date requeridos", () => {
      expect(schema.globalRole.fields.createdAt.type).toBe("date");
      expect(schema.globalRole.fields.createdAt.required).toBe(true);
      expect(schema.globalRole.fields.updatedAt.type).toBe("date");
      expect(schema.globalRole.fields.updatedAt.required).toBe(true);
    });
  });
});

describe("schema — comportamiento con allowRoleOnSignUp", () => {
  test("sin allowRoleOnSignUp, campo role tiene input: false", () => {
    const plugin = extendedAdmin();
    expect(plugin.schema.user.fields.role.input).toBe(false);
  });

  test("con allowRoleOnSignUp: true, campo role tiene input: true", () => {
    const plugin = extendedAdmin({ allowRoleOnSignUp: true });
    // @ts-expect-error accessing internal schema
    expect(plugin.schema.user.fields.role.input).toBe(true);
  });
});
