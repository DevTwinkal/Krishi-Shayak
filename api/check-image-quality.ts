import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  // If no key, allow image through — quality check is non-blocking
  if (!groqKey) return res.status(200).json({ isUsable: true, reason: "" });

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
            { type: "text", text: `Does this image clearly show a plant, leaf, or crop for disease analysis? Respond ONLY with JSON: {"isUsable": true/false, "reason": "<10 words max>"}` },
          ],
        }],
        max_tokens: 60,
        temperature: 0.1,
      }),
    });

    if (!response.ok) return res.status(200).json({ isUsable: true, reason: "" });

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return res.status(200).json({ isUsable: true, reason: "" });

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch {
    return res.status(200).json({ isUsable: true, reason: "" });
  }
}
