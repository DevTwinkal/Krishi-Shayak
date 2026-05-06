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

  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  const prompt = `
    Analyze this agricultural image specifically for the Indian agricultural context. 
    1. Identify the plant/crop and variety common in India.
    2. Detect any pests or diseases with scientific precision.
    3. Provide a confidence score (0-100).
    4. Suggest organic (Prakritik kheti) and chemical (IPM based) treatments suitable for Indian farmers.
    5. Provide a brief explanation with reference to scientific reasoning or commonly cited agricultural research in India.
    
    IMPORTANT: You MUST provide all text descriptions, plant names, and treatment details in ${langName}.
  `;

  try {
    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
          ],
        },
      ],
      generationConfig: {
        systemInstruction:
          "You are a senior agricultural scientist specializing in Indian crops and pests. Your advice must be based on reputable research papers (e.g., ICAR, IARI) and scientifically proven methods suitable for the Indian climate and soil conditions.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plantName: { type: Type.STRING },
            issueDetected: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            explanation: { type: Type.STRING },
            treatments: {
              type: Type.OBJECT,
              properties: {
                organic: { type: Type.STRING },
                chemical: { type: Type.STRING },
              },
              required: ["organic", "chemical"],
            },
          },
          required: ["plantName", "issueDetected", "confidence", "explanation", "treatments"],
        },
      },
    });

    const text = response.response.text();
    return res.status(200).json(JSON.parse(text || "{}"));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    return res.status(500).json({ error: error.message || "Image analysis failed" });
  }
}
