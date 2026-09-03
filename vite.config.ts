import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import unsplash from "./netlify/functions/unsplash";
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "local-unsplash-status",
      configureServer(server) {
        server.middlewares.use(
          "/.netlify/functions/unsplash",
          async (req, res) => {
            const result = await unsplash(
              new Request(`http://localhost${req.originalUrl}`, {
                method: req.method,
              }),
            );
            res.statusCode = result.status;
            result.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(await result.text());
          },
        );
      },
    },
  ],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: { output: { manualChunks: { charts: ["echarts"] } } },
  },
});
