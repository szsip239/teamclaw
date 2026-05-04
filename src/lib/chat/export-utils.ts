import type { ChatMessage } from '@/types/chat'
import { EXPORT_BG_BASE64 } from '@/lib/chat/export-bg'

export const MAX_EXPORT_MESSAGES = 10

interface ExportMeta {
  agentName: string
  instanceName?: string
  labelPng: string
  labelPdf: string
  labelDonePng: string
  labelDonePdf: string
  labelFailed: string
  labelFooter: string
}

// ─── Build export HTML ──────────────────────────────────────────────

export function buildExportHtml(
  messages: ChatMessage[],
  meta: ExportMeta,
): string {
  const messagesHtml = messages.map(renderMessage).join('')
  const agentLabel = escapeAttr(meta.agentName || 'chat')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>TeamClaw Export</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"><\/script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:800px;margin:0 auto;background:linear-gradient(180deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.18) 50%,rgba(255,255,255,0.08) 100%),url(${EXPORT_BG_BASE64}) repeat-y top/100% auto;color:#1a1a2e;padding:32px 24px 16px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
  .hdr{margin-bottom:24px;border-bottom:2px solid rgba(255,255,255,0.25);padding-bottom:16px}
  .hdr h1{font-size:20px;font-weight:700;color:#fff}
  .hdr p{font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px}
  .msgs{display:flex;flex-direction:column;gap:16px;background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 16px rgba(0,0,0,0.08)}
  .ftr{text-align:center;margin-top:20px;font-size:11px;color:rgba(255,255,255,0.7)}
  .u{display:flex;justify-content:flex-end}
  .ui{max-width:75%}
  .lbl{font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px}
  .lblr{text-align:right}
  .att{font-size:11px;color:#374151;background:#f3f4f6;padding:4px 8px;border-radius:6px;margin-bottom:4px;display:inline-block}
  .uimg{max-width:200px;max-height:150px;border-radius:6px;margin-bottom:4px}
  .bub{background:#023262;color:#fff;padding:10px 16px;border-radius:16px 16px 4px 16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
  .a{display:flex;justify-content:flex-start}
  .ai{max-width:95%;min-width:0}
  .txt{font-size:14px;line-height:1.7}
  .txt p{margin:6px 0}
  .txt ul,.txt ol{margin:4px 0;padding-left:20px}
  .txt li{margin:2px 0}
  .txt pre{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;overflow-x:auto;font-size:13px;line-height:1.5;margin:8px 0;white-space:pre-wrap}
  .txt pre code{background:none;padding:0;font-family:monospace}
  .txt code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:13px;font-family:monospace}
  .txt blockquote{border-left:3px solid #d1d5db;padding-left:12px;color:#6b7280;margin:8px 0}
  .txt hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
  .txt table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
  .txt th,.txt td{border:1px solid #d1d5db;padding:6px 10px;text-align:left}
  .txt th{background:#f3f4f6;font-weight:600}
  .txt strong{font-weight:600}
  .txt em{font-style:italic}
  .txt h2{font-size:17px;font-weight:700;margin:12px 0 4px}
  .txt h3{font-size:15px;font-weight:700;margin:10px 0 4px}
  .txt h4,.txt h5,.txt h6{font-size:14px;font-weight:600;margin:8px 0 2px}
  .txt a{color:#2563eb;text-decoration:underline}
  .pre-lang{font-size:10px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:4px 4px 0 0;display:inline-block}
  .echart-box{height:360px;margin:8px 0;border:1px solid #e5e7eb;border-radius:6px}
  .mermaid-box{display:flex;align-items:center;justify-content:center;height:120px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:8px 0;color:#9ca3af;font-size:13px}
  .btns{display:flex;gap:10px;justify-content:flex-end;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid rgba(255,255,255,0.25)}
  .btns button{display:inline-flex;align-items:center;gap:6px;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:system-ui,sans-serif;transition:filter 0.15s}
  .btns button:hover{filter:brightness(1.12)}
  .btns .btn-png{background:linear-gradient(135deg,#1e40af,#3b82f6)}
  .btns .btn-pdf{background:linear-gradient(135deg,#b91c1c,#ef4444)}
  .btns svg{width:16px;height:16px;flex-shrink:0}
  #dl-msg{margin-bottom:16px;font-size:12px;color:rgba(255,255,255,0.7);text-align:center}
</style>
</head>
<body>
<div class="hdr"><h1>@TeamClaw</h1><p>${escapeHtml(meta.agentName)}${meta.instanceName ? ` · ${escapeHtml(meta.instanceName)}` : ''} · ${new Date().toLocaleString()}</p></div>
<div class="btns">
  <button class="btn-png" onclick="downloadPNG()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    ${escapeHtml(meta.labelPng)}
  </button>
  <button class="btn-pdf" onclick="downloadPDF()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    ${escapeHtml(meta.labelPdf)}
  </button>
</div>
<div id="dl-msg"></div>
<div class="msgs">${messagesHtml}</div>
<div class="ftr">${escapeHtml(meta.labelFooter)}</div>
<script>
// Render ECharts
(function(){
  var boxes = document.querySelectorAll('.echart-box');
  for(var i=0;i<boxes.length;i++){
    try{
      var dataEl = boxes[i].previousElementSibling;
      var opt = JSON.parse(dataEl.textContent);
      echarts.init(boxes[i]).setOption(opt);
    }catch(e){}
  }
})();

function downloadPNG(){
  var btns = document.querySelector('.btns');
  var msg = document.getElementById('dl-msg');
  btns.style.display = 'none';
  msg.textContent = '';
  msg.style.display = 'none';
  html2canvas(document.body, {
    backgroundColor: null,
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false
  }).then(function(canvas){
    canvas.toBlob(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.download = '${agentLabel}-export.png';
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      btns.style.display = '';
      msg.style.display = '';
      msg.textContent = '${escapeAttr(meta.labelDonePng)}';
    }, 'image/png');
  }).catch(function(e){
    btns.style.display = '';
    msg.style.display = '';
    msg.textContent = '${escapeAttr(meta.labelFailed)} ' + e.message;
  });
}

function downloadPDF(){
  var btns = document.querySelector('.btns');
  var msg = document.getElementById('dl-msg');
  btns.style.display = 'none';
  msg.textContent = '';
  msg.style.display = 'none';

  // Override dark-bg styles for white-background PDF readability
  var pdfStyle = document.createElement('style');
  pdfStyle.id = 'pdf-override';
  pdfStyle.textContent = 'body{background:#fff!important} .msgs{background:#fff!important;box-shadow:none!important;border-radius:0!important} .hdr h1{color:#023262!important} .hdr p{color:#6b7280!important} .ftr{color:#6b7280!important} .btns{border-bottom-color:#e5e7eb!important} .hdr{border-bottom-color:#e5e7eb!important} #dl-msg{color:#6b7280!important}';
  document.head.appendChild(pdfStyle);

  var SCALE = 1.5;
  html2canvas(document.body, {
    backgroundColor: '#ffffff',
    scale: SCALE,
    useCORS: true,
    allowTaint: true,
    logging: false
  }).then(function(canvas){
    var bodyTop = document.body.getBoundingClientRect().top;

    // Collect Y break points from message containers and block elements
    var raw = [];
    document.querySelectorAll('.msgs > div').forEach(function(el){
      raw.push(el.getBoundingClientRect().top - bodyTop);
    });
    document.querySelectorAll('.txt table, .txt pre, .txt hr, .txt h2, .txt h3, .txt h4, .echart-box, .mermaid-box').forEach(function(el){
      raw.push(el.getBoundingClientRect().top - bodyTop);
    });
    raw.sort(function(a,b){ return a-b; });
    // Deduplicate within 8px and scale
    var breaks = [];
    for(var i=0;i<raw.length;i++){
      var y = Math.round(raw[i] * SCALE);
      if(breaks.length===0 || y - breaks[breaks.length-1] > 8) breaks.push(y);
    }

    var pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
    var pw = pdf.internal.pageSize.getWidth();
    var ph = pdf.internal.pageSize.getHeight();
    var MARGIN = 10; // mm
    var mw = pw - 2 * MARGIN;
    var mh = ph - 2 * MARGIN;
    var canvasW = canvas.width;
    var canvasH = canvas.height;
    var pxPerMm = canvasW / mw;
    var pageCanvasH = mh * pxPerMm;

    var pos = 0;
    var firstPage = true;
    while(pos < canvasH){
      if(!firstPage) pdf.addPage();
      firstPage = false;

      var remaining = canvasH - pos;
      var end = pos + pageCanvasH;
      var cut;

      if(remaining <= pageCanvasH){
        // Last page — use exact remaining height
        cut = canvasH;
      } else {
        // Find the break closest to end (fills page the most)
        cut = end;
        for(var i=breaks.length-1; i>=0; i--){
          if(breaks[i] > pos && breaks[i] < end){
            cut = breaks[i];
            break;
          }
        }
        // If the best break leaves >25% of page empty,
        // split mid-content rather than waste that much space
        if(cut - pos < pageCanvasH * 0.75) cut = end;
      }

      var sliceH = Math.min(cut - pos, canvasH - pos);
      var pdfH = sliceH / pxPerMm;

      // Draw slice into temp canvas (JPEG avoids transparent edges)
      var sc = document.createElement('canvas');
      sc.width = canvasW;
      sc.height = Math.ceil(sliceH);
      var ctx = sc.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sc.width, sc.height);
      ctx.drawImage(canvas, 0, pos, canvasW, sliceH, 0, 0, canvasW, sliceH);

      pdf.addImage(sc.toDataURL('image/jpeg', 0.88), 'JPEG', MARGIN, MARGIN, mw, pdfH);
      pos = cut;
    }

    pdf.save('${agentLabel}-export.pdf');
    msg.textContent = '${escapeAttr(meta.labelDonePdf)}';
  }).catch(function(e){
    msg.textContent = '${escapeAttr(meta.labelFailed)} ' + e.message;
  }).finally(function(){
    var s = document.getElementById('pdf-override');
    if(s) s.remove();
    btns.style.display = '';
    msg.style.display = '';
  });
}
<\/script>
</body>
</html>`
}

function renderMessage(msg: ChatMessage): string {
  if (msg.role === 'user') {
    let h = '<div class="u"><div class="ui">'
    h += '<div class="lbl lblr">You</div>'
    if (msg.attachments?.length) {
      for (const att of msg.attachments) h += `<div class="att">📎 ${escapeHtml(att.name)}</div>`
    }
    const imgs = msg.contentBlocks?.filter((b) => b.type === 'image' && b.imageUrl) ?? []
    for (const img of imgs) h += `<img class="uimg" src="${escapeAttr(img.imageUrl!)}" alt="${escapeAttr(img.alt ?? '')}">`
    if (msg.content && msg.content !== '__attachment_only__') h += `<div class="bub">${escapeHtml(msg.content)}</div>`
    return h + '</div></div>'
  }
  let h = '<div class="a"><div class="ai">'
  h += '<div class="lbl">Assistant</div>'
  if (msg.content) {
    try { h += `<div class="txt">${renderMarkdown(msg.content)}</div>` }
    catch(e) { h += `<div class="txt"><p>${escapeHtml(String(msg.content))}</p></div>` }
  }
  for (const block of msg.contentBlocks ?? []) {
    if (block.type === 'image' && block.imageUrl) h += `<img src="${escapeAttr(block.imageUrl)}" alt="${escapeAttr(block.alt ?? '')}" style="max-width:100%;border-radius:8px;margin-top:8px">`
  }
  return h + '</div></div>'
}

// ─── Markdown → HTML ────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  if (typeof md !== 'string') return ''
  try {
  const fences: { placeholder: string; replacement: string }[] = []

  let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const clean = escapeHtml(code.trimEnd())
    const id = fences.length

    if (lang === 'echarts') {
      let replacement: string
      try {
        JSON.parse(code.trimEnd())
        replacement = `<script type="application/json" class="echart-data">${code.trimEnd()}<\/script><div class="echart-box"></div>`
      } catch {
        replacement = `<div class="pre-lang">echarts</div><pre><code>${clean}</code></pre>`
      }
      fences.push({ placeholder: `\x00F${id}\x00`, replacement })
      return `\x00F${id}\x00`
    }

    if (lang === 'mermaid') {
      fences.push({ placeholder: `\x00F${id}\x00`, replacement: `<div class="mermaid-box">📐 Diagram</div>` })
      return `\x00F${id}\x00`
    }

    const langLabel = lang ? `<div class="pre-lang">${escapeHtml(lang)}</div>` : ''
    fences.push({ placeholder: `\x00F${id}\x00`, replacement: `${langLabel}<pre><code>${clean}</code></pre>` })
    return `\x00F${id}\x00`
  })

  html = escapeHtml(html)

  // Tables (GFM)
  html = html.replace(/\n(\|.+\|)\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g, (_m, headerStr, bodyStr) => {
    const headers = headerStr.split('|').map((c: string) => c.trim()).filter(Boolean)
    const rows = bodyStr.trim().split('\n')
    let table = '<table><thead><tr>'
    for (const h of headers) table += `<th>${h}</th>`
    table += '</tr></thead><tbody>'
    for (const row of rows) {
      table += '<tr>'
      const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean)
      for (const cell of cells) table += `<td>${cell}</td>`
      table += '</tr>'
    }
    table += '</tbody></table>'
    return '\n' + table + '\n'
  })

  // Block-level elements (line-by-line)
  const lines = html.split('\n')
  const out: string[] = []
  let inUl = false, inOl = false, inBlockquote = false

  function closeBlocks() {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false }
    if (inOl) { out.push('</ol>'); inOl = false }
    if (inUl) { out.push('</ul>'); inUl = false }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const hMatch = line.match(/^(#{1,4}) (.+)$/)
    if (hMatch) {
      closeBlocks()
      out.push(`<h${Math.min(hMatch[1].length + 1, 6)}>${hMatch[2]}</h${Math.min(hMatch[1].length + 1, 6)}>`)
      continue
    }

    if (/^---$/.test(line.trim())) { closeBlocks(); out.push('<hr>'); continue }

    const bqMatch = line.match(/^&gt; (.+)$/)
    if (bqMatch) {
      if (!inBlockquote) { closeBlocks(); out.push('<blockquote>'); inBlockquote = true }
      out.push(`<p>${bqMatch[1]}</p>`)
      continue
    } else if (inBlockquote) { closeBlocks() }

    const ulMatch = line.match(/^- (.+)$/)
    if (ulMatch) {
      if (!inUl) { closeBlocks(); out.push('<ul>'); inUl = true }
      out.push(`<li>${ulMatch[1]}</li>`)
      continue
    } else if (inUl) { closeBlocks() }

    const olMatch = line.match(/^\d+\. (.+)$/)
    if (olMatch) {
      if (!inOl) { closeBlocks(); out.push('<ol>'); inOl = true }
      out.push(`<li>${olMatch[1]}</li>`)
      continue
    } else if (inOl) { closeBlocks() }

    if (line.trim() === '') { closeBlocks(); continue }

    if (/^<[a-z]/.test(line) || /^\x00F\d+\x00$/.test(line)) {
      out.push(line)
      continue
    }

    out.push(`<p>${line}</p>`)
  }
  closeBlocks()

  html = out.join('\n')

  // Inline formatting
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Restore fenced code blocks
  for (const f of fences) {
    html = html.replace(f.placeholder, f.replacement)
  }

  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/\n{3,}/g, '\n\n')

  return html
  } catch { return '' }
}

// ─── Helpers ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
