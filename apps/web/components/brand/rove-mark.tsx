/**
 * The ROVE mark (DEV_SPEC §15): an eight-armed compass rose with rounded arm
 * ends — eight directions = infinite directions = a trip with no fixed route.
 *
 * Drawn as geometry, never as the Unicode ✳, so it stays crisp at 16px.
 * The four cardinal arms are longer than the diagonals, which is what makes it
 * read as a compass rather than a snowflake.
 *
 * Colour comes from `currentColor` — the caller decides terracotta / white /
 * espresso by setting `text-*`.
 */
export function RoveMark({
  className,
  core = false,
  ...props
}: React.SVGProps<SVGSVGElement> & { core?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className} {...props}>
      <g stroke="currentColor" strokeWidth={13} strokeLinecap="round">
        <path d="M50 12V88" />
        <path d="M12 50H88" />
        <path d="M28.8 28.8 71.2 71.2" />
        <path d="M71.2 28.8 28.8 71.2" />
      </g>
      {/* The espresso core only appears at display sizes — at favicon scale it
       * would close up into a muddy dot. */}
      {core ? <circle cx="50" cy="50" r="7.5" className="fill-espresso" /> : null}
    </svg>
  );
}
