// src/renderer/lib/math.ts

/**
 * Pre-processes markdown before passing to TipTap: converts $...$ and $$...$$ delimiters
 * to custom HTML tags that TipTap's parseHTML rules can recognise.
 * Run this on the markdown string BEFORE calling editor.commands.setContent().
 */
export function injectMathTags(md: string): string {
  return md
    // Block math $$...$$ first (must come before inline to avoid partial matches)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) => {
      const safe = formula.trim().replace(/"/g, '&quot;')
      return `<div data-math-block="${safe}"></div>`
    })
    // Inline math $...$
    .replace(/\$([^$\n]+?)\$/g, (_match, formula: string) => {
      const safe = formula.replace(/"/g, '&quot;')
      return `<span data-math-inline="${safe}"></span>`
    })
}
