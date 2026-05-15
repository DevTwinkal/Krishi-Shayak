import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const languageNames: Record<string, string> = {
  en: "English", hi: "Hindi", mr: "Marathi", te: "Telugu", ta: "Tamil",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi",
};

async function getRealWeather(location: string, owmKey: string) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)},IN&appid=${owmKey}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) {
    const fallback = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${owmKey}&units=metric`);
    if (!fallback.ok) throw new Error(`OpenWeatherMap: ${await fallback.text()}`);
    return fallback.json();
  }
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey = process.env.GROQ_API_KEY;
  const owmKey = process.env.OPENWEATHER_API_KEY;
  if (!groqKey) return res.status(500).json({ error: "Server misconfiguration: GROQ_API_KEY missing" });

  const { location, language = "en" } = req.body;
  if (!location) return res.status(400).json({ error: "location is required" });

  const langName = languageNames[language] || "English";
  const month = new Date().toLocaleString("en-IN", { month: "long" });

  let weatherContext = "";
  if (owmKey) {
    try {
      const wx = await getRealWeather(location, owmKey);
      const realTemp = Math.round(wx.main.temp);
      const realHumidity = wx.main.humidity;
      const realWindSpeed = Math.round((wx.wind?.speed || 0) * 3.6);
      const realCondition = wx.weather?.[0]?.description || "clear";
      const locationName = `${wx.name}, ${wx.sys?.country || "IN"}`;
      weatherContext = `Real weather for ${locationName}: Temp ${realTemp}°C, Humidity ${realHumidity}%, Wind ${realWindSpeed} km/h, Condition: ${realCondition}. Use these exact numeric values.`;
    } catch (err: any) {
      console.warn("OpenWeatherMap failed, using AI-generated weather:", err.message?.slice(0, 60));
    }
  }

  const systemPrompt = `You are an expert agricultural advisor for India. Provide farming insights based on weather data. Respond in ${langName}. Output ONLY valid JSON, no markdown.`;

  const userPrompt = weatherContext
    ? `${weatherContext}
Return this exact JSON with advisory fields in ${langName}:
{"temp":<integer>,"condition":"<condition in ${langName}>","humidity":<integer>,"windSpeed":<integer>,"locationName":"<name>","lat":<float>,"lon":<float>,"riskLevel":"<Low|Medium|High>","diseaseRisk":"<1 sentence in ${langName}>","farmingSuggestion":"<1 tip in ${langName}>","irrigationAdvice":"<1 tip in ${langName}>","sprayingAlert":"<1 tip in ${langName}>"}`
    : `Provide REALISTIC seasonal weather data and farming insights for: ${location}, India, in ${month}.
Return this exact JSON (all advisory fields in ${langName}):
{"temp":<realistic Celsius integer>,"feelsLike":<integer>,"condition":"<in ${langName}>","humidity":<0-100>,"windSpeed":<km/h integer>,"locationName":"<full name>","lat":<float>,"lon":<float>,"riskLevel":"<Low|Medium|High>","diseaseRisk":"<1 sentence in ${langName}>","farmingSuggestion":"<1 tip in ${langName}>","irrigationAdvice":"<1 tip in ${langName}>","sprayingAlert":"<1 tip in ${langName}>"}`;

  try {
    const groqRes = await fetch(GROQ_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 450,
        temperature: 0.2,
      }),
    });

    if (!groqRes.ok) throw new Error(await groqRes.text());

    const groqData = await groqRes.json();
    const text: string = groqData.choices?.[0]?.message?.content || "";
    const jsonMatch = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");

    return res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error: any) {
    console.error("Weather insights failed:", error.message?.slice(0, 80));
    return res.status(500).json({ error: error.message || "Weather insights failed" });
  }
}
