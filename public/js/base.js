/* NB Academy front end · base: utilities, backends, state, branding, role switcher, rendering shell */
'use strict';
const C = NBCore;
const D = 864e5;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const now = () => Date.now();
const fmtDate = t => t ? new Date(t).toLocaleString('en-IN', {weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit'}) : '–';
const fmtDay = t => new Date(t).toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const fmtDateOnly = t => t ? new Date(t).toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'}) : '–';
const fmtShort = t => t ? new Date(t).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '–';
const fmtTime = t => new Date(t).toLocaleTimeString('en-IN', {hour:'numeric', minute:'2-digit'});
const fmtG = v => v == null ? '–' : (Math.round(v * 100) / 100).toFixed(2);
const fmtPct = v => v == null ? '–' : `${Math.round(v)}%`;
const fmtH = v => v == null ? '–' : v < 1 ? `${Math.round(v * 60)} min` : `${v.toFixed(1)} h`;
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const toInput = t => { if (!t) return ''; const d = new Date(t); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const toDateInput = t => toInput(t).slice(0, 10);
const fromInput = s => s ? new Date(s).getTime() : null;
function ago(t) { if (!t) return 'never'; const s = (now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; if (s < 86400 * 45) return `${Math.floor(s / 86400)} days ago`; return fmtShort(t); }
function dur(ms) {
  ms = Math.abs(ms); const d = Math.floor(ms / D), h = Math.floor(ms % D / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} hour${h > 1 ? 's' : ''}` : ''}`;
  if (h) return `${h} hour${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}`;
  return `${m || 1} min`;
}
function hash(s) { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }
function inline(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function md(src) {
  const L = esc(src || '').split(/\r?\n/); let html = '', list = null, para = [];
  const fp = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const fl = () => { if (list) { html += `<${list.t}>` + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + `</${list.t}>`; list = null; } };
  for (const raw of L) {
    const l = raw.trim(); let m;
    if (!l) { fp(); fl(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { fp(); fl(); const n = m[1].length + 2; html += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
    if ((m = l.match(/^[-*]\s+(.*)/))) { fp(); if (!list || list.t !== 'ul') { fl(); list = {t:'ul', items:[]}; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)/))) { fp(); if (!list || list.t !== 'ol') { fl(); list = {t:'ol', items:[]}; } list.items.push(m[1]); continue; }
    fl(); para.push(l);
  }
  fp(); fl(); return html;
}

/* ---------- Icons ---------- */
const SVG = {
  page:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  url:'<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 10v7M9.5 14.5 12 17l2.5-2.5"/>',
  assign:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 12l2 2 4-4M9 17h6"/>',
  quiz:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.01"/>',
  forum:'<path d="M4 5h12v9H8l-4 3z"/><path d="M16 9h4v9l-3-2h-7v-2"/>',
  label:'<path d="M5 6h14M5 12h14M5 18h9"/>',
  workshop:'<circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/><path d="M11 7h4a3 3 0 0 1 3 3v2M13 17H9a3 3 0 0 1-3-3v-2"/>',
  lesson:'<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/><path d="M10 7.5h4.5a2 2 0 0 1 2 2V13"/>',
  glossary:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  choice:'<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  certificate:'<rect x="3" y="4" width="18" height="12" rx="2"/><circle cx="12" cy="17" r="3"/><path d="M10.5 19.5 10 22l2-1 2 1-.5-2.5M7 8h10M7 11h5"/>',
  video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2"/><path d="m8.5 9.5 4 2.5-4 2.5z"/>',
  scorm:'<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5M3 8v10"/>',
  live:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M3.5 5.5a10 10 0 0 0 0 7M20.5 5.5a10 10 0 0 1 0 7"/>',
  feedback:'<path d="M4 5h16v11H9l-5 4z"/><path d="m9 10 1.5 1.5L15 8"/>',
  bell:'<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
const icon = (type, size = '') => `<span class="ic ${size} p-${C.TYPES[type]?.p || 'other'}" aria-hidden="true"><svg viewBox="0 0 24 24">${SVG[type] || SVG.label}</svg></span>`;
const lockIcon = () => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;vertical-align:-3px">${SVG.lock}</svg>`;
const DEFAULT_LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><path d="M7 23V9l7 9V9M18 9h4.5a3 3 0 0 1 0 6H18zm0 6h5a3.2 3.2 0 0 1 0 6.5h-5z" fill="none" stroke="var(--nav)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function logoHTML(size) {
  const b = (S?.site || window.__site || {}).branding || {};
  const st = size ? ` style="width:${size}px;height:${size}px"` : '';
  if (b.logo) { const src = B.server ? '/api/logo' : (S && fileOf(b.logo) ? B.fileUrl(fileOf(b.logo)) : ''); if (src) return `<img class="logo" src="${esc(src)}" alt=""${st}>`; }
  return size ? DEFAULT_LOGO.replace('class="logo"', `class="logo"${st}`) : DEFAULT_LOGO;
}
let LOGO = DEFAULT_LOGO;
function medal(b, size = '') {
  const col = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#0e6175';
  const ini = esc((b.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  return `<svg class="medal ${size}" viewBox="0 0 84 96" role="img" aria-label="${esc(b.name)} badge"><path d="M28 60 18 94l14-8 10 10 4-30zM56 60l10 34-14-8-10 10-4-30z" fill="${col}" opacity=".55"/><circle cx="42" cy="40" r="34" fill="${col}"/><circle cx="42" cy="40" r="27" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 4"/><text x="42" y="48" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#fff">${ini}</text></svg>`;
}

/* ---------- Backends ---------- */
const SERVER = document.querySelector('meta[name="nb-mode"]')?.content === 'server';
class ApiError extends Error { constructor(m, s) { super(m); this.status = s; } }
const ServerBackend = {
  server:true,
  async req(method, url, body, headers = {}) {
    const r = await fetch(url, {method, credentials:'same-origin', headers:{'X-NB-Request':'1', ...(body && !(body instanceof Blob) ? {'Content-Type':'application/json'} : {}), ...headers}, body:body instanceof Blob ? body : body ? JSON.stringify(body) : undefined});
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok && r.status === 413 && !data.error) throw new ApiError('This file is larger than the web server in front of NB Academy allows. Ask whoever runs the server to raise the upload limit (for nginx: client_max_body_size 1g;) and try again.', 413);
    if (!r.ok && (r.status === 502 || r.status === 504) && !data.error) throw new ApiError('The server took too long to answer. For large uploads, ask whoever runs the server to raise the proxy timeouts (for nginx: proxy_read_timeout and client_body_timeout 600s;).', r.status);
    if (!r.ok) throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
    return data;
  },
  async init() { return (await this.req('GET', '/api/state')).state; },
  async login(username, password) { return this.req('POST', '/api/login', {username, password}); },
  async loginMfa(ticket, code) { return this.req('POST', '/api/login/mfa', {ticket, code}); },
  async logout() { await this.req('POST', '/api/logout', {}); },
  async op(name, payload) { return this.req('POST', '/api/op', {op:name, payload}); },
  async loginAs(id) { return (await this.req('POST', '/api/loginas', {id})).state; },
  async upload(file) { return this.req('POST', '/api/upload?name=' + encodeURIComponent(file.name), file, {'Content-Type':file.type || 'application/octet-stream'}); },
  async forgot(login) { return this.req('POST', '/api/forgot', {login}); },
  async tokenInfo(t) { return this.req('GET', '/api/token?t=' + encodeURIComponent(t)); },
  async tokenPassword(token, password) { return this.req('POST', '/api/token-password', {token, password}); },
  async testEmail(to) { return this.req('POST', '/api/admin/test-email', {to}); },
  async testLdap(username, password) { return this.req('POST', '/api/admin/test-ldap', {username, password}); },
  fileUrl: (f, dl) => `/files/${f.id}/${encodeURIComponent(f.name)}${dl ? '?dl=1' : ''}`,
  backupUrl: (cid, users) => `/api/backup/${cid}${users ? '?users=1' : ''}`,
  certPdfUrl: code => `/cert/${code}.pdf`,
  scormUrl: m => { const [p, q] = (m.launch || 'index.html').split('?'); return `/scorm/${m.id}/${p.split('/').map(encodeURIComponent).join('/')}${q ? '?' + q : ''}`; },
  async fileText(f) { const r = await fetch(this.fileUrl(f)); return r.text(); }
};
const LocalBackend = (() => {
  const KEY = 'nbacademy.v3', FKEY = 'nbacademy.v3.files', SKEY = 'nbacademy.v3.session';
  let id = 0; const env = {now:Date.now, uid:p => (p || 'x') + Date.now().toString(36).slice(-4) + (++id).toString(36) + Math.random().toString(36).slice(2, 6), hash:pw => ({password:pw}), verify:(u, pw) => u.password === pw};
  let DB = null, FILES = {}, SID = null, ticket = null;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  function fresh() {
    const s = C.seed(env); DB = s.state; FILES = {};
    for (const [fid, x] of Object.entries(s.files)) { const f = DB.files.find(y => y.id === fid); FILES[fid] = typeof x === 'string' ? `data:${f?.type || 'text/plain'};charset=utf-8,` + encodeURIComponent(x) : `data:${x.type};base64,${x.base64}`; }
    C.tick(DB, env); persist();
  }
  function persist() { set(KEY, JSON.stringify(DB)); set(FKEY, JSON.stringify(FILES)); if (SID) set(SKEY, SID); else del(SKEY); }
  const view = () => SID ? C.view(DB, SID) : null;
  return {
    server:false, env,
    async init() {
      if (!DB) {
        try { const raw = get(KEY); DB = raw ? JSON.parse(raw) : null; FILES = JSON.parse(get(FKEY) || '{}'); } catch (e) { DB = null; }
        if (!DB || DB.version !== C.VERSION) fresh();
        SID = get(SKEY); if (SID && !DB.users.some(u => u.id === SID)) SID = null;
      }
      if (C.tick(DB, env)) persist();
      return view();
    },
    async login(username, password) {
      const r = C.login(DB, username, password, env); persist();
      if (!r.user) throw new ApiError(r.error + (DB.site.demo && !r.locked ? ' Demo accounts use the password "demo".' : ''), 401);
      if (r.user.mfaEnabled) { ticket = r.user.id; return {mfa:true, ticket:'local'}; }
      SID = r.user.id; persist(); return {state:view()};
    },
    async loginMfa(t, code) { const u = DB.users.find(x => x.id === ticket); if (!u || !C.verifyTotp(u.mfaSecret, code, Date.now())) throw new ApiError('That code is not correct. Use the newest code from your authenticator app.', 401); SID = u.id; ticket = null; persist(); return {state:view()}; },
    async logout() { SID = null; persist(); },
    async op(name, payload) {
      const snap = JSON.stringify(DB);
      try { const result = C.run(DB, SID, name, C.clone(payload ?? {}), env); persist(); return {result:result == null ? null : C.clone(result), state:view()}; }
      catch (e) { DB = JSON.parse(snap); throw new ApiError(e.message, e.status || 500); }
    },
    async loginAs(uid) { await this.op('loginAsCheck', {id:uid}); C._.audit(DB, env, SID, 'Logged in as another user', DB.users.find(u => u.id === uid).username); SID = uid; persist(); return view(); },
    async upload(file) {
      if (file.size > 3 * 1048576) throw new ApiError('In the preview, files are limited to 3 MB. The server edition accepts up to 1 GB.', 413);
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new ApiError('Could not read the file.', 400)); r.readAsDataURL(file); });
      const fid = 'f_' + Math.random().toString(36).slice(2, 12);
      FILES[fid] = url;
      const out = await this.op('registerFile', {id:fid, name:file.name, type:file.type || 'application/octet-stream', size:file.size});
      if (/zip/.test(file.type) || /\.zip$/i.test(file.name)) { try { const launch = await previewScormLaunch(url); if (launch) { const lid = fid + '_launch'; FILES[lid] = launch.html; DB.files.push({id:lid, name:launch.name, type:'text/html', size:launch.html.length, owner:SID, time:Date.now()}); out.result.launchFileId = lid; out.result.launch = launch.name; out.state = view(); } } catch (e) {} }
      if (!set(FKEY, JSON.stringify(FILES))) toast('Browser storage is full, so this file is only kept until you reload.');
      return out;
    },
    async forgot(login) { const q = String(login || '').trim().toLowerCase(); const u = DB.users.find(x => C.sameName(x.username, q) || C.sameName(x.email, q)); if (u) { const tok = C._.makeToken(DB, env, u.id, 'reset', 2 * 3600e3); C._.notifyT(DB, env, 'passwordReset', u.id, {link:C.linkTo(DB, 'setpassword', tok)}); persist(); } return {ok:true}; },
    async tokenInfo(t) { const x = C._.useToken(DB, env, t, false); const u = x && DB.users.find(y => y.id === x.userId); return u ? {valid:true, name:u.firstname, username:u.username} : {valid:false}; },
    async tokenPassword(token, password) { const x = C._.useToken(DB, env, token, false); if (!x) throw new ApiError('This link has expired or was already used.', 400); try { C._.checkPassword(DB, password); } catch (e) { throw new ApiError(e.message, 400); } const u = DB.users.find(y => y.id === x.userId); u.password = password; u.mustChangePassword = false; C._.useToken(DB, env, token, true); persist(); return {ok:true, username:u.username}; },
    async testEmail() { throw new ApiError('The preview cannot send email. Use the server edition to test SMTP.', 400); },
    async testLdap() { throw new ApiError('The preview cannot reach a directory server. Use the server edition to test LDAP.', 400); },
    fileUrl: f => FILES[f.id] || '#',
    backupUrl: () => null, certPdfUrl: () => null,
    scormUrl: () => null,
    fileData: id => FILES[id],
    async fileText(f) { const u = FILES[f.id] || ''; const i = u.indexOf(','); if (i < 0) return ''; const meta = u.slice(0, i); const data = u.slice(i + 1); return meta.includes('base64') ? decodeURIComponent(escape(atob(data))) : decodeURIComponent(data); },
    reset() { fresh(); const un = SID && DB.users.find(u => u.id === SID); SID = un ? SID : null; persist(); return view(); },
    outboxLink(m) { const x = /\?go=setpassword&id=([\w-]+)/.exec(m.body || ''); return x ? x[1] : null; }
  };
})();
/* Preview only: read a zip in the browser and return the launch HTML of a single-file SCORM package */
async function previewScormLaunch(dataUrl) {
  if (typeof DecompressionStream === 'undefined') return null;
  const buf = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0)); const dv = new DataView(buf.buffer);
  let eo = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; } if (eo < 0) return null;
  let p = dv.getUint32(eo + 16, true); const n = dv.getUint16(eo + 10, true), files = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const st = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = buf.slice(st, st + cs);
    files[name] = method === 0 ? raw : method === 8 ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : null;
  }
  const man = Object.keys(files).find(x => /imsmanifest\.xml$/i.test(x)); if (!man) return null;
  const href = (new TextDecoder().decode(files[man]).match(/<resource\b[^>]*href\s*=\s*"([^"]+)"/i) || [])[1]; if (!href || !files[href]) return null;
  return {name:href, html:'data:text/html;charset=utf-8,' + encodeURIComponent(new TextDecoder().decode(files[href]))};
}
const B = SERVER ? ServerBackend : LocalBackend;

