#!/usr/bin/env node
'use strict';
/*
 * NB Academy server. Uses only Node.js built-in modules (Node 22.13 or newer).
 *
 *   node server/server.js            start (creates demo data on first run)
 *   node server/server.js --empty    first run without demo data (prints an admin password)
 *   node server/server.js --reset    delete the database and files, then reload demo data
 *
 * Environment: PORT (default 8080), HOST (default 0.0.0.0), NB_DATA_DIR (default ./data),
 *              NB_ADMIN_PASSWORD (used with --empty), NB_SECURE_COOKIES=1 behind HTTPS,
 *              NB_PUBLIC_URL (overrides the site URL used in emails and SSO redirects).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Core = require('../public/core.js');
const Store = require('./store.js');
const {sendMail} = require('./mailer.js');
const ldap = require('./ldap.js');
const oidc = require('./oidc.js');
const {unzip, scormLaunch} = require('./unzip.js');
const {certificatePdf} = require('./pdf.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA = path.resolve(process.env.NB_DATA_DIR || path.join(ROOT, 'data'));
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const MAX_JSON = 8 * 1024 * 1024, MAX_UPLOAD = 100 * 1024 * 1024;
const args = new Set(process.argv.slice(2));

/* ---------- Passwords and environment for the core ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32, {N:16384, r:8, p:1}).toString('hex');
  return {pwhash:`scrypt$${salt}$${hash}`, password:undefined};
}
function verifyPassword(u, pw) {
  if (!u.pwhash) return false;
  const [, salt, hash] = u.pwhash.split('$');
  const got = crypto.scryptSync(String(pw), salt, 32, {N:16384, r:8, p:1}), want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
let store;
const env = {now:() => Date.now(), uid:p => (p || 'x') + crypto.randomBytes(6).toString('hex'), token:() => crypto.randomBytes(24).toString('base64url'),
  hash:hashPassword, verify:verifyPassword, defaultPassword:process.env.NB_DEFAULT_PASSWORD || Core.DEFAULT_PASSWORD, scormExtract:(fileId, cmid) => extractScorm(fileId, cmid)};

/* ---------- State ---------- */
if (args.has('--reset')) { for (const f of ['nbacademy.db', 'nbacademy.db-wal', 'nbacademy.db-shm']) fs.rmSync(path.join(DATA, f), {force:true}); for (const d of ['files', 'scorm']) fs.rmSync(path.join(DATA, d), {recursive:true, force:true}); console.log('Database and files deleted.'); }
store = new Store(DATA);
let S;
if (store.isEmpty()) {
  if (args.has('--empty')) {
    S = Core.emptyState();
    const pw = process.env.NB_ADMIN_PASSWORD || env.defaultPassword;
    S.users.push({id:env.uid('u'), username:'admin', firstname:'Admin', lastname:'User', email:'admin@example.com', admin:true, created:Date.now(), termsAccepted:1, prefsSet:true, mustChangePassword:!process.env.NB_ADMIN_PASSWORD, ...hashPassword(pw)});
    S.categories.push({id:env.uid('k'), name:'Miscellaneous'});
    Core._.audit(S, env, null, 'Site installed', S.site.name, 'Empty site');
    console.log(`Created empty site. Log in as "admin" with password: ${pw}${process.env.NB_ADMIN_PASSWORD ? '' : ' (it must be changed at first sign-in)'}`);
  } else {
    const seeded = Core.seed(env); S = seeded.state;
    for (const [id, content] of Object.entries(seeded.files)) fs.writeFileSync(store.filePath(id), typeof content === 'string' ? content : Buffer.from(content.base64, 'base64'));
    console.log('Loaded demo data. Demo accounts use the password "demo".');
  }
  store.save(S);
} else S = store.load();
const siteUrl = () => (process.env.NB_PUBLIC_URL || S.site.url || '').replace(/\/+$/, '');

