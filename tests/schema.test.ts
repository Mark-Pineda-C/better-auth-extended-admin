import { describe, expect, test } from "bun:test";
import { schema } from "../src/schema";
import { extendedAdmin } from "../src/extended-admin";

describe("schema — field structure", () => {
  describe("user", () => {
    test("has field role: string, not required, not as input", () => {
      expect(schema.user.fields.role.type).toBe("string");
      expect(schema.user.fields.role.required).toBe(false);
      expect(schema.user.fields.role.input).toBe(false);
    });

    test("has field banned: boolean with default false", () => {
      expect(schema.user.fields.banned.type).toBe("boolean");
      expect(schema.user.fields.banned.defaultValue).toBe(false);
      expect(schema.user.fields.banned.input).toBe(false);
    });

    test("has field banReason: string, not required", () => {
      expect(schema.user.fields.banReason.type).toBe("string");
      expect(schema.user.fields.banReason.required).toBe(false);
    });

    test("has field banExpires: date, not required", () => {
      expect(schema.user.fields.banExpires.type).toBe("date");
      expect(schema.user.fields.banExpires.required).toBe(false);
    });

    test("has field isActive: boolean with default true", () => {
      expect(schema.user.fields.isActive.type).toBe("boolean");
      expect(schema.user.fields.isActive.defaultValue).toBe(true);
      expect(schema.user.fields.isActive.required).toBe(false);
    });
  });

  describe("session", () => {
    test("has field impersonatedBy: string, not required", () => {
      expect(schema.session.fields.impersonatedBy.type).toBe("string");
      expect(schema.session.fields.impersonatedBy.required).toBe(false);
    });
  });

  describe("globalRole", () => {
    test("has field name: string required", () => {
      expect(schema.globalRole.fields.name.type).toBe("string");
      expect(schema.globalRole.fields.name.required).toBe(true);
    });

    test("has field permissions: string required", () => {
      expect(schema.globalRole.fields.permissions.type).toBe("string");
      expect(schema.globalRole.fields.permissions.required).toBe(true);
    });

    test("has field description: string not required", () => {
      expect(schema.globalRole.fields.description.type).toBe("string");
      expect(schema.globalRole.fields.description.required).toBe(false);
    });

    test("has fields createdAt and updatedAt as date required", () => {
      expect(schema.globalRole.fields.createdAt.type).toBe("date");
      expect(schema.globalRole.fields.createdAt.required).toBe(true);
      expect(schema.globalRole.fields.updatedAt.type).toBe("date");
      expect(schema.globalRole.fields.updatedAt.required).toBe(true);
    });
  });

  describe("globalModule", () => {
    test("has field key: string required", () => {
      expect(schema.globalModule.fields.key.type).toBe("string");
      expect(schema.globalModule.fields.key.required).toBe(true);
    });

    test("has field name: string required", () => {
      expect(schema.globalModule.fields.name.type).toBe("string");
      expect(schema.globalModule.fields.name.required).toBe(true);
    });

    test("has field origins: string required", () => {
      expect(schema.globalModule.fields.origins.type).toBe("string");
      expect(schema.globalModule.fields.origins.required).toBe(true);
    });

    test("has field enabled: boolean required with default true", () => {
      expect(schema.globalModule.fields.enabled.type).toBe("boolean");
      expect(schema.globalModule.fields.enabled.required).toBe(true);
      expect(schema.globalModule.fields.enabled.defaultValue).toBe(true);
    });
  });
});

describe("schema — behavior with allowRoleOnSignUp", () => {
  test("without allowRoleOnSignUp, field role has input: false", () => {
    const plugin = extendedAdmin();
    expect(plugin.schema.user.fields.role.input).toBe(false);
  });

  test("with allowRoleOnSignUp: true, field role has input: true", () => {
    const plugin = extendedAdmin({ allowRoleOnSignUp: true });
    // @ts-expect-error accessing internal schema
    expect(plugin.schema.user.fields.role.input).toBe(true);
  });
});
