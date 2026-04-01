import { mergeSchema } from "better-auth/db";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { createAuthMiddleware } from "@better-auth/core/api";
import { isAPIError } from "better-auth/api";
import { defaultRoles } from "./access/statement";
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

declare module "@better-auth/core" {
    interface BetterAuthPluginRegistry<AuthOptions, Options> {
        admin: {
            creator: typeof admin;
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

export const admin = <O extends AdminOptions>(options?: O) => {
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

    const dynamicEndpoints = options?.dynamicRoles?.enabled
        ? {
              createRole: createRole(opts),
              updateRole: updateRole(opts),
              deleteRole: deleteRole(opts),
              listRoles: listRoles(opts),
              getRole: getRole(opts),
          }
        : {};

    return {
        id: "admin",

        init() {
            return {
                options: {
                    databaseHooks: {
                        user: {
                            create: {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                async before(user: any) {
                                    const role =
                                        // allowRoleOnSignUp lets the user supply a role from the sign-up body
                                        (opts.allowRoleOnSignUp && user.role
                                            ? parseRoles(user.role as string | string[])
                                            : null) ??
                                        opts.defaultRoleForSignUp ??
                                        opts.defaultRole ??
                                        "user";

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
                    matcher(context: { path: string }) {
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
            ...dynamicEndpoints,
        },

        $ERROR_CODES: ADMIN_ERROR_CODES,

        schema: mergeSchema(baseSchema, opts.schema),

        options,
    } as const;
};