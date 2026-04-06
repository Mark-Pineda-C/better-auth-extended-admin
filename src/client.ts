import type { Role } from "better-auth/plugins/access";
import { adminAc, defaultRoles, userAc } from "./access/statement";
import { ADMIN_ERROR_CODES } from "./error-codes";
import type { AdminOptions } from "./types";

interface ClientAdminOptions {
  /**
   * Custom static roles to add to the client-side role registry.
   * Merged with the built-in `admin` and `user` roles.
   */
  roles?: Record<string, Role>;
}

const hasPermissionClient = (
  data: {
    role: string;
    permissions: Record<string, string[]>;
  },
  roles: Record<string, Role>,
): boolean => {
  const roleList = data.role.split(",");
  for (const role of roleList) {
    if (roles[role]?.authorize(data.permissions)?.success) return true;
  }
  return false;
};

export const extendedAdminClient = (options?: ClientAdminOptions) => {
  const roles: Record<string, Role> = {
    admin: adminAc,
    user: userAc,
    ...(options?.roles ?? {}),
  };

  return {
    id: "extended-admin-client",
    $InferServerPlugin: {} as ReturnType<typeof import("./extended-admin").extendedAdmin>,
    getActions: () => ({
      extendedAdmin: {
        /**
         * Client-side permission check using static roles only.
         * For dynamic roles defined in the database use the server-side
         * `/extended-admin/has-permission` endpoint instead.
         */
        checkRolePermission: (data: {
          role: string;
          permissions: Record<string, string[]>;
        }) => hasPermissionClient(data, roles),
      },
    }),
    pathMethods: {
      "/extended-admin/list-users": "GET",
      "/extended-admin/list-roles": "GET",
      "/extended-admin/get-role": "GET",
      "/extended-admin/list-modules": "GET",
      "/extended-admin/get-module": "GET",
      "/extended-admin/get-user": "GET",
      "/extended-admin/stop-impersonating": "POST",
    } as const,
    $ERROR_CODES: ADMIN_ERROR_CODES,
  };
};

export type { AdminOptions, ClientAdminOptions };
