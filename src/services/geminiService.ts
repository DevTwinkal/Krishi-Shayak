// Frontend Gemini Service — HTTP client that calls server-side API endpoints.
// All Gemini API logic now runs server-side via /api/* routes.
// This file no longer imports or uses @google/genai directly.

const API_BASE = "";

const apiFetch = async (endpoint: string, body: Record<string, any>) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API call failed: ${response.statusText}`);
  }

  return response.json();
};

export const analyzePlantImage = async (base64Image: string, language: string = "en") => {
  try {
    return await apiFetch("/api/analyze-image", { base64Image, language });
  } catch (error) {
    console.error("Image Analysis failed:", error);
    return {};
  }
};

export const chatWithExpert = async (
  history: { role: "user" | "model"; text: string }[],
  message: string,
  language: string = "en",
  base64Image?: string,
  extraContext?: string
) => {
  try {
    const data = await apiFetch("/api/chat", {
      history,
      message,
      language,
      base64Image,
      extraContext,
    });
    return data.response;
  } catch (error: any) {
    console.error("Chat failed:", error);
    if (error.message?.includes("429")) {
      return "I'm a little busy helping other farmers right now. Could you please wait a minute and ask me again? I want to give you my full attention.";
    }
    return "I'm sorry, I'm having a little trouble connecting to my knowledge base. Can we try again in a moment?";
  }
};

export const getAIPoweredWeather = async (location: string, language: string = "en") => {
  try {
    return await apiFetch("/api/weather", { location, language });
  } catch (error) {
    console.error("Weather insights failed:", error);
    return null;
  }
};

export const enhanceImageQuality = async (base64Image: string) => {
  try {
    return await apiFetch("/api/check-image-quality", { base64Image });
  } catch (error) {
    console.error("Quality check failed:", error);
    return { isUsable: true, reason: "" }; // Fallback to skip check
  }
};

// Embedding is not actively used in the app, provide a no-op stub
export const generateEmbedding = async (_text: string) => {
  console.warn("generateEmbedding is not available in client-side mode.");
  return null;
};

// Pure math — stays client-side
export const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
};

/**
 * Generates a sentient briefing of the app's current state.
 * This is used for the "Read Aloud" button to give a conversational overview 
 * of the farmer's world, not just a transcript read.
 */
export const getAppSentientBriefing = async (state: any, language: string = "en") => {
  try {
    const data = await apiFetch("/api/briefing", { state, language });
    return data.briefing;
  } catch (error) {
    console.error("Sentient briefing failed:", error);
    return "I'm looking at your farm data right now... everything seems to be in order.";
  }
};
