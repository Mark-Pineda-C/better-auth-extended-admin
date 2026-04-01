# better-auth-extended-admin — Monorepo Example

This example demonstrates module-based login access control (`modules`) using `better-auth-extended-admin` in a monorepo with 4 applications.

## Apps

| App | Framework | Port | Allowed roles (sign-in) | Assigned role (sign-up) |
|-----|-----------|------|------------------------|------------------------|
| `server` | Hono + tRPC | 3000 | — | — |
| `admin-panel` | Next.js 15 | 3001 | `admin` | `admin` |
| `editor-panel` | TanStack Start | 3002 | `admin`, `editor` | `editor` |
| `user-panel` | SolidStart | 3003 | `admin`, `user` | `user` |

## How it works

The server configures `extendedAdmin` with `modules`, mapping each `Origin` header to the allowed roles:

```ts
extendedAdmin({
  allowRoleOnSignUp: true,
  moduleUnmatchedBehavior: "deny",
  modules: {
    adminPanel:  { origin: "http://localhost:3001", allowedRoles: ["admin"] },
    editorPanel: { origin: "http://localhost:3002", allowedRoles: ["admin", "editor"] },
    userPanel:   { origin: "http://localhost:3003", allowedRoles: ["admin", "user"] },
  },
})
```

Each frontend hardcodes its role in the sign-up form body. The plugin validates it against the matched module:

- Sign-up from `:3001` with `role: "admin"` → `"admin" ∈ allowedRoles` ✓
- Sign-up from `:3001` with `role: "user"` → `"user" ∉ allowedRoles` → **blocked** ✓
- Sign-in from `:3002` with role `user` → `"user" ∉ allowedRoles` → **403 Forbidden** ✓

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

1. Open `http://localhost:3001` → sign up as **admin**
2. Open `http://localhost:3002` → sign up as **editor**
3. Open `http://localhost:3003` → sign up as **user**
4. Try signing in with the wrong role (e.g. an editor in the admin-panel) → server returns 403 with a descriptive message

## Environment variables

Copy `.env.example` to `.env` in `apps/server` and set a secure secret:

```
BETTER_AUTH_SECRET=your-secure-secret-here
```
