import { parseSessionOutput, parseUserOutput } from "better-auth/db";
import {
  deleteSessionCookie,
  expireCookie,
  setSessionCookie,
} from "better-auth/cookies";
import { getSessionFromCtx } from "better-auth/api";
import { ADMIN_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { Where } from "@better-auth/core/db/adapter";
import { whereOperators } from "@better-auth/core/db/adapter";
import { createAuthEndpoint, createAuthMiddleware } from "@better-auth/core/api";
import type { AdminOptions, UserWithRole } from "../types";
import * as z from "zod";

const getDate = (span: number, unit: "sec" | "ms" = "ms") =>
  new Date(Date.now() + (unit === "sec" ? span * 1000 : span));

export const adminMiddleware = createAuthMiddleware(async (ctx) => {
  const session = await getSessionFromCtx(ctx);
  if (!session) throw APIError.fromStatus("UNAUTHORIZED");
  return { session };
});

export function parseRoles(roles: string | string[]): string {
  return Array.isArray(roles) ? roles.join(",") : roles;
}

// ─── set-role ────────────────────────────────────────────────────────────────

const setRoleBodySchema = z.object({
  userId: z.coerce.string(),
  role: z.union([z.string(), z.array(z.string())]),
});

export const setRole = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/set-role",
    {
      method: "POST",
      body: setRoleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      const sessionUser = ctx.context.session.user as UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { user: ["set-role"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE,
        );
      }

      const body = ctx.body as z.infer<typeof setRoleBodySchema>;
      const inputRoles = Array.isArray(body.role) ? body.role : [body.role];

      if (opts.roles) {
        for (const role of inputRoles) {
          if (!opts.roles[role]) {
            throw APIError.from(
              "BAD_REQUEST",
              ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE,
            );
          }
        }
      }

      const updatedUser = await ctx.context.internalAdapter.updateUser(
        body.userId,
        { role: parseRoles(body.role) },
      );

      return ctx.json({ user: parseUserOutput(ctx.context.options, updatedUser) });
    },
  );

// ─── get-user ────────────────────────────────────────────────────────────────

export const getUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/get-user",
    {
      method: "GET",
      query: z.object({ id: z.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      const sessionUser = ctx.context.session.user as UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { user: ["get"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_USER,
        );
      }

      const user = await ctx.context.internalAdapter.findUserById(ctx.query.id);
      if (!user) throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);

      return ctx.json(parseUserOutput(ctx.context.options, user));
    },
  );

// ─── create-user ─────────────────────────────────────────────────────────────

const createUserBodySchema = z.object({
  email: z.string(),
  password: z.string().optional(),
  name: z.string(),
  role: z.union([z.string(), z.array(z.string())]).optional(),
  data: z.record(z.string(), z.any()).optional(),
});

export const createUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/create-user",
    {
      method: "POST",
      body: createUserBodySchema,
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      if (!session && (ctx.request || ctx.headers)) {
        throw ctx.error("UNAUTHORIZED");
      }

      if (session) {
        const sessionUser = session.user as UserWithRole;
        if (
          !await hasPermission(
            {
              userId: sessionUser.id,
              role: sessionUser.role,
              options: opts,
              permissions: { user: ["create"] },
            },
            ctx,
          )
        ) {
          throw APIError.from(
            "FORBIDDEN",
            ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS,
          );
        }
      }

      const body = ctx.body as z.infer<typeof createUserBodySchema>;
      const email = body.email.toLowerCase();
      if (!z.string().email().safeParse(email).success) {
        throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
      }

      if (await ctx.context.internalAdapter.findUserByEmail(email)) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
        );
      }

      const assignedRole =
        (body.role && parseRoles(body.role)) ??
        opts.defaultRole ??
        "user";

      const user = await ctx.context.internalAdapter.createUser({
        email,
        name: body.name,
        role: assignedRole,
        isActive: true,
        ...body.data,
      });

      if (!user) {
        throw APIError.from(
          "INTERNAL_SERVER_ERROR",
          ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER,
        );
      }

      if (body.password) {
        const hashedPassword = await ctx.context.password.hash(body.password);
        await ctx.context.internalAdapter.linkAccount({
          accountId: user.id,
          providerId: "credential",
          password: hashedPassword,
          userId: user.id,
        });
      }

      return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
    },
  );

