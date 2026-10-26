'use strict';
/* Zip reader (stored and deflate entries) using node:zlib, for SCORM packages. Rejects unsafe paths. */
const zlib = require('node:zlib');

function unzip(buf, {maxFiles = 2000, maxBytes = 300 * 1024 * 1024} = {}) {
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not a zip archive.');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count > maxFiles) throw new Error('The package contains too many files.');
  const out = []; let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The zip archive is damaged.');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8').replace(/\\/g, '/'); p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (name.startsWith('/') || name.split('/').some(s => s === '..') || /^[a-z]:/i.test(name)) throw new Error(`Unsafe path in package: ${name}`);
    const ln = buf.readUInt16LE(loff + 26), lx = buf.readUInt16LE(loff + 28), start = loff + 30 + ln + lx;
    const raw = buf.slice(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, {maxOutputLength:usize + 1024}) : null;
    if (!data) throw new Error(`Unsupported compression in ${name}.`);
    total += data.length; if (total > maxBytes) throw new Error('The package is too large when unpacked.');
    out.push({name, data});
  }
  return out;
}
function scormLaunch(files) {
  const man = files.find(f => /(^|\/)imsmanifest\.xml$/i.test(f.name)); if (!man) throw new Error('No imsmanifest.xml found. Is this a SCORM package?');
  const xml = man.data.toString('utf8'); const base = man.name.includes('/') ? man.name.slice(0, man.name.lastIndexOf('/') + 1) : '';
  const res = [...xml.matchAll(/<resource\b[^>]*>/gi)].map(m => m[0]);
  const sco = res.find(r => /scormtype\s*=\s*"sco"/i.test(r)) || res[0];
  const href = sco && (sco.match(/href\s*=\s*"([^"]+)"/i) || [])[1]; if (!href) throw new Error('The manifest does not name a launch file.');
  const title = (xml.match(/<organization\b[\s\S]*?<title>([^<]+)<\/title>/i) || [])[1] || '';
  return {launch:base + href, title:title.trim(), single:files.length <= 2};
}
module.exports = {unzip, scormLaunch};
