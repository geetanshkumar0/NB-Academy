'use strict';
/* Certificate PDF writer (A4 landscape, standard PDF fonts, no dependencies). */
const W = 842, Hh = 595;
const winAnsi = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/·/g, '-').replace(/₂/g, '2').replace(/[^\x20-\x7e]/g, '?');
const esc = s => winAnsi(s).replace(/[\\()]/g, '\\$&');
// Approximate Helvetica widths for centring (units per 1000)
const widthOf = (s, size, bold) => winAnsi(s).split('').reduce((a, ch) => a + (/[il.,:;'|!]/.test(ch) ? 280 : /[mwMW]/.test(ch) ? 850 : /[A-Z0-9]/.test(ch) ? 670 : ch === ' ' ? 280 : 540), 0) * size / 1000 * (bold ? 1.06 : 1);
const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x0e6175; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(x => x.toFixed(3)).join(' '); };

function certificatePdf(o) {
  const c = [], text = (s, x, y, font, size, rgb = '0.11 0.16 0.19') => c.push(`BT ${rgb} rg /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`);
  const centre = (s, y, font, size, rgb) => text(s, (W - widthOf(s, size, font === 'F2')) / 2, y, font, size, rgb);
  const brand = hexRgb(o.primary), accent = hexRgb(o.accent);
  if (o.template === 'modern') { c.push(`${brand} rg 0 0 ${W} ${Hh} re f`, `1 1 1 rg 30 30 ${W - 60} ${Hh - 60} re f`, `${accent} rg 30 ${Hh - 90} ${W - 60} 6 re f`); }
  else if (o.template === 'minimal') { c.push(`${brand} RG 1 w 40 40 ${W - 80} ${Hh - 80} re S`); }
  else { c.push('0.99 0.99 0.97 rg 0 0 842 595 re f', `${accent} RG 6 w 22 22 ${W - 44} ${Hh - 44} re S`, `${brand} RG 1.2 w 36 36 ${W - 72} ${Hh - 72} re S`); }
  centre(o.site, Hh - 110, 'F2', 16, brand);
  centre('Certificate of Completion', Hh - 165, 'F4', 34, brand);
  centre('This certifies that', Hh - 210, 'F1', 13, '0.35 0.38 0.40');
  centre(o.name, Hh - 262, 'F3', 34);
  c.push(`0.75 0.70 0.58 RG 0.8 w ${W / 2 - 180} ${Hh - 275} m ${W / 2 + 180} ${Hh - 275} l S`);
  centre(o.body || 'has successfully completed', Hh - 305, 'F1', 13, '0.35 0.38 0.40');
  centre(o.course, Hh - 338, 'F2', 20);
  if (o.grade != null) centre(`Final course grade: ${o.grade.toFixed(1)}%`, Hh - 362, 'F1', 11, '0.35 0.38 0.40');
  const y = 120;
  text('Date of issue', 90, y + 16, 'F1', 9, '0.45 0.47 0.49'); text(o.date, 90, y, 'F2', 12);
  if (o.expires) { text('Valid until', 250, y + 16, 'F1', 9, '0.45 0.47 0.49'); text(o.expires, 250, y, 'F2', 12); }
  text('Verification code', 420, y + 16, 'F1', 9, '0.45 0.47 0.49'); text(o.code, 420, y, 'F2', 12);
  if (o.signatureName) { c.push(`0.3 0.3 0.3 RG 0.6 w 600 ${y + 2} m 760 ${y + 2} l S`); text(o.signatureName, 600, y - 14, 'F2', 11); if (o.signatureTitle) text(o.signatureTitle, 600, y - 28, 'F1', 9, '0.45 0.47 0.49'); }
  if (o.verifyUrl) text(`Verify at ${o.verifyUrl}`, 90, 70, 'F1', 9, '0.45 0.47 0.49');
  const stream = c.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${Hh}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
    `<< /Title (${esc('Certificate - ' + o.name)}) /Producer (NB Academy) >>`
  ];
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offs = [];
  objs.forEach((o2, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o2}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o2 => String(o2).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
module.exports = {certificatePdf};
