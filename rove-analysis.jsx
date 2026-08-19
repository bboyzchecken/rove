import { useState } from "react";

const ROVE_COLORS = {
  cream: "#F0EDE6",
  espresso: "#2C1A0E",
  terracotta: "#D4614A",
  terracottaLight: "#E8906B",
  matcha: "#8BC99A",
  sky: "#A8D4F0",
  sun: "#F0E06B",
  joyfull: "#C4B8E8",
  white: "#FFFFFF",
  grayText: "#6B5B4E",
};

const features = [
  // CORE TRIP PLANNING
  {
    category: "Core Trip Planning",
    name: "Trip Room / Dashboard",
    roveMention: "Trip Dashboard — เข้าไปแล้วเจอ trip ที่จัดไว้",
    planStatus: "planned",
    planPhase: "Phase 1 — M2",
    planDetail: "Trip Room tabs, overview payload, members, flags",
    gap: null,
  },
  {
    category: "Core Trip Planning",
    name: "Member Wishlist (must/nice/avoid)",
    roveMention: "Wishlist Plan — สมาชิกเอา location มา drop ลงไว้ได้เรื่อยๆ",
    planStatus: "planned",
    planPhase: "Phase 1 — M3",
    planDetail: "must/nice/avoid, tags, poi_id, coverage board",
    gap: "ROVE เน้น location drop มากกว่า text-free-form",
  },
  {
    category: "Core Trip Planning",
    name: "AI Plan Generation",
    roveMention: "AI gen — Gen AI ให้ได้ว่าควรไปกี่วัน วันไหนไป ไหนบ้าง",
    planStatus: "planned",
    planPhase: "Phase 1 — M4",
    planDetail: "normalize → frame → generate → validate → explain → persist",
    gap: null,
  },
  {
    category: "Core Trip Planning",
    name: "Itinerary Timeline Editor",
    roveMention: "Recap Map / Itinerary — สรุปแพลนตามที่เรา list ไว้",
    planStatus: "planned",
    planPhase: "Phase 1 — M5",
    planDetail: "dnd-kit timeline, add/edit/delete item, undo",
    gap: null,
  },
  {
    category: "Core Trip Planning",
    name: "Map View + Route Lines",
    roveMention: "ทำเป็นเส้นเชื่อมระหว่างสถานที่ได้ + ดู map จริงๆได้ด้วยเวลาไปเที่ยวจริงๆ",
    planStatus: "partial",
    planPhase: "V1 — W5.9",
    planDetail: "Google Maps JS: pins + polyline อยู่ใน Phase 2",
    gap: "ROVE อยากให้ดู map ระหว่างเที่ยวจริง (realtime nav) ซึ่งใกล้เคียง Trip Mode ใน V2",
  },
  {
    category: "Core Trip Planning",
    name: "POI Info (เวลาเปิด-ปิด, ระยะทาง)",
    roveMention: "มีบอกข้อมูลแต่ละอันว่าเปิดปิดกี่โมง ระยะห่างกี่นาที เส้นโดยสาร",
    planStatus: "planned",
    planPhase: "Phase 1 — A4.2, A5.3",
    planDetail: "tools: distance, open_hours จาก POI DB + Google; warning badges",
    gap: null,
  },
  // BUDGET & EXPENSE
  {
    category: "Budget & Expense",
    name: "Budget สรุปต่อคน (ประมาณการ)",
    roveMention: "Budget Spend — รายจ่ายที่ใช้ไปทั้งหมด",
    planStatus: "planned",
    planPhase: "Phase 1 — M7",
    planDetail: "category rollup, per_person, FX THB/JPY, prepaid แยก",
    gap: null,
  },
  {
    category: "Budget & Expense",
    name: "Expense — Shared / Personal split",
    roveMention: "Shared ทำรวมตี๋ในสมาชิก คิดแบบขุนทองได้ มีแบ่งว่าใครใช้ ใครจ่าย / Personal log ของตัวเอง",
    planStatus: "partial",
    planPhase: "V2 — M7.2b (mention เท่านั้น)",
    planDetail: "มีแค่ 'expense split จริง (settle up)' ใน V2 ยังไม่ลง detail",
    gap: "ROVE ลง detail กว่ามาก: Shared vs Personal, who paid/who used, export personal จาก shared, 'khun tong' style",
  },
  {
    category: "Budget & Expense",
    name: "Real-time Currency / FX check",
    roveMention: "เปลี่ยน Currency ได้ / เช็คค่าเงิน real time ได้",
    planStatus: "partial",
    planPhase: "Phase 1 — M7.1 (daily cache)",
    planDetail: "FX service + cache รายวัน override manual",
    gap: "ROVE ต้องการ real-time FX ไม่ใช่ daily cache — ต้องอัป spec",
  },
  {
    category: "Budget & Expense",
    name: "App-level Budget Spend (cross-trip)",
    roveMention: "Trip Dashboard: รายจ่ายที่ใช้ไปทั้งหมด (ระดับ app รวมทุก trip)",
    planStatus: "new",
    planPhase: "—",
    planDetail: "ไม่มีใน spec เลย มีแค่ per-plan budget",
    gap: "NEW: Dashboard รวมค่าใช้จ่ายทุก trip ที่เคยไป",
  },
  // MEMORY & RECAP
  {
    category: "Memory & Recap",
    name: "Recap Past Trip (completed trips)",
    roveMention: "Recap Past Trip — trip เก่าที่เคยไปแล้ว สรุปสั้นๆว่าไปไหน กี่วัน",
    planStatus: "partial",
    planPhase: "V2 — trip_reviews mention",
    planDetail: "มี trip_reviews table ใน V2 แต่ไม่ใช่ recap dashboard",
    gap: "NEW: หน้า recap สรุปทริปที่จบแล้ว (visual summary)",
  },
  {
    category: "Memory & Recap",
    name: "Cross-trip Stats (ปีนี้ไปกี่ที่ กี่ประเทศ)",
    roveMention: "ปีนี้ไปกี่ที่แล้ว กี่จังหวัด ประเทศ / รวมชั่วโมง วัน ที่เที่ยวทั้งหมดของปี",
    planStatus: "new",
    planPhase: "—",
    planDetail: "ไม่มีใน spec เลย",
    gap: "NEW: Travel stats ระดับ user (ala Duolingo streak / year wrap)",
  },
  {
    category: "Memory & Recap",
    name: "Journal (Trip Diary)",
    roveMention: "Journal log เก็บ moment ของ trip ได้ทั้งแบบ shared และ personal ใส่ได้ทั้ง รูป text แบ่งหน้าแต่ละวัน น่ารักๆ แบบสมุด",
    planStatus: "new",
    planPhase: "—",
    planDetail: "ไม่มีใน spec เลย (มีแค่ comments/discussion)",
    gap: "NEW: Trip journal — photo + text diary, shared/personal, per-day pages",
  },
  // PERSONAL FEATURES
  {
    category: "Personal / Gamification",
    name: "Widget Character (avatar)",
    roveMention: "อยากให้สร้าง Character ได้ preset 10 แบบ หรือตัวละคร สัตว์ น่ารักๆ fix แบบสัก 20 ตัวให้เลือก",
    planStatus: "new",
    planPhase: "—",
    planDetail: "ไม่มีใน spec เลย มีแค่ avatar_url จาก OAuth",
    gap: "NEW: Gamification layer — character เพิ่ม engagement + retention",
  },
  {
    category: "Personal / Gamification",
    name: "Dream Trip (bucket list)",
    roveMention: "สามารถเอาที่อยากไป มา drop ไว้ส่วนตัวของตัวเองได้ ใส่ลิงก์ได้ด้วย",
    planStatus: "new",
    planPhase: "—",
    planDetail: "ไม่มีใน spec เลย (Wishlist มีเฉพาะภายใน trip ที่เปิดแล้ว)",
    gap: "NEW: Pre-trip inspiration board ส่วนตัว ก่อนสร้าง trip จริง",
  },
  {
    category: "Personal / Gamification",
    name: "Global Calendar (all trips)",
    roveMention: "Calendar สรุปสั้นๆ ว่า trip ในอนาคตอีกกี่วันจะถึง สภาพอากาศที่ที่อยู่",
    planStatus: "new",
    planPhase: "—",
    planDetail: "มี weather ใน prep block ต่อ trip แต่ไม่มี global calendar view",
    gap: "NEW: Calendar view ข้าม trip พร้อม countdown + weather widget",
  },
  // DOCUMENTS & FILES
  {
    category: "Documents & Files",
    name: "Document Folder (per trip)",
    roveMention: "Document — รวมไฟล์ไว้ในที่เดียว Ticket / ตั๋วการเดินทางต่างๆ / โรงแรม / ทุกอย่างที่เป็นเอกสาร",
    planStatus: "new",
    planPhase: "—",
    planDetail: "มีแค่ export HTML/PDF ออกไป ไม่มี document folder สำหรับเก็บไฟล์เข้า",
    gap: "NEW: File storage ต่อ trip (upload tickets, hotel confirmations ฯลฯ)",
  },
  // SHARING & COMMUNITY
  {
    category: "Sharing & Community",
    name: "Share Link (private)",
    roveMention: "— (ไม่ได้พูดถึงโดยตรงใน ROVE)",
    planStatus: "planned",
    planPhase: "Phase 1 — M10",
    planDetail: "visibility private/link/public, share_token",
    gap: null,
  },
  {
    category: "Sharing & Community",
    name: "Export HTML/PDF",
    roveMention: "— (ไม่ได้พูดถึงใน ROVE)",
    planStatus: "planned",
    planPhase: "Phase 1 — M10",
    planDetail: "export job → R2 → signed url",
    gap: null,
  },
  {
    category: "Sharing & Community",
    name: "Public Community / Clone",
    roveMention: "— (ไม่ได้พูดถึงใน ROVE)",
    planStatus: "planned",
    planPhase: "V1 — M10/M11",
    planDetail: "public plan page, explore, clone",
    gap: "ROVE ไม่ได้พูดถึง community/public ≠ ขัดแย้ง แต่ต้องตกลงว่าจะเอาด้วยไหม",
  },
  {
    category: "Sharing & Community",
    name: "Booking / Affiliate",
    roveMention: "— (ไม่ได้พูดถึงใน ROVE เลย)",
    planStatus: "planned",
    planPhase: "Phase 1 — M12",
    planDetail: "ปุ่มจอง affiliate tracking, click/confirm",
    gap: "ROVE ไม่ได้พูดถึงเลย ≠ ขัดแย้ง แต่เป็น core revenue ของ plan เดิม ต้องคุยกัน",
  },
];

