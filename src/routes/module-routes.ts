import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { ADMIN_ERROR_CODES } from "../error-codes";
import type { AdminOptions } from "../types";
import { hasPermission } from "../has-permission";
import {
  findModuleByKey,
  invalidateModuleCache,
  listAllModules,
  normalizeModuleKey,
  normalizeOrigins,
  serializeOrigins,
} from "../module-store";
import { adminMiddleware } from "./admin-routes";

const createModuleBodySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  origins: z.array(z.string().min(1)).min(1),
  denyMessage: z.string().optional(),
  enabled: z.boolean().optional(),
});

const updateModuleBodySchema = z.object({
  key: z.string().min(1),
  data: z.object({
    name: z.string().min(1).optional(),
    origins: z.array(z.string().min(1)).min(1).optional(),
    denyMessage: z.string().optional(),
    enabled: z.boolean().optional(),
    newKey: z.string().min(1).optional(),
  }),
});

const deleteModuleBodySchema = z.object({
  key: z.string().min(1),
});

function ensureDynamicModulesEnabled(opts: AdminOptions) {
  if (opts.dynamicModules?.enabled === true) return;
  throw APIError.from("NOT_IMPLEMENTED", ADMIN_ERROR_CODES.DYNAMIC_MODULES_DISABLED);
}

async function ensureCanManageModules(
  opts: AdminOptions,
  ctx: Parameters<typeof hasPermission>[1],
  action: "create" | "read" | "update" | "delete" | "list",
) {
  const sessionUser = (
    ctx as {
      context: { session: { user: { id: string; role?: string } } };
    }
  ).context.session.user;

  const allowed = await hasPermission(
    {
      userId: sessionUser.id,
      role: sessionUser.role,
      options: opts,
      permissions: { role: [action] },
    },
    ctx,
  );

  if (allowed) return;

  const byAction = {
    create: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
    read: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE,
    update: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
    delete: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
    list: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_ROLES,
  } as const;

  throw APIError.from("FORBIDDEN", byAction[action]);
}

export const createModule = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/create-module",
    {
      method: "POST",
      body: createModuleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      ensureDynamicModulesEnabled(opts);
      await ensureCanManageModules(opts, ctx, "create");
      const body = ctx.body as z.infer<typeof createModuleBodySchema>;
      const key = normalizeModuleKey(body.key);

      const existing = await findModuleByKey(key, ctx);
      if (existing) {
        throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.MODULE_KEY_IS_ALREADY_TAKEN);
      }

      const now = new Date();
      const created = await ctx.context.adapter.create({
        model: "globalModule",
        data: {
          key,
          name: body.name.trim(),
          origins: serializeOrigins(normalizeOrigins(body.origins)),
          denyMessage: body.denyMessage?.trim() || null,
          enabled: body.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        },
      }) as {
        id: string;
        key: string;
        name: string;
        origins: string;
        denyMessage: string | null;
        enabled: boolean;
        createdAt: Date;
        updatedAt: Date;
      };

      invalidateModuleCache();

      return ctx.json({
        success: true,
        module: {
          ...created,
          origins: JSON.parse(created.origins) as string[],
        },
      });
    },
  );

export const updateModule = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/update-module",
    {
      method: "POST",
      body: updateModuleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      ensureDynamicModulesEnabled(opts);
      await ensureCanManageModules(opts, ctx, "update");
      const body = ctx.body as z.infer<typeof updateModuleBodySchema>;
      const key = normalizeModuleKey(body.key);
      const existing = await findModuleByKey(key, ctx);
      if (!existing) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.MODULE_NOT_FOUND);
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (body.data.newKey !== undefined) {
        const newKey = normalizeModuleKey(body.data.newKey);
        const conflict = await findModuleByKey(newKey, ctx);
        if (conflict && conflict.key !== key) {
          throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.MODULE_KEY_IS_ALREADY_TAKEN);
        }
        updateData.key = newKey;
      }
      if (body.data.name !== undefined) updateData.name = body.data.name.trim();
      if (body.data.origins !== undefined) {
        updateData.origins = serializeOrigins(normalizeOrigins(body.data.origins));
      }
      if (body.data.enabled !== undefined) updateData.enabled = body.data.enabled;
      if (body.data.denyMessage !== undefined) {
        updateData.denyMessage = body.data.denyMessage.trim() || null;
      }

      await ctx.context.adapter.update({
        model: "globalModule",
        where: [{ field: "key", value: key, operator: "eq" }],
        update: updateData,
      });

      invalidateModuleCache();

      const finalKey = (updateData.key as string | undefined) ?? key;
      const updated = await findModuleByKey(finalKey, ctx);

      return ctx.json({ success: true, module: updated });
    },
  );

export const deleteModule = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/delete-module",
    {
      method: "POST",
      body: deleteModuleBodySchema,
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      ensureDynamicModulesEnabled(opts);
      await ensureCanManageModules(opts, ctx, "delete");
      const key = normalizeModuleKey(ctx.body.key);
      const existing = await findModuleByKey(key, ctx);
      if (!existing) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.MODULE_NOT_FOUND);
      }

      const users = (await ctx.context.adapter.findMany({
        model: "globalRole",
        where: [],
      })) as Array<{ name: string; permissions: string }>;

      const assigned = users.some((role) => {
        try {
          const parsed = JSON.parse(role.permissions) as Record<string, string[]>;
          return (parsed.module ?? []).includes(key);
        } catch {
          return false;
        }
      });

      if (assigned) {
        throw APIError.from("BAD_REQUEST", ADMIN_ERROR_CODES.MODULE_IS_ASSIGNED_TO_ROLES);
      }

      await ctx.context.adapter.delete({
        model: "globalModule",
        where: [{ field: "key", value: key, operator: "eq" }],
      });

      invalidateModuleCache();

      return ctx.json({ success: true });
    },
  );

export const listModules = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/list-modules",
    {
      method: "GET",
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      ensureDynamicModulesEnabled(opts);
      await ensureCanManageModules(opts, ctx, "list");
      return ctx.json(await listAllModules(ctx));
    },
  );

export const getModule = (opts: AdminOptions) =>
  createAuthEndpoint(
    "/extended-admin/get-module",
    {
      method: "GET",
      query: z.object({ key: z.string().min(1) }),
      requireHeaders: true,
      use: [adminMiddleware],
    },
    async (ctx) => {
      ensureDynamicModulesEnabled(opts);
      await ensureCanManageModules(opts, ctx, "read");
      const key = normalizeModuleKey(ctx.query.key);
      const found = await findModuleByKey(key, ctx);
      if (!found) {
        throw APIError.from("NOT_FOUND", ADMIN_ERROR_CODES.MODULE_NOT_FOUND);
      }
      return ctx.json(found);
    },
  );