/* ---------- State ---------- */
let S = null, h = null;
const ui = {editing:false, view:{name:'dashboard', p:{}}, cal:null, attempt:null, timer:null, confirmFn:null, loginErr:'', replyTo:null, lesson:null, msgWith:null, gloss:{letter:'', q:''}, grp:'', csv:null, upload:{}, saveT:null,
  mode:null, mfaTicket:null, loginView:'login', token:null, lastActive:Date.now(), team:{cohort:'', filter:'all', course:''}, ana:{group:'company', company:'', department:'', course:''}};
function setState(st) { S = st; h = S ? C.H(S, S.me) : null; if (S) { applyBranding(); applyPrefs(); LOGO = logoHTML(); } }
const FAIL = Symbol('fail');
async function act(name, payload, okMsg, opts = {}) {
  try {
    const r = await B.op(name, payload);
    if (r.state) setState(r.state); if (!opts.silent) render(); if (okMsg) toast(okMsg);
    return r.result;
  } catch (e) {
    if (e.status === 401) { setState(null); ui.loginErr = e.message; render(); return FAIL; }
    if (e.status === 428) { try { setState(await B.init()); render(); } catch (x) {} toast(e.message, true); return FAIL; }
    if (opts.errEl) { const el = document.getElementById(opts.errEl); if (el) { el.textContent = e.message; el.hidden = false; return FAIL; } }
    toast(e.message, true); return FAIL;
  }
}

