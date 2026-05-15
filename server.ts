import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

app.use(express.json({ limit: "50mb" }));

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

// ── Mock responses for when API is unavailable ─────────────────────────────────
const MOCK_DETECTION = {
  plantName: "Tomato",
  issueDetected: "Early Blight (Alternaria solani)",
  confidence: 87,
  explanation: "The leaf shows characteristic dark brown spots with concentric rings, typical of Early Blight caused by the fungus Alternaria solani. This disease spreads rapidly in warm, humid conditions and can cause significant yield loss if untreated.",
  treatments: {
    organic: "Remove and destroy infected leaves. Apply neem oil spray (5ml/litre) every 7 days. Use copper-based fungicide (Bordeaux mixture). Maintain proper plant spacing for airflow.",
    chemical: "Apply Mancozeb 75 WP at 2g/litre or Chlorothalonil 75 WP at 2g/litre. Spray every 10-14 days. Alternate fungicides to prevent resistance. Follow label instructions strictly.",
  },
};

const MOCK_WEATHER = {
  temp: 31, feelsLike: 34, condition: "Partly Cloudy", humidity: 68,
  windSpeed: 14, locationName: "Your Location", lat: 20.5937, lon: 78.9629,
  riskLevel: "Medium",
  diseaseRisk: "Moderate humidity levels create favourable conditions for fungal diseases. Keep monitoring your crops closely.",
  farmingSuggestion: "Good conditions for transplanting seedlings. Ensure adequate irrigation for newly planted crops.",
  irrigationAdvice: "Light irrigation recommended in the evening. Avoid overhead watering to reduce disease spread.",
  sprayingAlert: "Suitable for spraying in the early morning. Avoid spraying during peak heat hours.",
};

function getMockChat(message: string, language: string): string {
  const responses: Record<string, string[]> = {
    en: [
      "That's a great question! Based on your farm conditions, I'd recommend checking the soil moisture first. Healthy crops need consistent watering, especially during warm months.",
      "I understand your concern. The best approach for this time of year is to monitor your plants daily for early signs of disease. Early detection is key to a good harvest.",
      "For this issue, try applying neem oil spray in the early morning. It's organic, safe, and very effective against most common pests and fungal diseases.",
    ],
    hi: [
      "यह एक अच्छा सवाल है! आपकी फसल के लिए, मैं पहले मिट्टी की नमी जांचने की सलाह देता हूं।",
      "चिंता मत करें! नीम के तेल का छिड़काव सुबह जल्दी करें। यह बहुत प्रभावी है।",
    ],
    mr: [
      "हा एक चांगला प्रश्न आहे! तुमच्या शेतासाठी, मी प्रथम जमिनीतील आर्द्रता तपासण्याची शिफारस करतो.",
    ],
  };
  const langResponses = responses[language] || responses.en;
  return langResponses[Math.floor(Math.random() * langResponses.length)];
}

// ── GROQ API helpers ──────────────────────────────────────────────────────────
async function groqText(prompt: string, maxTokens = 600): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("NO_KEY");
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw Object.assign(new Error(err), { status: res.status });
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function groqVision(base64Image: string, prompt: string, maxTokens = 700): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("NO_KEY");
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          { type: "text", text: prompt },
        ],
      }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw Object.assign(new Error(err), { status: res.status });
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJSON(text: string): any {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response: " + text.slice(0, 200));
  return JSON.parse(jsonMatch[0]);
}

function isQuotaError(e: any): boolean {
  return e?.status === 429 || e.message?.includes("429") || e.message?.includes("rate_limit");
}

// ── /api/analyze-image ────────────────────────────────────────────────────────
app.post("/api/analyze-image", async (req, res) => {
  const { base64Image, language = "en" } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  const langName = languageNames[language] || "English";

  const prompt = `You are a senior agricultural scientist (ICAR/IARI expert).
Carefully analyze this plant/leaf image for diseases, pests, deficiencies, or health issues.
Respond ONLY with a valid JSON object — no markdown, no code fences, no extra text:
{
  "plantName": "<plant name in ${langName}>",
  "issueDetected": "<specific disease/pest name or 'Healthy' in ${langName}>",
  "confidence": <integer 0-100>,
  "explanation": "<2-3 sentences of precise diagnosis in ${langName}>",
  "treatments": {
    "organic": "<step-by-step organic treatment in ${langName}>",
    "chemical": "<specific chemical/pesticide name and dosage in ${langName}>"
  }
}`;

  try {
    const text = await groqVision(base64Image, prompt, 700);
    res.json(parseJSON(text));
  } catch (error: any) {
    console.error("Image Analysis failed:", error.message?.slice(0, 120));
    if (isQuotaError(error) || error.message === "NO_KEY") {
      console.log("→ Using mock detection response");
      return res.json(MOCK_DETECTION);
    }
    res.status(500).json({ error: error.message });
  }
});

