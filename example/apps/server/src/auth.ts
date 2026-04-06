import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { extendedAdmin } from "better-auth-extended-admin";
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

function createModuleChecker(moduleName: string) {
  return async (roles: string[]): Promise<boolean> => {
    if (roles.includes("admin")) return true;
    const dbRoles = db.select().from(schema.globalRole).all();
    return roles.some((role) => {
      const dbRole = dbRoles.find((r) => r.name === role);
      if (dbRole) {
        try {
          const perms = JSON.parse(dbRole.permissions) as Record<
            string,
            string[]
          >;
          return perms.module?.includes(moduleName) ?? false;
        } catch {
          return false;
        }
      }
      return DEFAULT_MODULE_ACCESS[role]?.includes(moduleName) ?? false;
    });
  };
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
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ],
  plugins: [
    extendedAdmin({
      adminRoles: ["admin"],
      allowRoleOnSignUp: true,
      moduleUnmatchedBehavior: "deny",
      ac,
      dynamicRoles: { enabled: true },
      roles: {
        admin: adminRole,
        editor: editorRole,
        user: userRole,
      },
      modules: {
        adminPanel: {
          origin: "http://localhost:3001",
          allowedRoles: createModuleChecker("adminPanel"),
          denyMessage:
            "Solo usuarios con rol 'admin' pueden acceder al panel de administración.",
        },
        editorPanel: {
          origin: "http://localhost:3002",
          allowedRoles: createModuleChecker("editorPanel"),
          denyMessage:
            "Solo usuarios con rol 'admin' o 'editor' pueden acceder al panel de edición.",
        },
        userPanel: {
          origin: "http://localhost:3003",
          allowedRoles: createModuleChecker("userPanel"),
          denyMessage:
            "Solo usuarios con rol 'admin' o 'user' pueden acceder al panel de usuarios.",
        },
      },
    }),
  ],
});
