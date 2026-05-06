import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server misconfiguration: API key missing" });

  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";

  const prompt = `Provide current weather and agricultural insights for ${location} in India.
Return a JSON object with these exact fields:
- temp (number, Celsius)
- condition (string in ${langName})
- humidity (number, percentage)
- windSpeed (number, km/h)
- locationName (string)
- riskLevel ("Low", "Medium", or "High" — disease risk based on weather)
- farmingSuggestion (string in ${langName})
- irrigationAdvice (string in ${langName})
- sprayingAlert (string in ${langName})`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            temp: { type: Type.NUMBER },
            condition: { type: Type.STRING },
            humidity: { type: Type.NUMBER },
            windSpeed: { type: Type.NUMBER },
            locationName: { type: Type.STRING },
            riskLevel: { type: Type.STRING },
            farmingSuggestion: { type: Type.STRING },
            irrigationAdvice: { type: Type.STRING },
            sprayingAlert: { type: Type.STRING },
          },
          required: ["temp", "condition", "humidity", "windSpeed", "locationName", "riskLevel", "farmingSuggestion", "irrigationAdvice", "sprayingAlert"],
        },
      },
    });

    return res.status(200).json(JSON.parse(result.text() || "{}"));
  } catch (error: any) {
    console.error("Weather insights failed:", error);
    return res.status(500).json({ error: error.message || "Weather insights failed" });
  }
}
