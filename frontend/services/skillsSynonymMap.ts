/**
 * skillsSynonymMap.ts — Canonical synonym clusters and abbreviation expansions
 * for the Smart Skills Reconciler (Feature 3).
 *
 * SKILL_SYNONYMS: maps any surface form → canonical form.
 * ABBREV_EXPANSIONS: common abbreviations → full form (applied before synonym lookup).
 */

/** Expand common skill abbreviations to their full forms before synonym matching. */
export const ABBREV_EXPANSIONS: Record<string, string> = {
  'js':           'JavaScript',
  'ts':           'TypeScript',
  'py':           'Python',
  'k8s':          'Kubernetes',
  'k8':           'Kubernetes',
  'gcp':          'Google Cloud Platform',
  'aws':          'Amazon Web Services',
  'az':           'Azure',
  'ml':           'Machine Learning',
  'dl':           'Deep Learning',
  'nlp':          'Natural Language Processing',
  'cv':           'Computer Vision',
  'ci':           'Continuous Integration',
  'cd':           'Continuous Deployment',
  'ci/cd':        'CI/CD',
  'oop':          'Object-Oriented Programming',
  'fp':           'Functional Programming',
  'tdd':          'Test-Driven Development',
  'bdd':          'Behaviour-Driven Development',
  'ddd':          'Domain-Driven Design',
  'ux':           'User Experience',
  'ui':           'User Interface',
  'api':          'API',
  'rest':         'REST API',
  'graphql':      'GraphQL',
  'sql':          'SQL',
  'nosql':        'NoSQL',
  'db':           'Database',
  'iac':          'Infrastructure as Code',
  'infra':        'Infrastructure',
  'devops':       'DevOps',
  'devsecops':    'DevSecOps',
  'sre':          'Site Reliability Engineering',
  'llm':          'Large Language Models',
  'genai':        'Generative AI',
  // 'pm' intentionally omitted — ambiguous between Product Management and Project Management
  'ba':           'Business Analysis',
  'qa':           'Quality Assurance',
  'hr':           'Human Resources',
  'crm':          'CRM',
  'erp':          'ERP',
};

/**
 * Synonym clusters. Each entry: canonical form → list of aliases (any case).
 * During reconciliation, any alias encountered is replaced with the canonical form.
 */
export const SKILL_SYNONYM_CLUSTERS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'JavaScript',           aliases: ['javascript', 'js', 'Java Script', 'ECMAScript', 'ES6', 'ES2015'] },
  { canonical: 'TypeScript',           aliases: ['typescript', 'ts'] },
  { canonical: 'Python',               aliases: ['python', 'Python 3', 'Python3', 'Python programming', 'Python scripting'] },
  { canonical: 'React',                aliases: ['react', 'ReactJS', 'React.js', 'React JS'] },
  { canonical: 'Node.js',              aliases: ['nodejs', 'node', 'Node', 'NodeJS', 'node.js'] },
  { canonical: 'PostgreSQL',           aliases: ['postgres', 'postgresql', 'Postgres', 'Psql'] },
  { canonical: 'MySQL',                aliases: ['mysql'] },
  { canonical: 'MongoDB',              aliases: ['mongo', 'mongodb'] },
  { canonical: 'Kubernetes',           aliases: ['k8s', 'k8', 'kubernetes'] },
  { canonical: 'Docker',               aliases: ['docker'] },
  { canonical: 'AWS',                  aliases: ['Amazon Web Services', 'aws', 'Amazon AWS'] },
  { canonical: 'Azure',                aliases: ['Microsoft Azure', 'azure'] },
  { canonical: 'Google Cloud',         aliases: ['GCP', 'Google Cloud Platform', 'gcp'] },
  { canonical: 'CI/CD',                aliases: ['CI/CD pipelines', 'Continuous Integration', 'Continuous Deployment', 'Continuous Integration/Deployment', 'ci/cd'] },
  { canonical: 'Machine Learning',     aliases: ['ml', 'machine learning', 'ML/AI'] },
  { canonical: 'Deep Learning',        aliases: ['dl', 'deep learning', 'DL'] },
  { canonical: 'SQL',                  aliases: ['sql', 'Structured Query Language'] },
  { canonical: 'REST API',             aliases: ['REST', 'RESTful', 'RESTful API', 'REST APIs', 'RESTful APIs', 'REST services'] },
  { canonical: 'GraphQL',              aliases: ['graphql'] },
  { canonical: 'Agile',                aliases: ['agile', 'Agile methodology', 'Agile methodologies', 'Agile/Scrum'] },
  { canonical: 'Scrum',                aliases: ['scrum'] },
  { canonical: 'Git',                  aliases: ['git', 'Git/GitHub', 'version control', 'Version Control'] },
  { canonical: 'Terraform',            aliases: ['terraform', 'Terraform IaC'] },
  { canonical: 'Infrastructure as Code', aliases: ['IaC', 'iac'] },
  { canonical: 'Stakeholder Management', aliases: ['Stakeholder Engagement', 'stakeholder management', 'Stakeholder Relations', 'stakeholder communication'] },
  { canonical: 'Project Management',   aliases: ['project management', 'program management'] },
  { canonical: 'Data Analysis',        aliases: ['data analysis', 'data analytics', 'Data Analytics'] },
  { canonical: 'User Experience',      aliases: ['UX', 'ux', 'UX Design', 'User Experience Design'] },
  { canonical: 'Product Management',   aliases: ['product management', 'Product Strategy'] },
  { canonical: 'Communication',        aliases: ['communication skills', 'Written Communication', 'Verbal Communication'] },
  { canonical: 'Leadership',           aliases: ['leadership skills', 'Team Leadership', 'People Leadership'] },
  { canonical: 'Problem Solving',      aliases: ['problem solving', 'Problem-Solving', 'analytical thinking', 'Critical Thinking'] },
];

/** Build a flat lookup map: lowercase alias → canonical form. */
export function buildSynonymMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const cluster of SKILL_SYNONYM_CLUSTERS) {
    map.set(cluster.canonical.toLowerCase(), cluster.canonical);
    for (const alias of cluster.aliases) {
      map.set(alias.toLowerCase(), cluster.canonical);
    }
  }
  return map;
}
