# better-auth-extended-admin

An extended admin plugin for [better-auth](https://better-auth.com) that builds on top of the official `admin` plugin and adds:

- **Dynamic role system** — create, update, and delete roles at runtime, stored in the database
- **User activation / deactivation** — enable or disable accounts independently of the ban system
- **Role on sign-up** — optionally allow users to specify a role during registration, or set a default sign-up role
- **Dynamic MBLAC (module-based login access control)** — modules are stored in the database and evaluated at runtime per request origin

---

## Requirements

- `better-auth` ^1.5.6
- `TypeScript` ^5

---

## Installation

```bash
bun add better-auth-extended-admin
# or
npm install better-auth-extended-admin
```

---

## Quick start

### Server

```ts
import { betterAuth } from "better-auth";
import { extendedAdmin } from "better-auth-extended-admin";
import { createAccessControl } from "better-auth/plugins/access";

// 1. (Optional) Define your access control instance for dynamic roles
const ac = createAccessControl({
  user:    ["create","list","set-role","ban","impersonate","impersonate-admins","delete","set-password","get","update","enable","disable"],
  session: ["list","revoke","delete"],
  role:    ["create","read","update","delete","list"],
});

export const auth = betterAuth({
  plugins: [
    extendedAdmin({
      // Default role assigned to new users (default: "user")
      defaultRole: "user",

      // Roles that grant admin-level access (default: ["admin"])
      adminRoles: ["admin", "superadmin"],

      // Dynamic role system (requires ac)
      ac,
      dynamicRoles: {
        enabled: true,
        maximumRoles: 50,
      },

      // Dynamic module system (disabled by default for admin-base compatibility)
      dynamicModules: {
        enabled: true,
      },

      // Allow users to pass a `role` field during sign-up
      allowRoleOnSignUp: false,

      // Message shown when a user is banned
      bannedUserMessage: "You have been banned. Contact support.",

      // Message shown when a user is disabled
      disabledUserMessage: "Your account has been disabled. Contact support.",
    }),
  ],
});
```

### Client

```ts
import { createAuthClient } from "better-auth/client";
import { extendedAdminClient } from "better-auth-extended-admin";

export const authClient = createAuthClient({
  plugins: [extendedAdminClient()],
});

// Client-side permission check (static roles only)
const canCreate = authClient.extendedAdmin.checkRolePermission({
  role: "admin",
  permissions: { user: ["create"] },
});
```

---

## Features

### 1. Dynamic role system

When `dynamicRoles.enabled` is `true`, roles are persisted in the `adminRole` table and merged with your static roles at runtime.

```ts
// Create a new role
await authClient.extendedAdmin.createRole({
  name: "moderator",
  permissions: {
    user: ["list", "ban"],
    session: ["list", "revoke"],
  },
  description: "Can list and ban users",
});

// Update a role
await authClient.extendedAdmin.updateRole({
  name: "moderator",
  data: {
    permissions: { user: ["list", "ban", "get"] },
  },
});

// Delete a role (fails if any user still has it assigned)
await authClient.extendedAdmin.deleteRole({ name: "moderator" });

// List all dynamic roles
const roles = await authClient.extendedAdmin.listRoles();

// Get a single role
const role = await authClient.extendedAdmin.getRole({ name: "moderator" });
```

Dynamic roles are merged with static roles when checking permissions. A dynamic role with the same name as a static role **extends** its permissions rather than replacing them.

### 2. User activation / deactivation

The `isActive` flag provides a lightweight enable/disable toggle that is separate from the ban system. Disabled users cannot create sessions and are redirected to the error page on OAuth callbacks.

```ts
// Disable a user (also revokes their active sessions)
await authClient.extendedAdmin.disableUser({ userId: "user_123" });

// Re-enable a user
await authClient.extendedAdmin.enableUser({ userId: "user_123" });
```

**Difference from banning:**

| Feature | Ban | Disable |
|---|---|---|
| Has reason & expiry | Yes | No |
| Revokes sessions | Yes | Yes |
| Error code | `BANNED_USER` | `USER_IS_DISABLED` |
| Intended use | Disciplinary | Administrative |

### 3. Role on sign-up

By default, the `role` field is blocked from user input. Set `allowRoleOnSignUp: true` to allow it:

```ts
extendedAdmin({
  allowRoleOnSignUp: true,
  defaultRole: "user",
  defaultRoleForSignUp: "member", // overrides defaultRole for sign-up specifically
})
```

You can also create users with a specific role using the admin API:

```ts
await authClient.extendedAdmin.createUser({
  email: "jane@example.com",
  name: "Jane",
  password: "secret",
  role: "moderator",
});
```

### 4. Module-based login access control

Dynamic module checks are **opt-in** to preserve compatibility with the base admin plugin.
Enable them explicitly:

```ts
extendedAdmin({
  dynamicModules: { enabled: true },
})
```

When enabled, modules are **database-backed**.  
Access checks are performed on sign-in, sign-up, and (optionally) `getSession`:

1. Resolve module by request `Origin` using `globalModule.origins`.
2. Read user role(s).
3. Allow access if at least one role contains the module key in `permissions.module`.

You manage modules through the API:

```ts
await authClient.extendedAdmin.createModule({
  key: "admin-panel",
  name: "Admin Panel",
  origins: ["https://admin.example.com", "http://localhost:3001"],
  denyMessage: "Only administrators can access this panel.",
});

await authClient.extendedAdmin.createRole({
  name: "editor",
  permissions: {
    module: ["editor-panel"],
  },
});
```

Use `moduleUnmatchedBehavior: "deny"` to block unknown origins:

```ts
extendedAdmin({
  moduleUnmatchedBehavior: "deny",
  moduleDenyMessage: "Access is not allowed from this origin.",
});
```

### 5. Breaking changes (MBLAC)

No breaking behavior for legacy users by default:
- If `dynamicModules.enabled` is **not** set, module checks are skipped.
- Existing admin flows continue to work without module-table dependencies.
- Module endpoints return `NOT_IMPLEMENTED` until `dynamicModules.enabled: true`.

With `dynamicModules.enabled: true`:
- Module definitions come from `globalModule` records.
- `permissions.module` values are validated against existing module keys.
- Module CRUD endpoints become available.

### 6. Compatibility modes

| Mode | `dynamicRoles.enabled` | `dynamicModules.enabled` | Behavior |
|---|---|---|---|
| Legacy default | `false` or `true` | `false` (or omitted) | No module enforcement; module endpoints disabled |
| Roles dynamic only | `true` | `false` (or omitted) | Dynamic role CRUD active; module checks still disabled |
| Full dynamic | `true` or `false` | `true` | Module enforcement active + module endpoints enabled |

---

## All endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extended-admin/set-role` | Set a user's role |
| `GET` | `/extended-admin/get-user` | Get a user by ID |
| `POST` | `/extended-admin/create-user` | Create a new user with optional role |
| `POST` | `/extended-admin/update-user` | Update user fields |
| `GET` | `/extended-admin/list-users` | List users with filtering and pagination |
| `POST` | `/extended-admin/list-user-sessions` | List sessions for a user |
| `POST` | `/extended-admin/ban-user` | Ban a user |
| `POST` | `/extended-admin/unban-user` | Remove ban from a user |
| `POST` | `/extended-admin/enable-user` | Enable a disabled user |
| `POST` | `/extended-admin/disable-user` | Disable a user |
| `POST` | `/extended-admin/impersonate-user` | Start impersonating a user |
| `POST` | `/extended-admin/stop-impersonating` | Stop impersonating |
| `POST` | `/extended-admin/revoke-user-session` | Revoke a specific session |
| `POST` | `/extended-admin/revoke-user-sessions` | Revoke all sessions for a user |
| `POST` | `/extended-admin/remove-user` | Permanently delete a user |
| `POST` | `/extended-admin/set-user-password` | Set a user's password |
| `POST` | `/extended-admin/has-permission` | Check if a user has a permission |
| `POST` | `/extended-admin/create-role` | Create a dynamic role *(requires `dynamicRoles.enabled`)* |
| `POST` | `/extended-admin/update-role` | Update a dynamic role |
| `POST` | `/extended-admin/delete-role` | Delete a dynamic role |
| `GET` | `/extended-admin/list-roles` | List all dynamic roles |
| `GET` | `/extended-admin/get-role` | Get a dynamic role by name |
| `POST` | `/extended-admin/create-module` | Create a dynamic module *(requires `dynamicModules.enabled`)* |
| `POST` | `/extended-admin/update-module` | Update a dynamic module *(requires `dynamicModules.enabled`)* |
| `POST` | `/extended-admin/delete-module` | Delete a dynamic module *(requires `dynamicModules.enabled`)* |
| `GET` | `/extended-admin/list-modules` | List all dynamic modules *(requires `dynamicModules.enabled`)* |
| `GET` | `/extended-admin/get-module` | Get a dynamic module by key *(requires `dynamicModules.enabled`)* |

---

## AdminOptions reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultRole` | `string` | `"user"` | Role assigned to new users |
| `adminRoles` | `string \| string[]` | `["admin"]` | Roles considered admin-level |
| `roles` | `Record<string, Role>` | — | Custom static role definitions |
| `ac` | `AccessControl` | — | Access control instance (required for dynamic roles) |
| `dynamicRoles` | `{ enabled, maximumRoles? }` | — | Enable dynamic role system |
| `dynamicModules` | `{ enabled }` | — | Enable module checks and module CRUD endpoints |
| `allowRoleOnSignUp` | `boolean` | `false` | Accept `role` field from sign-up input |
| `defaultRoleForSignUp` | `string` | — | Default role for sign-up (overrides `defaultRole`) |
| `bannedUserMessage` | `string` | *See code* | Message for banned users |
| `disabledUserMessage` | `string` | *See code* | Message for disabled users |
| `defaultBanReason` | `string` | `"No reason"` | Default ban reason |
| `defaultBanExpiresIn` | `number` | — | Default ban duration in seconds |
| `impersonationSessionDuration` | `number` | `3600` | Impersonation session length in seconds |
| `adminUserIds` | `string[]` | — | User IDs that always have admin access |
| `allowImpersonatingAdmins` | `boolean` | `false` | Allow impersonating other admins *(deprecated)* |
| `schema` | `InferOptionSchema<AdminSchema>` | — | Override schema field names |
| `moduleDenyMessage` | `string` | *See code* | Default message when access is denied by module |
| `moduleUnmatchedBehavior` | `"allow" \| "deny"` | `"allow"` | Behavior when origin matches no module |
| `enforceModulesOnSession` | `boolean` | `true` | Apply module checks on `getSession` responses |

---

## Database schema

The plugin adds the following fields and tables to your database:

**`user` table (additional fields)**

| Column | Type | Description |
|--------|------|-------------|
| `role` | `string` | Comma-separated role(s) |
| `banned` | `boolean` | Whether the user is banned |
| `banReason` | `string` | Reason for the ban |
| `banExpires` | `date` | When the ban expires |
| `isActive` | `boolean` | Whether the account is enabled |

**`session` table (additional fields)**

| Column | Type | Description |
|--------|------|-------------|
| `impersonatedBy` | `string` | ID of the admin who initiated impersonation |

**`globalRole` table** *(only when `dynamicRoles.enabled`)*

| Column | Type | Description |
|--------|------|-------------|
| `id` | `string` | Primary key |
| `name` | `string` | Role name (lowercase, unique) |
| `permissions` | `string` | JSON-serialized permission map |
| `description` | `string` | Optional description |
| `createdAt` | `date` | Creation timestamp |
| `updatedAt` | `date` | Last update timestamp |

**`globalModule` table** *(used when `dynamicModules.enabled`)*

| Column | Type | Description |
|--------|------|-------------|
| `id` | `string` | Primary key |
| `key` | `string` | Unique module key (lowercase) |
| `name` | `string` | Human-readable module name |
| `origins` | `string` | JSON-serialized origin list |
| `denyMessage` | `string` | Optional module-specific deny message |
| `enabled` | `boolean` | Whether the module participates in access checks |
| `createdAt` | `date` | Creation timestamp |
| `updatedAt` | `date` | Last update timestamp |

---

## License

This project is licensed under the MIT License.
