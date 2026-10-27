'use strict';
/* Zip reader (stored and deflate entries) using node:zlib, for SCORM packages. Rejects unsafe paths. */
const zlib = require('node:zlib');

function unzip(buf, {maxFiles = 50000, maxBytes = 4 * 1024 * 1024 * 1024} = {}) {
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
/* Read imsmanifest.xml the way the SCORM standard describes: the default organization's first item that
   points at a resource, then that resource's href, with xml:base on <resources>/<resource> applied.
   Works for SCORM 1.2 and SCORM 2004 (2nd, 3rd and 4th editions), including packages zipped one folder deep. */
/* Accept the ways packages are commonly handed over:
   - the package itself (imsmanifest.xml at the top);
   - the package inside one or more folders (handled by scormLaunch, which finds the manifest at any depth);
   - a zip that contains the package's .zip (it is unpacked from inside).
   A zip holding several packages is refused with their names, so each can be uploaded as its own activity. */
function resolvePackage(files, depth = 0) {
  const manifests = files.filter(f => /(^|\/)imsmanifest\.xml$/i.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name));
  if (manifests.length > 1) {
    const roots = [...new Set(manifests.map(m => m.name.slice(0, m.name.lastIndexOf('/') + 1)))];
    const nested = roots.filter(r => roots.some(o => o !== r && r.startsWith(o)));
    if (roots.length - nested.length > 1) throw new Error(`This zip holds ${roots.length - nested.length} SCORM packages (${roots.filter(r => !nested.includes(r)).map(r => r.replace(/\/$/, '') || 'top level').join(', ')}). Upload each one as its own SCORM activity.`);
  }
  if (manifests.length || depth > 1) return files;
  const inner = files.filter(f => /\.zip$/i.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name));
  for (const z of inner) { let sub; try { sub = unzip(z.data); } catch (e) { continue; } if (sub.some(f => /(^|\/)imsmanifest\.xml$/i.test(f.name))) { if (inner.length > 1) { const pk = inner.filter(x => { try { return unzip(x.data).some(f => /(^|\/)imsmanifest\.xml$/i.test(f.name)); } catch (e) { return false; } }); if (pk.length > 1) throw new Error(`This zip holds ${pk.length} SCORM packages (${pk.map(x => x.name).join(', ')}). Upload each one as its own SCORM activity.`); } return resolvePackage(sub, depth + 1); } }
  return files;
}
function scormLaunch(files) {
  const mans = files.filter(f => /(^|\/)imsmanifest\.xml$/i.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name)).sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  const man = mans[0]; if (!man) throw new Error('No imsmanifest.xml found. Export the course as a SCORM package (a .zip with imsmanifest.xml), not as a web or video export.');
  const xml = man.data.toString('utf8').replace(/^﻿/, ''); const base = man.name.includes('/') ? man.name.slice(0, man.name.lastIndexOf('/') + 1) : '';
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? (m[2] ?? m[3]) : ''; };
  const resourcesTag = (xml.match(/<(?:\w+:)?resources\b[^>]*>/i) || [''])[0], resBase = attr(resourcesTag, 'xml:base');
  const resources = [...xml.matchAll(/<(?:\w+:)?resource\b[^>]*>/gi)].map(m => ({tag:m[0], id:attr(m[0], 'identifier'), href:attr(m[0], 'href'), base:attr(m[0], 'xml:base'), type:attr(m[0], 'adlcp:scormtype') || attr(m[0], 'adlcp:scormType') || attr(m[0], 'scormtype')}));
  // The default organization's first item that refers to a resource
  const orgsTag = (xml.match(/<(?:\w+:)?organizations\b[^>]*>/i) || [''])[0], def = attr(orgsTag, 'default');
  const orgs = [...xml.matchAll(/<(?:\w+:)?organization\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?organization>/gi)];
  const org = orgs.find(o => def && attr('<x ' + o[1] + '>', 'identifier') === def) || orgs[0];
  const refs = org ? [...org[2].matchAll(/<(?:\w+:)?item\b[^>]*>/gi)].map(m => ({ref:attr(m[0], 'identifierref'), params:attr(m[0], 'parameters')})).filter(x => x.ref) : [];
  let res = null, params = '';
  for (const r of refs) { const x = resources.find(y => y.id === r.ref && y.href); if (x) { res = x; params = r.params; break; } }
  res ||= resources.find(r => /^sco$/i.test(r.type) && r.href) || resources.find(r => r.href);
  if (!res) throw new Error('The manifest does not name a launch file.');
  const join = (...parts) => parts.filter(Boolean).map(x => x.replace(/^\.\//, '')).join('').replace(/\/{2,}/g, '/');
  const [hrefPath, hrefQuery = ''] = res.href.split('?');
  const launchPath = join(base, resBase && !/\/$/.test(resBase) ? resBase + '/' : resBase, res.base && !/\/$/.test(res.base) ? res.base + '/' : res.base, hrefPath);
  let query = hrefQuery; if (params) { const p = params.replace(/^[?&]/, ''); query = query ? query + '&' + p : p; }
  const names = new Set(files.map(f => f.name));
  if (!names.has(launchPath)) { const alt = files.find(f => f.name.toLowerCase() === launchPath.toLowerCase()); if (!alt) throw new Error(`The launch file "${launchPath}" named in imsmanifest.xml is not in the package.`); }
  const exact = names.has(launchPath) ? launchPath : files.find(f => f.name.toLowerCase() === launchPath.toLowerCase()).name;
  const schemaVersion = (xml.match(/<(?:\w+:)?schemaversion>\s*([^<]+?)\s*</i) || [])[1] || '';
  const version = /2004|CAM\s*1\.3/i.test(schemaVersion) || /adlcp_v1p3|imscp_v1p1.*adlseq|adlnav/i.test(xml) ? '2004' : '1.2';
  const title = ((org && (org[2].match(/<(?:\w+:)?title>([^<]+)<\/(?:\w+:)?title>/i) || [])[1]) || '').trim();
  return {launch:exact + (query ? '?' + query : ''), title, single:files.length <= 2, version, files:files.length};
}
module.exports = {unzip, scormLaunch, resolvePackage};
