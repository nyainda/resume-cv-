/**
 * Smart bullet capping for CV templates.
 *
 * When a candidate has many roles (> 4), cap each role's bullets at 4 so
 * the whole CV still fits on one page.  With 4 or fewer roles there is
 * enough vertical space to show every bullet as-is.
 *
 * @param bullets     - Array of responsibility bullet strings for a role.
 * @param totalRoles  - Total number of experience entries in the CV.
 */
export function smartBullets(bullets: string[], totalRoles: number): string[] {
  if (totalRoles > 4) {
    return bullets.slice(0, 4);
  }
  return bullets;
}

/**
 * Smart projects cap for sidebar templates (one-page layout).
 *
 * In the main column, cap the full-detail project list at 4 so the page
 * doesn't overflow, and return a "+N more" label when items are hidden.
 */
export function smartProjects<T>(
  projects: T[],
  limit = 4
): { visible: T[]; overflow: number } {
  return {
    visible: projects.slice(0, limit),
    overflow: Math.max(0, projects.length - limit),
  };
}
