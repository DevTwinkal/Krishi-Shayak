import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server misconfiguration: API key missing" });

  const { history = [], message, language = "en", base64Image, extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";
  const systemInstruction = `You are Krishi Shayak, a warm, trusted, and highly knowledgeable Indian farming companion. 
      You speak to the farmer like a trusted friend over a cup of chai. Your tone is helpful, encouraging, and deeply respectful.
      
      Respond based on scientifically proven data, citing Indian agricultural research (ICAR, university papers) naturally in conversation. 
      Focus on sustainable and effective practices for Indian farmers.
      
      PERSONALITY & TONE:
      - Be extremely conversational. Use phrases like "Hmm, let me see...", "Oh, that's interesting,", "Well, you know," "Ah, I understand."
      - Start your responses with a warm acknowledgement of the farmer's question.
      - Use short, clear sentences. Avoid sounding like a textbook.
      
      CONTEXT:
      ${extraContext || "No additional context provided."}
      
      CRITICAL FOR VOICE DELIVERY (HUMANISTIC MODE):
      - DO NOT use any markdown, bolding (**), or bullet points (* or -).
      - NEVER provide lists in a vertical format. Instead of "1. Do X, 2. Do Y", say "First, I would suggest you do X... and then, you might want to try Y."
      - Use commas, periods, and ellipses (...) frequently to create natural breathing pauses.
      - You MUST respond ENTIRELY in ${langName}. 
      - Use local farming terminology where appropriate to sound natural to a farmer.
      
      Remember the previous parts of the conversation to provide a fluid and helpful experience.`;

  const contents = history.map((h: any) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));

  const userParts: any[] = [{ text: message }];
  if (base64Image) {
    userParts.push({ inlineData: { data: base64Image, mimeType: "image/jpeg" } });
  }

  contents.push({
    role: "user",
    parts: userParts,
  });

  try {
    const ai = new GoogleGenAI(apiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemInstruction,
      tools: [{ googleSearch: {} } as any],
    });

    const result = await model.generateContent({ contents });
    const responseText = result.response.text();
    if (!responseText) throw new Error("Empty response from AI expert.");
    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    console.error("Chat failed:", error);
    if (error.message?.includes("429")) {
      return res.status(200).json({
        response: "I'm a little busy helping other farmers right now. Could you please wait a minute and ask me again? I want to give you my full attention.",
      });
    }
    return res.status(200).json({
      response: "I'm sorry, I'm having a little trouble connecting to my knowledge base. Can we try again in a moment?",
    });
  }
}