/* ---------- Branding and accessibility ---------- */
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function applyBranding() {
  const b = (S?.site || window.__site || {}).branding; let st = document.getElementById('brandcss');
  if (!b || (b.primary === '#0e6175' && b.accent === '#d2831a')) { if (st) st.textContent = ''; return; }
  if (!st) { st = document.createElement('style'); st.id = 'brandcss'; document.head.appendChild(st); }
  const p = b.primary, a = b.accent;
  st.textContent = `:root{--brand:${p};--brand-soft:${shade(p, .86)};--nav:${shade(p, -.45)};--nav-hover:${shade(p, -.3)};--accent:${a};--accent-soft:${shade(a, .85)}}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--brand:${shade(p, .45)};--brand-soft:${shade(p, -.6)};--nav:${shade(p, -.72)};--nav-hover:${shade(p, -.6)};--accent:${shade(a, .2)}}}
  :root[data-theme="dark"]{--brand:${shade(p, .45)};--brand-soft:${shade(p, -.6)};--nav:${shade(p, -.72)};--nav-hover:${shade(p, -.6)};--accent:${shade(a, .2)}}`;
}
function applyPrefs() {
  const pr = h?.me()?.prefs || {}; const r = document.documentElement;
  r.classList.toggle('hc', !!pr.contrast); r.classList.toggle('rm', !!pr.motion);
  r.style.fontSize = pr.text && pr.text !== '100' ? `${pr.text}%` : '';
}

