/**
 * Strips leading bullet-marker characters from responsibility / bullet text
 * before it is rendered via dangerouslySetInnerHTML.
 *
 * Templates render their own bullet marker (via CSS list-disc or a custom
 * <span>). If the stored text also begins with a bullet glyph that the AI or
 * an import left behind, you'd see a double marker (e.g. "• ► text").
 * This helper removes the leading glyph so only the template's own marker
 * is visible.
 *
 * The purification pipeline also strips these on save, but this function
 * acts as a defensive render-time safety net.
 */
export function cleanBulletHtml(html: string): string {
  // Strip leading bullet glyph + trailing space (e.g. "► ", "• ", "- ", "▶ ")
  return html.replace(/^[\s]*[•·*»►▶▸▹→‣⁃◆◇○●\-–—]\s+/, '');
}
