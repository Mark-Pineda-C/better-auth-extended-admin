import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    port: Number(process.env.PORT),
    allowedHosts: [".localhost"],
  },
});
