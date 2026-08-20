import { useState } from "react";

const C = {
  cream: "#F0EDE6",
  espresso: "#2C1A0E",
  terra: "#D4614A",
  terraLight: "#E8906B",
  matcha: "#8BC99A",
  sky: "#A8D4F0",
  sun: "#F0E06B",
  joy: "#C4B8E8",
  white: "#FFFFFF",
  gray: "#6B5B4E",
  border: "rgba(44,26,14,0.08)",
};

// Heat map colors: 0–4 members available
const HEAT_BG   = ["#F0EDE6","#FAD9CB","#F0AD8B","#E8906B","#D4614A"];
const HEAT_TEXT = ["#6B5B4E","#2C1A0E","#2C1A0E","#2C1A0E","#FFFFFF"];

const MEMBERS = [
  { id: 1, name: "เนอร์ส", emoji: "🌸", color: "#D4614A", bg: "#FEE8DC" },
  { id: 2, name: "แคท",   emoji: "🐱", color: "#4A7C59", bg: "#DDF0E4" },
  { id: 3, name: "เช็ค",  emoji: "⭐", color: "#7A6A10", bg: "#FFF8D0" },
  { id: 4, name: "คอม",   emoji: "🎮", color: "#6B5BAE", bg: "#EDE8FF" },
];

// December 2026 — starts Tuesday (DOW=2, 0=Sun)
const DEC_START = 2;
const DEC_DAYS  = 31;

// Each member's available day-numbers in Dec 2026
const AVAIL = {
  1: new Set([4,5,6,7,8,9,10,17,18,19,20,21,22]),
  2: new Set([4,5,6,7,8,9,10,11,20,21,22,23,24,25]),
  3: new Set([3,4,5,6,7,8,15,16,17,18,19,20,21,22]),
  4: new Set([4,5,6,7,8,9,18,19,20,21,22,23,24]),
};

// Pre-computed "all 4 available" windows
const WINDOWS = [
  { label: "✨ 4–8 ธ.ค.",  start: 4,  end: 8,  days: 5, everyone: true },
  { label: "20–22 ธ.ค.", start: 20, end: 22, days: 3, everyone: true },
];

const WEEKDAYS = ["อา","จ","อ","พ","พฤ","ศ","ส"];

