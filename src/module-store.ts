import type { GenericEndpointContext } from "@better-auth/core";

export interface StoredModule {
  id: string;
  key: string;
  name: string;
  origins: string[];
  denyMessage: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RawStoredModule {
  id: string;
  key: string;
  name: string;
  origins: string;
  denyMessage: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const moduleCache = new Map<string, StoredModule[]>();

const MODULE_CACHE_KEY_ALL = "__all_modules__";
const MODULE_CACHE_KEY_ENABLED = "__enabled_modules__";

export function normalizeModuleKey(key: string): string {
  return key.toLowerCase().trim();
}

export function normalizeOrigins(origins: string[]): string[] {
  return [...new Set(origins.map((o) => o.trim()).filter(Boolean))];
}

function parseOrigins(origins: string): string[] {
  try {
    const parsed = JSON.parse(origins) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeOrigins(
        parsed.filter((o): o is string => typeof o === "string"),
      );
    }
  } catch {
    // Old values or malformed rows are safely ignored and interpreted as no origins.
  }
  return [];
}

function fromRaw(raw: RawStoredModule): StoredModule {
  return {
    ...raw,
    origins: parseOrigins(raw.origins),
  };
}

async function loadModules(
  ctx: GenericEndpointContext,
  onlyEnabled: boolean,
): Promise<StoredModule[]> {
  const key = onlyEnabled ? MODULE_CACHE_KEY_ENABLED : MODULE_CACHE_KEY_ALL;
  const cached = moduleCache.get(key);
  if (cached) return cached;

  const rows = (await ctx.context.adapter.findMany({
    model: "globalModule",
    where: [],
  })) as RawStoredModule[];

  const all = rows.map(fromRaw);
  const enabled = all.filter((m) => m.enabled);

  moduleCache.set(MODULE_CACHE_KEY_ALL, all);
  moduleCache.set(MODULE_CACHE_KEY_ENABLED, enabled);

  return onlyEnabled ? enabled : all;
}

export async function listAllModules(
  ctx: GenericEndpointContext,
): Promise<StoredModule[]> {
  return loadModules(ctx, false);
}

export async function listEnabledModules(
  ctx: GenericEndpointContext,
): Promise<StoredModule[]> {
  return loadModules(ctx, true);
}

export async function findModuleByKey(
  key: string,
  ctx: GenericEndpointContext,
): Promise<StoredModule | null> {
  const modules = await listAllModules(ctx);
  return modules.find((m) => m.key === key) ?? null;
}

export function serializeOrigins(origins: string[]): string {
  return JSON.stringify(normalizeOrigins(origins));
}

export function invalidateModuleCache() {
  moduleCache.clear();
}
