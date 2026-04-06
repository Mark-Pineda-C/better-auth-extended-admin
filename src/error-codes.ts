import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ADMIN_ERROR_CODES = defineErrorCodes({
  // --- User management ---
  FAILED_TO_CREATE_USER: "Failed to create user",
  USER_ALREADY_EXISTS: "User already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "User already exists. Use another email.",
  YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
  YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
    "You are not allowed to change users role",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
    "You are not allowed to list users sessions",
  YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
  YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
    "You are not allowed to impersonate users",
  YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
    "You are not allowed to revoke users sessions",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
    "You are not allowed to set users password",
  BANNED_USER: "You have been banned from this application",
  YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
  NO_DATA_TO_UPDATE: "No data to update",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
  YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
  YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
    "You are not allowed to set a non-existent role value",
  YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins",
  INVALID_ROLE_TYPE: "Invalid role type",
  // --- User activation / deactivation ---
  USER_IS_DISABLED: "Your account has been disabled. Please contact support.",
  YOU_ARE_NOT_ALLOWED_TO_ENABLE_USERS:
    "You are not allowed to enable users",
  YOU_ARE_NOT_ALLOWED_TO_DISABLE_USERS:
    "You are not allowed to disable users",
  YOU_CANNOT_DISABLE_YOURSELF: "You cannot disable yourself",
  // --- Dynamic role management ---
  MISSING_AC_INSTANCE:
    "Dynamic roles require an access control instance. Please provide the `ac` option.",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
    "You are not allowed to create a role",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
    "You are not allowed to update a role",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
    "You are not allowed to delete a role",
  YOU_ARE_NOT_ALLOWED_TO_LIST_ROLES: "You are not allowed to list roles",
  YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
  ROLE_NOT_FOUND: "Role not found",
  ROLE_NAME_IS_ALREADY_TAKEN: "A role with that name already exists",
  CANNOT_DELETE_A_PRE_DEFINED_ROLE:
    "Pre-defined roles cannot be deleted",
  ROLE_IS_ASSIGNED_TO_USERS:
    "Cannot delete a role that is currently assigned to users",
  TOO_MANY_ROLES: "Maximum number of dynamic roles reached",
  INVALID_RESOURCE:
    "One or more resources in the permission set are not valid",
  INVALID_PERMISSIONS: "The permission set is invalid",
  // --- Module-based access control ---
  MODULE_ACCESS_DENIED:
    "You are not allowed to login from this origin",
  MODULE_NOT_FOUND: "Module not found",
  MODULE_KEY_IS_ALREADY_TAKEN: "A module with that key already exists",
  MODULE_IS_ASSIGNED_TO_ROLES:
    "Cannot delete a module that is currently assigned to roles",
  DYNAMIC_MODULES_DISABLED:
    "Dynamic modules are disabled. Enable `dynamicModules.enabled` to use module endpoints.",
});