const DESTINATIONS = [
  {
    id: "japan", flag: "🇯🇵", name: "ญี่ปุ่น", sub: "โตเกียว · โยโกฮาม่า",
    pill: "แนะนำสำหรับกลุ่มนี้", pillColor: C.terra,
    budget: "35,000–55,000",
    reason: "5 วันพอดีสำหรับ Tokyo loop + Day trip โยโกฮาม่า ช่วง ธ.ค. มีเทศกาลไฟฤดูหนาวสวยที่สุด",
    star: true,
  },
  {
    id: "korea", flag: "🇰🇷", name: "เกาหลีใต้", sub: "โซล · นัมซาน",
    pill: "หิมะแรกของปี", pillColor: C.sky,
    budget: "28,000–40,000",
    reason: "ธ.ค. มีโอกาสเห็นหิมะแรก สวนสาธารณะประดับไฟทั่วเมือง อากาศ -2°C ถึง 6°C",
    star: false,
  },
  {
    id: "taiwan", flag: "🇹🇼", name: "ไต้หวัน", sub: "ไทเป · จิ่วเฟิ่น",
    pill: "งบดีที่สุด", pillColor: C.matcha,
    budget: "18,000–28,000",
    reason: "5 วันเที่ยวสบายๆ กิน-ช้อปครบ อากาศเย็นสบาย ไม่หนาวจัด",
    star: false,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function overlapCount(day) {
  return MEMBERS.filter(m => AVAIL[m.id]?.has(day)).length;
}

function whoIsAvailable(day) {
  return MEMBERS.filter(m => AVAIL[m.id]?.has(day));
}

function allFreeInRange(memberId, start, end) {
  for (let d = start; d <= end; d++) {
    if (!AVAIL[memberId]?.has(d)) return false;
  }
  return true;
}

// ── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ phase }) {
  const steps = [
    { n: 1, label: "สร้างทริป",      done: true },
    { n: 2, label: "ชวนเพื่อน",     done: true },
    { n: 3, label: "ใส่วันว่าง",    done: true },
    { n: 4, label: "ล็อควัน",       done: phase === "locked" || phase === "dest" },
    { n: 5, label: "เลือกปลายทาง", done: phase === "dest" },
  ];
  return (
    <div style={{ background: C.white, padding: "10px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: s.done ? C.terra + "15" : "transparent" }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: s.done ? C.terra : "rgba(44,26,14,0.1)",
              color: s.done ? C.white : C.gray,
            }}>
              {s.done ? "✓" : s.n}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: s.done ? C.terra : C.gray, whiteSpace: "nowrap" }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div style={{ width: 14, height: 1, background: "rgba(44,26,14,0.12)", flexShrink: 0 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Calendar phase ───────────────────────────────────────────────────────────

function CalendarPhase({ onLock }) {
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd,   setRangeEnd]   = useState(null);
  const [hovered,    setHovered]    = useState(null);

  // Effective end: committed end OR hover preview
  const effectEnd = rangeEnd ?? (rangeStart && !rangeEnd ? hovered : null);
  const selA = rangeStart && effectEnd ? Math.min(rangeStart, effectEnd) : rangeStart;
  const selB = rangeStart && effectEnd ? Math.max(rangeStart, effectEnd) : null;
  const selDays = selA && selB ? selB - selA + 1 : 0;

  function handleDay(day) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(day); setRangeEnd(null);
    } else {
      setRangeEnd(day);
    }
  }

  function useWindow(w) {
    setRangeStart(w.start); setRangeEnd(w.end);
  }

  // Build grid cells
  const cells = [];
  for (let i = 0; i < DEC_START; i++) cells.push(null);
  for (let d = 1; d <= DEC_DAYS; d++) cells.push(d);

  const freeInSel = MEMBERS.filter(m => selA && selB && allFreeInRange(m.id, selA, selB));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, padding: 20, alignItems: "start" }}>

      {/* ── Left: Calendar ── */}
      <div>
        <div style={{ background: C.white, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: "0 2px 12px rgba(44,26,14,0.06)" }}>

          {/* Calendar header */}
          <div style={{ background: C.espresso, padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17, color: C.white, letterSpacing: "-0.3px" }}>ธันวาคม 2569</div>
                <div style={{ fontSize: 11, color: "rgba(232,144,107,0.9)", marginTop: 3 }}>ทุกคนใส่วันว่างแล้ว — คลิกเลือกช่วงที่ต้องการ</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {WINDOWS.map(w => (
                  <button key={w.label} onClick={() => useWindow(w)}
                    style={{ padding: "4px 10px", borderRadius: 14, background: "rgba(212,97,74,0.25)", border: `1px solid rgba(212,97,74,0.5)`, color: C.terraLight, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "8px 10px 0", gap: 2 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: C.gray, paddingBottom: 4 }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 10px 14px", gap: 3 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;

              const count   = overlapCount(day);
              const inRange = selA && selB && day >= selA && day <= selB;
              const isEdge  = day === selA || day === selB;
              const isOnly  = day === rangeStart && !rangeEnd && !hovered;

              return (
                <div key={day}
                  onClick={() => handleDay(day)}
                  onMouseEnter={() => { if (rangeStart && !rangeEnd) setHovered(day); }}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    borderRadius: 8, padding: "5px 3px", cursor: "pointer",
                    minHeight: 56,
                    background: inRange ? "rgba(168,212,240,0.55)" : HEAT_BG[count],
                    border: isEdge
                      ? `2px solid ${C.espresso}`
                      : inRange
                        ? `2px solid rgba(168,212,240,0.7)`
                        : isOnly
                          ? `2px solid ${C.terra}`
                          : "2px solid transparent",
                    transition: "background 0.1s, border 0.1s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    position: "relative",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: inRange ? C.espresso : HEAT_TEXT[count], lineHeight: 1 }}>{day}</span>

                  {/* Member emoji dots */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", minHeight: 18 }}>
                    {MEMBERS.map(m => AVAIL[m.id]?.has(day)
                      ? <span key={m.id} style={{ fontSize: 10, lineHeight: 1 }}>{m.emoji}</span>
                      : <span key={m.id} style={{ fontSize: 10, lineHeight: 1, opacity: 0.18 }}>{m.emoji}</span>
                    )}
                  </div>

                  {/* "All free" dot */}
                  {count === MEMBERS.length && !inRange && (
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.white, opacity: 0.7, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Heat legend */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gray }}>ว่างกัน:</span>
            {[0,1,2,3,4].map(n => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: HEAT_BG[n] }} />
                <span style={{ fontSize: 11, color: C.gray }}>{n === 0 ? "ไม่มี" : `${n} คน`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Range action bar */}
        {selA && selB && (
          <div style={{
            marginTop: 10, background: C.white, borderRadius: 12, padding: "12px 16px",
            border: `2px solid ${C.terra}`, display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 2px 12px rgba(212,97,74,0.15)",
          }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, color: C.espresso }}>
                {selA}–{selB} ธ.ค. · {selDays} วัน {selDays >= 4 ? selDays >= 6 ? "🔥" : "✨" : ""}
              </div>
              <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                {freeInSel.length === MEMBERS.length
                  ? `${freeInSel.map(m => m.emoji).join("")} ทุกคนว่างครบ!`
                  : `${freeInSel.map(m => m.emoji).join("")} ว่าง (${freeInSel.length}/${MEMBERS.length} คน)`
                }
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setRangeStart(null); setRangeEnd(null); }}
                style={{ padding: "7px 13px", borderRadius: 20, border: `1px solid rgba(44,26,14,0.15)`, background: "transparent", color: C.gray, cursor: "pointer", fontSize: 12 }}>
                เคลียร์
              </button>
              <button onClick={() => onLock(selA, selB, selDays, freeInSel)}
                style={{ padding: "7px 16px", borderRadius: 20, background: C.terra, color: C.white, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                🔒 ล็อคช่วงนี้
              </button>
            </div>
          </div>
        )}

        {!selA && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(168,212,240,0.25)", borderRadius: 10, border: `1px solid rgba(168,212,240,0.6)` }}>
            <span style={{ fontSize: 12, color: C.espresso }}>💡 คลิกวันแรก แล้วคลิกวันสุดท้าย — หรือเลือก "วันที่แนะนำ" ด้านบนขวาได้เลย</span>
          </div>
        )}
      </div>

      {/* ── Right: Sidebar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Members */}
        <div style={{ background: C.white, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: C.terra, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
            สมาชิก 4 คน
          </div>
          {MEMBERS.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                {m.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.espresso }}>{m.name}</div>
                <div style={{ fontSize: 11, color: m.color }}>✅ ใส่วันว่างแล้ว · {[...AVAIL[m.id]].length} วัน</div>
              </div>
            </div>
          ))}
        </div>

        {/* Best windows */}
        <div style={{ background: C.white, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: C.terra, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
            วันที่ทุกคนว่าง
          </div>
          {WINDOWS.map(w => (
            <div key={w.label} onClick={() => useWindow(w)} style={{
              padding: "10px 12px", borderRadius: 10, marginBottom: 8, cursor: "pointer",
              background: selA === w.start && selB === w.end ? C.terra + "15" : "rgba(44,26,14,0.04)",
              border: `1.5px solid ${selA === w.start && selB === w.end ? C.terra : "transparent"}`,
              transition: "all 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.espresso }}>{w.label}</div>
                <span style={{ fontSize: 10, fontWeight: 700, background: C.matcha + "40", color: "#3A6B49", padding: "2px 7px", borderRadius: 10 }}>{w.days} วัน</span>
              </div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 3 }}>{MEMBERS.map(m => m.emoji).join("")} ทุกคนว่าง</div>
            </div>
          ))}
        </div>

        {/* Summary tip */}
        <div style={{ padding: "10px 12px", background: C.sun + "30", borderRadius: 10, border: `1px solid ${C.sun}` }}>
          <div style={{ fontSize: 11, color: "#5A4A00", lineHeight: 1.6 }}>
            <strong>เมื่อล็อควันแล้ว</strong><br />
            ระบบจะแนะนำปลายทางที่เหมาะกับจำนวนวัน + ฤดูกาล + งบของกลุ่ม
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Destination phase ────────────────────────────────────────────────────────

function DestPhase({ lockedStart, lockedEnd, lockedDays, lockedMembers, onBack }) {
  const [picked, setPicked] = useState(null);

  return (
    <div style={{ padding: 20 }}>

      {/* Locked banner */}
      <div style={{ background: C.espresso, borderRadius: 14, padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, marginBottom: 4 }}>🎉 ได้วันแล้ว!</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: C.white, letterSpacing: "-0.3px" }}>
            {lockedStart}–{lockedEnd} ธ.ค. 2569 · {lockedDays} วัน {lockedDays-1} คืน
          </div>
          <div style={{ fontSize: 13, color: C.terraLight, marginTop: 3 }}>
            {lockedMembers.map(m => m.emoji).join(" ")} ทุกคนว่างตรงกัน
          </div>
        </div>
        <button onClick={onBack} style={{ padding: "7px 13px", borderRadius: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.65)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          ← เปลี่ยนวัน
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: C.espresso, letterSpacing: "-0.3px" }}>ไปที่ไหนดีสำหรับ {lockedDays} วัน?</div>
        <div style={{ fontSize: 13, color: C.gray, marginTop: 4 }}>แนะนำตามช่วงเวลา · จำนวนวัน · กลุ่ม {MEMBERS.length} คน</div>
      </div>

      {/* Destination cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {DESTINATIONS.map(dest => {
          const isSelected = picked === dest.id;
          const pillTextColor = dest.pillColor === C.sky ? "#1A5F8E" : dest.pillColor === C.matcha ? "#2A5A38" : C.white;
          return (
            <div key={dest.id} onClick={() => setPicked(dest.id)} style={{
              background: C.white, borderRadius: 16, overflow: "hidden",
              border: `2px solid ${isSelected ? C.terra : dest.star ? C.terra + "35" : C.border}`,
              cursor: "pointer", transition: "all 0.15s",
              boxShadow: dest.star ? "0 4px 18px rgba(212,97,74,0.12)" : "0 2px 8px rgba(44,26,14,0.05)",
            }}>
              {dest.star && (
                <div style={{ background: C.terra, padding: "5px 14px", fontSize: 11, fontWeight: 800, color: C.white, letterSpacing: "0.3px" }}>
                  ⭐ แนะนำสำหรับกลุ่มคุณ
                </div>
              )}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>{dest.flag}</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: C.espresso, letterSpacing: "-0.3px" }}>{dest.name}</div>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 10 }}>{dest.sub}</div>

                <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: dest.pillColor + "20", border: `1px solid ${dest.pillColor}50`, fontSize: 11, fontWeight: 700, color: pillTextColor, marginBottom: 12 }}>
                  {dest.pill}
                </div>

                <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.65, marginBottom: 14 }}>{dest.reason}</div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.gray }}>งบต่อคน (ไม่รวมตั๋ว)</div>
                    <div style={{ fontWeight: 900, fontSize: 15, color: C.espresso }}>฿{dest.budget}</div>
                  </div>
                  <button style={{
                    padding: "7px 15px", borderRadius: 20, fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer",
                    background: isSelected ? C.terra : C.espresso, color: C.white,
                    transition: "background 0.15s",
                  }}>
                    {isSelected ? "เลือกแล้ว ✓" : "เลือก"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Proceed CTA */}
      {picked && (
        <div style={{
          marginTop: 16, background: C.terra, borderRadius: 14, padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 4px 20px rgba(212,97,74,0.3)",
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: C.white }}>
              {DESTINATIONS.find(d => d.id === picked)?.flag} เริ่มวางแผน {DESTINATIONS.find(d => d.id === picked)?.name}!
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
              {lockedStart}–{lockedEnd} ธ.ค. · {lockedDays} วัน · {MEMBERS.length} คน → ขั้นต่อไป: ใส่ Wishlist แล้วให้ AI ร่างแพลน
            </div>
          </div>
          <button style={{
            padding: "11px 22px", borderRadius: 24, background: C.white, color: C.terra,
            border: "none", cursor: "pointer", fontSize: 14, fontWeight: 900, whiteSpace: "nowrap",
          }}>
            สร้างทริปนี้ →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [phase,  setPhase]  = useState("calendar");
  const [locked, setLocked] = useState(null); // {start,end,days,members}

  function handleLock(start, end, days, members) {
    setLocked({ start, end, days, members });
    setPhase("dest");
  }

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, 'Noto Sans Thai', sans-serif", background: C.cream, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: C.espresso, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: C.white, letterSpacing: "-0.5px" }}>
            R<span style={{ color: C.terra }}>✳</span>VE
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>/</span>
          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>ทริปใหม่ — หาวันที่ตรงกัน</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {MEMBERS.map(m => (
            <div key={m.id} title={m.name} style={{ width: 28, height: 28, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {m.emoji}
            </div>
          ))}
        </div>
      </div>

      <StepBar phase={phase} />

      {phase === "calendar" && <CalendarPhase onLock={handleLock} />}

      {phase === "dest" && locked && (
        <DestPhase
          lockedStart={locked.start}
          lockedEnd={locked.end}
          lockedDays={locked.days}
          lockedMembers={locked.members}
          onBack={() => setPhase("calendar")}
        />
      )}
    </div>
  );
}
