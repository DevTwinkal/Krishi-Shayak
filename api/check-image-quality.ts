import type { VercelRequest, VercelResponse } from "@vercel/node";

const HF_CAPTION_API = "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "Server misconfiguration: HF_TOKEN missing" });

  const { base64Image } = req.body;
  if (!base64Image) return res.status(400).json({ error: "base64Image is required" });

  try {
    const imageBuffer = Buffer.from(base64Image, "base64");

    const response = await fetch(HF_CAPTION_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      // On model load (503) or any error, assume image is usable to not block the user
      return res.status(200).json({ isUsable: true, reason: "" });
    }

    const data = await response.json();
    const caption: string = Array.isArray(data) ? (data[0]?.generated_text || "") : (data?.generated_text || "");

    // If we got a meaningful caption, the image is clear enough
    const isUsable = caption.length > 10;
    return res.status(200).json({ isUsable, reason: caption || "Could not assess image quality" });
  } catch (error: any) {
    console.error("Quality check failed:", error);
    return res.status(200).json({ isUsable: true, reason: "" });
  }
}
