import { ImageResponse } from 'next/og';

/**
 * The card that shows up when a ROVE link is pasted into a chat (W10.4).
 *
 * Drawn rather than photographed: a shared plan is text, and a screenshot of a
 * trip nobody in that chat is on would be misleading. Built with the brand's
 * own tokens so it cannot drift from the app.
 */
export const alt = 'ROVE — วางแพลนเที่ยวกันทั้งกลุ่ม';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px',
          background: '#FFFCF1',
          color: '#101010',
          fontFamily: 'sans-serif',
        }}
      >
        {/* The wordmark, lowercase with the period in cobalt (§5 Nav). Satori
            has no access to the app's fonts or CSS variables, so this is the
            one file where the palette is typed out — keep it in step with
            styles/brand.css. */}
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: '-1.3px' }}>
          <span>rove</span>
          <span style={{ color: '#3D86C8' }}>.</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 28,
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-2px',
          }}
        >
          <span>วางแพลนเที่ยวกันทั้งกลุ่ม</span>
          <span>โดยไม่ต้องแย่งกันคุมแชท</span>
        </div>

        <div style={{ display: 'flex', marginTop: 26, fontSize: 28, color: '#5F5E5A' }}>
          หาวันที่ทุกคนว่าง · ให้ AI ร่างแพลน · หารเงินกันจบในที่เดียว
        </div>

        {/* Four bars, one per colour, in the §2.4 order: plan, act, money,
            people — the product's own sequence, not a swatch row. */}
        <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
          {['#F0C045', '#3D86C8', '#54B73C', '#EF91C0'].map((color) => (
            <div key={color} style={{ width: 110, height: 14, borderRadius: 999, background: color }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
