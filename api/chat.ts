import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: "Server misconfiguration: GROQ_API_KEY missing" });

  const { history = [], message, language = "en", extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";

  const systemPrompt = `You are Krishi Shayak, a warm and deeply knowledgeable Indian farming companion. You have expert knowledge of Indian agriculture, crop diseases, pests, soil health, weather patterns across Indian states, government schemes (PM-KISAN, Soil Health Card, e-NAM), organic farming, and market prices.

Speak like a trusted friend who a farmer meets over chai — conversational, encouraging, and respectful. Use phrases like "Hmm, let me see...", "Ah, I understand," "Well, you know...". Start every response with a warm acknowledgement. Keep sentences short and clear. No markdown, no bullet points, no numbered lists. Use commas and ellipses for natural pauses.

Respond ENTIRELY in ${langName}.
${extraContext ? `Current context: ${extraContext}` : ""}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h: any) => ({
      role: h.role === "model" ? "assistant" : "user",
      content: h.text,
    })),
    { role: "user", content: message },
  ];

  try {
    const response = await fetch(GROQ_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 1024, temperature: 0.7 }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429) {
        return res.status(200).json({
          response: "I'm a little busy helping other farmers right now. Could you please wait a moment and ask me again?",
        });
      }
      throw new Error(err);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || "";
    if (!responseText) throw new Error("Empty response");
    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    console.error("Chat failed:", error);
    return res.status(200).json({
      response: "I'm sorry, I'm having a little trouble connecting to my knowledge base. Can we try again in a moment?",
    });
  }
}
