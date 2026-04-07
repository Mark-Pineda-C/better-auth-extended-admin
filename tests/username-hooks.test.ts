import { describe, expect, test } from "bun:test";
import { createTestInstance } from "./setup";
import { defaultAc } from "../src/access";

function seedModule(
  instance: ReturnType<typeof createTestInstance>,
  input: {
    key: string;
    origin: string;
    denyMessage?: string;
    enabled?: boolean;
  },
) {
  const db = instance.db as Record<string, Array<Record<string, unknown>>>;
  const table = (db["globalModule"] ??= []);
  table.push({
    id: `${input.key}-id`,
    key: input.key,
    name: input.key,
    origins: JSON.stringify([input.origin]),
    denyMessage: input.denyMessage ?? null,
    enabled: input.enabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function seedRoleWithModuleAccess(
  instance: ReturnType<typeof createTestInstance>,
  roleName: string,
  moduleKeys: string[],
) {
  const db = instance.db as Record<string, Array<Record<string, unknown>>>;
  const table = (db["globalRole"] ??= []);
  table.push({
    id: `${roleName}-id`,
    name: roleName,
    permissions: JSON.stringify({ module: moduleKeys }),
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe("username plugin — MBLAC", () => {
  test("signUp with username is blocked when origin is unmatched and moduleUnmatchedBehavior is deny", async () => {
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });

    const res = await instance.signUpUserWithUsername(
      "unknown-username@test.com",
      "password123",
      "Unknown User",
      "unknown_user",
      { origin: "http://unknown.example.com" },
    );

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("signIn.username allows access from permitted module origin", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedRoleWithModuleAccess(instance, "user", ["editorpanel"]);

    await instance.signUpUserWithUsername(
      "allowed-username@test.com",
      "password123",
      "Allowed User",
      "allowed_user",
      { origin: "http://editor.example.com" },
    );

    const res = await instance.signInUserByUsername(
      "allowed_user",
      "password123",
      { origin: "http://editor.example.com" },
    );

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("signIn.username blocks access from disallowed module origin", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });
    seedRoleWithModuleAccess(instance, "user", ["editorpanel"]);

    await instance.signUpUserWithUsername(
      "denied-username@test.com",
      "password123",
      "Denied User",
      "denied_user",
      { origin: "http://editor.example.com" },
    );

    const res = await instance.signInUserByUsername(
      "denied_user",
      "password123",
      { origin: "http://admin.example.com" },
    );

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("getSession stays valid for username session on allowed origin", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedRoleWithModuleAccess(instance, "user", ["editorpanel"]);

    await instance.signUpUserWithUsername(
      "session-ok@test.com",
      "password123",
      "Session OK",
      "session_ok",
      { origin: "http://editor.example.com" },
    );

    const login = await instance.signInUserByUsername(
      "session_ok",
      "password123",
      { origin: "http://editor.example.com" },
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: login.headers.get("cookie") ?? "",
          origin: "http://editor.example.com",
        },
      },
    });

    expect(session.data?.user).toBeDefined();
    expect(session.data?.user?.email).toBe("session-ok@test.com");
  });

  test("getSession returns null for username session on unauthorized origin", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });
    seedRoleWithModuleAccess(instance, "user", ["editorpanel"]);

    await instance.signUpUserWithUsername(
      "session-deny@test.com",
      "password123",
      "Session Deny",
      "session_deny",
      { origin: "http://editor.example.com" },
    );

    const login = await instance.signInUserByUsername(
      "session_deny",
      "password123",
      { origin: "http://editor.example.com" },
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: login.headers.get("cookie") ?? "",
          origin: "http://admin.example.com",
        },
      },
    });

    expect(session.data).toBeNull();
  });
});
