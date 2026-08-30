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
          background: '#FFFFFF',
          color: '#000000',
          fontFamily: 'sans-serif',
        }}
      >
        {/* The wordmark, lowercase, black on white (§6 Nav). Satori has no
            access to the app's fonts or CSS variables, so this is the one file
            where the palette is typed out — keep it in step with
            styles/brand.css.

            The period is ink rather than an accent because a share card has no
            section to be in, which is the same reason `RoveIcon` is ink: the
            period takes the CURRENT feature's colour, and a link pasted into a
            chat has no current feature. */}
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: '-1.3px' }}>
          <span>rove.</span>
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

        <div style={{ display: 'flex', marginTop: 26, fontSize: 28, color: '#525252' }}>
          หาวันที่ทุกคนว่าง · ให้ AI ร่างแพลน · หารเงินกันจบในที่เดียว
        </div>

        {/* Six bars, one per feature, in the order a user meets them: dates,
            wishlist, plan, money, journal, notes. This is §2.5's "legend
            listing all features" exception, and it is the whole v3 idea in one
            row — the card says "this product is six colour-coded rooms" before
            anyone has clicked the link.

            The LIGHT halves, not the solids: a 110px bar is a large area by
            §2.3's reckoning, and six saturated bars would out-shout the
            headline above them. */}
        <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
          {['#FFF08E', '#FFC7ED', '#B4F3FF', '#FFC799', '#BDFFAA', '#DCC0FF'].map((color) => (
            <div key={color} style={{ width: 110, height: 14, borderRadius: 999, background: color }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