/* ---------- Helper shortcuts ---------- */
const me = () => h.me();
const fullname = u => h.fullname(u);
const initials = u => u ? ((u.firstname || '?')[0] + ((u.lastname || '')[0] || '')).toUpperCase() : '?';
const avatar = (u, size = 34) => `<span class="avatar" style="width:${size}px;height:${size}px;background:hsl(${hash(u?.id) % 360} 45% 38%)">${esc(initials(u))}</span>`;
const fileOf = id => S.files.find(f => f.id === id);
const roleName = id => h.role(id)?.name || id;
const siteAdminCaps = ['site:config', 'user:manage', 'user:upload', 'role:manage', 'course:create', 'backup:restore', 'site:viewlogs', 'cohort:manage', 'path:manage', 'qbank:manage', 'audit:view'];
const canSiteAdmin = () => siteAdminCaps.some(c => h.has(c));
const isEditorAnywhere = () => h.isAdmin() || h.has('course:manageactivities') || S.enrol.some(e => e.userId === S.me && h.role(e.role)?.caps?.['course:manageactivities']);
const STATUS = {notstarted:['Not started', ''], inprogress:['In progress', 'brand'], completed:['Completed', 'ok'], overdue:['Overdue · locked', 'bad']};
/* Where "Resume" should take a learner: the last activity if unfinished, otherwise the next unfinished one that is unlocked */
function resumeTarget(cid) {
  const e = h.enrolOf(cid); const last = e?.lastMod && S.mods[e.lastMod];
  if (last && h.trackable(last) && !h.isDone(last, S.me) && !h.modLock(last)) return last;
  return h.courseMods(cid).filter(h.trackable).find(m => !h.isDone(m, S.me) && !h.modLock(m)) || null;
}
const statusChip = st => st ? `<span class="chip ${STATUS[st][1]}">${st === 'overdue' ? lockIcon() + ' ' : ''}${STATUS[st][0]}</span>` : '';

