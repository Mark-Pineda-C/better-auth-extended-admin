import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@server/routers/index";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/api/trpc",
      fetch: (input, init) =>
        fetch(input, { ...init, credentials: "include" }),
    }),
  ],
});
