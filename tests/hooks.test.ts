import { describe, expect, test } from "bun:test";
import { createTestInstance } from "./setup";

// ─── ban/disable hooks en sign-in ─────────────────────────────────────────────

describe("session create hook — usuario baneado", () => {
  test("usuario baneado no puede iniciar sesión (recibe 403)", async () => {
    const instance = createTestInstance();
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

  test("el mensaje de ban personalizado se incluye en el error", async () => {
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

  test("ban expirado se limpia y el usuario puede iniciar sesión", async () => {
    const instance = createTestInstance();
    const admin = await instance.createAdminUser();

    await instance.signUpUser("expiredban@test.com", "password123", "Expired Ban");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "expiredban@test.com");
    const userId = String(user?.["id"] ?? "");

    // Ban con 1 segundo de expiración que ya venció
    await instance.client.extendedAdmin.banUser({
      userId,
      banExpiresIn: 1,
      fetchOptions: { headers: Object.fromEntries(admin.headers.entries()) },
    });

    // Simular tiempo expirado modificando directamente banExpires en DB
    const userRecord = (db["user"] ?? []).find((u) => u["id"] === userId);
    if (userRecord) {
      userRecord["banExpires"] = new Date(Date.now() - 10_000); // 10 segundos en el pasado
    }

    const res = await instance.client.signIn.email({
      email: "expiredban@test.com",
      password: "password123",
    });

    expect(res.error).toBeNull();
    expect(res.data?.user).toBeDefined();

    // Verificar que el ban fue limpiado en DB
    const updatedUser = (db["user"] ?? []).find((u) => u["id"] === userId);
    expect(updatedUser?.["banned"]).toBe(false);
  });
});

// ─── disable hook en sign-in ──────────────────────────────────────────────────

describe("session create hook — usuario deshabilitado", () => {
  test("usuario con isActive: false no puede iniciar sesión (recibe 403)", async () => {
    const instance = createTestInstance();
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

  test("el mensaje de deshabilitación personalizado se incluye en el error", async () => {
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

  test("usuario rehabilitado puede iniciar sesión nuevamente", async () => {
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

describe("user create hook — roles en sign-up", () => {
  test("defaultRole se aplica a nuevos usuarios", async () => {
    const instance = createTestInstance({ defaultRole: "viewer" });

    await instance.signUpUser("newviewer@test.com", "password123", "Viewer User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "newviewer@test.com");

    expect(user?.["role"]).toBe("viewer");
  });

  test("defaultRoleForSignUp tiene precedencia sobre defaultRole", async () => {
    const instance = createTestInstance({
      defaultRole: "viewer",
      defaultRoleForSignUp: "member",
    });

    await instance.signUpUser("newmember@test.com", "password123", "Member User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "newmember@test.com");

    expect(user?.["role"]).toBe("member");
  });

  test("sin configuración, el rol por defecto es 'user'", async () => {
    const instance = createTestInstance();

    await instance.signUpUser("defaultuser@test.com", "password123", "Default User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "defaultuser@test.com");

    expect(user?.["role"]).toBe("user");
  });

  test("isActive se establece como true al crear un usuario", async () => {
    const instance = createTestInstance();

    await instance.signUpUser("active@test.com", "password123", "Active User");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "active@test.com");

    expect(user?.["isActive"]).toBe(true);
  });
});

// ─── modules — control de acceso por módulo ───────────────────────────────────

describe("modules — acceso por origen", () => {
  test("usuario con rol permitido puede iniciar sesión desde el módulo", async () => {
    const instance = createTestInstance({
      modules: {
        adminPanel: {
          origin: "http://admin.example.com",
          allowedRoles: ["admin"],
        },
      },
    });
    const admin = await instance.createAdminUser();

    // Admin sign-in desde el origen del módulo permitido
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

  test("usuario con rol no permitido es bloqueado en el módulo", async () => {
    const instance = createTestInstance({
      modules: {
        adminPanel: {
          origin: "http://admin.example.com",
          allowedRoles: ["admin"],
        },
      },
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

  test("mensaje de denegación personalizado del módulo aparece en el error", async () => {
    const denyMsg = "No tienes acceso al panel de administración.";
    const instance = createTestInstance({
      modules: {
        adminPanel: {
          origin: "http://admin.example.com",
          allowedRoles: ["admin"],
          denyMessage: denyMsg,
        },
      },
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

  test("con moduleUnmatchedBehavior: 'deny', origen no registrado bloquea el registro", async () => {
    // Con moduleUnmatchedBehavior: 'deny', el hook user.create.before también verifica
    // el origen. Un sign-up desde un origen no registrado queda denegado con 403.
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
      modules: {
        adminPanel: {
          origin: "http://admin.example.com",
          allowedRoles: ["admin"],
        },
      },
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

  test("con moduleUnmatchedBehavior: 'allow' (default), origen no registrado permite el acceso", async () => {
    const instance = createTestInstance({
      modules: {
        adminPanel: {
          origin: "http://admin.example.com",
          allowedRoles: ["admin"],
        },
      },
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

  test("allowedRoles como función síncrona permite al rol correcto", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: (roles) => roles.includes("editor"),
        },
      },
    });

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

  test("allowedRoles como función async permite al rol correcto", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: async (roles) => roles.includes("editor"),
        },
      },
    });

    await instance.signUpUser("asynceditor@test.com", "password123", "Async Editor");
    const db = instance.db as Record<string, Array<Record<string, unknown>>>;
    const user = (db["user"] ?? []).find((u) => u["email"] === "asynceditor@test.com");
    if (user) user["role"] = "editor";

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

  test("allowedRoles como función que deniega bloquea con 403", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: () => false,
        },
      },
    });

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

describe("modules — enforceModulesOnSession en getSession", () => {
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

  test("getSession devuelve null cuando el usuario accede desde un módulo no permitido para su rol", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: ["admin", "editor"],
        },
        userPanel: {
          origin: "http://user.example.com",
          allowedRoles: ["admin", "user"],
        },
      },
    });

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

  test("getSession devuelve sesión válida cuando el usuario accede desde su módulo permitido", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: ["admin", "editor"],
        },
        userPanel: {
          origin: "http://user.example.com",
          allowedRoles: ["admin", "user"],
        },
      },
    });

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

  test("admin puede acceder a getSession desde cualquier módulo", async () => {
    const instance = createTestInstance({
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: ["admin", "editor"],
        },
        userPanel: {
          origin: "http://user.example.com",
          allowedRoles: ["admin", "user"],
        },
      },
    });

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

  test("enforceModulesOnSession: false desactiva la verificación en getSession", async () => {
    const instance = createTestInstance({
      enforceModulesOnSession: false,
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: ["admin", "editor"],
        },
        userPanel: {
          origin: "http://user.example.com",
          allowedRoles: ["admin", "user"],
        },
      },
    });

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

  test("sin modules configurados, getSession funciona normalmente", async () => {
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

  test("con moduleUnmatchedBehavior: 'deny', getSession desde origen no registrado devuelve null", async () => {
    const instance = createTestInstance({
      moduleUnmatchedBehavior: "deny",
      modules: {
        editorPanel: {
          origin: "http://editor.example.com",
          allowedRoles: ["admin", "editor"],
        },
        userPanel: {
          origin: "http://user.example.com",
          allowedRoles: ["admin", "user"],
        },
      },
    });

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