/* ---------- Role switcher (Learner view / workspaces) ---------- */
function modes() {
  const ps = h.personas(), m = [];
  if (ps.includes('learner')) m.push(['learner', 'Learner']);
  if (ps.includes('teamlead')) m.push(['teamlead', 'Team Lead']);
  if (ps.includes('trainer')) m.push(['trainer', 'Trainer']);
  if (ps.includes('admin') || canSiteAdmin() || h.has('analytics:site') || h.has('access:approve')) m.push(['admin', 'Admin']);
  if (!m.length) m.push(['learner', 'Learner']);
  return m;
}
function currentMode() {
  const ms = modes().map(x => x[0]);
  if (!ui.mode || !ms.includes(ui.mode)) { let saved = null; try { saved = localStorage.getItem('nb.mode.' + S.me); } catch (e) {} ui.mode = ms.includes(saved) ? saved : ms[ms.length - 1]; }
  return ui.mode;
}
function setMode(m) { ui.mode = m; try { localStorage.setItem('nb.mode.' + S.me, m); } catch (e) {} if (m !== 'admin' && m !== 'trainer') ui.editing = false; go(homeFor(m)); }
const homeFor = m => ({learner:'dashboard', teamlead:'team', trainer:'trainer', admin:'analytics'}[m] || 'dashboard');

