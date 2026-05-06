import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "50mb" }));

// CORS for local dev
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI(apiKey);
};

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

// POST /api/analyze-image
app.post("/api/analyze-image", async (req, res) => {
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
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }] }],
      generationConfig: {
        systemInstruction: "You are a senior agricultural scientist specializing in Indian crops and pests.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plantName: { type: Type.STRING }, issueDetected: { type: Type.STRING },
            confidence: { type: Type.NUMBER }, explanation: { type: Type.STRING },
            treatments: { type: Type.OBJECT, properties: { organic: { type: Type.STRING }, chemical: { type: Type.STRING } }, required: ["organic", "chemical"] },
          },
          required: ["plantName", "issueDetected", "confidence", "explanation", "treatments"],
        },
      },
    });
    res.json(JSON.parse(response.response.text() || "{}"));
  } catch (error: any) {
    console.error("Image Analysis failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { history = [], message, language = "en", base64Image, extraContext } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";
  const systemInstruction = `You are Krishi Shayak, a warm, trusted, and highly knowledgeable Indian farming companion.
      CONTEXT: ${extraContext || "No additional context provided."}
      CRITICAL: You MUST respond ENTIRELY in ${langName}. No markdown. Use commas, periods, ellipses for natural flow.`;

  const contents = history.map((h: any) => ({ role: h.role, parts: [{ text: h.text }] }));
  const userParts: any[] = [{ text: message }];
  if (base64Image) userParts.push({ inlineData: { data: base64Image, mimeType: "image/jpeg" } });
  contents.push({ role: "user", parts: userParts });

  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction, tools: [{ googleSearch: {} } as any] });
    const result = await model.generateContent({ contents });
    const responseText = result.response.text();
    if (!responseText) throw new Error("Empty response");
    res.json({ response: responseText });
  } catch (error: any) {
    console.error("Chat failed:", error);
    res.json({ response: "I'm sorry, I'm having a little trouble connecting. Can we try again?" });
  }
});

// POST /api/weather
app.post("/api/weather", async (req, res) => {
  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";
  const prompt = `Provide the current weather and agricultural insights for ${location} in India. Return JSON with: temp, condition, humidity, windSpeed, locationName, riskLevel, farmingSuggestion, irrigationAdvice, sprayingAlert. Text in ${langName}.`;

  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: [{ googleSearch: {} } as any],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            temp: { type: Type.NUMBER }, condition: { type: Type.STRING }, humidity: { type: Type.NUMBER },
            windSpeed: { type: Type.NUMBER }, locationName: { type: Type.STRING }, riskLevel: { type: Type.STRING },
            farmingSuggestion: { type: Type.STRING }, irrigationAdvice: { type: Type.STRING }, sprayingAlert: { type: Type.STRING },
          },
          required: ["temp", "condition", "humidity", "windSpeed", "locationName", "riskLevel", "farmingSuggestion", "irrigationAdvice", "sprayingAlert"],
        },
      },
    });
    const result = await model.generateContent(prompt);
    res.json(JSON.parse(result.response.text() || "{}"));
  } catch (error: any) {
    console.error("Weather failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/check-image-quality
app.post("/api/check-image-quality", async (req, res) => {
  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent({
      contents: [{ parts: [{ text: "Is this image clear enough for agricultural disease detection? Respond with 'YES' or 'NO' and a reason." }, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }] }],
    });
    const text = response.response.text() || "";
    res.json({ isUsable: text.toUpperCase().includes("YES"), reason: text });
  } catch (error: any) {
    console.error("Quality check failed:", error);
    res.json({ isUsable: true, reason: "" });
  }
});

// POST /api/briefing
app.post("/api/briefing", async (req, res) => {
  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";
  const prompt = `You are Krishi Shayak. Provide a 3-4 sentence warm briefing for farmer ${state.userName} in ${state.location}. Weather: ${state.weather?.temp}°C, ${state.weather?.condition}. Risk: ${state.weather?.riskLevel}. ${state.recentDetection ? `Last detected ${state.recentDetection.issue} on ${state.recentDetection.plant}` : "No recent issues"}. Respond in ${langName}. No markdown.`;

  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const response = await model.generateContent(prompt);
    res.json({ briefing: response.response.text() });
  } catch (error: any) {
    console.error("Briefing failed:", error);
    res.json({ briefing: "I'm looking at your farm data right now... everything seems to be in order." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Krishi Shayak API server running on http://localhost:${PORT}`);
});
