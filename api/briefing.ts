import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_API = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";

  const inputs = `<s>[INST] You are Krishi Shayak, a warm farming companion standing next to the farmer in their field. Farmer ${state.userName} is in ${state.location}. Weather: ${state.weather?.temp}°C, ${state.weather?.condition}. Disease risk: ${state.weather?.riskLevel}. ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}.` : "No recent issues."}

Give a warm 3-4 sentence spoken overview starting with "Ah, ${state.userName}...". Talk about the conditions naturally, like a trusted friend. Use commas and ellipses for natural pauses. No markdown. Respond ENTIRELY in ${langName}. [/INST]`;

  try {
    const response = await fetch(HF_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs,
        parameters: { max_new_tokens: 200, temperature: 0.8, return_full_text: false },
      }),
    });

    if (!response.ok) {
      console.error("HF briefing error:", await response.text());
      return res.status(200).json({
        briefing: `Ah, ${state.userName}... I'm looking at your farm in ${state.location} right now. The weather seems ${state.weather?.condition || "quite pleasant"} today at ${state.weather?.temp || "–"}°C. Everything appears to be in order for now.`,
      });
    }

    const data = await response.json();
    const briefing: string = Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
    return res.status(200).json({ briefing });
  } catch (error: any) {
    console.error("Briefing failed:", error);
    return res.status(200).json({
      briefing: "I'm looking at your farm data right now... everything seems to be in order.",
    });
  }
}