const categories = [...new Set(features.map((f) => f.category))];

const statusConfig = {
  planned: {
    label: "✅ มีในแพลนแล้ว",
    bg: "#E8F5E9",
    border: "#4CAF50",
    text: "#2E7D32",
    dot: "#4CAF50",
  },
  partial: {
    label: "⚠️ มีบางส่วน",
    bg: "#FFF8E1",
    border: "#FFB300",
    text: "#E65100",
    dot: "#FFB300",
  },
  new: {
    label: "🆕 ไอเดียใหม่จาก ROVE",
    bg: "#FCE4EC",
    border: "#E91E63",
    text: "#880E4F",
    dot: "#E91E63",
  },
};

function StatusBadge({ status }) {
  const cfg = statusConfig[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: `1.5px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function LogoAnalysis() {
  return (
    <div style={{ padding: "32px 40px", background: ROVE_COLORS.cream }}>
      <h2
        style={{
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontWeight: 900,
          fontSize: 24,
          color: ROVE_COLORS.espresso,
          letterSpacing: "-0.5px",
          marginBottom: 24,
        }}
      >
        🎨 วิเคราะห์โลโก้ที่เลือก (Option 1 ⭐)
      </h2>

      {/* Logo display */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 32,
          flexWrap: "wrap",
        }}
      >
        {/* Main chosen logo */}
        <div
          style={{
            background: ROVE_COLORS.white,
            borderRadius: 120,
            width: 180,
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(44,26,14,0.15)",
            border: `3px solid ${ROVE_COLORS.terracotta}`,
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: -10, right: -10, fontSize: 22 }}>⭐</div>
          <div
            style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontWeight: 900,
              fontSize: 36,
              color: ROVE_COLORS.espresso,
              letterSpacing: "-1px",
              display: "flex",
              alignItems: "center",
            }}
          >
            R
            <span style={{ color: ROVE_COLORS.terracotta, fontSize: 32, margin: "0 1px" }}>✳</span>
            VE
          </div>
        </div>

        {/* Color variants */}
        <div
          style={{
            background: ROVE_COLORS.white,
            borderRadius: 120,
            width: 140,
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 10px rgba(44,26,14,0.1)",
            opacity: 0.6,
          }}
        >
          <div
            style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontWeight: 900,
              fontSize: 28,
              color: ROVE_COLORS.espresso,
              display: "flex",
              alignItems: "center",
            }}
          >
            R
            <span style={{ color: ROVE_COLORS.terracottaLight, margin: "0 1px" }}>✳</span>
            VE
          </div>
        </div>
        <div
          style={{
            background: ROVE_COLORS.white,
            borderRadius: 120,
            width: 140,
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 10px rgba(44,26,14,0.1)",
            opacity: 0.6,
          }}
        >
          <div
            style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontWeight: 900,
              fontSize: 28,
              color: "#4A7C59",
              display: "flex",
              alignItems: "center",
            }}
          >
            R
            <span style={{ color: "#D4614A", margin: "0 1px" }}>✳</span>
            VE
          </div>
        </div>
      </div>

      {/* Analysis grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {[
          {
            title: "Concept",
            icon: "💡",
            content:
              "ตัว O ถูกแทนด้วย asterisk/ดอกไม้ 8 กลีบ ตรงตาม Gimmick ที่ต้องการ: '8 เส้นเหมือนเข็มทิศ คล้ายดอกไม้' — โลโก้ทำงานเป็นทั้ง wordmark และ icon ในตัวเดียว",
          },
          {
            title: "Typography",
            icon: "🔤",
            content:
              "Bold geometric sans-serif (คล้าย Futura Bold / Montserrat Black) — ตัวอักษรใหญ่ทั้งหมด ให้ความรู้สึก confident + modern แต่ asterisk ทำให้ playful ขึ้น",
          },
          {
            title: "Color Rationale",
            icon: "🎨",
            content:
              "Option 1 (ที่เลือก): espresso body + terracotta asterisk → warm, grounded ต่างกับ Option 2 (อ่อนกว่า) และ Option 3 (เขียว) — espresso+terracotta ไป pair กับ palette cozy ได้ดีที่สุด",
          },
          {
            title: "Scalability",
            icon: "📐",
            content:
              "Asterisk symbol ✳ ใช้เดี่ยวเป็น app icon ได้ทันที (terracotta บน cream) โลโก้แนวนอนเหมาะ header / footer เต็มรูปแบบ — versatile มาก",
          },
          {
            title: "Meaning Alignment",
            icon: "🧭",
            content:
              '"ROVE = ท่องเที่ยวไปโดยไม่มีเส้นทางตายตัว" → 8 ทิศของ asterisk สื่อถึง infinite directions การเดินทางที่ไม่ตายตัว และ connection ของผู้คนในกลุ่ม',
          },
          {
            title: "Risk / Consideration",
            icon: "⚠️",
            content:
              "Asterisk เป็น symbol ที่ใช้กันทั่วไป (footnote, annotation) — ต้องมั่นใจว่า render ชัดในขนาดเล็ก (favicon 16px) และ asset ควรเป็น custom SVG ไม่ใช่ Unicode ✳",
          },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              background: ROVE_COLORS.white,
              borderRadius: 12,
              padding: "16px 20px",
              border: `1px solid rgba(44,26,14,0.1)`,
            }}
          >
            <div
              style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: ROVE_COLORS.terracotta,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {item.icon} {item.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: ROVE_COLORS.grayText,
                lineHeight: 1.6,
              }}
            >
              {item.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleAnalysis() {
  const colors = [
    { name: "Cha Thai Terracotta", hex: "#D4614A", role: "Primary / CTA / Logo accent" },
    { name: "Black Coffee Espresso", hex: "#2C1A0E", role: "Text / Logo body / Headers" },
    { name: "Cream Linen", hex: "#F0EDE6", role: "Background (textured paper feel)" },
    { name: "Matcha Tree", hex: "#8BC99A", role: "Success / Nature accent" },
    { name: "Cloud Sky", hex: "#A8D4F0", role: "Info / Calm accent" },
    { name: "Sun", hex: "#F0E06B", role: "Warning / Happy accent" },
    { name: "Joyfull", hex: "#C4B8E8", role: "Playful / Secondary accent" },
  ];

  return (
    <div style={{ padding: "32px 40px", background: ROVE_COLORS.white }}>
      <h2
        style={{
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontWeight: 900,
          fontSize: 24,
          color: ROVE_COLORS.espresso,
          letterSpacing: "-0.5px",
          marginBottom: 24,
        }}
      >
        🖌️ วิเคราะห์สไตล์แอป ROVE
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        {/* Color Palette */}
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: ROVE_COLORS.espresso,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Color Palette
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {colors.map((c) => (
              <div
                key={c.hex}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  background: "#FAFAF8",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: c.hex,
                    flexShrink: 0,
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ROVE_COLORS.espresso }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: ROVE_COLORS.grayText }}>
                    {c.hex} · {c.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Style Principles */}
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: ROVE_COLORS.espresso,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Design Direction
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                label: "Mood",
                value: "Cozy · Warm · Playful · Inviting",
                icon: "☕",
                color: ROVE_COLORS.terracotta,
              },
              {
                label: "Background Texture",
                value: "Cream linen paper — ให้ความรู้สึกเหมือนสมุดบันทึกการเดินทาง",
                icon: "📋",
                color: ROVE_COLORS.matcha,
              },
              {
                label: "Typography",
                value: "Bold geometric sans (Futura-style) สำหรับ heading — body font ควรอ่านง่าย เช่น Plus Jakarta Sans หรือ Noto Sans Thai",
                icon: "🔤",
                color: ROVE_COLORS.sky,
              },
              {
                label: "Border Radius",
                value: "กลมมน (16-24px) ไม่ใช่ sharp corners — เน้น friendly ไม่ corporate",
                icon: "⭕",
                color: ROVE_COLORS.joyfull,
              },
              {
                label: "Card Style",
                value: "Colored cards เป็น block หลัก (ตาม UI reference) — ใช้สีจาก palette แทน border",
                icon: "🃏",
                color: ROVE_COLORS.sun,
              },
              {
                label: "Iconography",
                value: "Rounded filled icons, น่ารัก ไม่ outline เท่านั้น — emoji-friendly",
                icon: "🌸",
                color: ROVE_COLORS.terracotta,
              },
              {
                label: "UI Reference ที่ให้มา",
                value: "Playful event/health apps: card-heavy, colorful bubbles, rounded chips — ไม่ใช่ corporate dashboard",
                icon: "📱",
                color: ROVE_COLORS.matcha,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "10px 14px",
                  background: "#FAFAF8",
                  borderRadius: 10,
                  borderLeft: `4px solid ${item.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: item.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 3,
                  }}
                >
                  {item.icon} {item.label}
                </div>
                <div style={{ fontSize: 12, color: ROVE_COLORS.grayText, lineHeight: 1.5 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS Token Suggestion */}
      <div
        style={{
          background: ROVE_COLORS.espresso,
          borderRadius: 12,
          padding: "20px 24px",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: ROVE_COLORS.terracottaLight,
            fontWeight: 700,
            marginBottom: 10,
            letterSpacing: "1px",
          }}
        >
          /* styles/brand.css — ROVE tokens (§15 placeholder → ใส่ค่าจริงได้เลย) */
        </div>
        {[
          ["--brand-primary", "19 62% 56%", "/* terracotta #D4614A */"],
          ["--brand-primary-fg", "0 0% 100%", "/* white text on terracotta */"],
          ["--brand-accent", "16 52% 67%", "/* terracotta light #E8906B */"],
          ["--brand-bg", "38 27% 91%", "/* cream linen #F0EDE6 */"],
          ["--brand-surface", "0 0% 100%", "/* white cards */"],
          ["--brand-espresso", "24 53% 16%", "/* #2C1A0E logo text */"],
          ["--brand-matcha", "137 36% 65%", "/* #8BC99A */"],
          ["--brand-sky", "207 68% 81%", "/* #A8D4F0 */"],
          ["--brand-sun", "52 82% 68%", "/* #F0E06B */"],
          ["--brand-joyfull", "260 37% 80%", "/* #C4B8E8 */"],
          ["--brand-muted", "22 18% 43%", "/* #6B5B4E gray text */"],
        ].map(([prop, val, comment]) => (
          <div
            key={prop}
            style={{
              fontSize: 12,
              lineHeight: 1.8,
              display: "flex",
              gap: 8,
            }}
          >
            <span style={{ color: "#A8D4F0" }}>{prop}:</span>
            <span style={{ color: "#F0E06B" }}>{val};</span>
            <span style={{ color: "#6B5B4E" }}>{comment}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("compare");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const filtered = features.filter(
    (f) =>
      (filterStatus === "all" || f.planStatus === filterStatus) &&
      (filterCategory === "all" || f.category === filterCategory)
  );

  const counts = {
    planned: features.filter((f) => f.planStatus === "planned").length,
    partial: features.filter((f) => f.planStatus === "partial").length,
    new: features.filter((f) => f.planStatus === "new").length,
  };

  return (
    <div
      style={{
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        background: ROVE_COLORS.cream,
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: ROVE_COLORS.espresso,
          padding: "24px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              background: ROVE_COLORS.white,
              borderRadius: 50,
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 15,
              color: ROVE_COLORS.espresso,
            }}
          >
            R<span style={{ color: ROVE_COLORS.terracotta }}>✳</span>VE
          </div>
          <div>
            <div
              style={{
                color: ROVE_COLORS.white,
                fontWeight: 900,
                fontSize: 20,
                letterSpacing: "-0.5px",
              }}
            >
              ROVE × TripPlan — Feature Gap Analysis
            </div>
            <div style={{ color: ROVE_COLORS.terracottaLight, fontSize: 12, marginTop: 2 }}>
              เปรียบเทียบ DEV_SPEC.md กับ ROVE.pdf · วันที่ 19 ส.ค. 2569
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { key: "compare", label: "📊 Feature Compare" },
            { key: "logo", label: "🎨 Logo Analysis" },
            { key: "style", label: "🖌️ Style Guide" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
                background:
                  activeTab === tab.key ? ROVE_COLORS.terracotta : "rgba(255,255,255,0.1)",
                color: activeTab === tab.key ? ROVE_COLORS.white : "rgba(255,255,255,0.6)",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "compare" && (
        <div>
          {/* Summary Stats */}
          <div
            style={{
              display: "flex",
              gap: 16,
              padding: "24px 40px",
              background: ROVE_COLORS.white,
              borderBottom: `1px solid rgba(44,26,14,0.08)`,
            }}
          >
            {[
              {
                status: "planned",
                count: counts.planned,
                label: "มีในแพลนแล้วครบ",
                icon: "✅",
              },
              {
                status: "partial",
                count: counts.partial,
                label: "มีบางส่วน ต้องอัป spec",
                icon: "⚠️",
              },
              {
                status: "new",
                count: counts.new,
                label: "ไอเดียใหม่จาก ROVE",
                icon: "🆕",
              },
            ].map((s) => (
              <div
                key={s.status}
                onClick={() => setFilterStatus(filterStatus === s.status ? "all" : s.status)}
                style={{
                  flex: 1,
                  background: filterStatus === s.status ? statusConfig[s.status].bg : "#F9F7F5",
                  border: `2px solid ${filterStatus === s.status ? statusConfig[s.status].border : "transparent"}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 900, color: ROVE_COLORS.espresso }}>
                  {s.count}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ROVE_COLORS.grayText }}>
                  {s.icon} {s.label}
                </div>
              </div>
            ))}
            <div
              style={{
                flex: 1,
                background: "#F9F7F5",
                borderRadius: 12,
                padding: "16px 20px",
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: ROVE_COLORS.espresso }}>
                {features.length}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: ROVE_COLORS.grayText }}>
                📋 Feature ทั้งหมดที่เทียบ
              </div>
            </div>
          </div>

          {/* Filters */}
          <div
            style={{
              padding: "16px 40px",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              background: ROVE_COLORS.cream,
              borderBottom: `1px solid rgba(44,26,14,0.08)`,
            }}
          >
            <span
              style={{ fontSize: 12, fontWeight: 700, color: ROVE_COLORS.grayText, marginRight: 4 }}
            >
              หมวด:
            </span>
            {["all", ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 14,
                  border: `1.5px solid ${filterCategory === cat ? ROVE_COLORS.espresso : "rgba(44,26,14,0.2)"}`,
                  background: filterCategory === cat ? ROVE_COLORS.espresso : "transparent",
                  color: filterCategory === cat ? ROVE_COLORS.white : ROVE_COLORS.grayText,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {cat === "all" ? "ทั้งหมด" : cat}
              </button>
            ))}
            {(filterStatus !== "all" || filterCategory !== "all") && (
              <button
                onClick={() => {
                  setFilterStatus("all");
                  setFilterCategory("all");
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 14,
                  border: `1.5px solid ${ROVE_COLORS.terracotta}`,
                  background: "transparent",
                  color: ROVE_COLORS.terracotta,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                ✕ ล้าง filter
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ padding: "0 40px 40px" }}>
            {categories
              .filter((cat) => filterCategory === "all" || filterCategory === cat)
              .map((cat) => {
                const catFeatures = filtered.filter((f) => f.category === cat);
                if (catFeatures.length === 0) return null;
                return (
                  <div key={cat} style={{ marginTop: 24 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 13,
                        color: ROVE_COLORS.terracotta,
                        textTransform: "uppercase",
                        letterSpacing: "1.5px",
                        marginBottom: 10,
                        paddingTop: 4,
                      }}
                    >
                      {cat}
                    </div>
                    <div
                      style={{
                        background: ROVE_COLORS.white,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: `1px solid rgba(44,26,14,0.08)`,
                      }}
                    >
                      {/* Table header */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "220px 1fr 1fr 1fr",
                          background: ROVE_COLORS.espresso,
                          padding: "10px 16px",
                          gap: 12,
                        }}
                      >
                        {["Feature", "ROVE บอกว่า...", "Status / Phase", "Gap / หมายเหตุ"].map(
                          (h) => (
                            <div
                              key={h}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.6)",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {h}
                            </div>
                          )
                        )}
                      </div>
                      {catFeatures.map((f, i) => (
                        <div
                          key={f.name}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "220px 1fr 1fr 1fr",
                            padding: "12px 16px",
                            gap: 12,
                            borderTop: i > 0 ? `1px solid rgba(44,26,14,0.06)` : "none",
                            background:
                              f.planStatus === "new"
                                ? "rgba(233,30,99,0.02)"
                                : f.planStatus === "partial"
                                  ? "rgba(255,179,0,0.03)"
                                  : "transparent",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: ROVE_COLORS.espresso,
                                lineHeight: 1.4,
                              }}
                            >
                              {f.name}
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <StatusBadge status={f.planStatus} />
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: ROVE_COLORS.grayText,
                              lineHeight: 1.6,
                              fontStyle: f.roveMention.includes("ไม่ได้") ? "italic" : "normal",
                              opacity: f.roveMention.includes("ไม่ได้") ? 0.6 : 1,
                            }}
                          >
                            {f.roveMention}
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: ROVE_COLORS.terracotta,
                                marginBottom: 3,
                              }}
                            >
                              {f.planPhase}
                            </div>
                            <div style={{ fontSize: 11, color: ROVE_COLORS.grayText, lineHeight: 1.5 }}>
                              {f.planDetail}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color:
                                f.gap && f.planStatus === "new"
                                  ? "#880E4F"
                                  : f.gap && f.planStatus === "partial"
                                    ? "#E65100"
                                    : ROVE_COLORS.grayText,
                              lineHeight: 1.5,
                              fontWeight: f.gap ? 600 : 400,
                            }}
                          >
                            {f.gap || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {activeTab === "logo" && <LogoAnalysis />}
      {activeTab === "style" && <StyleAnalysis />}
    </div>
  );
}
