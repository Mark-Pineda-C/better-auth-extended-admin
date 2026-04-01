import { router } from "../trpc";
import { dashboardRouter } from "./dashboard";

export const appRouter = router({
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
