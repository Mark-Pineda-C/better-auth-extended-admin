import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { extendedAdmin } from "better-auth-extended-admin";
import { randomUUID } from "crypto";
import { db } from "./db";
import * as schema from "./schema";

const ac = createAccessControl({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "get",
    "update",
    "enable",
    "disable",
  ] as const,
  session: ["list", "revoke", "delete"] as const,
  role: ["create", "read", "update", "delete", "list"] as const,
  module: ["adminPanel", "editorPanel", "userPanel"] as const,
});

const adminRole = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "get",
    "update",
    "enable",
    "disable",
  ],
  session: ["list", "revoke", "delete"],
  role: ["create", "read", "update", "delete", "list"],
  module: ["adminPanel", "editorPanel", "userPanel"],
});

const editorRole = ac.newRole({
  user: [],
  session: [],
  role: [],
  module: ["editorPanel"],
});

const userRole = ac.newRole({
  user: [],
  session: [],
  role: [],
  module: ["userPanel"],
});

export const DEFAULT_MODULE_ACCESS: Record<string, string[]> = {
  admin: ["adminPanel", "editorPanel", "userPanel"],
  editor: ["editorPanel"],
  user: ["userPanel"],
};

export const DEFAULT_MODULES = [
  {
    key: "adminPanel",
    name: "Admin Panel",
    origins: ["http://admin-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' pueden acceder al panel de administración.",
  },
  {
    key: "editorPanel",
    name: "Editor Panel",
    origins: ["http://editor-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' o 'editor' pueden acceder al panel de edición.",
  },
  {
    key: "userPanel",
    name: "User Panel",
    origins: ["http://user-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' o 'user' pueden acceder al panel de usuarios.",
  },
];

const existingModuleKeys = new Set(
  db.select({ key: schema.globalModule.key }).from(schema.globalModule).all().map((m) => m.key),
);

for (const mod of DEFAULT_MODULES) {
  if (existingModuleKeys.has(mod.key)) continue;
  db.insert(schema.globalModule).values({
    id: randomUUID(),
    key: mod.key,
    name: mod.name,
    origins: JSON.stringify(mod.origins),
    denyMessage: mod.denyMessage,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();
}

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret:
    process.env.BETTER_AUTH_SECRET ?? "example-secret-change-in-production",
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    "http://admin-panel.localhost:1355",
    "http://editor-panel.localhost:1355",
    "http://user-panel.localhost:1355",
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    }
  },
  plugins: [
    extendedAdmin({
      adminRoles: ["admin"],
      allowRoleOnSignUp: true,
      moduleUnmatchedBehavior: "deny",
      ac,
      dynamicRoles: { enabled: true },
      dynamicModules: { enabled: true },
      roles: {
        admin: adminRole,
        editor: editorRole,
        user: userRole,
      },
    }),
  ],
});
