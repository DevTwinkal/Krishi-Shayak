import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: "Server misconfiguration: GROQ_API_KEY missing" });

  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";

  try {
    const response = await fetch(GROQ_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You are Krishi Shayak, a warm farming companion standing next to the farmer in their field. Be conversational and natural — like a trusted friend. No markdown. Respond ENTIRELY in ${langName}.`,
          },
          {
            role: "user",
            content: `Give farmer ${state.userName} a warm 3–4 sentence spoken overview of their farm conditions. Start with "Ah, ${state.userName}...". Talk naturally about: weather (${state.weather?.temp}°C, ${state.weather?.condition}), disease risk (${state.weather?.riskLevel}), ${state.recentDetection ? `recent issue: ${state.recentDetection.issue} on ${state.recentDetection.plant}` : "no recent issues"}. Use commas and ellipses for natural pauses. No markdown.`,
          },
        ],
        max_tokens: 250,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      console.error("Groq briefing error:", await response.text());
      return res.status(200).json({
        briefing: `Ah, ${state.userName}... I'm looking at your farm in ${state.location} right now. The weather is ${state.weather?.condition || "quite pleasant"} at ${state.weather?.temp || "–"}°C today. Everything appears to be in order for now.`,
      });
    }

    const data = await response.json();
    const briefing = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ briefing });
  } catch (error: any) {
    console.error("Briefing failed:", error);
    return res.status(200).json({
      briefing: "I'm looking at your farm data right now... everything seems to be in order.",
    });
  }
}
