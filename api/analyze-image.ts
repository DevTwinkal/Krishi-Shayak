import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: "Server misconfiguration: GROQ_API_KEY missing" });

  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  const prompt = `You are a senior agricultural scientist specialising in Indian crops, pests, and diseases (ICAR/IARI expertise).
Carefully analyse this plant/crop image and return this exact JSON (all text fields in ${langName}):
{"plantName":"<plant or crop name common in India>","issueDetected":"<pest/disease detected or Healthy if none>","confidence":<0-100>,"explanation":"<2-3 sentences with scientific reasoning, referencing ICAR/IARI research where relevant>","treatments":{"organic":"<organic/Prakritik kheti treatment>","chemical":"<IPM-based chemical treatment>"}}
Respond ONLY with valid JSON — no markdown, no code fences, no extra text.`;

  try {
    const response = await fetch(GROQ_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            { type: "text", text: prompt },
          ],
        }],
        max_tokens: 700,
        temperature: 0.2,
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Image Analysis failed:", error.message?.slice(0, 120));
    return res.status(500).json({ error: error.message || "Image analysis failed" });
  }
}
