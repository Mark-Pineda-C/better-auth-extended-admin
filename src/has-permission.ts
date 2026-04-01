import type { GenericEndpointContext } from "@better-auth/core";
import type { Role } from "better-auth/plugins/access";
import type { AdminOptions } from "./types";
import { defaultRoles } from "./access/statement";

interface HasPermissionInput {
  userId?: string | undefined;
  role?: string | undefined;
  options: AdminOptions;
  permissions?: Record<string, string[]> | undefined;
}

const roleCache = new Map<string, Record<string, Role>>();

const hasPermissionFn = (
  roles: string[],
  acRoles: Record<string, Role>,
  permissions: Record<string, string[]>,
): boolean => {
  for (const role of roles) {
    if (acRoles[role]?.authorize(permissions)?.success) return true;
  }
  return false;
};

export const hasPermission = async (
  input: HasPermissionInput,
  ctx?: GenericEndpointContext,
): Promise<boolean> => {
  if (
    input.userId &&
    input.options.adminUserIds?.includes(input.userId)
  ) {
    return true;
  }

  if (!input.permissions) return false;

  const roles = (input.role ?? input.options.defaultRole ?? "user").split(",");

  let acRoles: Record<string, Role> = {
    ...defaultRoles,
    ...(input.options.roles ?? {}),
  };

  if (
    ctx &&
    input.options.dynamicRoles?.enabled &&
    input.options.ac
  ) {
    const cached = roleCache.get("__admin__");
    if (cached) {
      acRoles = cached;
    } else {
      const dbRoles = await ctx.context.adapter.findMany({
        model: "globalRole",
        where: [],
      }) as Array<{ name: string; permissions: string }>;

      for (const dbRole of dbRoles) {
        let parsedPermissions: Record<string, string[]>;
        try {
          parsedPermissions = JSON.parse(dbRole.permissions) as Record<string, string[]>;
        } catch {
          ctx.context.logger.error(
            "[ExtendedAdmin] Invalid permissions JSON for role: " + dbRole.name,
          );
          continue;
        }

        const staticStatements = acRoles[dbRole.name]?.statements ?? {};
        const merged: Record<string, string[]> = { ...staticStatements };

        for (const [resource, actions] of Object.entries(parsedPermissions)) {
          merged[resource] = [
            ...new Set([...(merged[resource] ?? []), ...actions]),
          ];
        }

        acRoles[dbRole.name] = input.options.ac.newRole(merged);
      }

      roleCache.set("__admin__", acRoles);
    }
  }

  return hasPermissionFn(roles, acRoles, input.permissions);
};

export const invalidateRoleCache = () => {
  roleCache.delete("__admin__");
};
