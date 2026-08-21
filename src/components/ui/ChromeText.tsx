/**
 * Inflated chrome lettering — the signature of the whole design.
 *
 * Two stacked copies of the same text: a blurred solid behind for the puffy
 * bloom, and a gradient-clipped face on top. It has to be two elements because
 * `background-clip: text` cannot also carry a glow — the clip discards
 * everything outside the glyphs, blur included.
 *
 * The duplicate is aria-hidden so screen readers hear the word once.
 */

export function ChromeText({
  children, className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={`chrome-wrap ${className}`}>
      <span className="chrome-glow" aria-hidden="true">{children}</span>
      <span className="chrome-face">{children}</span>
    </span>
  );
}
