import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { ADMIN_ERROR_CODES } from "../error-codes";
import { hasPermission, invalidateRoleCache } from "../has-permission";
import { adminMiddleware } from "./admin-routes";
import type { AdminOptions } from "../types";
import { listAllModules, normalizeModuleKey } from "../module-store";
import * as z from "zod";

const DEFAULT_MAX_ROLES = Number.POSITIVE_INFINITY;

function normalizeRoleName(name: string): string {
  return name.toLowerCase().trim();
}

async function checkRoleNameConflictsWithStatic(
  roleName: string,
  opts: AdminOptions,
  ctx: Parameters<typeof hasPermission>[1],
): Promise<void> {
  const staticRoleNames = opts.roles
    ? Object.keys(opts.roles)
    : ["admin", "user"];

  if (staticRoleNames.includes(roleName)) {
    ctx?.context.logger.error(
      `[ExtendedAdmin] Role name "${roleName}" conflicts with a pre-defined static role.`,
    );
    throw APIError.from(
      "BAD_REQUEST",
      ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
    );
  }
}

async function checkRoleNameConflictsWithDB(
  roleName: string,
  ctx: NonNullable<Parameters<typeof hasPermission>[1]>,
): Promise<void> {
  const existing = await ctx.context.adapter.findOne({
    model: "globalRole",
    where: [{ field: "name", value: roleName, operator: "eq" }],
  });

  if (existing) {
    throw APIError.from(
      "BAD_REQUEST",
      ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
    );
  }
}

async function validatePermissionSet(
  permission: Record<string, string[]>,
  opts: AdminOptions,
  ctx: NonNullable<Parameters<typeof hasPermission>[1]>,
): Promise<void> {
  if (!opts.ac) return;

  const validResources = Object.keys(opts.ac.statements);
  const provided = Object.keys(permission);
  const invalid = provided.filter((r) => !validResources.includes(r));

  if (invalid.length > 0) {
    ctx.context.logger.error(
      `[ExtendedAdmin] Invalid resources in permission set: ${invalid.join(", ")}`,
    );
    throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.INVALID_RESOURCE);
  }

  const invalidActions: string[] = [];
  for (const [resource, actions] of Object.entries(permission)) {
    if (resource === "module") continue;
    const allowedActions = opts.ac.statements[resource] ?? [];
    invalidActions.push(
      ...actions
        .filter((a) => !allowedActions.includes(a))
        .map((a) => `${resource}:${a}`),
    );
  }
  if (invalidActions.length > 0) {
    ctx.context.logger.error(
      `[ExtendedAdmin] Invalid actions in permission set: ${invalidActions.join(", ")}`,
    );
    throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.INVALID_PERMISSIONS);
  }

  const moduleRefs = permission.module ?? [];
  if (moduleRefs.length > 0 && opts.dynamicModules?.enabled === true) {
    const modules = await listAllModules(ctx);
    const moduleKeys = new Set(modules.map((m) => m.key));
    const invalidModuleRefs = moduleRefs
      .map((key) => normalizeModuleKey(key))
      .filter((key) => key !== "*" && !moduleKeys.has(key));
    if (invalidModuleRefs.length > 0) {
      ctx.context.logger.error(
        `[ExtendedAdmin] Invalid module references in permission set: ${invalidModuleRefs.join(", ")}`,
      );
      throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.INVALID_PERMISSIONS);
    }
  }
}

function normalizePermissionSet(
  permission: Record<string, string[]>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(permission)) {
    const normalizedActions = [...new Set(
      actions
        .map((action) =>
          resource === "module" ? normalizeModuleKey(action) : action.trim()
        )
        .filter(Boolean),
    )];
    if (normalizedActions.length > 0) next[resource] = normalizedActions;
  }
  return next;
}

// ─── create-role ─────────────────────────────────────────────────────────────

const createRoleBodySchema = z.object({
  name: z.string().min(1),
  permissions: z.record(z.string(), z.array(z.string())),
  description: z.string().optional(),
});

