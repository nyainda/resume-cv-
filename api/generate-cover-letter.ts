import { GoogleGenAI } from "@google/genai";
import type { UserProfile } from '../types';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { profile, jobDescription } = req.body as { profile: UserProfile, jobDescription: string };
    if (!profile || !jobDescription) {
        return res.status(400).json({ error: 'User profile and job description are required.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
        You are a professional career coach. Write a compelling and professional cover letter based on the provided user profile and job description.

        USER PROFILE:
        ${JSON.stringify(profile, null, 2)}

        JOB DESCRIPTION:
        ${jobDescription}

        Instructions:
        1. The tone should be professional, confident, and enthusiastic.
        2. Structure the letter with an introduction (state the position being applied for), a body (highlighting 2-3 key skills and experiences from the user's profile that match the job description), and a conclusion (reiterate interest and include a call to action).
        3. Address the letter to "Hiring Manager" unless a name is available in the job description.
        4. Integrate keywords from the job description naturally.
        5. Keep it concise, ideally around 3-4 paragraphs.
        6. End with "Sincerely," followed by the user's name.
        7. Return only the plain text of the cover letter, with appropriate line breaks. Do not return markdown or any other formatting.
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    res.status(200).json({ letter: response.text });
  } catch (error) {
    console.error("Error in /api/generate-cover-letter:", error);
    res.status(500).json({ error: "Failed to generate cover letter." });
  }
}
