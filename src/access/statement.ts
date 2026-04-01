import { createAccessControl } from "better-auth/plugins/access";

export const defaultStatements = {
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
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
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
});

export const userAc = defaultAc.newRole({
  user: [],
  session: [],
  role: [],
});

export const defaultRoles = {
  admin: adminAc,
  user: userAc,
};