export const createRole = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/create-role",
    {
      method: "POST",
      body: createRoleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (!opts.ac) {
        throw APIError.from(
          "NOT_IMPLEMENTED",
          ADMIN_ERROR_CODES.MISSING_AC_INSTANCE,
        );
      }

      const sessionUser = ctx.context.session.user as import("../types").UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { role: ["create"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
        );
      }

      const body = ctx.body as z.infer<typeof createRoleBodySchema>;
      const roleName = normalizeRoleName(body.name);
      const normalizedPermissions = normalizePermissionSet(body.permissions);
      await checkRoleNameConflictsWithStatic(roleName, opts, ctx);
      await checkRoleNameConflictsWithDB(roleName, ctx);
      await validatePermissionSet(normalizedPermissions, opts, ctx);

      const maxRoles =
        typeof opts.dynamicRoles?.maximumRoles === "number"
          ? opts.dynamicRoles.maximumRoles
          : DEFAULT_MAX_ROLES;

      const currentCount = await ctx.context.adapter.count({
        model: "globalRole",
        where: [],
      });

      if (currentCount >= maxRoles) {
        throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.TOO_MANY_ROLES);
      }

      const now = new Date();
      const created = await ctx.context.adapter.create({
        model: "globalRole",
        data: {
          name: roleName,
          permissions: JSON.stringify(normalizedPermissions),
          description: body.description ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      invalidateRoleCache();

      return ctx.json({
        success: true,
        role: {
          ...created,
          permissions: normalizedPermissions,
        },
      });
    },
  );

// ─── update-role ─────────────────────────────────────────────────────────────

const updateRoleBodySchema = z.object({
  name: z.string().min(1),
  data: z.object({
    permissions: z.record(z.string(), z.array(z.string())).optional(),
    description: z.string().optional(),
    newName: z.string().optional(),
  }),
});

export const updateRole = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/update-role",
    {
      method: "POST",
      body: updateRoleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (!opts.ac) {
        throw APIError.from(
          "NOT_IMPLEMENTED",
          ADMIN_ERROR_CODES.MISSING_AC_INSTANCE,
        );
      }

      const sessionUser = ctx.context.session.user as import("../types").UserWithRole;
      if (
        !await hasPermission(
          {
            userId: sessionUser.id,
            role: sessionUser.role,
            options: opts,
            permissions: { role: ["update"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
        );
      }

      const body = ctx.body as z.infer<typeof updateRoleBodySchema>;
      const roleName = normalizeRoleName(body.name);

      const existing = (await ctx.context.adapter.findOne({
        model: "globalRole",
        where: [{ field: "name", value: roleName, operator: "eq" }],
      })) as { name: string; permissions: string; description: string | null } | null;

      if (!existing) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.ROLE_NOT_FOUND);
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.data.permissions !== undefined) {
        const normalizedPermissions = normalizePermissionSet(body.data.permissions);
        await validatePermissionSet(normalizedPermissions, opts, ctx);
        updateData.permissions = JSON.stringify(normalizedPermissions);
      }

      if (body.data.description !== undefined) {
        updateData.description = body.data.description;
      }

      if (body.data.newName !== undefined) {
        const newName = normalizeRoleName(body.data.newName);
        await checkRoleNameConflictsWithStatic(newName, opts, ctx);
        await checkRoleNameConflictsWithDB(newName, ctx);
        updateData.name = newName;
      }

      await ctx.context.adapter.update({
        model: "globalRole",
        where: [{ field: "name", value: roleName, operator: "eq" }],
        update: updateData,
      });

      invalidateRoleCache();

      const updatedPermissions =
        body.data.permissions !== undefined
          ? normalizePermissionSet(body.data.permissions)
          : (JSON.parse(existing.permissions) as Record<string, string[]>);

      return ctx.json({
        success: true,
        role: {
          name: (updateData.name as string | undefined) ?? roleName,
          permissions: updatedPermissions,
          description:
            (updateData.description as string | undefined) ??
            existing.description,
        },
      });
    },
  );

// ─── delete-role ─────────────────────────────────────────────────────────────

export const deleteRole = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/delete-role",
    {
      method: "POST",
      body: z.object({ name: z.string().min(1) }),
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as import("../types").UserWithRole).id,
            role: (ctx.context.session.user as import("../types").UserWithRole).role,
            options: opts,
            permissions: { role: ["delete"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
        );
      }

      const roleName = normalizeRoleName(ctx.body.name);

      const staticRoleNames = opts.roles
        ? Object.keys(opts.roles)
        : ["admin", "user"];

      if (staticRoleNames.includes(roleName)) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE,
        );
      }

      const existing = await ctx.context.adapter.findOne({
        model: "globalRole",
        where: [{ field: "name", value: roleName, operator: "eq" }],
      });

      if (!existing) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.ROLE_NOT_FOUND);
      }

      // Prevent deletion if any user still holds this role
      const usersWithRole = await ctx.context.adapter.findMany({
        model: "user",
        where: [
          {
            field: "role",
            value: roleName,
            operator: "contains",
          },
        ],
      }) as Array<{ role: string | null }>;

      const hasAssignedUsers = usersWithRole.some((u) =>
        (u.role ?? "")
          .split(",")
          .map((r) => r.trim())
          .includes(roleName),
      );

      if (hasAssignedUsers) {
        throw APIError.from(
          "BAD_REQUEST",
          ADMIN_ERROR_CODES.ROLE_IS_ASSIGNED_TO_USERS,
        );
      }

      await ctx.context.adapter.delete({
        model: "globalRole",
        where: [{ field: "name", value: roleName, operator: "eq" }],
      });

      invalidateRoleCache();

      return ctx.json({ success: true });
    },
  );

// ─── list-roles ──────────────────────────────────────────────────────────────

export const listRoles = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/list-roles",
    {
      method: "GET",
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as import("../types").UserWithRole).id,
            role: (ctx.context.session.user as import("../types").UserWithRole).role,
            options: opts,
            permissions: { role: ["list"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_ROLES,
        );
      }

      const dbRoles = (await ctx.context.adapter.findMany({
        model: "globalRole",
        where: [],
      })) as Array<{
        id: string;
        name: string;
        permissions: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>;

      return ctx.json(
        dbRoles.map((r) => ({
          ...r,
          permissions: JSON.parse(r.permissions) as Record<string, string[]>,
        })),
      );
    },
  );

// ─── get-role ────────────────────────────────────────────────────────────────

export const getRole = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/get-role",
    {
      method: "GET",
      query: z.object({ name: z.string().min(1) }),
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      if (
        !await hasPermission(
          {
            userId: (ctx.context.session.user as import("../types").UserWithRole).id,
            role: (ctx.context.session.user as import("../types").UserWithRole).role,
            options: opts,
            permissions: { role: ["read"] },
          },
          ctx,
        )
      ) {
        throw APIError.from(
          "FORBIDDEN",
          ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE,
        );
      }

      const roleName = normalizeRoleName(ctx.query.name);

      const role = (await ctx.context.adapter.findOne({
        model: "globalRole",
        where: [{ field: "name", value: roleName, operator: "eq" }],
      })) as {
        id: string;
        name: string;
        permissions: string;
        description: string | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;

      if (!role) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.ROLE_NOT_FOUND);
      }

      return ctx.json({
        ...role,
        permissions: JSON.parse(role.permissions) as Record<string, string[]>,
      });
    },
  );
