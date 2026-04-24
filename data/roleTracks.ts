export interface RoleTrack {
  name: string;
  keywords: string[];
}

// Detection tracks used to constrain stale-profile refresh inference.
// Expand this list over time as you onboard new industries/functions.
export const ROLE_TRACKS: RoleTrack[] = [
  { name: 'Sales / Commercial', keywords: ['sales', 'account', 'pipeline', 'deal', 'prospect', 'quota', 'client', 'territory'] },
  { name: 'Field Engineering / Operations', keywords: ['field', 'site', 'commissioning', 'maintenance', 'inspection', 'installation', 'troubleshooting', 'deployment'] },
  { name: 'Project / Program Delivery', keywords: ['project', 'program', 'delivery', 'milestone', 'timeline', 'stakeholder', 'budget', 'scope'] },
  { name: 'Technical Support / Reliability', keywords: ['support', 'incident', 'uptime', 'downtime', 'sla', 'root cause', 'ticket', 'on-call'] },
  { name: 'Software Engineering', keywords: ['api', 'backend', 'frontend', 'microservices', 'refactor', 'testing', 'release', 'codebase'] },
  { name: 'Data / Analytics', keywords: ['sql', 'dashboard', 'etl', 'analytics', 'bi', 'forecast', 'model', 'insight'] },
  { name: 'Product Management', keywords: ['roadmap', 'prd', 'backlog', 'feature', 'user research', 'sprint', 'prioritization'] },
  { name: 'Finance / Accounting', keywords: ['reconciliation', 'ledger', 'forecast', 'budget', 'variance', 'audit', 'close', 'fp&a'] },
  { name: 'Healthcare / Clinical', keywords: ['patient', 'clinical', 'protocol', 'triage', 'care', 'emr', 'ehr', 'nurse'] },
  { name: 'Education / Training', keywords: ['curriculum', 'lesson', 'student', 'classroom', 'assessment', 'teaching', 'learning'] },
  { name: 'Supply Chain / Logistics', keywords: ['warehouse', 'inventory', 'procurement', 'logistics', 'vendor', 'shipment', 'otif'] },
  { name: 'HR / People Operations', keywords: ['recruiting', 'onboarding', 'talent', 'performance', 'engagement', 'hris', 'l&d'] },
];
