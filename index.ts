// Plugin factory
export { admin } from "./src/admin";

// Client plugin
export { adminClient } from "./src/client";

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
    SessionWithImpersonatedBy,
    UserWithRole,
    InferAdminRolesFromOption,
} from "./src/types";

// Schema
export { schema } from "./src/schema";
export type { AdminSchema } from "./src/schema";

// Error codes
export { ADMIN_ERROR_CODES } from "./src/error-codes";
