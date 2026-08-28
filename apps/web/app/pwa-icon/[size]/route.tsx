import { ImageResponse } from 'next/og';

/**
 * The installed-app icon, rendered rather than committed (W10.6).
 *
 * The brand mark is an SVG (`public/brand/mark.svg`) and a manifest needs PNGs
 * at fixed sizes. Generating them here keeps one source of truth for the mark —
 * a committed PNG pair is two more files to forget when the logo changes — and
 * the colour still comes from a token rather than a hex typed into an asset.
 */
export const dynamic = 'force-static';

const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

// The mark, inlined: Satori draws an <img>, not arbitrary SVG children.
const MARK = (color: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <g stroke="${color}" stroke-width="13" stroke-linecap="round">
    <path d="M50 12V88"/>
    <path d="M12 50H88"/>
    <path d="M28.8 28.8 71.2 71.2"/>
    <path d="M71.2 28.8 28.8 71.2"/>
  </g>
</svg>`;

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = SIZES.includes(Number(raw) as (typeof SIZES)[number]) ? Number(raw) : 192;

  // Maskable icons are cropped to a circle on some launchers, so the mark sits
  // inside the safe area with room to spare rather than filling the square.
  const inner = Math.round(size * 0.58);
  const mark = `data:image/svg+xml;utf8,${encodeURIComponent(MARK('#3D86C8'))}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFFCF1',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
