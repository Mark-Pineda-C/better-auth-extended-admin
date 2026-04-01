import type { BetterAuthPluginDBSchema } from "better-auth";

export const schema = {
  user: {
    fields: {
      role: {
        type: "string",
        required: false,
        input: false,
      },
      banned: {
        type: "boolean",
        defaultValue: false,
        required: false,
        input: false,
      },
      banReason: {
        type: "string",
        required: false,
        input: false,
      },
      banExpires: {
        type: "date",
        required: false,
        input: false,
      },
      isActive: {
        type: "boolean",
        defaultValue: true,
        required: false,
        input: false,
      },
    },
  },
  session: {
    fields: {
      impersonatedBy: {
        type: "string",
        required: false,
      },
    },
  },
  globalRole: {
    fields: {
      name: {
        type: "string",
        required: true,
      },
      permissions: {
        type: "string",
        required: true,
      },
      description: {
        type: "string",
        required: false,
      },
      createdAt: {
        type: "date",
        required: true,
      },
      updatedAt: {
        type: "date",
        required: true,
      },
    },
  },
} satisfies BetterAuthPluginDBSchema;

export type AdminSchema = typeof schema;