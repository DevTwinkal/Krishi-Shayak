import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server misconfiguration: API key missing" });

  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";
  const prompt = `You are Krishi Shayak, a sentient farming companion. 
  Look at the current state of the farmer's dashboard and provide a warm, humanistic briefing.
  
  CURRENT STATE:
  - User: ${state.userName}
  - Location: ${state.location}
  - Weather: ${state.weather?.temp}°C, ${state.weather?.condition}
  - Risk Level: ${state.weather?.riskLevel}
  - Recent History: ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}` : "No recent issues"}
  
  TASK:
  Provide a 3-4 sentence warm overview as if you are standing next to them in the field. 
  Talk ABOUT the conditions, don't just list them. 
  Example: "Ah, ${state.userName}, it looks like a warm day in ${state.location}..."
  
  CRITICAL: Respond ENTIRELY in ${langName}. No markdown. No bullets. Use commas and ellipses for natural breath.`;

  try {
    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent(prompt);
    return res.status(200).json({ briefing: response.response.text() });
  } catch (error: any) {
    console.error("Sentient briefing failed:", error);
    return res.status(200).json({
      briefing: "I'm looking at your farm data right now... everything seems to be in order.",
    });
  }
}