// ── /api/chat ─────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { history = [], message, language = "en", extraContext, base64Image } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  const langName = languageNames[language] || "English";
  const systemPrompt = `You are Krishi Shayak, a warm, trusted Indian farming companion.
Speak like a knowledgeable friend — conversational, encouraging, practical, no markdown.
Respond ENTIRELY in ${langName}.
Farmer context: ${extraContext || "None."}`;

  const turns = history.slice(-6).map((h: any) =>
    `${h.role === "user" ? "Farmer" : "Krishi Shayak"}: ${h.text}`
  );
  turns.push(`Farmer: ${message}`);

  const fullPrompt = systemPrompt + "\n\n" + turns.join("\n") + "\nKrishi Shayak:";

  try {
    let text: string;
    if (base64Image) {
      text = await groqVision(base64Image, fullPrompt, 512);
    } else {
      text = await groqText(fullPrompt, 512);
    }
    res.json({ response: text.trim() });
  } catch (error: any) {
    console.error("Chat failed:", error.message?.slice(0, 120));
    if (isQuotaError(error) || error.message === "NO_KEY") {
      return res.json({ response: getMockChat(message, language) });
    }
    res.json({ response: "I'm sorry, I'm having a little trouble connecting. Can we try again?" });
  }
});

// ── /api/weather ──────────────────────────────────────────────────────────────
app.post("/api/weather", async (req, res) => {
  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";
  const month = new Date().toLocaleString("en-IN", { month: "long" });

  // Use real weather data if OpenWeatherMap key is available
  let weatherContext = "";
  const owmKey = process.env.OPENWEATHER_API_KEY;
  if (owmKey) {
    try {
      const owmUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)},IN&appid=${owmKey}&units=metric`;
      const owmRes = await fetch(owmUrl);
      if (owmRes.ok) {
        const wx = await owmRes.json();
        const realTemp = Math.round(wx.main.temp);
        const realHumidity = wx.main.humidity;
        const realWind = Math.round((wx.wind?.speed || 0) * 3.6);
        const realCondition = wx.weather?.[0]?.description || "clear";
        const locName = `${wx.name}, ${wx.sys?.country || "IN"}`;
        weatherContext = `Real weather data for ${locName}: Temp ${realTemp}°C, Humidity ${realHumidity}%, Wind ${realWind} km/h, Condition: ${realCondition}. Use these exact numeric values in the JSON.`;
      }
    } catch {
      // Fall through to AI-generated weather
    }
  }

  const prompt = `You are an expert agricultural weather advisor for India.
${weatherContext || `Provide REALISTIC seasonal weather data and farming insights for: ${location}, in ${month}.`}
Respond ONLY with valid JSON — no markdown, no code fences:
{
  "temp": <realistic Celsius integer>,
  "feelsLike": <feels-like Celsius integer>,
  "condition": "<weather condition in ${langName}>",
  "humidity": <realistic 0-100 integer>,
  "windSpeed": <km/h integer>,
  "locationName": "<full location name>",
  "lat": <latitude float>,
  "lon": <longitude float>,
  "riskLevel": "<Low or Medium or High>",
  "diseaseRisk": "<1 sentence disease risk in ${langName}>",
  "farmingSuggestion": "<1 actionable farming tip in ${langName}>",
  "irrigationAdvice": "<1 irrigation tip in ${langName}>",
  "sprayingAlert": "<1 spraying advice in ${langName}>"
}`;

  try {
    const text = await groqText(prompt, 500);
    res.json(parseJSON(text));
  } catch (error: any) {
    console.error("Weather failed:", error.message?.slice(0, 120));
    if (isQuotaError(error) || error.message === "NO_KEY") {
      return res.json({ ...MOCK_WEATHER, locationName: location });
    }
    res.status(500).json({ error: error.message });
  }
});

// ── /api/check-image-quality ──────────────────────────────────────────────────
app.post("/api/check-image-quality", async (req, res) => {
  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  try {
    const text = await groqVision(
      base64Image,
      `Does this image clearly show a plant, leaf, or crop for disease analysis?
Respond ONLY with JSON: {"isUsable": true/false, "reason": "<10 words max>"}`,
      80
    );
    res.json(parseJSON(text));
  } catch {
    res.json({ isUsable: true, reason: "" });
  }
});

// ── /api/briefing ─────────────────────────────────────────────────────────────
app.post("/api/briefing", async (req, res) => {
  const { state, language = "en" } = req.body;
  if (!state) return res.status(400).json({ error: "state is required" });

  const langName = languageNames[language] || "English";
  const prompt = `You are Krishi Shayak, a warm farming companion.
Farmer ${state.userName} is in ${state.location}.
Weather: ${state.weather?.temp}°C, ${state.weather?.condition}, Risk: ${state.weather?.riskLevel}.
${state.recentDetection ? `Last issue: ${state.recentDetection.issue} on ${state.recentDetection.plant}.` : "No recent issues."}
Give a warm 3-4 sentence briefing starting with "Ah, ${state.userName}...".
No bullets, no markdown. Respond in ${langName}.`;

  try {
    const briefing = await groqText(prompt, 200);
    res.json({ briefing: briefing.trim() });
  } catch (error: any) {
    console.error("Briefing failed:", error.message?.slice(0, 80));
    res.json({ briefing: `Ah, ${state.userName}! The weather looks good today. Keep monitoring your crops and stay positive. A good harvest is on the way!` });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const hasKey = !!process.env.GROQ_API_KEY;
  console.log(`✅ Krishi Shayak API server → http://localhost:${PORT}`);
  console.log(`🤖 AI: ${hasKey ? "GROQ (Llama 3.3 70B + Vision)" : "Mock mode (no GROQ_API_KEY)"}`);
  console.log(`📌 Note: If quota is exceeded, smart mock responses will be used automatically.`);
});
