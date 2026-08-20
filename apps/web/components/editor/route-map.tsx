import type { PlanItem } from '@/lib/mock';

/**
 * Schematic route preview for one day.
 *
 * Google Maps pins + polyline are W5.9 (Phase 2). Until the key is wired this
 * draws the same information — order, hops and stop names — from the itinerary
 * itself, so the screen is honest rather than a grey box.
 *
 * Positions are derived from the item id, not random, so a day always looks
 * the same between renders.
 */
/** FNV-1a plus an avalanche step. Plain `h * 31 + c` leaves ids that differ by
 *  one character — which is exactly what day item ids do — sitting next to each
 *  other, and every stop lands on the same line. */
function hash(text: string) {
  let h = 2_166_136_261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2_246_822_507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function RouteMap({ items, city }: { items: PlanItem[]; city: string }) {
  const stops = items.filter((i) => i.type !== 'stay').slice(0, 7);

  const points = stops.map((item, i) => {
    // Spread stops left-to-right, scatter vertically inside a safe band.
    const x = 40 + (i * 580) / Math.max(1, stops.length - 1);
    const y = 42 + (hash(item.id) % 130);
    return { item, x, y };
  });

  // Round the corners of the route so it reads as a walked path, not a chart.
  const path = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1]!;
      const midX = (prev.x + p.x) / 2;
      return `C ${midX} ${prev.y}, ${midX} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(' ');

  return (
    <div className="rounded-brand bg-surface overflow-hidden">
      <svg
        viewBox="0 0 660 220"
        className="h-44 w-full"
        role="img"
        aria-label={`เส้นทางวันนี้ใน${city}`}
      >
        <rect width="660" height="220" className="fill-matcha/12" />

        {/* soft blocks standing in for districts and water */}
        <rect x="30" y="20" width="180" height="80" rx="16" className="fill-matcha/25" />
        <rect x="420" y="130" width="210" height="70" rx="16" className="fill-sky/35" />
        <rect x="240" y="150" width="120" height="50" rx="14" className="fill-sun/25" />

        <path
          d={path}
          className="stroke-primary/70"
          strokeWidth={3}
          strokeDasharray="7 7"
          fill="none"
        />

        {points.map((p, i) => (
          <g key={p.item.id}>
            <circle cx={p.x} cy={p.y} r={13} className="fill-primary" />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              className="fill-white text-[11px] font-bold"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>

      <ol className="divide-border divide-y">
        {points.map((p, i) => (
          <li key={p.item.id} className="flex items-center gap-2.5 px-3.5 py-2">
            <span className="bg-primary/12 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
              {i + 1}
            </span>
            <span className="text-espresso min-w-0 flex-1 truncate text-xs font-medium">
              {p.item.title}
            </span>
            {p.item.travel ? (
              <span className="text-muted shrink-0 text-[11px]">
                {p.item.travel.minutes} นาที →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
