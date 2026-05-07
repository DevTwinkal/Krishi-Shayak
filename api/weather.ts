import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_API = "https://api-inference.huggingface.co/v1/chat/completions";
const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";

  const prompt = `You are an agricultural weather expert for India. Provide realistic weather and farming insights for ${location}, India.

Return ONLY a valid JSON object with these exact fields (no extra text, no markdown):
{
  "temp": <number in Celsius>,
  "condition": "<weather condition in ${langName}>",
  "humidity": <percentage 0-100>,
  "windSpeed": <km/h>,
  "locationName": "<full location name>",
  "riskLevel": "<Low, Medium, or High for crop disease risk based on weather>",
  "farmingSuggestion": "<practical farming advice in ${langName}>",
  "irrigationAdvice": "<irrigation advice in ${langName}>",
  "sprayingAlert": "<pesticide/spraying advice in ${langName}>"
}

Base the values on typical seasonal weather patterns for ${location} in India during ${new Date().toLocaleString("en-IN", { month: "long" })}. Return only the JSON, nothing else.`;

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
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("Weather insights failed:", error);
    return res.status(500).json({ error: error.message || "Weather insights failed" });
  }
}
