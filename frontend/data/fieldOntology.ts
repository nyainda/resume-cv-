/**
 * S6 — Profession Ontology
 *
 * A formal parent-child taxonomy for all CVField slugs used in ProCV.
 * Each node carries a human-readable label, its parent slug, whether it
 * is a leaf (maps to a real CVField profile), an optional emoji icon for
 * the UI cascading dropdown, and an optional `keywords` array used by
 * the fuzzy resolver to match free-text job titles.
 *
 * Hierarchy example:
 *   engineering_group
 *     └─ civil_group
 *          ├─ civil_engineering  (leaf)
 *          ├─ irrigation         (leaf)
 *          ├─ drought_management (leaf)
 *          ├─ construction       (leaf)
 *          └─ architecture       (leaf)
 *     └─ manufacturing           (leaf)
 *     └─ logistics               (leaf)
 *
 *   technology_group
 *     ├─ tech               (leaf — generic Software Engineering, backward-compat)
 *     ├─ data_analytics     (leaf — Data Science & Analytics)
 *     └─ tech_sub_group     (intermediate — specific engineering disciplines)
 *          ├─ frontend_web  (leaf)
 *          ├─ backend_eng   (leaf)
 *          ├─ fullstack_eng (leaf)
 *          ├─ mobile_eng    (leaf)
 *          ├─ ml_ai_eng     (leaf)
 *          ├─ devops_infra  (leaf)
 *          ├─ security_eng  (leaf)
 *          └─ qa_eng        (leaf)
 */

export interface FieldNode {
  slug: string;
  label: string;
  parent?: string;
  isLeaf: boolean;
  icon: string;
  /**
   * Free-text aliases / common job titles that should resolve to this leaf.
   * Used by the fuzzy resolver in fieldOntologyResolver.ts — these are checked
   * against normalised token sets so partial matches score proportionally.
   */
  keywords?: string[];
}

