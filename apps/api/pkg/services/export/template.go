package export

// planTemplate is deliberately one self-contained file: no external CSS, no
// webfont, no image host. An exported plan has to open years later on a phone
// with no signal, which rules out anything that fetches (DEV_SPEC A10.2).
//
// Colours are the §15 brand tokens inlined, since there is no stylesheet to
// import them from.
const planTemplate = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.Title}}</title>
<style>
  :root {
    --ink: #1b1b1f;
    --muted: #6b6b76;
    --line: #e6e4df;
    --paper: #fdfcfa;
    --accent: #d9541f;
    --accent-soft: #fbeee7;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 64px;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Thai", "Helvetica Neue", sans-serif;
    line-height: 1.6;
    font-size: 15px;
  }
  .sheet { max-width: 720px; margin: 0 auto; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 28px; }
  .brand { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h1 { font-size: 28px; margin: 8px 0 4px; line-height: 1.25; }
  .meta { color: var(--muted); font-size: 14px; }
  .summary { background: var(--accent-soft); border-radius: 10px; padding: 14px 16px; margin: 20px 0 28px; }
  .day { margin-bottom: 32px; break-inside: avoid; }
  .day-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-bottom: 14px; }
  .day-date { font-weight: 700; font-size: 17px; }
  .day-theme { color: var(--muted); font-size: 13px; }
  .item { display: grid; grid-template-columns: 62px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px dotted var(--line); break-inside: avoid; }
  .item:last-child { border-bottom: 0; }
  .item-time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; padding-top: 2px; }
  .item-title { font-weight: 600; }
  .item-notes { color: var(--muted); font-size: 14px; margin-top: 2px; }
  .item-sub { color: var(--muted); font-size: 13px; margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap; }
  .cost { color: var(--ink); font-weight: 600; }
  .unverified { color: var(--accent); font-size: 12px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
  @media print {
    body { background: #fff; padding: 0; font-size: 12px; }
    .day { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <div class="brand">{{.BrandName}}</div>
    <h1>{{.Title}}</h1>
    <div class="meta">
      {{.StartDate}}{{if .EndDate}} – {{.EndDate}}{{end}}
      {{if .PartySize}} · {{.PartySize}} คน{{end}}
      {{if .Subtitle}} · {{.Subtitle}}{{end}}
    </div>
  </header>

  {{if .Summary}}<div class="summary">{{.Summary}}</div>{{end}}

  {{range .Days}}
  <section class="day">
    <div class="day-head">
      <span class="day-date">{{.Date}}</span>
      {{if .Title}}<span>{{.Title}}</span>{{end}}
      {{if .Theme}}<span class="day-theme">{{.Theme}}</span>{{end}}
    </div>
    {{range .Items}}
    <div class="item">
      <div class="item-time">{{if .Time}}{{.Time}}{{else}}—{{end}}</div>
      <div>
        <div class="item-title">{{.Title}}{{if not .Verified}} <span class="unverified">ยังไม่ยืนยัน</span>{{end}}</div>
        {{if .Notes}}<div class="item-notes">{{.Notes}}</div>{{end}}
        <div class="item-sub">
          {{if .Travel}}<span>{{.Travel}}</span>{{end}}
          {{if .Cost}}<span class="cost">{{.Cost}}</span>{{end}}
        </div>
      </div>
    </div>
    {{else}}
    <div class="item-notes">ยังไม่มีรายการในวันนี้</div>
    {{end}}
  </section>
  {{end}}

  <footer>
    {{if .TotalLabel}}<div>{{.TotalLabel}}</div>{{end}}
    {{if .FXNote}}<div>{{.FXNote}}</div>{{end}}
    <div>สร้างเมื่อ {{.GeneratedAt}} · {{.BrandName}}</div>
  </footer>
</div>
</body>
</html>
`
