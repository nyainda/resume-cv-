import { groqChat, GROQ_LARGE } from './groqService';

export type NegotiationMode = 'new-offer' | 'raise';

export interface NegotiationInput {
  mode?: NegotiationMode;
  roleTitle: string;
  company: string;
  offeredSalary: string;   // for raise mode, this is the current salary
  targetSalary: string;
  currentSalary?: string;
  location?: string;
  yearsExperience?: string;
  equityOffered?: string;
  competingOffers?: string;
  offerDeadline?: string;
  notes?: string;
  // Raise-specific
  performanceHighlights?: string;
  timeSinceLastRaise?: string;
  marketDataPoints?: string;
}

export interface NegotiationOutput {
  counterOfferEmail: string;
  talkTrack: string;
  geographicPushback: string;
  competingOfferLeverage: string;
  equityGuide: string;
  benefitsChecklist: string;
}

export interface RaiseOutput {
  raiseRequestEmail: string;
  talkTrack: string;
  marketDataArgument: string;
  handlingObjections: string;
  timingStrategy: string;
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
  return `Generate a complete salary negotiation package for this new-offer situation:

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
  "talkTrack": "A phone/video call script with exact words to say. Include: opening, the ask with your specific number, handling silence, handling pushback, closing with next steps. 250-350 words. Use ## for sections.",
  "geographicPushback": "Script for if they try to reduce salary based on location or cost of living. Include 3 specific rebuttals with exact words to use. 150-200 words. Use ## for each rebuttal.",
  "competingOfferLeverage": "${input.competingOffers ? 'Script for leveraging the specific competing offer without burning bridges. Include exact phrasing for email and phone. 150-200 words.' : 'General script for mentioning you are in active conversations with other companies, without specifics. 100-150 words.'}",
  "equityGuide": "How to evaluate and negotiate the equity package. Include: how to calculate current value, how to ask for more equity, vesting cliff questions to ask. Use ## for each section. 200-250 words.",
  "benefitsChecklist": "A prioritized checklist of 8-10 benefits to negotiate beyond base salary, each with a one-line ask script. Format EXACTLY as a markdown checklist using '- [ ]' for each item."
}

Return ONLY valid JSON. No markdown code fences.`;
}

function buildRaisePrompt(input: NegotiationInput): string {
  return `Generate a complete salary raise request package for this internal raise situation:

Role: ${input.roleTitle}
Company: ${input.company}
Current salary: ${input.offeredSalary}
Target salary: ${input.targetSalary}
${input.yearsExperience ? `Time in current role: ${input.yearsExperience}` : ''}
${input.timeSinceLastRaise ? `Time since last raise: ${input.timeSinceLastRaise}` : ''}
${input.performanceHighlights ? `Key achievements / performance highlights: ${input.performanceHighlights}` : ''}
${input.marketDataPoints ? `Market data / competing context: ${input.marketDataPoints}` : ''}
${input.notes ? `Additional context: ${input.notes}` : ''}

Return a JSON object with exactly these keys (all values are markdown strings):
{
  "raiseRequestEmail": "A professional email to the manager requesting a salary review. Subject line included. Lead with specific impact and value delivered, not personal need. 150-200 words.",
  "talkTrack": "A face-to-face or video meeting script. Include sections for: ## Opening the conversation, ## Making the ask with your specific number, ## Handling 'budget is frozen', ## Handling 'not right now', ## Closing with a specific commitment. 300-350 words.",
  "marketDataArgument": "How to present market data effectively. Include: ## Where to find salary data (Glassdoor, Levels.fyi, LinkedIn Salary), ## How to frame data as information not ultimatum, ## 3 Exact scripts for quoting market rates. 150-200 words.",
  "handlingObjections": "Scripts for the 4 most common objections with exact words to say: ## 'Budget is frozen this year', ## 'This isn't the right time', ## 'Your performance needs to improve first', ## 'Let's revisit in 6 months'. 200-250 words.",
  "timingStrategy": "When and how to have this conversation: ## Best timing in the year/quarter, ## How to prime your manager 2-4 weeks in advance, ## How to handle indefinite deferral, ## Red flags that mean it's time to look externally. 150-200 words.",
  "benefitsChecklist": "If they can't move on base salary, 8-10 non-cash alternatives to negotiate. Each with a one-line ask script. Include: bonus, equity refresh, extra PTO, remote flexibility, training budget, title change, early review date. Format EXACTLY as markdown checklist using '- [ ]' for each item."
}

Return ONLY valid JSON. No markdown code fences.`;
}

export async function generateNegotiationPackage(
  input: NegotiationInput
): Promise<NegotiationOutput> {
  const raw = await groqChat(GROQ_LARGE, SYSTEM, buildPrompt(input), {
    json: true,
    temperature: 0.7,
    maxTokens: 3500,
  });
  return JSON.parse(raw) as NegotiationOutput;
}

export async function generateRaisePackage(
  input: NegotiationInput
): Promise<RaiseOutput> {
  const raw = await groqChat(GROQ_LARGE, SYSTEM, buildRaisePrompt(input), {
    json: true,
    temperature: 0.7,
    maxTokens: 3500,
  });
  return JSON.parse(raw) as RaiseOutput;
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
