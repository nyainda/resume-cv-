import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { base64Data, mimeType } = req.body;
    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: 'base64Data and mimeType are required.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = "This file is a resume, CV, or professional profile. Extract all text content from it. Return only the raw text, preserving original line breaks and structure as much as possible. Do not add any commentary, summaries, or formatting like markdown.";
    
    const filePart = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType,
        },
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [filePart, { text: prompt }] },
    });

    res.status(200).json({ text: response.text });
  } catch (error) {
    console.error("Error in /api/extract-profile-text-from-file:", error);
    if (error instanceof Error && error.message.includes('unsupported')) {
        return res.status(400).json({ error: "Failed to read text from the file. The file type might not be supported by the AI." });
    }
    res.status(500).json({ error: "Failed to read text from the file. Please try a clearer file." });
  }
}
