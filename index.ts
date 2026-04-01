// Plugin factory
export { extendedAdmin } from "./src/extended-admin";

// Client plugin
export { extendedAdminClient } from "./src/client";

// Access control utilities
export {
  adminAc,
  defaultAc,
  defaultRoles,
  defaultStatements,
  userAc,
} from "./src/access";

// Types
export type {
  AdminOptions,
  ModuleConfig,
  SessionWithImpersonatedBy,
  UserWithRole,
  InferAdminRolesFromOption,
} from "./src/types";

// Schema
export { schema } from "./src/schema";
export type { AdminSchema } from "./src/schema";

// Error codes
export { ADMIN_ERROR_CODES } from "./src/error-codes";
