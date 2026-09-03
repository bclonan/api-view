import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import unsplash from "./netlify/functions/unsplash";
import { pageMetadata } from "./src/site/navigation";
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "documentation-route-metadata",
      enforce: "post",
      generateBundle(_options, bundle) {
        const index = bundle["index.html"];
        if (!index || index.type !== "asset") return;
        for (const route of ["/webmcp", "/hackathon"]) {
          const meta = pageMetadata(route);
          let html = String(index.source).replace(
            /<title>.*?<\/title>/,
            `<title>${meta.title}</title>`,
          );
          html = html
            .replace(
              /(<meta\s+name="description"\s+content=")[^"]*/,
              `$1${meta.description}`,
            )
            .replace(
              /(<link rel="canonical" href=")[^"]*/,
              `$1${meta.canonical}`,
            )
            .replace(
              /(<meta property="og:url" content=")[^"]*/,
              `$1${meta.canonical}`,
            )
            .replace(
              /(<meta\s+(?:property="og:title"|name="twitter:title")\s+content=")[^"]*/g,
              `$1${meta.title}`,
            )
            .replace(
              /(<meta\s+(?:property="og:description"|name="twitter:description")\s+content=")[^"]*/g,
              `$1${meta.description}`,
            );
          this.emitFile({
            type: "asset",
            fileName: `${route.slice(1)}/index.html`,
            source: html,
          });
        }
      },
    },
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