export const FIELD_ONTOLOGY: FieldNode[] = [
  // ── Root group nodes (not CVField values themselves) ──────────────────────
  { slug: 'engineering_group',           label: 'Engineering & Construction', parent: undefined, isLeaf: false, icon: '🏗️' },
  { slug: 'technology_group',            label: 'Technology & Data',          parent: undefined, isLeaf: false, icon: '💻' },
  { slug: 'business_group',              label: 'Business & Commercial',      parent: undefined, isLeaf: false, icon: '📈' },
  { slug: 'professional_services_group', label: 'Professional Services',      parent: undefined, isLeaf: false, icon: '⚖️' },
  { slug: 'public_social_group',         label: 'Public & Social Sector',     parent: undefined, isLeaf: false, icon: '🌍' },
  { slug: 'other_group',                 label: 'Other Sectors',              parent: undefined, isLeaf: false, icon: '🗂️' },

  // ── Engineering & Construction ─────────────────────────────────────────────
  { slug: 'civil_group',        label: 'Civil Engineering',              parent: 'engineering_group', isLeaf: false, icon: '🏛️' },
  { slug: 'civil_engineering',  label: 'Civil Engineering (General)',    parent: 'civil_group',       isLeaf: true,  icon: '🏛️',
    keywords: ['civil engineer','structural engineer','site engineer','geotechnical','quantity surveyor','road engineer','highway engineer','bridge engineer','drainage engineer','infrastructure engineer','graduate engineer'] },
  { slug: 'irrigation',         label: 'Water / Irrigation Engineering', parent: 'civil_group',       isLeaf: true,  icon: '💧',
    keywords: ['irrigation engineer','water resource','biosystems engineer','agricultural engineer','hydrology','drip system','sprinkler engineer'] },
  { slug: 'drought_management', label: 'Drought / Food Security',        parent: 'civil_group',       isLeaf: true,  icon: '🌾',
    keywords: ['drought','food security','early warning','famine','climate resilience','ndma'] },
  { slug: 'construction',       label: 'Construction Management',        parent: 'civil_group',       isLeaf: true,  icon: '🏚️',
    keywords: ['construction manager','site manager','contracts manager','building contractor','mep engineer','construction supervisor','site supervisor'] },
  { slug: 'architecture',       label: 'Architecture & Urban Design',    parent: 'civil_group',       isLeaf: true,  icon: '📐',
    keywords: ['architect','architectural designer','urban planner','landscape architect','interior designer','bim coordinator','revit specialist'] },
  { slug: 'manufacturing',      label: 'Manufacturing & Production',     parent: 'engineering_group', isLeaf: true,  icon: '🏭',
    keywords: ['manufacturing engineer','production engineer','process engineer','plant manager','quality engineer','lean engineer','factory manager','industrial engineer'] },
  { slug: 'logistics',          label: 'Logistics & Supply Chain',      parent: 'engineering_group', isLeaf: true,  icon: '🚛',
    keywords: ['logistics manager','supply chain','procurement officer','warehouse manager','inventory manager','fleet manager','freight','distribution'] },

  // ── Technology & Data ──────────────────────────────────────────────────────
  // `tech` and `data_analytics` are kept as direct children for backward compat.
  // Specific subcategories live under `tech_sub_group` below.
  { slug: 'tech',               label: 'Software Engineering (General)', parent: 'technology_group',  isLeaf: true,  icon: '⚙️',
    keywords: ['software engineer','software developer','tech lead','principal engineer','staff engineer','solution architect','systems engineer','it engineer','cto'] },
  { slug: 'data_analytics',     label: 'Data Science & Analytics',      parent: 'technology_group',  isLeaf: true,  icon: '📊',
    keywords: ['data analyst','data scientist','business analyst','bi developer','tableau developer','power bi','data engineer','analytics engineer','reporting analyst','quantitative analyst'] },

  // ── Technology Subcategory Group ──────────────────────────────────────────
  { slug: 'tech_sub_group',     label: 'Engineering Specialisations',   parent: 'technology_group',  isLeaf: false, icon: '🔧' },

  { slug: 'frontend_web',       label: 'Frontend / Web Engineering',    parent: 'tech_sub_group',    isLeaf: true,  icon: '🖥️',
    keywords: ['frontend developer','frontend engineer','front-end developer','front-end engineer','ui developer','web developer','ui engineer','react developer','vue developer','angular developer','javascript developer','html css developer','web designer developer','ux engineer'] },

  { slug: 'backend_eng',        label: 'Backend Engineering',           parent: 'tech_sub_group',    isLeaf: true,  icon: '🖧',
    keywords: ['backend developer','backend engineer','back-end developer','back-end engineer','api developer','java developer','python developer','node developer','node.js developer','golang developer','ruby developer','php developer','django developer','spring developer','server-side developer'] },

  { slug: 'fullstack_eng',      label: 'Full-Stack Engineering',        parent: 'tech_sub_group',    isLeaf: true,  icon: '🔀',
    keywords: ['full-stack developer','full-stack engineer','fullstack developer','fullstack engineer','full stack developer','full stack engineer','mern developer','mean developer','t-shaped engineer'] },

  { slug: 'mobile_eng',         label: 'Mobile Engineering',            parent: 'tech_sub_group',    isLeaf: true,  icon: '📱',
    keywords: ['mobile developer','mobile engineer','ios developer','android developer','react native developer','flutter developer','swift developer','kotlin developer','xamarin developer','cross-platform mobile'] },

  { slug: 'ml_ai_eng',          label: 'AI / Machine Learning Engineering', parent: 'tech_sub_group', isLeaf: true, icon: '🤖',
    keywords: ['machine learning engineer','ml engineer','ai engineer','artificial intelligence engineer','deep learning engineer','computer vision engineer','nlp engineer','llm engineer','generative ai','genai engineer','research engineer','applied scientist','ai researcher','prompt engineer'] },

  { slug: 'devops_infra',       label: 'DevOps / Cloud / Infrastructure', parent: 'tech_sub_group', isLeaf: true,  icon: '☁️',
    keywords: ['devops engineer','cloud engineer','infrastructure engineer','sre','site reliability engineer','platform engineer','aws engineer','azure engineer','gcp engineer','kubernetes engineer','ci/cd engineer','cloud architect','systems administrator','sysadmin','network engineer'] },

  { slug: 'security_eng',       label: 'Security / Cybersecurity',      parent: 'tech_sub_group',    isLeaf: true,  icon: '🔐',
    keywords: ['security engineer','cybersecurity engineer','information security engineer','penetration tester','pen tester','appsec engineer','cloud security engineer','soc analyst','security analyst','devsecops','vulnerability analyst','ethical hacker'] },

  { slug: 'qa_eng',             label: 'QA / Test Engineering',         parent: 'tech_sub_group',    isLeaf: true,  icon: '🧪',
    keywords: ['qa engineer','test engineer','quality assurance engineer','sdet','automation engineer','testing engineer','software tester','qa analyst','manual tester','test automation','selenium engineer','cypress developer'] },

  // ── Business & Commercial ──────────────────────────────────────────────────
  { slug: 'product_mgmt',       label: 'Product Management',            parent: 'business_group',    isLeaf: true,  icon: '🗺️',
    keywords: ['product manager','product owner','head of product','vp of product','director of product','chief product officer','cpo','associate product manager','technical product manager','digital product manager','product lead','product strategist'] },
  { slug: 'sales',              label: 'Sales & Business Development',  parent: 'business_group',    isLeaf: true,  icon: '🤝',
    keywords: ['sales manager','account executive','business development','sales rep','key account manager','sales director','sdr','bdr'] },
  { slug: 'marketing',          label: 'Marketing & Brand',             parent: 'business_group',    isLeaf: true,  icon: '📣',
    keywords: ['marketing manager','brand manager','digital marketing','content manager','seo specialist','growth marketer','social media manager','campaign manager'] },
  { slug: 'finance',            label: 'Finance & Accounting',          parent: 'business_group',    isLeaf: true,  icon: '💰',
    keywords: ['accountant','financial analyst','finance manager','auditor','treasury analyst','investment analyst','cfo','portfolio manager','cpa','cfa'] },
  { slug: 'consulting',         label: 'Consulting & Strategy',         parent: 'business_group',    isLeaf: true,  icon: '🎯',
    keywords: ['management consultant','strategy analyst','business consultant','engagement manager','transformation lead','advisory','change management'] },
  { slug: 'operations',         label: 'Operations & Process',          parent: 'business_group',    isLeaf: true,  icon: '⚡',
    keywords: ['operations manager','operations analyst','business operations','coo','operational excellence','process improvement'] },

  // ── Professional Services ──────────────────────────────────────────────────
  { slug: 'legal',              label: 'Legal & Compliance',            parent: 'professional_services_group', isLeaf: true, icon: '⚖️',
    keywords: ['lawyer','attorney','advocate','barrister','solicitor','legal officer','legal counsel','paralegal','compliance officer'] },
  { slug: 'hr',                 label: 'HR & People Operations',        parent: 'professional_services_group', isLeaf: true, icon: '👥',
    keywords: ['hr manager','human resources','talent acquisition','recruiter','hrbp','learning and development','people operations','payroll manager'] },

  // ── Public & Social Sector ─────────────────────────────────────────────────
  { slug: 'ngo',                label: 'NGO / International Development',         parent: 'public_social_group', isLeaf: true, icon: '🤲',
    keywords: ['ngo','humanitarian','community development','programme officer','project officer','field officer','wash','development worker','non-profit','charity'] },
  { slug: 'government',         label: 'Government & Public Administration',      parent: 'public_social_group', isLeaf: true, icon: '🏛️',
    keywords: ['government officer','public sector','ministry','parastatal','civil servant','policy analyst','public administration','county officer'] },
  { slug: 'healthcare',         label: 'Healthcare & Clinical',                   parent: 'public_social_group', isLeaf: true, icon: '🏥',
    keywords: ['doctor','physician','nurse','pharmacist','clinical officer','public health','epidemiologist','lab technician','dentist','surgeon','medical officer'] },
  { slug: 'education',          label: 'Education & Training',                    parent: 'public_social_group', isLeaf: true, icon: '🎓',
    keywords: ['teacher','lecturer','tutor','professor','curriculum developer','education officer','trainer','facilitator','school principal','teaching assistant'] },

  // ── Other Sectors ──────────────────────────────────────────────────────────
  { slug: 'hospitality',        label: 'Hospitality & Tourism',         parent: 'other_group', isLeaf: true, icon: '🏨',
    keywords: ['hotel manager','front office manager','housekeeping','food and beverage','events coordinator','restaurant manager','concierge','hospitality manager'] },
  { slug: 'media',              label: 'Media & Communications',        parent: 'other_group', isLeaf: true, icon: '📰',
    keywords: ['journalist','broadcaster','editor','photographer','videographer','content creator','media officer','communications officer','copywriter'] },
  { slug: 'general',            label: 'General / Other',               parent: 'other_group', isLeaf: true, icon: '🗂️' },
];

/** All leaf nodes sorted alphabetically within their group. */
export const LEAF_NODES: FieldNode[] = FIELD_ONTOLOGY.filter(n => n.isLeaf);

/** All root (top-level category) nodes. */
export const ROOT_NODES: FieldNode[] = FIELD_ONTOLOGY.filter(n => !n.parent);
