import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { jobDescription } = req.body;
    if (!jobDescription) {
        return res.status(400).json({ error: 'jobDescription is required.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
        Analyze the following job description. Extract the top 10 most important technical keywords (specific technologies, tools, platforms, methodologies like Agile) and the top 10 essential soft skills (communication, leadership, etc.). Prioritize keywords that are explicitly mentioned or strongly implied as requirements.

        JOB DESCRIPTION:
        ${jobDescription}

        Return ONLY the JSON object adhering to the provided schema. Do not include any markdown formatting.
    `;

    const schema = {
        type: Type.OBJECT,
        properties: {
            keywords: {
                type: Type.ARRAY,
                description: "Top 10 most important technical keywords or nouns.",
                items: { type: Type.STRING }
            },
            skills: {
                type: Type.ARRAY,
                description: "Top 10 most important soft skills or abilities.",
                items: { type: Type.STRING }
            }
        },
        required: ["keywords", "skills"]
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.1,
        }
    });

    res.status(200).json(JSON.parse(response.text.trim()));
  } catch (error) {
    console.error("Error in /api/analyze-job:", error);
    res.status(500).json({ error: "Failed to analyze job description." });
  }
}
