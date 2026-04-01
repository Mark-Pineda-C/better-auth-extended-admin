# better-auth-extended-admin

An extended admin plugin for [better-auth](https://better-auth.com) that builds on top of the official `admin` plugin and adds:

- **Dynamic role system** — create, update, and delete roles at runtime, stored in the database
- **User activation / deactivation** — enable or disable accounts independently of the ban system
- **Role on sign-up** — optionally allow users to specify a role during registration, or set a default sign-up role
- **Module-based login access control** — restrict which roles can sign in or sign up from each frontend/origin

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
import { admin } from "better-auth-extended-admin";
import { createAccessControl } from "better-auth/plugins/access";

// 1. (Optional) Define your access control instance for dynamic roles
const ac = createAccessControl({
  user:    ["create","list","set-role","ban","impersonate","impersonate-admins","delete","set-password","get","update","enable","disable"],
  session: ["list","revoke","delete"],
  role:    ["create","read","update","delete","list"],
});

export const auth = betterAuth({
  plugins: [
    admin({
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
import { adminClient } from "better-auth-extended-admin";

export const authClient = createAuthClient({
  plugins: [adminClient()],
});

// Client-side permission check (static roles only)
const canCreate = authClient.admin.checkRolePermission({
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
await authClient.admin.createRole({
  name: "moderator",
  permissions: {
    user: ["list", "ban"],
    session: ["list", "revoke"],
  },
  description: "Can list and ban users",
});

// Update a role
await authClient.admin.updateRole({
  name: "moderator",
  data: {
    permissions: { user: ["list", "ban", "get"] },
  },
});

// Delete a role (fails if any user still has it assigned)
await authClient.admin.deleteRole({ name: "moderator" });

// List all dynamic roles
const roles = await authClient.admin.listRoles();

// Get a single role
const role = await authClient.admin.getRole({ name: "moderator" });
```

Dynamic roles are merged with static roles when checking permissions. A dynamic role with the same name as a static role **extends** its permissions rather than replacing them.

### 2. User activation / deactivation

The `isActive` flag provides a lightweight enable/disable toggle that is separate from the ban system. Disabled users cannot create sessions and are redirected to the error page on OAuth callbacks.

```ts
// Disable a user (also revokes their active sessions)
await authClient.admin.disableUser({ userId: "user_123" });

// Re-enable a user
await authClient.admin.enableUser({ userId: "user_123" });
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
admin({
  allowRoleOnSignUp: true,
  defaultRole: "user",
  defaultRoleForSignUp: "member", // overrides defaultRole for sign-up specifically
})
```

You can also create users with a specific role using the admin API:

```ts
await authClient.admin.createUser({
  email: "jane@example.com",
  name: "Jane",
  password: "secret",
  role: "moderator",
});
```

### 4. Module-based login access control

When your auth backend serves multiple frontends (e.g. an admin panel, a customer portal, an internal tool), you can restrict which roles are allowed to sign in or sign up from each origin.

```ts
admin({
  defaultRole: "user",
  roles: {
    admin: adminAc,
    user: userAc,
    editor: editorAc,
  },
  modules: {
    "admin-panel": {
      origin: "https://admin.example.com",
      allowedRoles: ["admin"],
      denyMessage: "Only administrators can access this panel.",
    },
    "customer-portal": {
      origin: "https://app.example.com",
      allowedRoles: ["user", "editor"],
    },
  },
})
```

A user with role `"editor"` trying to sign in from `https://admin.example.com` will receive a `FORBIDDEN` error. From `https://app.example.com`, the same user passes through normally.

**Multiple origins per module** (useful for dev environments):

```ts
modules: {
  "admin-panel": {
    origin: [
      "https://admin.example.com",
      "http://localhost:3001",
    ],
    allowedRoles: ["admin"],
  },
},
```

**Custom matching** for cases where the origin header is not enough (e.g. same domain, different modules identified by a custom header):

```ts
modules: {
  "admin-panel": {
    match: (request) => request.headers.get("x-app-module") === "admin",
    allowedRoles: ["admin"],
  },
  "customer-portal": {
    match: (request) => request.headers.get("x-app-module") === "portal",
    allowedRoles: ["user", "editor"],
  },
},
```

**Unmatched origins** — by default, requests from origins that don't match any module are allowed. Set `moduleUnmatchedBehavior: "deny"` to block them:

```ts
admin({
  modules: { /* ... */ },
  moduleUnmatchedBehavior: "deny",
  moduleDenyMessage: "Access is not allowed from this origin.",
})
```

This feature applies to both **sign-in** and **sign-up**. During sign-up, the role that would be assigned to the new user is checked against the module's `allowedRoles`. If it doesn't match, the registration is blocked before the user is created. Users with multiple roles (comma-separated) are allowed if at least one of their roles is in the module's `allowedRoles`.

---

## All endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/set-role` | Set a user's role |
| `GET` | `/admin/get-user` | Get a user by ID |
| `POST` | `/admin/create-user` | Create a new user with optional role |
| `POST` | `/admin/update-user` | Update user fields |
| `GET` | `/admin/list-users` | List users with filtering and pagination |
| `POST` | `/admin/list-user-sessions` | List sessions for a user |
| `POST` | `/admin/ban-user` | Ban a user |
| `POST` | `/admin/unban-user` | Remove ban from a user |
| `POST` | `/admin/enable-user` | Enable a disabled user |
| `POST` | `/admin/disable-user` | Disable a user |
| `POST` | `/admin/impersonate-user` | Start impersonating a user |
| `POST` | `/admin/stop-impersonating` | Stop impersonating |
| `POST` | `/admin/revoke-user-session` | Revoke a specific session |
| `POST` | `/admin/revoke-user-sessions` | Revoke all sessions for a user |
| `POST` | `/admin/remove-user` | Permanently delete a user |
| `POST` | `/admin/set-user-password` | Set a user's password |
| `POST` | `/admin/has-permission` | Check if a user has a permission |
| `POST` | `/admin/create-role` | Create a dynamic role *(requires `dynamicRoles.enabled`)* |
| `POST` | `/admin/update-role` | Update a dynamic role |
| `POST` | `/admin/delete-role` | Delete a dynamic role |
| `GET` | `/admin/list-roles` | List all dynamic roles |
| `GET` | `/admin/get-role` | Get a dynamic role by name |

---

## AdminOptions reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultRole` | `string` | `"user"` | Role assigned to new users |
| `adminRoles` | `string \| string[]` | `["admin"]` | Roles considered admin-level |
| `roles` | `Record<string, Role>` | — | Custom static role definitions |
| `ac` | `AccessControl` | — | Access control instance (required for dynamic roles) |
| `dynamicRoles` | `{ enabled, maximumRoles? }` | — | Enable dynamic role system |
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
| `modules` | `Record<string, ModuleConfig>` | — | Module-based login/sign-up access control by origin |
| `moduleDenyMessage` | `string` | *See code* | Default message when access is denied by module |
| `moduleUnmatchedBehavior` | `"allow" \| "deny"` | `"allow"` | Behavior when origin matches no module |

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

---

## License

MIT