// ─── update-user ─────────────────────────────────────────────────────────────

const adminUpdateUserBodySchema = z.object({
  userId: z.coerce.string(),
  data: z.record(z.any(), z.any()),
});

export const adminUpdateUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/update-user",
    {
      method: "POST",
      body: adminUpdateUserBodySchema,
      use: [adminMiddleware],
    },
    async (ctx) => {
      const sessionUser = ctx.context.session.user as UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { user: ["update"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS,
        );
      }

      const body = ctx.body as z.infer<typeof adminUpdateUserBodySchema>;

      if (Object.keys(body.data).length === 0) {
        throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.NO_DATA_TO_UPDATE);
      }

      if (Object.prototype.hasOwnProperty.call(body.data, "role")) {
        if (
          !await hasPermission(
            {
              userId: sessionUser.id,
              role: sessionUser.role,
              options: opts,
              permissions: { user: ["set-role"] },
            },
            ctx,
          )
        ) {
          throw APIError.from(
            "FORBIDDEN",
            ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE,
          );
        }

        const roleValue = body.data.role as string | string[];
        const inputRoles = Array.isArray(roleValue) ? roleValue : [roleValue];

        for (const role of inputRoles) {
          if (typeof role !== "string") {
            throw APIError.from(
              "BAD_REQUEST",
              ADMIN_ERROR_CODES.INVALID_ROLE_TYPE,
            );
          }
          if (opts.roles && !opts.roles[role]) {
            throw APIError.from(
              "BAD_REQUEST",
              ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE,
            );
          }
        }

        body.data.role = parseRoles(inputRoles);
      }

      const updatedUser = await ctx.context.internalAdapter.updateUser(
        body.userId,
        body.data,
      );

      return ctx.json(parseUserOutput(ctx.context.options, updatedUser));
    },
  );

// ─── list-users ──────────────────────────────────────────────────────────────

const listUsersQuerySchema = z.object({
  searchValue: z.string().optional(),
  searchField: z.enum(["email", "name"]).optional(),
  searchOperator: z.enum(["contains", "starts_with", "ends_with"]).optional(),
  limit: z.string().or(z.number()).optional(),
  offset: z.string().or(z.number()).optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  filterField: z.string().optional(),
  filterValue: z
    .string()
    .or(z.number())
    .or(z.boolean())
    .or(z.array(z.string()))
    .or(z.array(z.number()))
    .optional(),
  filterOperator: z.enum(whereOperators).optional(),
});

export const listUsers = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/list-users",
    {
      method: "GET",
      use: [adminMiddleware],
      query: listUsersQuerySchema,
    },
    async (ctx) => {
      const sessionUser = ctx.context.session.user as UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { user: ["list"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS,
        );
      }

      const where: Where[] = [];

      if (ctx.query?.searchValue) {
        where.push({
          field: ctx.query.searchField ?? "email",
          operator: ctx.query.searchOperator ?? "contains",
          value: ctx.query.searchValue,
        });
      }

      if (ctx.query?.filterValue !== undefined) {
        where.push({
          field: ctx.query.filterField ?? "email",
          operator: ctx.query.filterOperator ?? "eq",
          value: ctx.query.filterValue,
        });
      }

      try {
        const users = await ctx.context.internalAdapter.listUsers(
          Number(ctx.query?.limit) || undefined,
          Number(ctx.query?.offset) || undefined,
          ctx.query?.sortBy
            ? { field: ctx.query.sortBy, direction: ctx.query.sortDirection ?? "asc" }
            : undefined,
          where.length ? where : undefined,
        );
        const total = await ctx.context.internalAdapter.countTotalUsers(
          where.length ? where : undefined,
        );
        return ctx.json({
          users: users.map((u) => parseUserOutput(ctx.context.options, u)),
          total,
          limit: Number(ctx.query?.limit) || undefined,
          offset: Number(ctx.query?.offset) || undefined,
        });
      } catch {
        return ctx.json({ users: [], total: 0 });
      }
    },
  );

