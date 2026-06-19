import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import searchHandler from "./api/search.js";
import assistantHandler from "./api/assistant.js";

function parseJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

export default defineConfig({
  server: {
    watch: {
      ignored: [/[/\\]dist[/\\]/, /[/\\]data_private[/\\]/],
    },
  },
  plugins: [
    react(),
    {
      name: "local-api-search",
      configureServer(server) {
        server.middlewares.use("/project-data.json", (request, response) => {
          response.statusCode = 404;
          response.end("Not found");
        });
        server.middlewares.use("/api/search", async (request, response) => {
          request.body = await parseJsonBody(request);
          searchHandler(request, response);
        });
        server.middlewares.use("/api/assistant", async (request, response) => {
          request.body = await parseJsonBody(request);
          assistantHandler(request, response);
        });
      },
    },
  ],
  test: {
    environment: "node",
  },
});
