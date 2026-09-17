import { GoogleGenAI, Type } from "@google/genai";

// Shared Gemini client with lazy initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it in the deployment's environment variables.");
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
  "gemini-2.5-flash",
];

const responseSchema = {
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
};

/**
 * Runs tree-branch detection on a base64 (optionally data-URI prefixed) image.
 * Always resolves; failures are reported as { ok: false } so the caller can
 * answer with HTTP 200 and avoid edge/proxy error-page interception.
 */
export async function analyzeTree(image: unknown): Promise<Record<string, any>> {
  try {
    if (!image || typeof image !== "string") {
      return { ok: false, error: "No image payload provided" };
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
            responseSchema,
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

    return { ok: true, ...parsedResult };
  } catch (err: any) {
    console.error("Gemini analysis final error:", err);
    return {
      ok: false,
      error: err?.message || "Failed to analyze tree image with Gemini.",
    };
  }
}
