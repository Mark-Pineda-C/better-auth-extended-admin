import { mergeSchema } from "better-auth/db";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { createAuthMiddleware } from "@better-auth/core/api";
import { isAPIError } from "better-auth/api";
import type { Role } from "better-auth/plugins/access";
import { defaultRoles } from "./access/statement";
import { listEnabledModules } from "./module-store";
import { ADMIN_ERROR_CODES } from "./error-codes";
import { schema } from "./schema";
import type { AdminOptions } from "./types";
import {
  adminUpdateUser,
  banUser,
  createUser,
  disableUser,
  enableUser,
  getUser,
  impersonateUser,
  listUserSessions,
  listUsers,
  parseRoles,
  removeUser,
  revokeUserSession,
  revokeUserSessions,
  setRole,
  setUserPassword,
  stopImpersonating,
  unbanUser,
  userHasPermission,
} from "./routes/admin-routes";

import {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  updateRole,
} from "./routes/role-routes";
import { createModule, deleteModule, getModule, listModules, updateModule } from "./routes/module-routes";

declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    extendedAdmin: {
      creator: typeof extendedAdmin;
    };
  }
}

const getEndpointResponse = async (ctx: {
  context: { returned?: unknown };
}) => {
  const returned = ctx.context.returned;
  if (!returned) return null;
  if (returned instanceof Response) {
    if ((returned as Response).status !== 200) return null;
    return (returned as Response).clone().json();
  }
  if (isAPIError(returned)) return null;
  return returned;
};

interface ResolvedModule {
  key: string;
  denyMessage: string | null;
}

const hasStaticModuleAccess = (
  roleNames: string[],
  acRoles: Record<string, Role>,
  moduleKey: string,
): boolean => roleNames.some((role) =>
  (acRoles[role]?.statements?.module ?? []).includes(moduleKey) ||
  (acRoles[role]?.statements?.module ?? []).includes("*")
);

async function hasDynamicModuleAccess(
  roleNames: string[],
  ctx: { context?: unknown },
  moduleKey: string,
): Promise<boolean> {
  if (!ctx.context) return false;
  const dbRoles = await (
    (ctx as {
      context: {
        adapter: {
          findMany(input: { model: string; where: unknown[] }): Promise<Array<{ name: string; permissions: string }>>;
        };
      };
    }).context.adapter.findMany({
      model: "globalRole",
      where: [],
    })
  );

  return roleNames.some((roleName) => {
    const dbRole = dbRoles.find((r) => r.name === roleName);
    if (!dbRole) return false;
    try {
      const parsed = JSON.parse(dbRole.permissions) as Record<string, string[]>;
      return (parsed.module ?? []).includes(moduleKey) ||
        (parsed.module ?? []).includes("*");
    } catch {
      return false;
    }
  });
}