/* ---------- Built-in site administrators (server/site-admins.js and NB_SITE_ADMINS) ---------- */
function ensureSiteAdmins() {
  const emails = [...new Set([...require('./site-admins'), ...(process.env.NB_SITE_ADMINS || '').split(',')].map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
  const want = new Set(emails); let changed = false;
  for (const u of S.users) if (u.builtinAdmin && !want.has(String(u.email).toLowerCase())) { delete u.builtinAdmin; changed = true; }
  for (const email of emails) {
    let u = S.users.find(x => String(x.email).toLowerCase() === email);
    if (u) {
      // Never signed in and never set a password: give it the starting password, so it can be used
      if (!u.lastLogin && !u.pwChanged && u.mustChangePassword !== false && !u.defaultPwSet) { Object.assign(u, hashPassword(env.defaultPassword), {mustChangePassword:true, defaultPwSet:true}); changed = true; console.log(`Site administrator ${email}: sign in as "${u.username}" with the starting password; it must be changed at first sign-in.`); }
      if (!u.admin || !u.builtinAdmin || u.suspended) { const was = u.admin; Object.assign(u, {admin:true, builtinAdmin:true, suspended:false}); changed = true; if (!was) Core._.audit(S, env, null, 'Built-in administrator granted', u.username, email); }
      continue;
    }
    const local = email.split('@')[0], base = local.toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'admin';
    let un = base, i = 2; while (S.users.some(x => x.username === un)) un = base + i++;
    const parts = local.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1));
    u = {id:env.uid('u'), username:un, email, firstname:parts[0] || un, lastname:parts.slice(1).join(' '), admin:true, builtinAdmin:true, created:Date.now(), mustChangePassword:true,
      company:'', department:'', defaultPwSet:true, ...hashPassword(env.defaultPassword)};
    S.users.push(u);
    const tok = Core._.makeToken(S, env, u.id, 'setpw', 7 * 24 * 3600e3);
    Core._.notifyT(S, env, 'welcome', u.id, {link:Core.linkTo(S, 'setpassword', tok)});
    Core._.audit(S, env, null, 'Built-in administrator created', un, email);
    console.log(`Site administrator ${email} created. Sign in as "${un}" with the starting password (it must be changed at first sign-in), or use this set-password link, valid 7 days: ${siteUrl() || `http://localhost:${PORT}`}/?go=setpassword&id=${tok}`);
    changed = true;
  }
  if (changed) store.save(S);
}
ensureSiteAdmins();

/* Run an operation. If it fails part-way, reload the last saved state so nothing half-done remains. */
function runOp(uid, name, payload) {
  try { const r = Core.run(S, uid, name, payload, env); store.save(S); return r; }
  catch (e) { S = store.load(); throw e; }
}
function mutate(fn) { try { const r = fn(); store.save(S); return r; } catch (e) { S = store.load(); throw e; } }

/* ---------- Scheduler and email delivery ---------- */
function runTick() { try { const n = Core.tick(S, env); if (n) store.save(S); } catch (e) { console.error('Scheduler error:', e.message); S = store.load(); } }
let mailing = false;
async function deliverMail() {
  const cfg = S.site.email; if (mailing || !cfg?.enabled || !cfg.host) return; mailing = true;
  try {
    for (const m of S.outbox.filter(x => x.status === 'queued').slice(0, 20)) {
      try { await sendMail(cfg, m); m.status = 'sent'; m.sentAt = Date.now(); m.error = ''; }
      catch (e) { m.tries = (m.tries || 0) + 1; m.error = e.message; m.status = m.tries >= 3 ? 'failed' : 'queued'; }
    }
    store.save(S);
  } finally { mailing = false; }
}

/* ---------- SCORM ---------- */
function extractScorm(fileId, cmid) {
  const fp = store.filePath(fileId); if (!fs.existsSync(fp)) throw new Core.OpError('The package file is missing.', 400);
  let files, info;
  try { files = unzip(fs.readFileSync(fp)); info = scormLaunch(files); } catch (e) { throw new Core.OpError(`This SCORM package cannot be used: ${e.message}`, 400); }
  const dir = store.scormDir(cmid); fs.rmSync(dir, {recursive:true, force:true});
  for (const f of files) { const out = path.join(dir, f.name); if (!out.startsWith(dir + path.sep)) continue; fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out, f.data); }
  fs.writeFileSync(path.join(dir, '.package'), fileId);
  return info;
}
function ensureScorm(m) {
  const dir = store.scormDir(m.id), marker = path.join(dir, '.package');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === m.packageId) return;
  const info = extractScorm(m.packageId, m.id); if (!m.launch) mutate(() => { m.launch = info.launch; });
}
const SCORM_TYPES = {'.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.xml':'application/xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.webp':'image/webp', '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.pdf':'application/pdf', '.vtt':'text/vtt', '.swf':'application/octet-stream'};

