/**
 * S6 — Field Ontology Resolver
 *
 * Provides four capabilities:
 *   1. resolveFieldAncestors()  — walk up the tree to get the full inheritance chain
 *   2. getLeafChildren()        — get all CVField leaves under any parent node
 *   3. getRootNodes / getChildNodes — build cascading UI dropdowns
 *   4. getFieldLabel()          — human-readable label for any slug
 */

import { FIELD_ONTOLOGY, FieldNode, ROOT_NODES } from '../data/fieldOntology';
import type { CVField } from './cvPromptHelpers';

// ── Fast lookup maps built once at module load time ───────────────────────────
const BY_SLUG = new Map<string, FieldNode>(FIELD_ONTOLOGY.map(n => [n.slug, n]));

const CHILDREN_OF = new Map<string, string[]>();
for (const node of FIELD_ONTOLOGY) {
    if (node.parent) {
        if (!CHILDREN_OF.has(node.parent)) CHILDREN_OF.set(node.parent, []);
        CHILDREN_OF.get(node.parent)!.push(node.slug);
    }
}

// ── 1. Ancestor chain ─────────────────────────────────────────────────────────

/**
 * Return the full ancestor chain for any ontology slug:
 *   resolveFieldAncestors('irrigation')
 *   → ['irrigation', 'civil_group', 'engineering_group']
 *
 * Useful for inheriting parent-level rules: a rule that applies to
 * 'civil_group' automatically applies to every leaf below it.
 */
export function resolveFieldAncestors(slug: string): string[] {
    const chain: string[] = [];
    let current: string | undefined = slug;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
        visited.add(current);
        chain.push(current);
        current = BY_SLUG.get(current)?.parent;
    }
    return chain;
}

/**
 * Return true if `slug` is a descendant (direct or indirect) of `ancestorSlug`.
 *
 * isDescendantOf('irrigation', 'engineering_group') → true
 * isDescendantOf('tech', 'engineering_group')       → false
 */
export function isDescendantOf(slug: string, ancestorSlug: string): boolean {
    return resolveFieldAncestors(slug).includes(ancestorSlug);
}

// ── 2. Leaf children ──────────────────────────────────────────────────────────

/**
 * Return all CVField leaf slugs that are children (or recursive descendants)
 * of the given parent slug.
 *
 * getLeafChildren('civil_group')
 * → ['civil_engineering', 'irrigation', 'drought_management', 'construction', 'architecture']
 */
export function getLeafChildren(parentSlug: string): string[] {
    return (CHILDREN_OF.get(parentSlug) || []).flatMap(childSlug => {
        const node = BY_SLUG.get(childSlug);
        if (!node) return [];
        return node.isLeaf ? [childSlug] : getLeafChildren(childSlug);
    });
}

// ── 3. Dropdown helpers ────────────────────────────────────────────────────────

/** Top-level category nodes — use to build the first tier of the dropdown. */
export { ROOT_NODES };

/**
 * Direct children of a given parent slug.
 * Returns both intermediate group nodes and leaf nodes.
 */
export function getChildNodes(parentSlug: string): FieldNode[] {
    return FIELD_ONTOLOGY.filter(n => n.parent === parentSlug);
}

/**
 * Returns a flat list of groups + their leaf children, structured for a
 * <select> or grouped <ul> — each group followed by its leaves with an
 * indent level so the UI can render optgroups.
 *
 * Returns:
 *   [
 *     { node: engineering_group, depth: 0 },
 *     { node: civil_group,       depth: 1 },
 *     { node: civil_engineering, depth: 2 },
 *     { node: irrigation,        depth: 2 },
 *     ...
 *   ]
 */
export interface FlatOntologyEntry {
    node: FieldNode;
    depth: number;
}

export function buildFlatOntology(): FlatOntologyEntry[] {
    const result: FlatOntologyEntry[] = [];

    function walk(slug: string, depth: number) {
        const node = BY_SLUG.get(slug);
        if (!node) return;
        result.push({ node, depth });
        for (const childSlug of CHILDREN_OF.get(slug) || []) {
            walk(childSlug, depth + 1);
        }
    }

    for (const root of ROOT_NODES) {
        walk(root.slug, 0);
    }

    return result;
}