/* ---------- Rendering ---------- */
const app = document.getElementById('app');
const modalEl = document.getElementById('modal');
const VIEWS = {};
function go(name, p = {}) {
  if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
  if (name !== 'attempt') ui.attempt = null;
  if (name !== 'lessonplay') ui.lesson = null;
  ui.view = {name, p}; ui.replyTo = null;
  closeModal(); render(); window.scrollTo(0, 0);
}
function onboardingStep() {
  const u = me(); if (!u) return null;
  if (u.mustChangePassword) return 'password';
  if (C.mfaRequired(S, {...u, admin:u.admin}) && !u.mfaEnabled) return 'mfa';
  if ((u.termsAccepted || 0) < (S.site.terms?.version || 1)) return 'terms';
  if (!u.prefsSet) return 'prefs';
  return null;
}
function render() {
  if (!S) { app.innerHTML = viewLogin(); return; }
  const step = onboardingStep();
  if (step) { app.innerHTML = viewOnboarding(step); return; }
  const V = VIEWS[ui.view.name] || VIEWS.dashboard;
  let body;
  try { body = V(ui.view.p || {}); } catch (e) { console.error(e); body = `<div class="card stack" style="max-width:560px"><h2>Something went wrong showing this page</h2><p class="muted small mono">${esc(e.message)}</p><div><button class="btn" data-go="dashboard">Back to dashboard</button></div></div>`; }
  app.innerHTML = navbar() + `<main class="page" id="main">${body}</main><footer class="foot">${esc(S.site.name)} · ${B.server ? 'Server edition' : 'Preview edition · data is stored in this browser'}</footer>`;
  afterRender();
}
function afterRender() {
  if (ui.view.name === 'attempt' && ui.attempt) { const q = S.mods[ui.attempt.cmid]; if (q?.timelimit && !ui.timer) { tick(); ui.timer = setInterval(tick, 1000); } }
  const qt = document.getElementById('qtype'); if (qt) toggleQFields();
  const tb = document.querySelector('.tbody'); if (tb) tb.scrollTop = tb.scrollHeight;
  if (typeof mountPlayers === 'function') mountPlayers();
}
function navbar() {
  const u = me(), v = ui.view.name, mode = currentMode(), ms = modes();
  const L = {learner:[['dashboard', 'Dashboard'], ['mycourses', 'My learning'], ['home', 'Library'], ['calendar', 'Calendar']],
    teamlead:[['team', 'Team workspace'], ['calendar', 'Calendar']],
    trainer:[['trainer', 'Trainer workspace'], ['mycourses', 'My courses'], ['calendar', 'Calendar']],
    admin:[['analytics', 'Analytics'], ...(h.has('access:approve') ? [['approvals', 'Approvals']] : []), ['home', 'Courses'], ...(canSiteAdmin() ? [['admin', 'Site administration']] : [])]}[mode];
  const pending = h.has('access:approve') ? S.accessRequests.filter(r => r.status === 'pending').length : 0;
  const courseCtx = ['course', 'participants', 'groups', 'grades', 'badges', 'creports', 'csettings', 'mod', 'attempt', 'review', 'discussion', 'grader', 'submit', 'lessonplay', 'wsassess'].includes(v);
  const on = k => (k === v || (k === 'mycourses' && courseCtx && mode !== 'admin') || (k === 'home' && courseCtx && mode === 'admin')) ? 'on' : '';
  const um = h.unreadMessages(), un = h.unreadNotifications();
  const notes = S.notifications.slice().sort((a, b) => b.time - a.time).slice(0, 8);
  return `<header class="nav"><div class="nav-in">
    <button class="brand" data-go="${homeFor(mode)}" aria-label="${esc(S.site.name)} home">${LOGO}<b>${esc(S.site.name)}</b></button>
    <nav class="prim" aria-label="Primary">${L.map(([k, l]) => `<button class="${on(k)}" data-go="${k}">${l}${k === 'approvals' && pending ? ` <span class="count" style="position:static;display:inline-grid">${pending}</span>` : ''}</button>`).join('')}</nav>
    <div class="nav-r">
      ${ms.length > 1 ? `<div class="modesw" role="group" aria-label="Switch view">${ms.map(([k, l]) => `<button class="${k === mode ? 'on' : ''}" data-act="setMode" data-m="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>` : ''}
      ${isEditorAnywhere() && mode !== 'learner' ? `<label class="switch"><input type="checkbox" id="editmode" ${ui.editing ? 'checked' : ''}> Edit mode</label>` : ''}
      <button class="nav-ico" data-go="messages" aria-label="Messages${um ? `, ${um} unread` : ''}"><svg viewBox="0 0 24 24">${SVG.chat}</svg>${um ? `<span class="count">${um}</span>` : ''}</button>
      <details class="ndrop"><summary class="nav-ico" aria-label="Notifications${un ? `, ${un} unread` : ''}"><svg viewBox="0 0 24 24">${SVG.bell}</svg>${un ? `<span class="count">${un}</span>` : ''}</summary>
        <div class="menu"><div class="mhead"><b>Notifications</b>${un ? '<button class="link small" data-act="readAllNotes">Mark all as read</button>' : ''}</div>
          ${notes.map(noteItem).join('') || '<div class="empty small">You have no notifications.</div>'}
          <div class="mhead" style="border-top:1px solid var(--line)"><button class="link small" data-go="notifications">See all</button></div></div></details>
      <details class="umenu"><summary aria-label="User menu">${avatar(u)}</summary>
        <div class="menu"><div class="who"><b>${esc(fullname(u))}</b><div class="muted small">${esc(u.email)}</div></div>
          <button data-go="profile" data-id="${u.id}">Profile and security</button>
          <button data-go="record">My learning record</button>
          <button data-go="gradesoverview">Grades</button>
          <button data-go="messages">Messages</button>
          <button data-go="mybadges">Badges</button>
          <button data-go="prefs">Accessibility</button>
          ${B.server ? '' : '<button data-act="resetDemo">Reset demo data</button>'}
          <button data-act="logout">Log out</button></div></details>
    </div></div></header>`;
}
function noteItem(n) { return `<button class="nitem ${n.read ? '' : 'unread'}" data-act="openNote" data-id="${n.id}"><span class="ud ${n.read ? 'r' : ''}"></span><span style="min-width:0"><b class="small" style="display:block">${esc(n.subject)}</b><span class="muted small">${esc(n.body)}${n.body ? ' · ' : ''}${ago(n.time)}</span></span></button>`; }
function phead(crumbs, title, extra = '') {
  const cr = crumbs.filter(c => c[0]).map(([l, g, id]) => g ? `<button data-go="${g}" ${id ? `data-id="${id}"` : ''}>${esc(l)}</button>` : `<span>${esc(l)}</span>`).join('<span class="sep">/</span>');
  return `<div class="phead"><nav class="crumbs" aria-label="Breadcrumb">${cr}</nav><div class="ptitle">${extra}<h1>${esc(title)}</h1></div></div>`;
}
const progressBar = p => `<div class="prog"><div class="bar"><i style="width:${p}%"></i></div><span class="num">${p}% complete</span></div>`;
const pattern = id => { const x = hash(id) % 360; return `background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.09) 0 10px,transparent 10px 22px),linear-gradient(135deg,hsl(${x} 48% 30%),hsl(${(x + 45) % 360} 52% 42%))`; };
function notFound(msg) { return `<div class="card stack" style="max-width:560px"><h2>Not available</h2><p class="muted">${esc(msg || 'This item may have been deleted, or you may not have access to it.')}</p><div><button class="btn" data-go="dashboard">Go to dashboard</button></div></div>`; }
function fileChip(id, removable) {
  const f = fileOf(id); if (!f) return '';
  const url = B.fileUrl(f, true);
  return `<span class="fchip">${icon('file', 'sm')}<span>${url && url !== '#' ? `<a href="${esc(url)}" ${B.server ? '' : `download="${esc(f.name)}"`} target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}</span><span class="muted">${fmtSize(f.size)}</span>${removable ? `<button class="xbtn" style="font-size:1rem;padding:0 4px" data-act="${removable}" data-id="${f.id}" aria-label="Remove ${esc(f.name)}">×</button>` : ''}</span>`;
}
/* Searchable checkbox list used for picking people, courses and cohorts */
function picker(name, items, selected = [], opts = {}) {
  const id = 'pk' + Math.random().toString(36).slice(2, 7), sel = new Set(selected);
  return `<div class="picker"><input type="search" placeholder="${esc(opts.placeholder || 'Search')}" data-filter="#${id}" aria-label="${esc(opts.placeholder || 'Search')}">
    <div class="pick-list" id="${id}">${items.map(([v, label, sub]) => `<label class="check" data-s="${esc(String(label + ' ' + (sub || '')).toLowerCase())}"><input type="checkbox" name="${name}" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}> <span>${esc(label)}${sub ? ` <span class="muted small">${esc(sub)}</span>` : ''}</span></label>`).join('') || '<p class="muted small">Nothing to choose from.</p>'}</div></div>`;
}
const picked = (f, name) => [...f.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);