// ─── list-user-sessions ──────────────────────────────────────────────────────

export const listUserSessions = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/list-user-sessions",
    {
      method: "POST",
      use: [adminMiddleware],
      body: z.object({ userId: z.coerce.string() }),
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { session: ["list"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS,
        );
      }

      const sessions = await ctx.context.internalAdapter.listSessions(
        ctx.body.userId,
      );

      return ctx.json({
        sessions: sessions.map((s) =>
          parseSessionOutput(ctx.context.options, s)
        ),
      });
    },
  );

// ─── ban-user ─────────────────────────────────────────────────────────────────

export const banUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/ban-user",
    {
      method: "POST",
      body: z.object({
        userId: z.coerce.string(),
        banReason: z.string().optional(),
        banExpiresIn: z.number().optional(),
      }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["ban"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_BAN_USERS,
        );
      }

      if (!await ctx.context.internalAdapter.findUserById(ctx.body.userId)) {
        throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);
      }

      if (ctx.body.userId === (ctx.context.session.user as UserWithRole).id) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.YOU_CANNOT_BAN_YOURSELF,
        );
      }

      const user = await ctx.context.internalAdapter.updateUser(ctx.body.userId, {
        banned: true,
        banReason: ctx.body.banReason ?? opts.defaultBanReason ?? "No reason",
        banExpires: ctx.body.banExpiresIn
          ? getDate(ctx.body.banExpiresIn, "sec")
          : opts.defaultBanExpiresIn
            ? getDate(opts.defaultBanExpiresIn, "sec")
            : undefined,
        updatedAt: new Date(),
      });

      await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);

      return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
    },
  );

// ─── unban-user ───────────────────────────────────────────────────────────────

export const unbanUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/unban-user",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["ban"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_BAN_USERS,
        );
      }

      const user = await ctx.context.internalAdapter.updateUser(ctx.body.userId, {
        banned: false,
        banExpires: null,
        banReason: null,
        updatedAt: new Date(),
      });

      return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
    },
  );

// ─── enable-user ─────────────────────────────────────────────────────────────

export const enableUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/enable-user",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["enable"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_ENABLE_USERS,
        );
      }

      if (!await ctx.context.internalAdapter.findUserById(ctx.body.userId)) {
        throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);
      }

      const user = await ctx.context.internalAdapter.updateUser(ctx.body.userId, {
        isActive: true,
        updatedAt: new Date(),
      });

      return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
    },
  );

// ─── disable-user ────────────────────────────────────────────────────────────

export const disableUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/disable-user",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["disable"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DISABLE_USERS,
        );
      }

      if (ctx.body.userId === (ctx.context.session.user as UserWithRole).id) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.YOU_CANNOT_DISABLE_YOURSELF,
        );
      }

      if (!await ctx.context.internalAdapter.findUserById(ctx.body.userId)) {
        throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);
      }

      const user = await ctx.context.internalAdapter.updateUser(ctx.body.userId, {
        isActive: false,
        updatedAt: new Date(),
      });

      await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);

      return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
    },
  );

// ─── impersonate-user ────────────────────────────────────────────────────────

