import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Image, mimeType } = req.body;
    if (!base64Image || !mimeType) {
      return res.status(400).json({ error: 'base64Image and mimeType are required.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = "Analyze this image of a job description and extract all of the text from it. Return only the raw text, with no additional commentary.";
    
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: mimeType,
        },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    
    res.status(200).json({ text: response.text });
  } catch (error) {
    console.error("Error in /api/extract-text-from-image:", error);
    res.status(500).json({ error: "Failed to read text from the image. Please try a clearer image." });
  }
}
