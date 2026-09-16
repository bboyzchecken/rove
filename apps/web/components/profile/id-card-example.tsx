/**
 * The D-38 example: an ID card with religion and blood type covered before the
 * photo is taken. Drawn, not photographed — no real card appears anywhere.
 */
export function IdCardExample({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      role="img"
      aria-label="ตัวอย่างบัตรประชาชนที่ปิดช่องศาสนาและกรุ๊ปเลือดไว้"
      className={className}
    >
      <rect x="4" y="4" width="312" height="192" rx="16" className="fill-blue-light stroke-ink" strokeWidth="2" />
      <rect x="20" y="20" width="180" height="12" rx="6" className="fill-ink" opacity="0.7" />
      <rect x="20" y="44" width="130" height="8" rx="4" className="fill-ink" opacity="0.35" />
      <rect x="20" y="62" width="150" height="8" rx="4" className="fill-ink" opacity="0.35" />
      <rect x="20" y="80" width="110" height="8" rx="4" className="fill-ink" opacity="0.35" />

      {/* covered: religion */}
      <text x="20" y="113" fontSize="16" fontWeight="600" className="fill-ink">ศาสนา</text>
      <rect x="80" y="97" width="90" height="21" rx="4" className="fill-ink" />
      <text x="125" y="112" fontSize="13" textAnchor="middle" className="fill-bg">ปิดไว้</text>

      {/* covered: blood type */}
      <text x="20" y="139" fontSize="16" fontWeight="600" className="fill-ink">กรุ๊ปเลือด</text>
      <rect x="100" y="123" width="76" height="21" rx="4" className="fill-ink" />
      <text x="138" y="138" fontSize="13" textAnchor="middle" className="fill-bg">ปิดไว้</text>

      <rect x="20" y="162" width="170" height="10" rx="5" className="fill-ink" opacity="0.5" />

      <rect x="222" y="44" width="76" height="96" rx="10" className="fill-bg stroke-ink" strokeWidth="1.5" />
      <circle cx="260" cy="80" r="16" className="fill-ink" opacity="0.25" />
      <rect x="236" y="104" width="48" height="26" rx="13" className="fill-ink" opacity="0.25" />
    </svg>
  );
}
