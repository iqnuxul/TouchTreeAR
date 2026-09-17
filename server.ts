import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 image payloads from camera screenshots
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Shared Gemini client with lazy initialization
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it in Settings > Secrets.");
    }
    if (!aiClient) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Server-side tree branch detection API with multi-model fallback
  app.post("/api/analyze-tree", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        res.json({ ok: false, error: "No image payload provided" });
        return;
      }

      const ai = getGeminiClient();

      // Extract mime type and raw base64 data
      let mimeType = "image/jpeg";
      let rawBase64 = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          rawBase64 = matches[2];
        } else if (image.includes(",")) {
          rawBase64 = image.split(",")[1];
        }
      }

      const prompt = `Identify all visible tree branches, stems, and twigs in this image. 
Return their structure as a JSON array of polylines (connected 2D point sequences) tracing along the center of each branch from its base towards the outer branch tips:
{
  "branches": [
    {
      "points": [
        { "x": 0.5, "y": 0.8 },
        { "x": 0.52, "y": 0.6 },
        { "x": 0.55, "y": 0.4 }
      ]
    }
  ]
}
Coordinates MUST be normalized between 0.0 and 1.0 relative to image width (x: 0=left, 1=right) and height (y: 0=top, 1=bottom).
Output ONLY valid JSON matching the schema.`;

      // Fallback model sequence to guarantee uptime even during capacity spikes
      const candidateModels = [
        "gemini-3.5-flash",
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite-preview",
        "gemini-flash-lite-latest",
      ];

      let lastError: any = null;
      let parsedResult: any = null;

      for (const model of candidateModels) {
        try {
          console.log(`Attempting tree branch analysis with model: ${model}...`);
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: rawBase64,
                    },
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  branches: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        points: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              x: { type: Type.NUMBER },
                              y: { type: Type.NUMBER },
                            },
                            required: ["x", "y"],
                          },
                        },
                      },
                      required: ["points"],
                    },
                  },
                },
                required: ["branches"],
              },
            },
          });

          const text = response.text || "{}";
          parsedResult = JSON.parse(text);
          console.log(`Analysis succeeded with model ${model}, found ${parsedResult?.branches?.length || 0} branches.`);
          break;
        } catch (modelErr: any) {
          console.warn(`Model ${model} analysis failed:`, modelErr?.message || modelErr);
          lastError = modelErr;
          // Continue to next candidate model
        }
      }

      if (!parsedResult) {
        throw lastError || new Error("All Gemini models failed to process the image.");
      }

      // Return status 200 with ok: true to prevent Nginx error_page interception
      res.json({ ok: true, ...parsedResult });
    } catch (err: any) {
      console.error("Gemini analysis final error:", err);
      const message = err?.message || "Failed to analyze tree image with Gemini.";
      // Return HTTP 200 with ok: false so Nginx does not intercept 403/502/503 and return HTML error pages
      res.json({
        ok: false,
        error: message,
      });
    }
  });

  // Vite middleware for dev / static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
