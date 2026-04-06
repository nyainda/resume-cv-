import { groqChat, GROQ_LARGE } from './groqService';

export interface NegotiationInput {
  roleTitle: string;
  company: string;
  offeredSalary: string;
  targetSalary: string;
  currentSalary?: string;
  location?: string;
  yearsExperience?: string;
  equityOffered?: string;
  competingOffers?: string;
  offerDeadline?: string;
  notes?: string;
}

export interface NegotiationOutput {
  counterOfferEmail: string;
  talkTrack: string;
  geographicPushback: string;
  competingOfferLeverage: string;
  equityGuide: string;
  benefitsChecklist: string;
}

const SYSTEM = `You are an elite compensation negotiation strategist with 20 years of experience coaching candidates at Google, Meta, Stripe, and top-tier startups. You have helped candidates increase offers by 15–40%.

Your negotiation scripts are:
- Confident but never aggressive
- Specific with numbers, never vague
- Psychologically grounded (reciprocity, anchoring, BATNA)
- Structured so the candidate can follow them word-for-word
- Written in first person, ready to copy-paste or speak aloud

Never use filler phrases like "I just wanted to", "I'm not sure if", or "sorry to bother you".
Always anchor high (10–20% above target) in counter-offers.
Always frame requests as collaborative ("I want to make this work") not adversarial.`;

function buildPrompt(input: NegotiationInput): string {
  return `Generate a complete salary negotiation package for this situation:

Role: ${input.roleTitle}
Company: ${input.company}
Offer received: ${input.offeredSalary}
My target: ${input.targetSalary}
${input.currentSalary ? `Current salary: ${input.currentSalary}` : ''}
${input.location ? `Location: ${input.location}` : ''}
${input.yearsExperience ? `Years of experience: ${input.yearsExperience}` : ''}
${input.equityOffered ? `Equity offered: ${input.equityOffered}` : ''}
${input.competingOffers ? `Competing offers: ${input.competingOffers}` : ''}
${input.offerDeadline ? `Offer deadline: ${input.offerDeadline}` : ''}
${input.notes ? `Additional context: ${input.notes}` : ''}

Return a JSON object with exactly these keys (all values are markdown strings):
{
  "counterOfferEmail": "A professional email to the recruiter/HR. Subject line included. Anchor 15% above target. 150-200 words.",
  "talkTrack": "A phone/video call script with exact words to say. Include: opening, ask, handling silence, handling pushback, closing. 250-350 words.",
  "geographicPushback": "Script for if they try to reduce salary based on location or cost of living. Include 3 specific rebuttals with exact words. 150-200 words.",
  "competingOfferLeverage": "${input.competingOffers ? 'Script for leveraging the competing offer without burning bridges. Include exact phrasing. 150-200 words.' : 'General script for mentioning you are in active conversations with other companies, without specifics. 100-150 words.'}",
  "equityGuide": "How to evaluate and negotiate the equity package. Include: how to calculate current value, how to ask for more, vesting cliff questions to ask. 200-250 words.",
  "benefitsChecklist": "A prioritized checklist of 8-10 benefits to negotiate beyond base salary, each with a one-line ask script. Format as a markdown checklist."
}

Return ONLY valid JSON. No markdown code fences.`;
}

export async function generateNegotiationPackage(
  input: NegotiationInput
): Promise<NegotiationOutput> {
  const raw = await groqChat(GROQ_LARGE, SYSTEM, buildPrompt(input), {
    json: true,
    temperature: 0.7,
    maxTokens: 3000,
  });

  const parsed = JSON.parse(raw) as NegotiationOutput;
  return parsed;
}

export async function generateQuickCounter(
  input: Pick<NegotiationInput, 'roleTitle' | 'company' | 'offeredSalary' | 'targetSalary'>
): Promise<string> {
  const prompt = `Write a single, confident counter-offer email for:
Role: ${input.roleTitle} at ${input.company}
Offer: ${input.offeredSalary} → Target: ${input.targetSalary}

Include subject line. 120-150 words. Professional, warm, anchored high. Return plain text only.`;

  return groqChat(GROQ_LARGE, SYSTEM, prompt, { temperature: 0.6 });
}