export const impersonateUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/impersonate-user",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["impersonate"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS,
        );
      }

      const targetUser = await ctx.context.internalAdapter.findUserById(
        ctx.body.userId,
      );

      if (!targetUser) {
        throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);
      }

      const adminRoles = (
        Array.isArray(opts.adminRoles)
          ? opts.adminRoles
          : opts.adminRoles?.split(",") ?? []
      ).map((r) => r.trim());

      const targetUserWithRole = targetUser as UserWithRole;
      const targetIsAdmin =
        ((targetUserWithRole.role ?? opts.defaultRole ?? "user") as string)
          .split(",")
          .some((r: string) => adminRoles.includes(r)) ||
        !!opts.adminUserIds?.includes(targetUser.id);

      if (targetIsAdmin) {
        const canImpersonateAdmins =
          opts.allowImpersonatingAdmins === true ||
          (await hasPermission(
            {
              userId: (ctx.context.session.user as UserWithRole).id,
              role: (ctx.context.session.user as UserWithRole).role,
              options: opts,
              permissions: { user: ["impersonate-admins"] },
            },
            ctx,
          ));

        if (!canImpersonateAdmins) {
          throw APIError.from(
            "FORBIDDEN",
            ADMIN_ERROR_CODES.YOU_CANNOT_IMPERSONATE_ADMINS,
          );
        }
      }

      const session = await ctx.context.internalAdapter.createSession(
        targetUser.id,
        true,
        {
          impersonatedBy: (ctx.context.session.user as UserWithRole).id,
          expiresAt: opts.impersonationSessionDuration
            ? getDate(opts.impersonationSessionDuration, "sec")
            : getDate(3600, "sec"),
        },
        true,
      );

      if (!session) {
        throw APIError.from(
          "INTERNAL_SERVER_ERROR",
          ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER,
        );
      }

      const authCookies = ctx.context.authCookies;
      deleteSessionCookie(ctx);

      const dontRememberMeCookie = await ctx.getSignedCookie(
        ctx.context.authCookies.dontRememberToken.name,
        ctx.context.secret,
      );

      const adminCookieProp = ctx.context.createAuthCookie("admin_session");
      await ctx.setSignedCookie(
        adminCookieProp.name,
        `${ctx.context.session.session.token}:${dontRememberMeCookie ?? ""}`,
        ctx.context.secret,
        authCookies.sessionToken.attributes,
      );

      await setSessionCookie(ctx, { session, user: targetUser }, true);

      return ctx.json({
        session,
        user: parseUserOutput(ctx.context.options, targetUser),
      });
    },
  );

// ─── stop-impersonating ──────────────────────────────────────────────────────

export const stopImpersonating = () =>
  createAuthEndpoint(
    "/extended-admin/stop-impersonating",
    { method: "POST", requireHeaders: true },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      if (!session) throw APIError.fromStatus("UNAUTHORIZED");

      if (!session.session.impersonatedBy) {
        throw APIError.fromStatus("BAD_REQUEST", {
          message: "You are not impersonating anyone",
        });
      }

      const user = await ctx.context.internalAdapter.findUserById(
        session.session.impersonatedBy,
      );
      if (!user) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
          message: "Failed to find user",
        });
      }

      const adminSessionCookie = ctx.context.createAuthCookie("admin_session");
      const adminCookie = await ctx.getSignedCookie(
        adminSessionCookie.name,
        ctx.context.secret,
      );

      if (!adminCookie) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
          message: "Failed to find admin session",
        });
      }

      const [adminSessionToken, dontRememberMeCookie] = adminCookie.split(":");
      const adminSession = await ctx.context.internalAdapter.findSession(
        adminSessionToken!,
      );

      if (!adminSession || adminSession.session.userId !== user.id) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
          message: "Failed to find admin session",
        });
      }

      await ctx.context.internalAdapter.deleteSession(session.session.token);
      await setSessionCookie(ctx, adminSession, !!dontRememberMeCookie);
      expireCookie(ctx, adminSessionCookie);

      return ctx.json({
        session: parseSessionOutput(
          ctx.context.options,
          adminSession.session,
        ),
        user: parseUserOutput(ctx.context.options, adminSession.user),
      });
    },
  );

// ─── revoke-user-session ─────────────────────────────────────────────────────