/* ---------- HTTP helpers ---------- */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; frame-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const SEC_HEADERS = {'Content-Security-Policy':CSP, 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'SAMEORIGIN', 'Referrer-Policy':'same-origin'};
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {...SEC_HEADERS, 'Content-Length':buf.length, ...(typeof body === 'object' && !Buffer.isBuffer(body) ? {'Content-Type':'application/json; charset=utf-8'} : {}), ...headers});
  res.end(buf);
}
const sendErr = (res, status, msg, extra) => send(res, status, {error:msg, ...extra});
const redirect = (res, to, headers = {}) => { res.writeHead(302, {Location:to, ...headers}); res.end(); };
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function sessionCookie(req, token, maxAge) {
  const secure = process.env.NB_SECURE_COOKIES === '1' || req.headers['x-forwarded-proto'] === 'https';
  return `nb_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`;
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('The upload is too large.'), {status:413})); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
}
async function readJSON(req) { const b = await readBody(req, MAX_JSON); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { throw Object.assign(new Error('Invalid JSON.'), {status:400}); } }
const idleMs = () => (S.site.security?.sessionTimeout || 60) * 60e3;
function currentUser(req) { const t = cookies(req).nb_sid; const uid = store.sessionUser(t, idleMs()); const u = uid && S.users.find(x => x.id === uid); return u && !u.suspended ? {uid, token:t} : null; }
function checkCsrf(req) { if (req.headers['x-nb-request'] !== '1') throw Object.assign(new Error('Missing request header.'), {status:403}); }
function startSession(req, res, uid, body) { const token = crypto.randomBytes(32).toString('hex'); store.createSession(token, uid, SESSION_TTL); return send(res, 200, body || {state:Core.view(S, uid), server:true}, {'Set-Cookie':sessionCookie(req, token, SESSION_TTL)}); }
const origin = req => siteUrl() || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

/* Login throttling per IP (on top of per-account lockout) */
const fails = new Map();
const throttled = ip => { const f = fails.get(ip); return f && f.n >= 20 && Date.now() - f.t < 15 * 60e3; };
const failed = ip => { const f = fails.get(ip); if (!f || Date.now() - f.t > 15 * 60e3) fails.set(ip, {n:1, t:Date.now()}); else f.n++; };
/* Second factor: short-lived tickets between password and code */
const mfaTickets = new Map();

