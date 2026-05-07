import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

async function captionImage(hfToken: string, base64Image: string): Promise<string> {
  const imageBuffer = Buffer.from(base64Image, "base64");
  const response = await fetch(HF_CAPTION_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${hfToken}`, "Content-Type": "application/octet-stream" },
    body: imageBuffer,
  });
  if (!response.ok) throw new Error(`Caption API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const hfToken = process.env.HF_TOKEN;
  if (!groqKey) return res.status(500).json({ error: "Server misconfiguration: GROQ_API_KEY missing" });
  if (!hfToken) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  try {
    const caption = await captionImage(hfToken, base64Image);

    const response = await fetch(GROQ_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a senior agricultural scientist specialising in Indian crops, pests, and diseases (ICAR/IARI expertise). Provide scientifically accurate, practical advice for Indian farmers. Respond ONLY with valid JSON — no markdown, no explanation outside JSON.`,
          },
          {
            role: "user",
            content: `An image of a plant/crop has been described as: "${caption}"

Analyse this for Indian agricultural context and return this exact JSON (all text fields in ${langName}):
{"plantName":"<plant or crop name common in India>","issueDetected":"<pest/disease detected or Healthy if none>","confidence":<0-100>,"explanation":"<2-3 sentences with scientific reasoning, referencing ICAR/IARI research where relevant>","treatments":{"organic":"<organic/Prakritik kheti treatment>","chemical":"<IPM-based chemical treatment>"}}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    return res.status(500).json({ error: error.message || "Image analysis failed" });
  }
}
