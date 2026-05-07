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

  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";
  const month = new Date().toLocaleString("en-IN", { month: "long" });

  const inputs = `<s>[INST] You are an agricultural weather expert for India. Provide realistic seasonal weather and farming insights for ${location}, India in ${month}.

Output ONLY a raw JSON object, no explanation, no markdown, no code fences:
{"temp":<Celsius number>,"condition":"<weather in ${langName}>","humidity":<0-100>,"windSpeed":<km/h>,"locationName":"<full location name>","riskLevel":"<Low or Medium or High>","farmingSuggestion":"<practical farming advice in ${langName}>","irrigationAdvice":"<irrigation advice in ${langName}>","sprayingAlert":"<pesticide advice in ${langName}>"}
 [/INST]`;

  try {
    const response = await fetch(HF_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs,
        parameters: { max_new_tokens: 400, temperature: 0.2, return_full_text: false },
      }),
    });

    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const text: string = Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Weather insights failed:", error);
    return res.status(500).json({ error: error.message || "Weather insights failed" });
  }
}
