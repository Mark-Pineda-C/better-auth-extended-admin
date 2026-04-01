import { createAuthClient } from "better-auth/react";
import { extendedAdminClient } from "better-auth-extended-admin";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000/api/auth",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [extendedAdminClient()],
});
