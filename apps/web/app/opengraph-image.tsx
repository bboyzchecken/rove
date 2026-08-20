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
          background: '#ffffff',
          color: '#3D2B24',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 44, fontWeight: 800 }}>
          <span>R</span>
          <span style={{ color: '#D9714E' }}>✳</span>
          <span>VE</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 28,
            fontSize: 62,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-2px',
          }}
        >
          <span>วางแพลนเที่ยวกันทั้งกลุ่ม</span>
          <span>โดยไม่ต้องแย่งกันคุมแชท</span>
        </div>

        <div style={{ display: 'flex', marginTop: 26, fontSize: 28, color: '#6B5B4E' }}>
          หาวันที่ทุกคนว่าง · ให้ AI ร่างแพลน · หารเงินกันจบในที่เดียว
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
          {['#D9714E', '#8BC99A', '#A8D4F0', '#F0E06B', '#C4B8E8'].map((color) => (
            <div key={color} style={{ width: 96, height: 14, borderRadius: 999, background: color }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
