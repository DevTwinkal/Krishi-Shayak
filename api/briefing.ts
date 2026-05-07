import type { VercelRequest, VercelResponse } from "@vercel/node";

const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";
const HF_API = `https://api-inference.huggingface.co/models/${MODEL}/v1/chat/completions`;

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

  const prompt = `You are Krishi Shayak, a warm farming companion standing next to the farmer in their field.

Current farm conditions:
- Farmer: ${state.userName}
- Location: ${state.location}
- Weather: ${state.weather?.temp}°C, ${state.weather?.condition}
- Disease Risk: ${state.weather?.riskLevel}
- Recent activity: ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}` : "No recent issues"}

Give a warm 3-4 sentence spoken overview — talk ABOUT the conditions naturally, like a trusted friend. Start with "Ah, ${state.userName}...". Use commas and ellipses for natural pauses. No markdown, no bullet points. Respond ENTIRELY in ${langName}.`;

  try {
    const response = await fetch(HF_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("HF briefing error:", err);
      return res.status(200).json({
        briefing: `Ah, ${state.userName}... I'm looking at your farm data right now. The weather seems ${state.weather?.condition || "quite pleasant"} today. Everything appears to be in order for now.`,
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
