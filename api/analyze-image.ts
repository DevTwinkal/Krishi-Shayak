import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";
const HF_TEXT_API = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

async function captionImage(token: string, base64Image: string): Promise<string> {
  const imageBuffer = Buffer.from(base64Image, "base64");
  const response = await fetch(HF_CAPTION_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: imageBuffer,
  });
  if (!response.ok) throw new Error(`Caption API ${response.status}: ${await response.text()}`);
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

    const inputs = `<s>[INST] You are a senior agricultural scientist specialising in Indian crops and pests (ICAR/IARI methods). An image shows: "${caption}"

Analyse this for the Indian agricultural context. Output ONLY a raw JSON object, no explanation, no markdown, no code fences:
{"plantName":"<plant name in ${langName}>","issueDetected":"<pest/disease or Healthy in ${langName}>","confidence":<0-100>,"explanation":"<2-3 sentence scientific explanation in ${langName}>","treatments":{"organic":"<organic Prakritik kheti treatment in ${langName}>","chemical":"<IPM chemical treatment in ${langName}>"}}
 [/INST]`;

    const response = await fetch(HF_TEXT_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs,
        parameters: { max_new_tokens: 500, temperature: 0.2, return_full_text: false },
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const text: string = Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    return res.status(500).json({ error: error.message || "Image analysis failed" });
  }
}
