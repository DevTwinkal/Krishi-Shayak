import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_API = "https://router.huggingface.co/hf-inference/v1/chat/completions";
const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { history = [], message, language = "en", extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";

  const systemPrompt = `You are Krishi Shayak, a warm, trusted Indian farming companion. You speak like a knowledgeable friend over chai. Be conversational, encouraging, and deeply respectful. Use phrases like "Hmm, let me see...", "Ah, I understand," "Well, you know,". Start with a warm acknowledgement. Use short clear sentences. No markdown, no bullet points, no numbered lists. Use commas and ellipses for natural pauses. Respond ENTIRELY in ${langName}. Context: ${extraContext || "None."}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h: any) => ({
      role: h.role === "model" ? "assistant" : "user",
      content: h.text,
    })),
    { role: "user", content: message },
  ];

  try {
    const response = await fetch(HF_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024, temperature: 0.7 }),
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
