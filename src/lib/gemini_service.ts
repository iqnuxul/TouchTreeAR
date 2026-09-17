export interface BranchPoint {
  x: number;
  y: number;
}

export interface Branch {
  points: BranchPoint[];
}

export interface GeminiDetectionResult {
  branches: Branch[];
}

export const analyzeTreeImage = async (base64Image: string): Promise<GeminiDetectionResult> => {
  const response = await fetch("/api/analyze-tree", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ image: base64Image }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const rawText = await response.text().catch(() => "");
    if (rawText.toLowerCase().includes("warmup") || response.status === 502 || response.status === 503) {
      throw new Error("The application server is warming up. Please wait a moment and try scanning again.");
    }
    if (rawText.toLowerCase().includes("forbidden") || response.status === 403) {
      throw new Error("Access permission denied by server. Please reload the page to refresh authentication.");
    }
    throw new Error(`Server returned unexpected response (${response.status}). Please try again in a few seconds.`);
  }

  const data = await response.json();

  if (data.ok === false || data.error) {
    throw new Error(data.error || "Failed to analyze tree branches. Please try again.");
  }

  return {
    branches: Array.isArray(data.branches) ? data.branches : [],
  };
};
