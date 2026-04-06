import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "./auth";

type User = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
};

type Session = {
  id: string;
  token: string;
  userId: string;
};

export type TRPCContext = {
  user: User | null;
  session: Session | null;
};

export const createTRPCContext = async (req: Request): Promise<TRPCContext> => {
  try {
    const result = await auth.api.getSession({ headers: req.headers });
    return {
      user: result?.user as User | null,
      session: result?.session as Session | null,
    };
  } catch {
    return { user: null, session: null };
  }
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado." });
  }
  return next({ ctx: { user: ctx.user, session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Se requiere rol de administrador.",
    });
  }
  return next({ ctx });
});

export const editorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "editor" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Se requiere rol de editor o administrador.",
    });
  }
  return next({ ctx });
});

export const userProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "user" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Se requiere rol de usuario o administrador.",
    });
  }
  return next({ ctx });
});
