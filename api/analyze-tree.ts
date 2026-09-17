import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeTree } from "./_analyze";

// Camera screenshots arrive as large base64 payloads, so give Gemini room to run
export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const result = await analyzeTree(body.image);

  // Always HTTP 200 with an ok flag so proxies never swap the body for an HTML error page
  res.status(200).json(result);
}
