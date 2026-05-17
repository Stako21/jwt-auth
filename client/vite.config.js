import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000";
  const devHost = env.VITE_DEV_HOST || "0.0.0.0";
  const devPort = Number(env.VITE_DEV_PORT || 5173);
  const previewPort = Number(env.VITE_PREVIEW_PORT || 4173);
  const hmrHost = env.VITE_DEV_PUBLIC_HOST || undefined;

  return {
    plugins: [react()],
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      hmr: hmrHost
        ? {
            host: hmrHost,
          }
        : undefined,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: devHost,
      port: previewPort,
      strictPort: true,
    },
  };
});
