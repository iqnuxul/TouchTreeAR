import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { analyzeTree } from "./api/_analyze";

// Local development server. In production the app is served statically and
// /api/* is handled by the Vercel serverless functions in ./api.
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 image payloads from camera screenshots
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Tree branch detection, sharing the same implementation as the deployed function
  app.post("/api/analyze-tree", async (req, res) => {
    const result = await analyzeTree(req.body?.image);
    res.json(result);
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