function getRequestOrigin(ctx: {
  headers?: Headers;
  request?: Request;
}): string | null {
  const origin = ctx.headers?.get("origin") ?? ctx.request?.headers.get("origin");
  if (origin) return origin;
  const referer = ctx.headers?.get("referer") ?? ctx.request?.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

async function checkModuleAccess(
  opts: AdminOptions,
  role: string,
  ctx: { headers?: Headers; request?: Request; path?: string; context?: unknown },
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (opts.dynamicModules?.enabled !== true) {
    return { allowed: true };
  }

  if (!ctx.context) {
    return { allowed: true };
  }

  const requestOrigin = getRequestOrigin(ctx);
  const modules = await listEnabledModules(ctx as Parameters<typeof listEnabledModules>[0]);
  if (modules.length === 0) return { allowed: true };
  const matchedModule = requestOrigin
    ? modules.find((m) => m.origins.includes(requestOrigin))
    : undefined;
  const matched: ResolvedModule | null = matchedModule
    ? { key: matchedModule.key, denyMessage: matchedModule.denyMessage }
    : null;

  if (!matched) {
    if ((opts.moduleUnmatchedBehavior ?? "allow") === "deny") {
      return {
        allowed: false,
        message:
          opts.moduleDenyMessage ??
          "Login not allowed for your current role in this application.",
      };
    }
    return { allowed: true };
  }

  const roleNames = role.split(",").map((r) => r.trim()).filter(Boolean);
  const acRoles: Record<string, Role> = {
    ...defaultRoles,
    ...(opts.roles ?? {}),
  };
  const hasStaticAccess = hasStaticModuleAccess(roleNames, acRoles, matched.key);
  const hasAllowed = hasStaticAccess ||
    (opts.dynamicRoles?.enabled
      ? await hasDynamicModuleAccess(roleNames, ctx, matched.key)
      : false);

  if (hasAllowed) return { allowed: true };

  return {
    allowed: false,
    message:
      matched.denyMessage ??
      opts.moduleDenyMessage ??
      "Login not allowed for your current role in this application.",
  };
}

export const extendedAdmin = <O extends AdminOptions>(options?: O) => {
  const opts = {
    ...(options ?? {}),
    defaultRole: options?.defaultRole ?? "user",
    adminRoles: options?.adminRoles ?? ["admin"],
    bannedUserMessage:
      options?.bannedUserMessage ??
      "You have been banned from this application. Please contact support if you believe this is an error.",
    disabledUserMessage:
      options?.disabledUserMessage ??
      "Your account has been disabled. Please contact support.",
  } satisfies AdminOptions;

  // Validate that admin roles exist in the configured roles
  if (options?.adminRoles) {
    const definedRoleKeys = Object.keys(options.roles ?? defaultRoles).map(
      (r) => r.toLowerCase(),
    );
    const adminRoleList = Array.isArray(options.adminRoles)
      ? options.adminRoles
      : options.adminRoles.split(",");

    const invalidRoles = adminRoleList.filter(
      (r) => !definedRoleKeys.includes(r.toLowerCase()),
    );

    if (invalidRoles.length > 0 && !options.dynamicRoles?.enabled) {
      throw new BetterAuthError(
        `Invalid admin roles: ${invalidRoles.join(", ")}. Admin roles must be defined in the 'roles' configuration.`,
      );
    }
  }

  // Warn if dynamicRoles enabled but ac is missing
  if (options?.dynamicRoles?.enabled && !options.ac) {
    throw new BetterAuthError(
      "[ExtendedAdmin] dynamicRoles.enabled requires the `ac` option to be set.",
    );
  }

  // Build the base schema — when allowRoleOnSignUp is enabled, expose `role` as user input
  const baseSchema = options?.allowRoleOnSignUp
    ? ({
      ...schema,
      user: {
        fields: {
          ...schema.user.fields,
          role: { type: "string" as const, required: false, input: true },
        },
      },
    } as unknown as typeof schema)
    : schema;


  return {
    id: "extended-admin" as const,

    init() {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async before(user: any, ctx: any) {
                  const role =
                    // allowRoleOnSignUp lets the user supply a role from the sign-up body
                    (opts.allowRoleOnSignUp && user.role
                      ? parseRoles(user.role as string | string[])
                      : null) ??
                    opts.defaultRoleForSignUp ??
                    opts.defaultRole ??
                    "user";

                  // Check module-based access control for sign-up
                  if (ctx) {
                    const moduleResult = await checkModuleAccess(opts, role, ctx);
                    if (!moduleResult.allowed) {
                      if (
                        ctx.path?.startsWith("/callback") ||
                        ctx.path?.startsWith("/oauth2/callback")
                      ) {
                        const redirectURI =
                          ctx.context?.options?.onAPIError?.errorURL ??
                          `${ctx.context?.baseURL}/error`;
                        throw ctx.redirect(
                          `${redirectURI}?error=module_access_denied&error_description=${moduleResult.message}`,
                        );
                      }
                      throw APIError.from("FORBIDDEN", {
                        message: moduleResult.message,
                        code: "MODULE_ACCESS_DENIED",
                      });
                    }
                  }

                  return {
                    data: {
                      role,
                      isActive: true,
                      ...user,
                    },
                  };
                },
              },
            },
            session: {
              create: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async before(session: any, ctx: any) {
                  if (!ctx) return;

                  const user =
                    await ctx.context.internalAdapter.findUserById(
                      session.userId,
                    );

                  // Check disabled first (softer block — no ban record)
                  if (user?.isActive === false) {
                    if (
                      ctx.path.startsWith("/callback") ||
                      ctx.path.startsWith("/oauth2/callback")
                    ) {
                      const redirectURI =
                        ctx.context.options.onAPIError?.errorURL ??
                        `${ctx.context.baseURL}/error`;
                      throw ctx.redirect(
                        `${redirectURI}?error=disabled&error_description=${opts.disabledUserMessage}`,
                      );
                    }
                    throw APIError.from("FORBIDDEN", {
                      message: opts.disabledUserMessage,
                      code: "USER_IS_DISABLED",
                    });
                  }

                  // Check ban
                  if (user?.banned) {
                    if (
                      user.banExpires &&
                      new Date(user.banExpires).getTime() < Date.now()
                    ) {
                      await ctx.context.internalAdapter.updateUser(
                        session.userId,
                        {
                          banned: false,
                          banReason: null,
                          banExpires: null,
                        },
                      );
                      return;
                    }

                    if (
                      ctx.path.startsWith("/callback") ||
                      ctx.path.startsWith("/oauth2/callback")
                    ) {
                      const redirectURI =
                        ctx.context.options.onAPIError?.errorURL ??
                        `${ctx.context.baseURL}/error`;
                      throw ctx.redirect(
                        `${redirectURI}?error=banned&error_description=${opts.bannedUserMessage}`,
                      );
                    }

                    throw APIError.from("FORBIDDEN", {
                      message: opts.bannedUserMessage,
                      code: "BANNED_USER",
                    });
                  }

                  // Check module-based access control
                  const moduleResult = await checkModuleAccess(
                    opts,
                    user?.role ?? opts.defaultRole ?? "user",
                    ctx,
                  );
                  if (!moduleResult.allowed) {
                    if (
                      ctx.path.startsWith("/callback") ||
                      ctx.path.startsWith("/oauth2/callback")
                    ) {
                      const redirectURI =
                        ctx.context.options.onAPIError?.errorURL ??
                        `${ctx.context.baseURL}/error`;
                      throw ctx.redirect(
                        `${redirectURI}?error=module_access_denied&error_description=${moduleResult.message}`,
                      );
                    }
                    throw APIError.from("FORBIDDEN", {
                      message: moduleResult.message,
                      code: "MODULE_ACCESS_DENIED",
                    });
                  }
                },
              },
            },
          },
        },
      };
    },

    hooks: {
      after: [
        {
          matcher(context: { path?: string }) {
            return context.path === "/get-session";
          },
          handler: createAuthMiddleware(async (ctx) => {
            if (opts.enforceModulesOnSession === false) return;
            if (opts.dynamicModules?.enabled !== true) return;
            const response = await getEndpointResponse(ctx) as { user: { role: string } };
            if (!response?.user) return;

            const moduleResult = await checkModuleAccess(
              opts,
              response.user.role ?? opts.defaultRole ?? "user",
              ctx,
            );

            if (!moduleResult.allowed) {
              throw APIError.from("UNAUTHORIZED", {
                message: moduleResult.message,
                code: "MODULE_ACCESS_DENIED",
              });
            }
          }),
        },
        {
          matcher(context: { path?: string }) {
            return context.path === "/list-sessions";
          },
          handler: createAuthMiddleware(async (ctx) => {
            const response = await getEndpointResponse(ctx);
            if (!response || !Array.isArray(response)) return;
            const filtered = response.filter(
              (s: { impersonatedBy?: string }) => !s.impersonatedBy,
            );
            return ctx.json(filtered);
          }),
        },
      ],
    },

    endpoints: {
      setRole: setRole(opts),
      getUser: getUser(opts),
      createUser: createUser(opts),
      adminUpdateUser: adminUpdateUser(opts),
      listUsers: listUsers(opts),
      listUserSessions: listUserSessions(opts),
      unbanUser: unbanUser(opts),
      banUser: banUser(opts),
      enableUser: enableUser(opts),
      disableUser: disableUser(opts),
      impersonateUser: impersonateUser(opts),
      stopImpersonating: stopImpersonating(),
      revokeUserSession: revokeUserSession(opts),
      revokeUserSessions: revokeUserSessions(opts),
      removeUser: removeUser(opts),
      setUserPassword: setUserPassword(opts),
      userHasPermission: userHasPermission(opts),
      createRole: createRole(opts),
      updateRole: updateRole(opts),
      deleteRole: deleteRole(opts),
      listRoles: listRoles(opts),
      getRole: getRole(opts),
      createModule: createModule(opts),
      updateModule: updateModule(opts),
      deleteModule: deleteModule(opts),
      listModules: listModules(opts),
      getModule: getModule(opts),
    },

    $ERROR_CODES: ADMIN_ERROR_CODES,

    schema: mergeSchema(baseSchema, opts.schema),

    options,
  };
};