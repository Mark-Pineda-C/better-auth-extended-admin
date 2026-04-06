import { router, adminProcedure } from "../trpc";
import { DEFAULT_MODULE_ACCESS } from "../auth";

export const adminRouter = router({
  getAdminConfig: adminProcedure.query(() => ({
    modules: [
      {
        key: "adminPanel",
        name: "Admin Panel",
        origin: "http://localhost:3001",
      },
      {
        key: "editorPanel",
        name: "Editor Panel",
        origin: "http://localhost:3002",
      },
      {
        key: "userPanel",
        name: "User Panel",
        origin: "http://localhost:3003",
      },
    ],
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
      module: ["adminPanel", "editorPanel", "userPanel"],
    },
  })),
});
