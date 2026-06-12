/**
 * S6 — Profession Ontology
 *
 * A formal parent-child taxonomy for all CVField slugs used in ProCV.
 * Each node carries a human-readable label, its parent slug, whether it
 * is a leaf (maps to a real CVField profile), and an optional emoji icon
 * for the UI cascading dropdown.
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
 */

export interface FieldNode {
  slug: string;
  label: string;
  parent?: string;
  isLeaf: boolean;
  icon: string;
}

export const FIELD_ONTOLOGY: FieldNode[] = [
  // ── Root group nodes (not CVField values themselves) ──────────────────────
  { slug: 'engineering_group',          label: 'Engineering & Construction', parent: undefined, isLeaf: false, icon: '🏗️' },
  { slug: 'technology_group',           label: 'Technology & Data',           parent: undefined, isLeaf: false, icon: '💻' },
  { slug: 'business_group',             label: 'Business & Commercial',       parent: undefined, isLeaf: false, icon: '📈' },
  { slug: 'professional_services_group',label: 'Professional Services',       parent: undefined, isLeaf: false, icon: '⚖️' },
  { slug: 'public_social_group',        label: 'Public & Social Sector',      parent: undefined, isLeaf: false, icon: '🌍' },
  { slug: 'other_group',                label: 'Other Sectors',               parent: undefined, isLeaf: false, icon: '🗂️' },

  // ── Engineering & Construction ─────────────────────────────────────────────
  { slug: 'civil_group',        label: 'Civil Engineering',           parent: 'engineering_group', isLeaf: false, icon: '🏛️' },
  { slug: 'civil_engineering',  label: 'Civil Engineering (General)', parent: 'civil_group',       isLeaf: true,  icon: '🏛️' },
  { slug: 'irrigation',         label: 'Water / Irrigation Engineering', parent: 'civil_group',   isLeaf: true,  icon: '💧' },
  { slug: 'drought_management', label: 'Drought / Food Security',     parent: 'civil_group',       isLeaf: true,  icon: '🌾' },
  { slug: 'construction',       label: 'Construction Management',     parent: 'civil_group',       isLeaf: true,  icon: '🏚️' },
  { slug: 'architecture',       label: 'Architecture & Urban Design', parent: 'civil_group',       isLeaf: true,  icon: '📐' },
  { slug: 'manufacturing',      label: 'Manufacturing & Production',  parent: 'engineering_group', isLeaf: true,  icon: '🏭' },
  { slug: 'logistics',          label: 'Logistics & Supply Chain',   parent: 'engineering_group', isLeaf: true,  icon: '🚛' },

  // ── Technology & Data ──────────────────────────────────────────────────────
  { slug: 'tech',               label: 'Software Engineering / Tech', parent: 'technology_group',  isLeaf: true,  icon: '⚙️' },
  { slug: 'data_analytics',     label: 'Data Science & Analytics',   parent: 'technology_group',  isLeaf: true,  icon: '📊' },

  // ── Business & Commercial ──────────────────────────────────────────────────
  { slug: 'sales',              label: 'Sales & Business Development', parent: 'business_group',   isLeaf: true,  icon: '🤝' },
  { slug: 'marketing',          label: 'Marketing & Brand',           parent: 'business_group',    isLeaf: true,  icon: '📣' },
  { slug: 'finance',            label: 'Finance & Accounting',        parent: 'business_group',    isLeaf: true,  icon: '💰' },
  { slug: 'consulting',         label: 'Consulting & Strategy',       parent: 'business_group',    isLeaf: true,  icon: '🎯' },
  { slug: 'operations',         label: 'Operations & Process',        parent: 'business_group',    isLeaf: true,  icon: '⚡' },

  // ── Professional Services ──────────────────────────────────────────────────
  { slug: 'legal',              label: 'Legal & Compliance',          parent: 'professional_services_group', isLeaf: true, icon: '⚖️' },
  { slug: 'hr',                 label: 'HR & People Operations',      parent: 'professional_services_group', isLeaf: true, icon: '👥' },

  // ── Public & Social Sector ─────────────────────────────────────────────────
  { slug: 'ngo',                label: 'NGO / International Development',         parent: 'public_social_group', isLeaf: true, icon: '🤲' },
  { slug: 'government',         label: 'Government & Public Administration',      parent: 'public_social_group', isLeaf: true, icon: '🏛️' },
  { slug: 'healthcare',         label: 'Healthcare & Clinical',                   parent: 'public_social_group', isLeaf: true, icon: '🏥' },
  { slug: 'education',          label: 'Education & Training',                    parent: 'public_social_group', isLeaf: true, icon: '🎓' },

  // ── Other Sectors ──────────────────────────────────────────────────────────
  { slug: 'hospitality',        label: 'Hospitality & Tourism',       parent: 'other_group', isLeaf: true, icon: '🏨' },
  { slug: 'media',              label: 'Media & Communications',      parent: 'other_group', isLeaf: true, icon: '📰' },
  { slug: 'general',            label: 'General / Other',             parent: 'other_group', isLeaf: true, icon: '🗂️' },
];

/** All leaf nodes sorted alphabetically within their group. */
export const LEAF_NODES: FieldNode[] = FIELD_ONTOLOGY.filter(n => n.isLeaf);

/** All root (top-level category) nodes. */
export const ROOT_NODES: FieldNode[] = FIELD_ONTOLOGY.filter(n => !n.parent);