/* ---------- Modals & toast ---------- */
function openModal(title, body, wide) {
  modalEl.innerHTML = `<div class="mback" data-act="backdrop"><div class="mbox ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="xbtn" data-act="closeModal" aria-label="Close">×</button></header><div class="mb">${body}</div></div></div>`;
  const f = modalEl.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=search]),select,textarea,button.primary'); if (f) f.focus();
  const qt = document.getElementById('qtype'); if (qt) toggleQFields();
}
function closeModal() { modalEl.innerHTML = ''; }
function confirmBox(title, text, fn, label = 'Delete') {
  ui.confirmFn = fn;
  openModal(title, `<p>${text}</p><div class="mfoot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger-solid" data-act="doConfirm">${esc(label)}</button></div>`);
}
let toastT;
function toast(msg, bad) { const t = document.getElementById('toast'); t.innerHTML = `<div style="${bad ? 'background:var(--bad);color:#fff' : ''}">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(() => t.innerHTML = '', bad ? Math.min(20000, Math.max(4500, String(msg).length * 70)) : 2600); }
function download(name, text, type = 'text/csv') {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) {}
  if (!B.server) openModal('Export', `<p class="muted small">In the preview, downloads may be blocked by the viewer. Copy the data below instead.</p><textarea rows="10" class="mono" style="font-size:.78rem" readonly id="exporttxt">${esc(text)}</textarea><div class="mfoot"><button class="btn primary" data-act="copyText" data-t="exporttxt">Copy to clipboard</button></div>`, true);
}
const csv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
