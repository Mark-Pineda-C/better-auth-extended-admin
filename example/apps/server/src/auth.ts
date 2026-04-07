import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAccessControl } from "better-auth/plugins/access";
import { extendedAdmin } from "better-auth-extended-admin";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
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
  module: ["adminpanel", "editorpanel", "userpanel"] as const,
});
const pluginAc = ac as any;

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
  module: ["adminpanel", "editorpanel", "userpanel"],
});

const editorRole = ac.newRole({
  user: [],
  session: [],
  role: [],
  module: ["editorpanel"],
});

const userRole = ac.newRole({
  user: [],
  session: [],
  role: [],
  module: ["userpanel"],
});

export const DEFAULT_MODULE_ACCESS: Record<string, string[]> = {
  admin: ["adminpanel", "editorpanel", "userpanel"],
  editor: ["editorpanel"],
  user: ["userpanel"],
};

export const DEFAULT_MODULES = [
  {
    key: "adminpanel",
    name: "Admin Panel",
    origins: ["http://admin-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' pueden acceder al panel de administración.",
  },
  {
    key: "editorpanel",
    name: "Editor Panel",
    origins: ["http://editor-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' o 'editor' pueden acceder al panel de edición.",
  },
  {
    key: "userpanel",
    name: "User Panel",
    origins: ["http://user-panel.localhost:1355"],
    denyMessage:
      "Solo usuarios con rol 'admin' o 'user' pueden acceder al panel de usuarios.",
  },
];

// Normalize existing module keys and role module refs to lowercase to avoid
// validation mismatches (e.g. adminPanel vs adminpanel) in dynamic mode.
const existingModules = db
  .select({
    id: schema.globalModule.id,
    key: schema.globalModule.key,
    enabled: schema.globalModule.enabled,
    createdAt: schema.globalModule.createdAt,
  })
  .from(schema.globalModule)
  .all();

const normalizedById = new Map<string, string>();
for (const mod of existingModules) {
  const normalized = mod.key.toLowerCase().trim();
  normalizedById.set(mod.id, normalized);
  if (normalized !== mod.key) {
    db.update(schema.globalModule)
      .set({ key: normalized, updatedAt: new Date() })
      .where(eq(schema.globalModule.id, mod.id))
      .run();
  }
}

// Deduplicate by normalized key when old mixed-case data exists.
const modulesAfterNormalize = db
  .select({
    id: schema.globalModule.id,
    key: schema.globalModule.key,
    enabled: schema.globalModule.enabled,
    createdAt: schema.globalModule.createdAt,
  })
  .from(schema.globalModule)
  .all();

const keepByKey = new Map<string, string>();
for (const mod of modulesAfterNormalize) {
  const keepId = keepByKey.get(mod.key);
  if (!keepId) {
    keepByKey.set(mod.key, mod.id);
    continue;
  }
  const currentKeep = modulesAfterNormalize.find((m) => m.id === keepId);
  if (!currentKeep) continue;
  const shouldReplaceKeep =
    Number(mod.enabled) > Number(currentKeep.enabled) ||
    (Number(mod.enabled) === Number(currentKeep.enabled) &&
      mod.createdAt < currentKeep.createdAt);
  if (shouldReplaceKeep) {
    db.delete(schema.globalModule)
      .where(eq(schema.globalModule.id, keepId))
      .run();
    keepByKey.set(mod.key, mod.id);
  } else {
    db.delete(schema.globalModule)
      .where(eq(schema.globalModule.id, mod.id))
      .run();
  }
}

const existingRoles = db
  .select({
    id: schema.globalRole.id,
    permissions: schema.globalRole.permissions,
  })
  .from(schema.globalRole)
  .all();

for (const role of existingRoles) {
  try {
    const parsed = JSON.parse(role.permissions) as Record<string, string[]>;
    const modules = parsed.module ?? [];
    const normalizedModules = [...new Set(
      modules.map((m) => m.toLowerCase().trim()).filter(Boolean),
    )];
    const changed =
      normalizedModules.length !== modules.length ||
      normalizedModules.some((m, i) => m !== modules[i]);
    if (!changed) continue;
    parsed.module = normalizedModules;
    db.update(schema.globalRole)
      .set({
        permissions: JSON.stringify(parsed),
        updatedAt: new Date(),
      })
      .where(eq(schema.globalRole.id, role.id))
      .run();
  } catch {
    // Ignore malformed permission payloads in demo data.
  }
}

const existingModuleKeys = new Set(
  db
    .select({ key: schema.globalModule.key })
    .from(schema.globalModule)
    .all()
    .map((m) => m.key.toLowerCase().trim()),
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
      ac: pluginAc,
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
