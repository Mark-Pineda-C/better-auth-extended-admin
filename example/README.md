# better-auth-extended-admin — Monorepo Example

This example demonstrates module-based login access control for `better-auth-extended-admin` v0.2.0 using dynamic modules stored in the database.

## Apps

| App | Framework | URL (dev) | Allowed roles (sign-in) | Assigned role (sign-up) |
|-----|-----------|------|------------------------|------------------------|
| `server` | Hono + tRPC | `http://localhost:3000` | — | — |
| `admin-panel` | Next.js 15 | `http://admin-panel.localhost:1355` | `admin` | `admin` |
| `editor-panel` | TanStack Start | `http://editor-panel.localhost:1355` | `admin`, `editor` | `editor` |
| `user-panel` | SolidStart | `http://user-panel.localhost:1355` | `admin`, `user` | `user` |

## How it works

The server enables dynamic modules explicitly:

```ts
extendedAdmin({
  allowRoleOnSignUp: true,
  moduleUnmatchedBehavior: "deny",
  dynamicRoles: { enabled: true },
  dynamicModules: { enabled: true },
})
```

Module definitions are seeded into `globalModule` at server startup (`example/apps/server/src/auth.ts`), and role access is evaluated through `permissions.module`.

- Sign-up from `admin-panel.localhost:1355` with `role: "admin"` -> allowed
- Sign-up from `admin-panel.localhost:1355` with `role: "user"` -> blocked (403)
- Sign-in from `editor-panel.localhost:1355` with role `user` -> blocked (403)

### Legacy vs dynamic mode

- **Legacy mode (default):** if `dynamicModules.enabled` is omitted/false, module checks are skipped.
- **Dynamic mode (this example):** `dynamicModules.enabled: true` turns on module checks and module CRUD endpoints.

## Requirements

- [Bun](https://bun.sh/) ≥ 1.0
- [Node.js](https://nodejs.org/) ≥ 20 (required by TanStack Start and SolidStart's Vinxi build layer)

## Setup

### 1. Build the plugin (from the repo root)

```bash
bun run build
```

### 2. Install dependencies

```bash
cd example
bun install
```

### 3. Create the database (in apps/server)

```bash
cd apps/server
bunx drizzle-kit push
```

### 4. Start all apps

Open 4 terminals:

```bash
# Terminal 1 — server
cd example/apps/server
bun run dev

# Terminal 2 — admin panel (Next.js)
cd example/apps/admin-panel
bun run dev

# Terminal 3 — editor panel (TanStack Start)
cd example/apps/editor-panel
bun run dev

# Terminal 4 — user panel (SolidStart)
cd example/apps/user-panel
bun run dev
```

Or from the example root (runs all in parallel):

```bash
cd example
bun run dev
```

## Testing the access control

1. Open `http://admin-panel.localhost:1355` -> sign up as **admin**
2. Open `http://editor-panel.localhost:1355` -> sign up as **editor**
3. Open `http://user-panel.localhost:1355` -> sign up as **user**
4. Try signing in with the wrong role (e.g. an editor in the admin-panel) → server returns 403 with a descriptive message

## Database reset / reseed (optional)

To reset module data and reseed defaults:

```bash
cd apps/server
rm -f local.db
bunx drizzle-kit push
```

Then restart the server. On startup, it seeds default modules (`adminpanel`, `editorpanel`, `userpanel`) into `globalModule` if missing.

## Environment variables

Copy `.env.example` to `.env` in `apps/server` and set a secure secret:

```
BETTER_AUTH_SECRET=your-secure-secret-here
```
