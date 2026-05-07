import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_API = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

function buildMistralPrompt(system: string, history: { role: string; text: string }[], userMessage: string): string {
  let prompt = `<s>[INST] ${system}\n\n`;
  if (history.length === 0) {
    prompt += `${userMessage} [/INST]`;
    return prompt;
  }
  // First turn includes system
  const first = history[0];
  prompt += `${first.text} [/INST]`;
  for (let i = 1; i < history.length; i++) {
    const h = history[i];
    if (h.role === "model" || h.role === "assistant") {
      prompt += ` ${h.text}</s>`;
    } else {
      prompt += `[INST] ${h.text} [/INST]`;
    }
  }
  prompt += `[INST] ${userMessage} [/INST]`;
  return prompt;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { history = [], message, language = "en", extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";
  const system = `You are Krishi Shayak, a warm, trusted Indian farming companion. Speak like a knowledgeable friend over chai. Be conversational, encouraging, and deeply respectful. Use phrases like "Hmm, let me see...", "Ah, I understand,". Start with a warm acknowledgement. Short clear sentences. No markdown, no bullet points. Use commas and ellipses for natural pauses. Respond ENTIRELY in ${langName}. Context: ${extraContext || "None."}`;

  const inputs = buildMistralPrompt(system, history, message);

  try {
    const response = await fetch(HF_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs,
        parameters: { max_new_tokens: 512, temperature: 0.7, return_full_text: false },
      }),
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
    const responseText = Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
    if (!responseText) throw new Error("Empty response");
    return res.status(200).json({ response: responseText });
  } catch (error: any) {
    console.error("Chat failed:", error);
    return res.status(200).json({
      response: "I'm sorry, I'm having a little trouble connecting to my knowledge base. Can we try again in a moment?",
    });
  }
}
