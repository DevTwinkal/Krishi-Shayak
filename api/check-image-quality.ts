import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server misconfiguration: API key missing" });

  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  try {
    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [
        {
          parts: [
            { text: "Is this image clear enough for agricultural disease detection? Respond with 'YES' or 'NO' and a reason." },
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
          ],
        },
      ],
    });

    const text = response.response.text() || "";
    return res.status(200).json({
      isUsable: text.toUpperCase().includes("YES"),
      reason: text,
    });
  } catch (error: any) {
    console.error("Quality check failed:", error);
    // Fallback to skip check on error
    return res.status(200).json({ isUsable: true, reason: "" });
  }
}