export const revokeUserSession = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/revoke-user-session",
    {
      method: "POST",
      body: z.object({ sessionToken: z.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { session: ["revoke"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS,
        );
      }

      await ctx.context.internalAdapter.deleteSession(ctx.body.sessionToken);
      return ctx.json({ success: true });
    },
  );

// ─── revoke-user-sessions ────────────────────────────────────────────────────

export const revokeUserSessions = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/revoke-user-sessions",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { session: ["revoke"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS,
        );
      }

      await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);
      return ctx.json({ success: true });
    },
  );

// ─── remove-user ─────────────────────────────────────────────────────────────

export const removeUser = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/remove-user",
    {
      method: "POST",
      body: z.object({ userId: z.coerce.string() }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["delete"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS,
        );
      }

      if (ctx.body.userId === (ctx.context.session.user as UserWithRole).id) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.YOU_CANNOT_REMOVE_YOURSELF,
        );
      }

      if (!await ctx.context.internalAdapter.findUserById(ctx.body.userId)) {
        throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.USER_NOT_FOUND);
      }

      await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
      return ctx.json({ success: true });
    },
  );

// ─── set-user-password ───────────────────────────────────────────────────────

export const setUserPassword = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/set-user-password",
    {
      method: "POST",
      body: z.object({
        newPassword: z.string().min(1, "newPassword cannot be empty"),
        userId: z.coerce.string().min(1, "userId cannot be empty"),
      }),
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as UserWithRole).id,
            role: (ctx.context.session.user as UserWithRole).role,
            options: opts,
            permissions: { user: ["set-password"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD,
        );
      }

      const { newPassword, userId } = ctx.body;
      const minLen = ctx.context.password.config.minPasswordLength;
      const maxLen = ctx.context.password.config.maxPasswordLength;

      if (newPassword.length < minLen) {
        throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
      }
      if (newPassword.length > maxLen) {
        throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
      }

      const hashedPassword = await ctx.context.password.hash(newPassword);
      await ctx.context.internalAdapter.updatePassword(userId, hashedPassword);

      return ctx.json({ status: true });
    },
  );

// ─── has-permission ──────────────────────────────────────────────────────────

const userHasPermissionBodySchema = z
  .object({
    userId: z.coerce.string().optional(),
    role: z.string().optional(),
  })
  .and(
    z.union([
      z.object({
        permission: z.record(z.string(), z.array(z.string())),
        permissions: z.undefined(),
      }),
      z.object({
        permission: z.undefined(),
        permissions: z.record(z.string(), z.array(z.string())),
      }),
    ]),
  );

export const userHasPermission = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/has-permission",
    {
      method: "POST",
      body: userHasPermissionBodySchema,
    },
    async (ctx) => {
      type PermBody = z.infer<typeof userHasPermissionBodySchema>;
      const body = ctx.body as PermBody;

      if (!body?.permissions) {
        throw new APIError("BAD_REQUEST", {
          message:
            "invalid permission check. no permission(s) were passed.",
        });
      }

      const session = await getSessionFromCtx(ctx);
      if (!session && (ctx.request || ctx.headers)) {
        throw new APIError("UNAUTHORIZED");
      }
      if (!session && !body.userId && !body.role) {
        throw new APIError("BAD_REQUEST", {
          message: "user id or role is required",
        });
      }

      const sessionUser = session?.user as UserWithRole | undefined;
      const user: { id: string; role?: string } | null =
        sessionUser ??
        (body.role ? { id: body.userId ?? "", role: body.role } : null) ??
        (body.userId
          ? (await ctx.context.internalAdapter.findUserById(body.userId) as UserWithRole | null)
          : null);

      if (!user) {
        throw new APIError("BAD_REQUEST", { message: "user not found" });
      }

      const result = await hasPermission(
        {
          userId: user.id,
          role: user.role,
          options: opts,
          permissions: body.permissions,
        },
        ctx,
      );

      return ctx.json({ error: null, success: result });
    },
  );
