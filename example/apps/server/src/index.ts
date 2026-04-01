import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "./auth";
import { appRouter } from "./routers";
import { createTRPCContext } from "./trpc";

const app = new Hono();

const FRONTEND_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
];

app.use(
  "*",
  cors({
    origin: FRONTEND_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["Set-Cookie"],
    credentials: true,
    maxAge: 600,
  }),
);

// better-auth handles all /api/auth/* routes
app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// tRPC handles all /api/trpc/* routes
app.all("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext(c.req.raw),
    onError: ({ error, path }) => {
      if (error.code !== "UNAUTHORIZED" && error.code !== "FORBIDDEN") {
        console.error(`tRPC error on ${path}:`, error.message);
      }
    },
  });
});

app.get("/", (c) =>
  c.json({
    status: "ok",
    message: "Auth server running on port 3000",
    endpoints: {
      auth: "/api/auth/**",
      trpc: "/api/trpc/**",
    },
  }),
);

const port = Number(process.env.PORT ?? 3000);

console.log(`✓ Server running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
