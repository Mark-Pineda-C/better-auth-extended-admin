import type { InferOptionSchema, Session, User } from "better-auth";
import type { AccessControl, Role } from "better-auth/plugins/access";
import type { AdminSchema } from "./schema";

export interface UserWithRole extends User {
  role?: string | undefined;
  banned: boolean | null;
  banReason?: (string | null) | undefined;
  banExpires?: (Date | null) | undefined;
  isActive: boolean;
}

export interface SessionWithImpersonatedBy extends Session {
  impersonatedBy?: string | undefined;
}

export interface ModuleConfig {
  /**
   * Origin(s) to match against the request `Origin` header.
   * Can be a single string or an array for multiple origins (e.g. production + localhost).
   */
  origin?: string | string[] | undefined;
  /**
   * Custom matching function. Takes priority over `origin` when provided.
   * Receives the raw `Request` object so you can inspect any header, path, query param, etc.
   */
  match?: ((request: Request) => boolean) | undefined;
  /**
   * Roles that are allowed to sign in / sign up from this module.
   * For multi-role users (comma-separated), access is granted if at least one role matches.
   */
  allowedRoles: string[];
  /**
   * Custom deny message for this specific module.
   * Falls back to the global `moduleDenyMessage` if not set.
   */
  denyMessage?: string | undefined;
}

export interface AdminOptions {
  /**
   * The default role for a user
   *
   * @default "user"
   */
  defaultRole?: string | undefined;
  /**
   * Roles that are considered admin roles.
   *
   * Any user role that isn't in this list, even if they have the permission,
   * will not be considered an admin.
   *
   * @default ["admin"]
   */
  adminRoles?: (string | string[]) | undefined;
  /**
   * Custom static roles and their permissions.
   * These are merged with the built-in `admin` and `user` roles.
   */
  roles?: Record<string, Role> | undefined;
  /**
   * A default ban reason
   *
   * By default, no reason is provided
   */
  defaultBanReason?: string | undefined;
  /**
   * Number of seconds until the ban expires
   *
   * By default, the ban never expires
   */
  defaultBanExpiresIn?: number | undefined;
  /**
   * Duration of the impersonation session in seconds
   *
   * By default, the impersonation session lasts 1 hour
   */
  impersonationSessionDuration?: number | undefined;
  /**
   * Custom schema for the admin plugin
   */
  schema?: InferOptionSchema<AdminSchema> | undefined;
  /**
   * List of user ids that should have admin access
   *
   * If this is set, the `adminRole` option is ignored
   */
  adminUserIds?: string[] | undefined;
  /**
   * Message to show when a user is banned
   *
   * @default "You have been banned from this application. Please contact support if you believe this is an error."
   */
  bannedUserMessage?: string | undefined;
  /**
   * Message to show when a user account is disabled
   *
   * @default "Your account has been disabled. Please contact support."
   */
  disabledUserMessage?: string | undefined;
  /**
   * Whether to allow impersonating other admins.
   *
   * @deprecated Use the `impersonate-admins` permission instead.
   *
   * @default false
   */
  allowImpersonatingAdmins?: boolean | undefined;
  /**
   * Access control instance required for dynamic roles.
   * Must be provided when `dynamicRoles.enabled` is true.
   */
  ac?: AccessControl | undefined;
  /**
   * Configuration for the dynamic role system.
   * Roles stored in the database can be created, updated, and deleted at runtime.
   */
  dynamicRoles?: {
    /**
     * Enable the dynamic role system.
     * Requires `ac` to be set.
     */
    enabled: boolean;
    /**
     * Maximum number of dynamic roles allowed.
     *
     * @default Infinity
     */
    maximumRoles?: number | undefined;
  } | undefined;
  /**
   * Allow users to specify a role during sign-up.
   * When enabled, the `role` field is accepted as user input on registration.
   *
   * @default false
   */
  allowRoleOnSignUp?: boolean | undefined;
  /**
   * Default role assigned to users who sign up via the normal sign-up flow.
   * Falls back to `defaultRole` if not set.
   */
  defaultRoleForSignUp?: string | undefined;
  /**
   * Module-based login and sign-up access control.
   * Map of module name to its configuration. Each module defines which origins
   * it serves and which roles are allowed to authenticate from it.
   *
   * When a request origin matches a module, the user's role is checked against
   * that module's `allowedRoles`. This applies to both sign-in and sign-up.
   */
  modules?: Record<string, ModuleConfig> | undefined;
  /**
   * Default message shown when a user is denied access due to module restrictions.
   *
   * @default "Login not allowed for your current role in this application."
   */
  moduleDenyMessage?: string | undefined;
  /**
   * Behavior when the request origin does not match any configured module.
   * - `"allow"` (default): permit the request
   * - `"deny"`: block the request
   *
   * @default "allow"
   */
  moduleUnmatchedBehavior?: "allow" | "deny" | undefined;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
  O extends { roles: Record<string, unknown> }
  ? keyof O["roles"]
  : "user" | "admin";