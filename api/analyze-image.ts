import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
const HF_CHAT_API = "https://api-inference.huggingface.co/v1/chat/completions";
const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

async function captionImage(token: string, base64Image: string): Promise<string> {
  const imageBuffer = Buffer.from(base64Image, "base64");
  const response = await fetch(HF_CAPTION_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBuffer,
  });
  if (!response.ok) throw new Error(`Caption API failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  try {
    const caption = await captionImage(token, base64Image);

    const prompt = `You are a senior agricultural scientist specialising in Indian crops and pests. An image has been described as: "${caption}"

Based on this image description, analyse it for the Indian agricultural context.

Return ONLY a valid JSON object with these exact fields (no extra text, no markdown):
{
  "plantName": "<plant or crop name, common in India, in ${langName}>",
  "issueDetected": "<pest or disease detected, or 'Healthy' if none, in ${langName}>",
  "confidence": <confidence score 0-100>,
  "explanation": "<2-3 sentence scientific explanation referencing ICAR/IARI research where relevant, in ${langName}>",
  "treatments": {
    "organic": "<organic/Prakritik kheti treatment, in ${langName}>",
    "chemical": "<IPM-based chemical treatment, in ${langName}>"
  }
}

If the image does not appear to show a plant or crop, set issueDetected to "Not a plant image" and confidence to 0. Return only the JSON.`;

    const chatResponse = await fetch(HF_CHAT_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 768,
        temperature: 0.3,
      }),
    });

    if (!chatResponse.ok) {
      throw new Error(await chatResponse.text());
    }

    const chatData = await chatResponse.json();
    const text = chatData.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    return res.status(500).json({ error: error.message || "Image analysis failed" });
  }
}
