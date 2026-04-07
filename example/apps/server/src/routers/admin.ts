import { router, adminProcedure } from "../trpc";
import { DEFAULT_MODULE_ACCESS, DEFAULT_MODULES } from "../auth";

export const adminRouter = router({
  getAdminConfig: adminProcedure.query(() => ({
    modules: DEFAULT_MODULES.map((m) => ({
      key: m.key,
      name: m.name,
      origin: m.origins[0] ?? "",
    })),
    staticRoles: ["admin", "editor", "user"],
    defaultModuleAccess: DEFAULT_MODULE_ACCESS,
    availablePermissions: {
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
      ],
      session: ["list", "revoke", "delete"],
      role: ["create", "read", "update", "delete", "list"],
      module: DEFAULT_MODULES.map((m) => m.key),
    },
  })),
});
