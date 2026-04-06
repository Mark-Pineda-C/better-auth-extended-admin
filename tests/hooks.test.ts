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

// ─── ban/disable hooks en sign-in ─────────────────────────────────────────────

describe("session create hook — banned user", () => {
  test("banned user cannot sign in (receives 403)", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
    });
    const admin = await instance.createAdminUser();

    await instance.signUpUser("banned@test.com", "password123", "Banned User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "banned@test.com");
    const userId = String(user?.["id"] ?? "");

    await instance.client.extendedAdmin.banUser({
      userId,
      banReason: "Test ban",
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    const res = await instance.client.signIn.email({
      email: "banned@test.com",
      password: "password123",
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("the custom ban message is included in the error", async () => {
    const customMsg = "Fuiste suspendido permanentemente.";
    const instance = createTestInstance({ bannedUserMessage: customMsg });
    const admin = await instance.createAdminUser();

    await instance.signUpUser("banned2@test.com", "password123", "Banned2");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "banned2@test.com");
    const userId = String(user?.["id"] ?? "");

    await instance.client.extendedAdmin.banUser({
      userId,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    const res = await instance.client.signIn.email({
      email: "banned2@test.com",
      password: "password123",
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain(customMsg);
  });

  test("expired ban is cleared and the user can sign in", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
    });
    const admin = await instance.createAdminUser();

    await instance.signUpUser("expiredban@test.com", "password123", "Expired Ban");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "expiredban@test.com");
    const userId = String(user?.["id"] ?? "");

    // Ban with 1 second expiration that has expired
    await instance.client.extendedAdmin.banUser({
      userId,
      banExpiresIn: 1,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    // Simulate expired time by modifying banExpires directly in DB
    const userRecord = (db["user"] ?? []).find((u) => u["id"] === userId);
    if (userRecord) {
      userRecord["banExpires"] = new Date(Date.now() - 10_000); // 10 seconds in the past
    }

    const res = await instance.client.signIn.email({
      email: "expiredban@test.com",
      password: "password123",
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();

    // Verify that the ban was cleared in DB
    const updatedUser = (db["user"] ?? []).find((u) => u["id"] === userId);
    expect(updatedUser?.["banned"]).toBe(false);
  });
});

// ─── disable hook en sign-in ──────────────────────────────────────────────────

describe("session create hook — disabled user", () => {
  test("user with isActive: false cannot sign in (receives 403)", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
    });
    const admin = await instance.createAdminUser();

    await instance.signUpUser("disabled@test.com", "password123", "Disabled User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "disabled@test.com");
    const userId = String(user?.["id"] ?? "");

    await instance.client.extendedAdmin.disableUser({
      userId,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    const res = await instance.client.signIn.email({
      email: "disabled@test.com",
      password: "password123",
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("the custom disable message is included in the error", async () => {
    const customMsg = "Tu cuenta fue suspendida temporalmente.";
    const instance = createTestInstance({ disabledUserMessage: customMsg });
    const admin = await instance.createAdminUser();

    await instance.signUpUser("disabled2@test.com", "password123", "Disabled2");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "disabled2@test.com");
    const userId = String(user?.["id"] ?? "");

    await instance.client.extendedAdmin.disableUser({
      userId,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    const res = await instance.client.signIn.email({
      email: "disabled2@test.com",
      password: "password123",
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain(customMsg);
  });

  test("rehabilitated user can sign in again", async () => {
    const instance = createTestInstance();
    const admin = await instance.createAdminUser();

    await instance.signUpUser("reenable@test.com", "password123", "Reenable User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "reenable@test.com");
    const userId = String(user?.["id"] ?? "");

    await instance.client.extendedAdmin.disableUser({
      userId,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    await instance.client.extendedAdmin.enableUser({
      userId,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    const res = await instance.client.signIn.email({
      email: "reenable@test.com",
      password: "password123",
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });
});

// ─── user create hook — roles en sign-up ─────────────────────────────────────

describe("user create hook — roles in sign-up", () => {
  test("defaultRole is applied to new users", async () => {
    const instance = createTestInstance({ defaultRole: "viewer" });

    await instance.signUpUser("newviewer@test.com", "password123", "Viewer User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "newviewer@test.com");

    expect(user?.["role"]).toBe("viewer");
  });

  test("defaultRoleForSignUp takes precedence over defaultRole", async () => {
    const instance = createTestInstance({
      defaultRole: "viewer",
      defaultRoleForSignUp: "member",
    });

    await instance.signUpUser("newmember@test.com", "password123", "Member User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "newmember@test.com");

    expect(user?.["role"]).toBe("member");
  });

  test("without configuration, the default role is 'user'", async () => {
    const instance = createTestInstance();

    await instance.signUpUser("defaultuser@test.com", "password123", "Default User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "defaultuser@test.com");

    expect(user?.["role"]).toBe("user");
  });

  test("isActive is set to true when creating a user", async () => {
    const instance = createTestInstance();

    await instance.signUpUser("active@test.com", "password123", "Active User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "active@test.com");

    expect(user?.["isActive"]).toBe(true);
  });
});

// ─── modules — control de acceso por módulo ───────────────────────────────────

describe("modules — access by origin", () => {
  test("legacy mode skips module checks when dynamicModules is disabled", async () => {
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });

    await instance.signUpUser("legacy@test.com", "password123", "Legacy User");
    const res = await instance.client.signIn.email({
      email: "legacy@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://admin.example.com" },
      },
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("user with allowed role can sign in from the module", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });
    const admin = await instance.createAdminUser();

    // Admin sign-in from the allowed module origin
    const res = await instance.client.signIn.email({
      email: "admin@test.com",
      password: "adminpassword123",
      fetchOptions: {
        headers: { origin: "http://admin.example.com" },
      },
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("user with non-allowed role is blocked in the module", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });

    await instance.signUpUser("regularmod@test.com", "password123", "Regular Mod");

    const res = await instance.client.signIn.email({
      email: "regularmod@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://admin.example.com" },
      },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("the custom module deny message appears in the error", async () => {
    const denyMsg = "No tienes acceso al panel de administración.";
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
      denyMessage: denyMsg,
    });

    await instance.signUpUser("deniedmod@test.com", "password123", "Denied Mod");

    const res = await instance.client.signIn.email({
      email: "deniedmod@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://admin.example.com" },
      },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain(denyMsg);
  });

  test("with moduleUnmatchedBehavior: 'deny', unknown origin blocks the registration", async () => {
    // With moduleUnmatchedBehavior: 'deny', the user.create.before hook also checks
    // the origin. A sign-up from an unknown origin is denied with 403.
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });

    const res = await instance.client.signUp.email({
      email: "unknownmod@test.com",
      password: "password123",
      name: "Unknown Mod",
      fetchOptions: {
        headers: { origin: "http://unknown.example.com" },
      },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });

  test("with moduleUnmatchedBehavior: 'allow' (default), unknown origin allows access", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "adminpanel",
      origin: "http://admin.example.com",
    });

    await instance.signUpUser("unmatchedallow@test.com", "password123", "Unmatched Allow");

    const res = await instance.client.signIn.email({
      email: "unmatchedallow@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://other.example.com" },
      },
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("dynamic role with module access allows the correct role", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);

    await instance.signUpUser("fneditor@test.com", "password123", "Fn Editor");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "fneditor@test.com");
    if (user) user["role"] = "editor";

    const res = await instance.client.signIn.email({
      email: "fneditor@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://editor.example.com" },
      },
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("multi-role is allowed when at least one role has access to the module", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);

    await instance.signUpUser("asynceditor@test.com", "password123", "Async Editor");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "asynceditor@test.com");
    if (user) user["role"] = "user,editor";

    const res = await instance.client.signIn.email({
      email: "asynceditor@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://editor.example.com" },
      },
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();
  });

  test("dynamic role without module access is blocked with 403", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, {
      key: "editorpanel",
      origin: "http://editor.example.com",
    });
    seedRoleWithModuleAccess(instance, "editor", ["othermodule"]);

    await instance.signUpUser("fndeny@test.com", "password123", "Fn Deny");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "fndeny@test.com");
    if (user) user["role"] = "editor";

    const res = await instance.client.signIn.email({
      email: "fndeny@test.com",
      password: "password123",
      fetchOptions: {
        headers: { origin: "http://editor.example.com" },
      },
    });

    expect(res.error).not.toBeNull();
    expect(res.error?.status).toBe(403);
  });
});

// ─── modules — enforceModulesOnSession en getSession ──────────────────────────

describe("modules — enforceModulesOnSession in getSession", () => {
  /**
   * Signs up a user without an origin (unmatched → allowed), promotes to the
   * given role in the memory DB, then signs in from `signInOrigin` so the
   * session cookie is tied to a valid module.
   */
  async function createEditorWithSession(
    instance: ReturnType<typeof createTestInstance>,
    email: string,
    signInOrigin: string,
  ) {
    await instance.signUpUser(email, "password123", "Editor");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === email);
    if (user) user["role"] = "editor";

    const { headers } = await instance.signInUser(email, "password123", {
      origin: signInOrigin,
    });
    return headers;
  }

  test("getSession returns null when the user accesses from an unauthorized module for their role", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, { key: "editorpanel", origin: "http://editor.example.com" });
    seedModule(instance, { key: "userpanel", origin: "http://user.example.com" });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);
    seedRoleWithModuleAccess(instance, "user", ["userpanel"]);

    const headers = await createEditorWithSession(
      instance, "editor@test.com", "http://editor.example.com",
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://user.example.com",
        },
      },
    });

    expect(session.data).toBeNull();
  });

  test("getSession returns a valid session when the user accesses from their allowed module", async () => {
    const instance = createTestInstance({
      ac: defaultAc,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
    });
    seedModule(instance, { key: "editorpanel", origin: "http://editor.example.com" });
    seedModule(instance, { key: "userpanel", origin: "http://user.example.com" });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);
    seedRoleWithModuleAccess(instance, "user", ["userpanel"]);

    const headers = await createEditorWithSession(
      instance, "editor2@test.com", "http://editor.example.com",
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://editor.example.com",
        },
      },
    });

    expect(session.data?.user).toBeDefined();
    expect(session.data?.user?.email).toBe("editor2@test.com");
  });

  test("admin can access getSession from any module", async () => {
    const instance = createTestInstance({
      dynamicModules: { enabled: true },
    });
    seedModule(instance, { key: "editorpanel", origin: "http://editor.example.com" });
    seedModule(instance, { key: "userpanel", origin: "http://user.example.com" });

    const admin = await instance.createAdminUser();

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: admin.headers.get("cookie") ?? "",
          origin: "http://user.example.com",
        },
      },
    });

    expect(session.data?.user).toBeDefined();
  });

  test("enforceModulesOnSession: false disables the verification in getSession", async () => {
    const instance = createTestInstance({
      enforceModulesOnSession: false,
      dynamicModules: { enabled: true },
    });
    seedModule(instance, { key: "editorpanel", origin: "http://editor.example.com" });
    seedModule(instance, { key: "userpanel", origin: "http://user.example.com" });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);
    seedRoleWithModuleAccess(instance, "user", ["userpanel"]);

    const headers = await createEditorWithSession(
      instance, "editor3@test.com", "http://editor.example.com",
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://user.example.com",
        },
      },
    });

    expect(session.data?.user).toBeDefined();
  });

  test("without configured modules, getSession works normally", async () => {
    const instance = createTestInstance();

    const { headers } = await instance.signUpUser(
      "normal@test.com", "password123", "Normal User",
    );

    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://any-origin.example.com",
        },
      },
    });

    expect(session.data?.user).toBeDefined();
  });

  test("with moduleUnmatchedBehavior: 'deny', getSession from unknown origin returns null", async () => {
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
      dynamicModules: { enabled: true },
    });
    seedModule(instance, { key: "editorpanel", origin: "http://editor.example.com" });
    seedModule(instance, { key: "userpanel", origin: "http://user.example.com" });
    seedRoleWithModuleAccess(instance, "editor", ["editorpanel"]);
    seedRoleWithModuleAccess(instance, "user", ["userpanel"]);

    // Sign up from userPanel (default role "user" is allowed there)
    await instance.signUpUser(
      "denytest@test.com", "password123", "Deny Test",
      { origin: "http://user.example.com" },
    );
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "denytest@test.com");
    if (user) user["role"] = "editor";

    // Sign in from editorPanel (editor role allowed)
    const { headers } = await instance.signInUser(
      "denytest@test.com", "password123",
      { origin: "http://editor.example.com" },
    );

    // getSession from an unregistered origin should be denied
    const session = await instance.client.getSession({
      fetchOptions: {
        headers: {
          cookie: headers.get("cookie") ?? "",
          origin: "http://unknown.example.com",
        },
      },
    });

    expect(session.data).toBeNull();
  });
});