/* ---------- Page shell ---------- */
function shell() {
  const frag = fs.readFileSync(path.join(PUBLIC, 'app.html'), 'utf8');
  const cut = frag.indexOf('<div id="app">');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="nb-mode" content="server">${frag.slice(0, cut)}</head><body>${frag.slice(cut)}</body></html>`;
}
let SHELL = shell();
const MIME = {'.js':'text/javascript; charset=utf-8'};
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|text\/vtt|video\/(mp4|webm)|audio\/(mpeg|wav|ogg))$/;
const e = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

function certLookup(code) {
  const c = S.certIssued.find(x => x.code === String(code).toUpperCase()); if (!c) return null;
  const m = S.mods[c.cmid], course = m ? S.courses.find(x => x.id === m.courseId) : null, u = S.users.find(x => x.id === c.userId);
  return {c, m, course, u};
}
function certPage(code) {
  const r = certLookup(code);
  const body = r ? `<h1>Certificate verified</h1><p><b>${e(r.u ? `${r.u.firstname} ${r.u.lastname}` : 'Former user')}</b> was awarded <b>${e(r.m?.name || 'a certificate')}</b> for <b>${e(r.course?.fullname || 'a course')}</b> on ${new Date(r.c.time).toDateString()}.</p>
      ${r.c.expires ? `<p>${r.c.expires < Date.now() ? `<b style="color:#b0342b">Expired</b> on ${new Date(r.c.expires).toDateString()}.` : `Valid until ${new Date(r.c.expires).toDateString()}.`}</p>` : ''}<p>Code: <code>${e(r.c.code)}</code> · <a href="/cert/${e(r.c.code)}.pdf">Download PDF</a></p>`
    : `<h1>No certificate found</h1><p>The code <code>${e(code)}</code> does not match any certificate issued by ${e(S.site.name)}.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificate check · ${e(S.site.name)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 16px;color:#15212b}h1{font-size:1.6rem}code{background:#eef2f5;padding:2px 6px;border-radius:4px}</style></head><body>${body}<p><a href="/">${e(S.site.name)}</a></p></body></html>`;
}
function certPdfFor(code) {
  const r = certLookup(code); if (!r) return null; const b = S.site.branding || {}, cs = S.site.cert || {};
  return certificatePdf({site:S.site.name, name:r.u ? `${r.u.firstname} ${r.u.lastname}` : 'Former user', course:r.course?.fullname || '', date:new Date(r.c.time).toDateString(), expires:r.c.expires ? new Date(r.c.expires).toDateString() : '', code:r.c.code, grade:r.c.grade, verifyUrl:`${siteUrl() || ''}/cert/${r.c.code}`.replace(/^\/cert/, '/cert'), primary:b.primary, accent:b.accent, template:cs.template, signatureName:cs.signatureName, signatureTitle:cs.signatureTitle, body:cs.body});
}

/* ---------- Login helpers ---------- */
async function passwordLogin(username, password) {
  const name = String(username || '').trim().toLowerCase();
  let u = S.users.find(x => x.username === name);
  const L = S.site.ldap || {};
  if (L.enabled && (u?.auth === 'ldap' || (!u && L.autoCreate))) {
    const r = await ldap.bind(L.url, L.bindDn.replace('{username}', ldap.escapeDn(name)), String(password || ''));
    if (!r.ok) { if (u) mutate(() => Core.login(S, name, '\u0000never', env)); return {error:'Invalid login, please try again.'}; }
    if (!u) mutate(() => { u = createExternalUser({username:name, email:L.emailDomain ? `${name}@${L.emailDomain}` : `${name}@example.com`, firstname:name, lastname:'', auth:'ldap'}); });
    return mutate(() => Core.login(S, name, null, env, {trusted:true, via:'LDAP'}));
  }
  if (u?.auth === 'sso') return {error:'This account signs in with single sign-on. Use the button below the form.'};
  return mutate(() => Core.login(S, name, password, env));
}
function createExternalUser(x) {
  let un = String(x.username || x.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user'; const base = un; let i = 1;
  while (S.users.some(u => u.username === un)) un = `${base}${++i}`;
  const u = {id:env.uid('u'), username:un, email:x.email, firstname:x.firstname || un, lastname:x.lastname || '', admin:false, created:Date.now(), auth:x.auth, ...hashPassword(crypto.randomBytes(24).toString('hex'))};
  S.users.push(u); Core._.audit(S, env, null, 'User created automatically', un, `First sign-in via ${x.auth.toUpperCase()}`); Core._.applyRules(S, env, u.id);
  return u;
}
function afterPassword(req, res, u) {
  if (u.mfaEnabled && u.mfaSecret) {
    const ticket = crypto.randomBytes(18).toString('base64url'); mfaTickets.set(ticket, {uid:u.id, at:Date.now(), tries:0});
    for (const [k, v] of mfaTickets) if (Date.now() - v.at > 300e3) mfaTickets.delete(k);
    return send(res, 200, {mfa:true, ticket});
  }
  return startSession(req, res, u.id);
}

/* ---------- Router ---------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { if (process.env.NODE_ENV !== 'production') SHELL = shell(); return send(res, 200, SHELL, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache'}); }
    if (req.method === 'GET' && /^\/(core|core-ext|demo-media)\.js$/.test(p)) return send(res, 200, fs.readFileSync(path.join(PUBLIC, p)), {'Content-Type':MIME['.js'], 'Cache-Control':'no-cache'});
    if (req.method === 'GET' && /^\/js\/[a-z0-9-]+\.js$/.test(p) && fs.existsSync(path.join(PUBLIC, p))) return send(res, 200, fs.readFileSync(path.join(PUBLIC, p)), {'Content-Type':MIME['.js'], 'Cache-Control':'no-cache'});
    if (req.method === 'GET' && p === '/health') return send(res, 200, {ok:true, users:S.users.length, courses:S.courses.length, queuedEmails:S.outbox.filter(m => m.status === 'queued').length});
    if (req.method === 'GET' && /^\/cert\/[A-Za-z0-9]+\.pdf$/.test(p)) { const pdf = certPdfFor(p.slice(6, -4)); return pdf ? send(res, 200, pdf, {'Content-Type':'application/pdf', 'Content-Disposition':`inline; filename="certificate-${p.slice(6, -4)}.pdf"`}) : sendErr(res, 404, 'Certificate not found.'); }
    if (req.method === 'GET' && p.startsWith('/cert/')) return send(res, 200, certPage(decodeURIComponent(p.slice(6))), {'Content-Type':'text/html; charset=utf-8'});
    if (req.method === 'GET' && p === '/api/logo') { const id = S.site.branding?.logo, f = id && S.files.find(x => x.id === id); if (!f || !fs.existsSync(store.filePath(id))) return sendErr(res, 404, 'No logo.'); return send(res, 200, fs.readFileSync(store.filePath(id)), {'Content-Type':f.type, 'Cache-Control':'public, max-age=300', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}); }
    if (req.method === 'GET' && p === '/api/site') return send(res, 200, {site:{name:S.site.name, tagline:S.site.tagline, branding:S.site.branding, terms:S.site.terms?.version}, demo:!!S.site.demo, codes:S.courses.filter(c => c.visible && c.status !== 'draft').slice(0, 8).map(c => c.shortname),
      sso:S.site.sso?.enabled ? {label:S.site.sso.label} : null, forgot:true});

    if (req.method === 'GET' && p.startsWith('/files/')) {
      const me = currentUser(req); if (!me) return sendErr(res, 401, 'Please log in.');
      const id = p.split('/')[2]; const f = S.files.find(x => x.id === id);
      if (!f || !Core.canReadFile(S, me.uid, id)) return sendErr(res, 404, 'File not found.');
      const fp = store.filePath(id); if (!fs.existsSync(fp)) return sendErr(res, 404, 'File not found.');
      const data = fs.readFileSync(fp), inline = INLINE_TYPES.test(f.type) && url.searchParams.get('dl') !== '1';
      const base = {'Content-Type':inline ? f.type : 'application/octet-stream', 'Content-Disposition':`${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control':'private, max-age=3600', 'Accept-Ranges':'bytes'};
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range && inline) { const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1; if (start <= end) return send(res, 206, data.subarray(start, end + 1), {...base, 'Content-Range':`bytes ${start}-${end}/${data.length}`}); }
      return send(res, 200, data, base);
    }
    if (req.method === 'GET' && p.startsWith('/scorm/')) {
      const me = currentUser(req); if (!me) return sendErr(res, 401, 'Please log in.');
      const [, , cmid, ...rest] = p.split('/'); const m = S.mods[cmid];
      const V = m && Core.view(S, me.uid); if (!m || m.type !== 'scorm' || !V?.mods[cmid] || V.mods[cmid].oversightOnly) return sendErr(res, 404, 'Not found.');
      ensureScorm(m);
      const dir = store.scormDir(cmid), rel = decodeURIComponent(rest.join('/')), fp = path.join(dir, rel);
      if (!fp.startsWith(dir + path.sep) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return sendErr(res, 404, 'Not found.');
      return send(res, 200, fs.readFileSync(fp), {'Content-Type':SCORM_TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'private, max-age=600',
        'Content-Security-Policy':"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'"});
    }
    if (req.method === 'GET' && p === '/api/state') { const me = currentUser(req); if (!me) return send(res, 200, {state:null}); return send(res, 200, {state:Core.view(S, me.uid), server:true}); }
    if (req.method === 'GET' && p === '/api/token') { const t = Core._.useToken(S, env, url.searchParams.get('t'), false); const u = t && S.users.find(x => x.id === t.userId); return send(res, 200, u ? {valid:true, name:u.firstname, username:u.username, kind:t.kind} : {valid:false}); }
    if (req.method === 'GET' && p.startsWith('/api/backup/')) {
      const me = currentUser(req); if (!me) return sendErr(res, 401, 'Please log in.');
      const b = runOp(me.uid, 'backupCourse', {cid:p.split('/')[3], includeUsers:url.searchParams.get('users') === '1'});
      const name = `backup-${b.course.shortname}-${new Date().toISOString().slice(0, 10)}.nbz.json`.replace(/[^\w.-]/g, '_');
      return send(res, 200, JSON.stringify(b, null, 1), {'Content-Type':'application/json; charset=utf-8', 'Content-Disposition':`attachment; filename="${name}"`});
    }
    /* Single sign-on (OpenID Connect) */
    if (req.method === 'GET' && p === '/auth/sso') {
      const sso = S.site.sso; if (!sso?.enabled) return redirect(res, '/?sso_error=' + encodeURIComponent('Single sign-on is not enabled.'));
      try { return redirect(res, await oidc.startUrl(sso, `${origin(req)}/auth/sso/callback`)); } catch (er) { return redirect(res, '/?sso_error=' + encodeURIComponent(er.message)); }
    }
    if (req.method === 'GET' && p === '/auth/sso/callback') {
      const sso = S.site.sso;
      try {
        if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
        const claims = await oidc.finish(sso, `${origin(req)}/auth/sso/callback`, url.searchParams.get('code'), url.searchParams.get('state'));
        let u = S.users.find(x => x.email.toLowerCase() === String(claims.email).toLowerCase());
        if (!u && !sso.autoCreate) throw new Error(`No ${S.site.name} account uses ${claims.email}. Ask an administrator to create one.`);
        const r = mutate(() => { if (!u) u = createExternalUser({email:claims.email, username:claims.preferred_username || claims.email.split('@')[0], firstname:claims.given_name || claims.name || '', lastname:claims.family_name || '', auth:'sso'}); return Core.login(S, u.username, null, env, {trusted:true, via:'SSO'}); });
        if (!r.user) throw new Error(r.error);
        const token = crypto.randomBytes(32).toString('hex'); store.createSession(token, r.user.id, SESSION_TTL);
        return redirect(res, '/', {'Set-Cookie':sessionCookie(req, token, SESSION_TTL)});
      } catch (er) { return redirect(res, '/?sso_error=' + encodeURIComponent(er.message)); }
    }

    if (req.method !== 'POST') return sendErr(res, 404, 'Not found.');
    checkCsrf(req);
    const ip = req.socket.remoteAddress || '?';

    if (p === '/api/login') {
      if (throttled(ip)) return sendErr(res, 429, 'Too many failed logins from this network. Try again in 15 minutes.');
      const b = await readJSON(req);
      const r = await passwordLogin(b.username, b.password);
      if (!r.user) { failed(ip); return sendErr(res, 401, r.error); }
      fails.delete(ip); return afterPassword(req, res, r.user);
    }
    if (p === '/api/login/mfa') {
      const b = await readJSON(req); const t = mfaTickets.get(b.ticket);
      if (!t || Date.now() - t.at > 300e3) return sendErr(res, 401, 'Your sign-in has expired. Enter your password again.', {restart:true});
      const u = S.users.find(x => x.id === t.uid);
      if (!u || !Core.verifyTotp(u.mfaSecret, b.code, Date.now())) { if (++t.tries >= 5) mfaTickets.delete(b.ticket); return sendErr(res, 401, 'That code is not correct. Use the newest code from your authenticator app.'); }
      mfaTickets.delete(b.ticket); return startSession(req, res, u.id);
    }
    if (p === '/api/logout') { const t = cookies(req).nb_sid; if (t) store.dropSession(t); return send(res, 200, {ok:true}, {'Set-Cookie':sessionCookie(req, '', 0)}); }
    if (p === '/api/forgot') {
      if (throttled(ip)) return sendErr(res, 429, 'Too many requests. Try again later.'); failed(ip);
      const b = await readJSON(req); const q = String(b.login || '').trim().toLowerCase();
      const u = S.users.find(x => x.username === q || x.email.toLowerCase() === q);
      if (u && !u.suspended && u.auth !== 'sso' && u.auth !== 'ldap') mutate(() => { const tok = Core._.makeToken(S, env, u.id, 'reset', 2 * 3600e3); Core._.notifyT(S, env, 'passwordReset', u.id, {link:Core.linkTo(S, 'setpassword', tok)}); });
      deliverMail();
      return send(res, 200, {ok:true});
    }
    if (p === '/api/token-password') {
      const b = await readJSON(req);
      const r = mutate(() => { const t = Core._.useToken(S, env, b.token, false); if (!t) throw new Core.OpError('This link has expired or was already used. Ask for a new one.', 400);
        Core._.checkPassword(S, b.password); const u = S.users.find(x => x.id === t.userId); Object.assign(u, hashPassword(b.password)); u.mustChangePassword = false; u.lockedUntil = null; u.failedLogins = 0; u.pwChanged = Date.now();
        Core._.useToken(S, env, b.token, true); Core._.audit(S, env, u.id, 'Password set from emailed link', u.username); return u; });
      store.dropUserSessions(r.id);
      return send(res, 200, {ok:true, username:r.username});
    }

    const me = currentUser(req); if (!me) return sendErr(res, 401, 'Your session has ended. Please log in again.');

    if (p === '/api/op') {
      const b = await readJSON(req);
      if (['registerFile', 'loginAsCheck'].includes(b.op)) return sendErr(res, 400, 'Not allowed.');
      const result = runOp(me.uid, b.op, b.payload);
      if (b.op === 'deleteUser' || (b.op === 'suspendUser' && b.payload?.on)) store.dropUserSessions(b.payload.id);
      if (['setOwnPassword', 'updateProfile'].includes(b.op) && b.payload?.password) { /* keep this session, end others */ }
      if (S.outbox.some(m => m.status === 'queued')) setImmediate(deliverMail);
      if (b.op === 'heartbeat' || b.op === 'touch' || b.op === 'saveProgress') return send(res, 200, {result});
      return send(res, 200, {result, state:Core.view(S, me.uid)});
    }
    if (p === '/api/loginas') {
      const b = await readJSON(req);
      const r = runOp(me.uid, 'loginAsCheck', {id:b.id});
      mutate(() => Core._.audit(S, env, me.uid, 'Logged in as another user', S.users.find(u => u.id === r.id).username));
      store.dropSession(me.token);
      const token = crypto.randomBytes(32).toString('hex'); store.createSession(token, r.id, 4 * 3600e3, me.uid);
      return send(res, 200, {state:Core.view(S, r.id)}, {'Set-Cookie':sessionCookie(req, token, 4 * 3600e3)});
    }
    if (p === '/api/upload') {
      const name = String(url.searchParams.get('name') || 'file').slice(0, 200);
      const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].slice(0, 100);
      const body = await readBody(req, MAX_UPLOAD);
      if (!body.length) return sendErr(res, 400, 'The file is empty.');
      const id = 'f_' + crypto.randomBytes(10).toString('hex');
      fs.writeFileSync(store.filePath(id), body);
      const f = runOp(me.uid, 'registerFile', {id, name, type, size:body.length});
      return send(res, 200, {result:f, state:Core.view(S, me.uid)});
    }
    if (p === '/api/admin/test-email') {
      const b = await readJSON(req); const u = S.users.find(x => x.id === me.uid);
      if (!Core.H(S, me.uid).has('site:config')) return sendErr(res, 403, 'Not allowed.');
      const cfg = S.site.email; if (!cfg.host) return sendErr(res, 400, 'Save the SMTP settings first.');
      try { await sendMail(cfg, {to:b.to || u.email, toName:'', subject:`Test email from ${S.site.name}`, body:`This is a test email from ${S.site.name}.\n\nIf you can read this, email delivery works.`}); return send(res, 200, {ok:true}); }
      catch (er) { return sendErr(res, 400, `Sending failed: ${er.message}`); }
    }
    if (p === '/api/admin/test-ldap') {
      const b = await readJSON(req); if (!Core.H(S, me.uid).has('site:config')) return sendErr(res, 403, 'Not allowed.');
      const L = S.site.ldap; const r = await ldap.bind(L.url, L.bindDn.replace('{username}', ldap.escapeDn(String(b.username || ''))), String(b.password || ''));
      return r.ok ? send(res, 200, {ok:true}) : sendErr(res, 400, r.error);
    }
    return sendErr(res, 404, 'Not found.');
  } catch (er) {
    const status = er.status || 500;
    if (status >= 500) console.error(er);
    return sendErr(res, status, status >= 500 ? 'Something went wrong on the server.' : er.message);
  }
}

const server = http.createServer(handle);
let timers = [];
server.on('listening', () => { runTick(); timers = [setInterval(runTick, 5 * 60e3), setInterval(deliverMail, 30e3), setInterval(() => store.purgeSessions(), 3600e3)]; timers.forEach(t => t.unref()); });
server.on('close', () => timers.forEach(clearInterval));
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`NB Academy running at http://localhost:${PORT}  (data: ${DATA})`));
  const stop = () => { try { store.save(S); } catch (x) {} process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
module.exports = {server, getState:() => S, runTick, deliverMail, _store:() => store};
