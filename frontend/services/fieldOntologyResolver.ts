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