// ── 4. Label lookup ────────────────────────────────────────────────────────────

/** Human-readable label for any ontology slug. Falls back to formatted slug. */
export function getFieldLabel(slug: string): string {
    return BY_SLUG.get(slug)?.label ?? slug.replace(/_/g, ' ');
}

/** Icon emoji for any ontology slug. Falls back to empty string. */
export function getFieldIcon(slug: string): string {
    return BY_SLUG.get(slug)?.icon ?? '';
}

/**
 * Reverse lookup — find the CVField leaf slug that best matches a human label.
 * Used when deserialising a stored `preferredField` string into a CVField.
 */
export function findLeafByLabel(label: string): CVField | null {
    const norm = label.toLowerCase().trim();
    const hit = FIELD_ONTOLOGY.find(n => n.isLeaf && n.label.toLowerCase() === norm);
    return (hit?.slug as CVField) ?? null;
}

/**
 * Validate that a slug is a known ontology node (leaf or group).
 * Useful for input validation on stored preferredField values.
 */
export function isKnownSlug(slug: string): boolean {
    return BY_SLUG.has(slug);
}

// ── 5. Fuzzy title resolver ────────────────────────────────────────────────

/**
 * Tokenise a string into lowercase alphabetical words of ≥ 3 characters.
 * "React Native Developer" → ["react", "native", "developer"]
 */
function tokenise(text: string): Set<string> {
    return new Set(
        text.toLowerCase().split(/\W+/).filter(t => t.length >= 3)
    );
}

/**
 * Jaccard-like overlap between two token sets.
 * Returns a value in [0, 1]. 1.0 = identical sets.
 */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const t of a) { if (b.has(t)) intersection++; }
    const union = a.size + b.size - intersection;
    return intersection / union;
}

/**
 * Fuzzy-resolve a free-text job title to the best-matching leaf slug.
 *
 * How it works:
 *   1. Tokenise the title.
 *   2. For each leaf node that has `keywords`, score each keyword phrase
 *      against the title tokens using Jaccard overlap.
 *   3. Return the leaf slug with the highest score above MIN_THRESHOLD.
 *
 * Returns `null` if no leaf scores above the threshold — the caller should
 * fall back to the existing TITLE_FIELD_MAP / keyword scorer.
 *
 * @example
 *   fuzzyResolveByTitle("React Native Developer")   // → "mobile_eng"
 *   fuzzyResolveByTitle("Python Backend Engineer")  // → "backend_eng"
 *   fuzzyResolveByTitle("ML/AI Research Engineer")  // → "ml_ai_eng"
 *   fuzzyResolveByTitle("Agronomy Consultant")       // → null  (falls back)
 */
const MIN_THRESHOLD = 0.35;

export function fuzzyResolveByTitle(title: string): string | null {
    const titleTokens = tokenise(title);
    if (titleTokens.size === 0) return null;

    let best: { slug: string; score: number } | null = null;

    for (const node of FIELD_ONTOLOGY) {
        if (!node.isLeaf || !node.keywords || node.keywords.length === 0) continue;

        let maxScore = 0;
        for (const kw of node.keywords) {
            const kwTokens = tokenise(kw);
            const score = tokenOverlap(titleTokens, kwTokens);
            if (score > maxScore) maxScore = score;
        }

        if (maxScore >= MIN_THRESHOLD && (!best || maxScore > best.score)) {
            best = { slug: node.slug, score: maxScore };
        }
    }

    return best?.slug ?? null;
}

/**
 * Convenience wrapper: given a job title string, return the resolved
 * CVField label (e.g. "Frontend / Web Engineering") or null.
 */
export function fuzzyResolveLabel(title: string): string | null {
    const slug = fuzzyResolveByTitle(title);
    return slug ? getFieldLabel(slug) : null;
}
