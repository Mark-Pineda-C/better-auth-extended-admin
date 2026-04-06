import { z } from "zod";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  editorProcedure,
  userProcedure,
} from "../trpc";

export const dashboardRouter = router({
  hello: publicProcedure.query(() => ({
    message: "API funcionando correctamente",
    timestamp: new Date().toISOString(),
  })),

  getProfile: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    role: ctx.user.role ?? "sin rol",
  })),

  getAdminStats: adminProcedure.query(({ ctx }) => ({
    message: `Panel de administración — bienvenido, ${ctx.user.name}`,
    capabilities: [
      "Gestionar usuarios",
      "Cambiar roles",
      "Banear/desbanear usuarios",
      "Activar/desactivar cuentas",
      "Acceder a todos los paneles",
    ],
    role: ctx.user.role,
  })),

  getEditorContent: editorProcedure.query(({ ctx }) => ({
    message: `Panel de edición — bienvenido, ${ctx.user.name}`,
    capabilities: [
      "Crear contenido",
      "Editar artículos",
      "Publicar entradas",
      "Gestionar borradores",
    ],
    role: ctx.user.role,
  })),

  getUserContent: userProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(({ ctx, input }) => ({
      message: `Panel de usuario — bienvenido, ${ctx.user.name}`,
      page: input.page,
      items: ["Artículo 1", "Artículo 2", "Artículo 3"],
      role: ctx.user.role,
    })),
});
