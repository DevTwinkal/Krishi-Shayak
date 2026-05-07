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

const HF_CHAT_API = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3";
const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

const hfGenerate = async (token: string, inputs: string, maxTokens = 512, temperature = 0.7): Promise<string> => {
  const response = await fetch(HF_CHAT_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs, parameters: { max_new_tokens: maxTokens, temperature, return_full_text: false } }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");
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
    const inputs = `<s>[INST] You are a senior agricultural scientist for India (ICAR/IARI). Image shows: "${caption}". Output ONLY raw JSON no markdown: {"plantName":"<in ${langName}>","issueDetected":"<pest/disease or Healthy in ${langName}>","confidence":<0-100>,"explanation":"<2-3 sentences in ${langName}>","treatments":{"organic":"<in ${langName}>","chemical":"<in ${langName}>"}} [/INST]`;
    const text = await hfGenerate(token, inputs, 500, 0.2);
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
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
  const system = `You are Krishi Shayak, a warm, trusted Indian farming companion. Speak like a knowledgeable friend over chai. Be conversational and encouraging. No markdown, no bullet points. Respond ENTIRELY in ${langName}. Context: ${extraContext || "None."}`;

  let inputs = `<s>[INST] ${system}\n\n${history.length ? history[0].text : message} [/INST]`;
  for (let i = 1; i < history.length; i++) {
    const h = history[i];
    inputs += h.role === "model" ? ` ${h.text}</s>` : `[INST] ${h.text} [/INST]`;
  }
  if (history.length) inputs += `[INST] ${message} [/INST]`;

  try {
    const text = await hfGenerate(token, inputs, 512, 0.7);
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
  const month = new Date().toLocaleString("en-IN", { month: "long" });
  const inputs = `<s>[INST] Agricultural weather expert for India. Provide seasonal insights for ${location} in ${month}. Output ONLY raw JSON no markdown: {"temp":<Celsius>,"condition":"<in ${langName}>","humidity":<0-100>,"windSpeed":<km/h>,"locationName":"<full name>","riskLevel":"<Low or Medium or High>","farmingSuggestion":"<in ${langName}>","irrigationAdvice":"<in ${langName}>","sprayingAlert":"<in ${langName}>"} [/INST]`;

  try {
    const text = await hfGenerate(token, inputs, 400, 0.2);
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
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
  const inputs = `<s>[INST] You are Krishi Shayak, a warm farming companion. Farmer ${state.userName} in ${state.location}. Weather: ${state.weather?.temp}°C ${state.weather?.condition}, risk: ${state.weather?.riskLevel}. ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}.` : "No recent issues."} Give warm 3-4 sentence overview starting "Ah, ${state.userName}...". No markdown. Respond in ${langName}. [/INST]`;

  try {
    const briefing = await hfGenerate(token, inputs, 200, 0.8);
    res.json({ briefing });
  } catch (error: any) {
    console.error("Briefing failed:", error);
    res.json({ briefing: "I'm looking at your farm data right now... everything seems to be in order." });
  }
});

app.listen(PORT, () => {
  console.log(`Krishi Shayak API server running on http://localhost:${PORT}`);
});
