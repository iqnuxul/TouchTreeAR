import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeTree } from "./_analyze.js";

// Camera screenshots arrive as large base64 payloads, so give Gemini room to run
export const config = {
  maxDuration: 60,
};

// A 1920x1080 JPEG at quality 0.92 lands well under 3 MB once base64-encoded.
// Anything larger is not a camera frame from this app.
const MAX_IMAGE_CHARS = 3_000_000;

// Best-effort per-IP throttle. Serverless instances do not share memory, so
// this does not bound total traffic — it just stops a single client from
// looping the endpoint on a warm instance. The hard guarantee is the quota
// cap on the Gemini key itself.
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX_REQUESTS = 12;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound on a long-lived instance
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(key);
    }
  }

  return recent.length > RATE_MAX_REQUESTS;
}

/**
 * Only serve requests that came from a page on this deployment. This is
 * spoofable by a determined caller, but it stops the endpoint from being
 * used as a free Gemini proxy by a script. Forks can widen it with
 * ALLOWED_ORIGINS (comma-separated hostnames).
 */
function isAllowedOrigin(req: VercelRequest): boolean {
  const host = req.headers.host;
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const hostOf = (value: string | undefined): string | null => {
    if (!value) return null;
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  };

  const origin = hostOf(req.headers.origin as string | undefined);
  const referer = hostOf(req.headers.referer as string | undefined);
  const candidate = origin || referer;

  // A browser sends Origin or Referer on a same-origin POST; a bare script does not
  if (!candidate) return false;
  return candidate === host || extra.includes(candidate);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!isAllowedOrigin(req)) {
    res.status(200).json({
      ok: false,
      error: "This endpoint only serves the app itself. Clone the repo and run your own instance to use it directly.",
    });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    res.status(200).json({
      ok: false,
      error: "Too many scans from this device. Please wait a few minutes and try again.",
    });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const image = body.image;

  if (typeof image === "string" && image.length > MAX_IMAGE_CHARS) {
    res.status(200).json({ ok: false, error: "Image is too large to analyze." });
    return;
  }

  const result = await analyzeTree(image);

  // Always HTTP 200 with an ok flag so proxies never swap the body for an HTML error page
  res.status(200).json(result);
}
