import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "50mb" }));

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const HF_CHAT_API = "https://router.huggingface.co/hf-inference/v1/chat/completions";
const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";
const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

const hfChat = async (token: string, messages: any[], maxTokens = 1024, temperature = 0.7) => {
  const response = await fetch(HF_CHAT_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

const captionImage = async (token: string, base64Image: string): Promise<string> => {
  const imageBuffer = Buffer.from(base64Image, "base64");
  const response = await fetch(HF_CAPTION_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: imageBuffer,
  });
  if (!response.ok) throw new Error(`Caption API failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
};

app.post("/api/analyze-image", async (req, res) => {
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN missing" });

  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  try {
    const caption = await captionImage(token, base64Image);
    const prompt = `You are a senior agricultural scientist specialising in Indian crops and pests. An image has been described as: "${caption}"

Return ONLY a valid JSON object:
{
  "plantName": "<plant name in ${langName}>",
  "issueDetected": "<pest/disease or 'Healthy' in ${langName}>",
  "confidence": <0-100>,
  "explanation": "<scientific explanation referencing ICAR/IARI in ${langName}>",
  "treatments": {
    "organic": "<organic treatment in ${langName}>",
    "chemical": "<IPM chemical treatment in ${langName}>"
  }
}`;

    const text = await hfChat(token, [{ role: "user", content: prompt }], 768, 0.3);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    res.json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN missing" });

  const { history = [], message, language = "en", extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";
  const systemPrompt = `You are Krishi Shayak, a warm, trusted Indian farming companion. Speak like a knowledgeable friend over chai. Be conversational, encouraging, and deeply respectful. Use phrases like "Hmm, let me see...", "Ah, I understand,". Start with a warm acknowledgement. Use short clear sentences. No markdown, no bullet points. Respond ENTIRELY in ${langName}. Context: ${extraContext || "None."}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h: any) => ({ role: h.role === "model" ? "assistant" : "user", content: h.text })),
    { role: "user", content: message },
  ];

  try {
    const text = await hfChat(token, messages);
    res.json({ response: text });
  } catch (error: any) {
    console.error("Chat failed:", error);
    res.json({ response: "I'm sorry, I'm having a little trouble connecting. Can we try again?" });
  }
});

app.post("/api/weather", async (req, res) => {
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN missing" });

  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";
  const prompt = `Provide current weather and agricultural insights for ${location}, India in ${new Date().toLocaleString("en-IN", { month: "long" })}.

Return ONLY valid JSON:
{
  "temp": <Celsius number>,
  "condition": "<weather in ${langName}>",
  "humidity": <0-100>,
  "windSpeed": <km/h>,
  "locationName": "<full location name>",
  "riskLevel": "<Low/Medium/High disease risk>",
  "farmingSuggestion": "<farming advice in ${langName}>",
  "irrigationAdvice": "<irrigation advice in ${langName}>",
  "sprayingAlert": "<spraying advice in ${langName}>"
}`;

  try {
    const text = await hfChat(token, [{ role: "user", content: prompt }], 512, 0.3);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    res.json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Weather failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/check-image-quality", async (req, res) => {
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN missing" });

  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  try {
    const caption = await captionImage(token, base64Image);
    const isUsable = caption.length > 10;
    res.json({ isUsable, reason: caption || "Could not assess image quality" });
  } catch {
    res.json({ isUsable: true, reason: "" });
  }
});

app.post("/api/briefing", async (req, res) => {
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN missing" });

  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";
  const prompt = `You are Krishi Shayak, a warm farming companion. Farmer ${state.userName} is in ${state.location}. Weather: ${state.weather?.temp}°C, ${state.weather?.condition}. Disease risk: ${state.weather?.riskLevel}. ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}.` : "No recent issues."} Give a warm 3-4 sentence spoken overview starting with "Ah, ${state.userName}...". Respond in ${langName}. No markdown.`;

  try {
    const briefing = await hfChat(token, [{ role: "user", content: prompt }], 300, 0.8);
    res.json({ briefing });
  } catch (error: any) {
    console.error("Briefing failed:", error);
    res.json({ briefing: "I'm looking at your farm data right now... everything seems to be in order." });
  }
});

app.listen(PORT, () => {
  console.log(`Krishi Shayak API server running on http://localhost:${PORT}`);
});
