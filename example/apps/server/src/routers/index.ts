import { router } from "../trpc";
import { adminRouter } from "./admin";
import { dashboardRouter } from "./dashboard";

export const appRouter = router({
  dashboard: dashboardRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
