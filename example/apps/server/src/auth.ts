import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { extendedAdmin } from "better-auth-extended-admin";
import { db } from "./db";
import * as schema from "./schema";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "example-secret-change-in-production",
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ],
  plugins: [
    extendedAdmin({
      adminRoles: ["admin"],
      // Allows clients to send `role` in the sign-up body.
      // Each frontend hardcodes its own role, and the module config
      // validates that the role is allowed from that origin.
      allowRoleOnSignUp: true,
      // Deny requests from origins not registered in modules
      moduleUnmatchedBehavior: "deny",
      modules: {
        adminPanel: {
          origin: "http://localhost:3001",
          allowedRoles: ["admin"],
          denyMessage: "Solo usuarios con rol 'admin' pueden acceder al panel de administración.",
        },
        editorPanel: {
          origin: "http://localhost:3002",
          allowedRoles: ["admin", "editor"],
          denyMessage: "Solo usuarios con rol 'admin' o 'editor' pueden acceder al panel de edición.",
        },
        userPanel: {
          origin: "http://localhost:3003",
          allowedRoles: ["admin", "user"],
          denyMessage: "Solo usuarios con rol 'admin' o 'user' pueden acceder al panel de usuarios.",
        },
      },
    }),
  ],
});
