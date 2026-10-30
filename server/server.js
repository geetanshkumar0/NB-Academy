#!/usr/bin/env node
'use strict';
/*
 * NB Academy server. Uses only Node.js built-in modules (Node 22.13 or newer).
 *
 *   node server/server.js            start (a new site starts empty; administrators come from server/site-admins.js)
 *   node server/server.js --demo     start with demo data (or set NB_DEMO=1); needed on every start to keep it
 *   node server/server.js --reset    delete the database and files first (combine with --demo for fresh demo data)
 *
 * A site that holds demo data but is started without --demo has the demo content removed
 * automatically (after a backup is written to data/backups/).
 *
 * Environment: PORT (default 8080), HOST (default 0.0.0.0), NB_DATA_DIR (default ./data),
 *              NB_SECURE_COOKIES=1 behind HTTPS,
 *              NB_PUBLIC_URL (overrides the site URL used in emails and SSO redirects).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Core = require('../public/core.js');
const Store = require('./store.js');
const {sendMail} = require('./mailer.js');
const ldap = require('./ldap.js');
const oidc = require('./oidc.js');
const {unzip, scormLaunch, resolvePackage} = require('./unzip.js');
const {certificatePdf} = require('./pdf.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA = path.resolve(process.env.NB_DATA_DIR || path.join(ROOT, 'data'));
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const MAX_JSON = 8 * 1024 * 1024, MAX_UPLOAD = (Number(process.env.NB_MAX_UPLOAD_MB) || 1024) * 1024 * 1024; // SCORM packages with video can be large
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
const DEMO = args.has('--demo') || process.env.NB_DEMO === '1';
let S;
if (store.isEmpty()) {
  if (!DEMO) {
    S = Core.emptyState();
    S.categories.push({id:env.uid('k'), name:'Miscellaneous'});
    Core._.audit(S, env, null, 'Site installed', S.site.name, 'Empty site');
    console.log('Created empty site. Sign in with one of the site administrator accounts listed in server/site-admins.js.');
  } else {
    const seeded = Core.seed(env); S = seeded.state;
    for (const [id, content] of Object.entries(seeded.files)) fs.writeFileSync(store.filePath(id), typeof content === 'string' ? content : Buffer.from(content.base64, 'base64'));
    console.log('Loaded demo data. Demo accounts use the password "demo".');
  }
  store.save(S);
} else S = store.load();
const siteUrl = () => (process.env.NB_PUBLIC_URL || S.site.url || '').replace(/\/+$/, '');
/* Links in emails must be full web addresses. Use the site address setting (or NB_PUBLIC_URL);
   until one is set, use the address people reach this server at. */
let seenOrigin = '';
const publicBase = () => siteUrl() || seenOrigin;
const absolutize = (text, base) => base ? String(text).replace(/(^|[\s(<"'])\/(\?go=|cert\/|email-assets\/)/g, `$1${base}/$2`) : text;

/* ---------- Built-in site administrators (server/site-admins.js and NB_SITE_ADMINS) ---------- */
function ensureSiteAdmins() {
  const emails = [...new Set([...siteConfig.admins, ...(process.env.NB_SITE_ADMINS || '').split(',')].map(x => String(x).trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
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
    let un = base, i = 2; while (Core.findUser(S, un)) un = base + i++;
    const parts = local.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1));
    u = {id:env.uid('u'), username:un, email, firstname:parts[0] || un, lastname:parts.slice(1).join(' '), admin:true, builtinAdmin:true, created:Date.now(), mustChangePassword:true,
      department:'', defaultPwSet:true, ...hashPassword(env.defaultPassword)};
    S.users.push(u);
    const tok = Core._.makeToken(S, env, u.id, 'setpw', 7 * 24 * 3600e3);
    Core._.notifyT(S, env, 'welcome', u.id, {link:Core.linkTo(S, 'setpassword', tok)});
    Core._.audit(S, env, null, 'Built-in administrator created', un, email);
    console.log(`Site administrator ${email} created. Sign in as "${un}" with the starting password (it must be changed at first sign-in), or use this set-password link, valid 7 days: ${publicBase() || `http://localhost:${PORT}`}/?go=setpassword&id=${tok}`);
    changed = true;
  }
  if (changed) store.save(S);
}
/* Delete the accounts listed under "remove" in server/site-admins.js (or NB_REMOVE_ACCOUNTS) */
function removeAccounts(list) {
  const keep = new Set(siteConfig.admins.map(x => String(x).toLowerCase()));
  let changed = false;
  for (const entry of list.map(x => String(x).trim().toLowerCase()).filter(Boolean)) {
    const u = S.users.find(x => Core.sameName(x.username, entry) || Core.sameName(x.email, entry));
    if (!u || u.builtinAdmin || keep.has(String(u.email).toLowerCase())) continue;
    if (u.admin && !S.users.some(x => x.admin && x.id !== u.id && !x.suspended)) { console.log(`Not removing ${u.username}: it is the only administrator.`); continue; }
    S.users = S.users.filter(x => x.id !== u.id); S.enrol = S.enrol.filter(e => e.userId !== u.id); S.sysroles = S.sysroles.filter(r => r.userId !== u.id);
    S.groups.forEach(g => g.members = g.members.filter(m => m !== u.id));
    S.cohorts.forEach(c => { c.members = c.members.filter(m => m !== u.id); c.leads = c.leads.filter(m => m !== u.id); c.trainers = c.trainers.filter(m => m !== u.id); });
    S.tokens = (S.tokens || []).filter(t => t.userId !== u.id);
    Core._.audit(S, env, null, 'User removed by server configuration', u.username, u.email);
    store.dropUserSessions(u.id);
    console.log(`Removed account ${u.username} (${u.email}) as listed in server/site-admins.js.`);
    changed = true;
  }
  if (changed) store.save(S);
}
/* Turn a demo site into a clean one: back up, then keep only real accounts, site settings and the audit history */
function removeDemoData() {
  if (!S.site.demo || DEMO) return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), dir = path.join(DATA, 'backups', 'before-demo-removal-' + stamp);
  fs.mkdirSync(dir, {recursive:true});
  store.db.exec(`VACUUM INTO '${path.join(dir, 'nbacademy.db').replace(/'/g, "''")}'`);
  for (const d of ['files', 'scorm']) { const from = path.join(DATA, d); if (fs.existsSync(from)) { fs.cpSync(from, path.join(dir, d), {recursive:true}); fs.rmSync(from, {recursive:true, force:true}); } }
  fs.mkdirSync(path.join(DATA, 'files'), {recursive:true});
  const isDemoUser = u => /@nbacademy\.example$/i.test(String(u.email || ''));
  const keep = S.users.filter(u => !isDemoUser(u)), ids = new Set(keep.map(u => u.id));
  const E = Core.emptyState();
  E.site = {...S.site, demo:false};
  E.users = keep;
  E.sysroles = S.sysroles.filter(r => ids.has(r.userId) && E.roles.some(x => x.id === r.roleId));
  E.audit = S.audit;
  E.tokens = (S.tokens || []).filter(t => ids.has(t.userId));
  E.outbox = (S.outbox || []).filter(m => keep.some(u => u.email === m.to));
  E.categories = [{id:env.uid('k'), name:'Miscellaneous'}];
  const removedUsers = S.users.length - keep.length, removedCourses = S.courses.length;
  for (const u of S.users) if (!ids.has(u.id)) store.dropUserSessions(u.id);
  S = E;
  Core._.audit(S, env, null, 'Demo data removed', S.site.name, `${removedCourses} courses and ${removedUsers} demo accounts removed; backup in ${path.relative(DATA, dir)}`);
  store.save(S);
  console.log(`Demo data removed: ${removedCourses} courses and ${removedUsers} demo accounts. A backup of the previous data is in ${dir}`);
  return true;
}
const siteConfig = require('./site-admins');
ensureSiteAdmins();
removeDemoData();
// Meeting server secret given in the environment (NB_MEET_SECRET) is never stored; the settings page only shows that it is set
S.site.meetings = {server:'', appId:'nbacademy', secret:'', ...(S.site.meetings || {}), secretInEnv:!!process.env.NB_MEET_SECRET};
if (process.env.NB_MEET_URL) S.site.meetings.server = process.env.NB_MEET_URL.replace(/\/+$/, '');
if (process.env.NB_MEET_APP_ID) S.site.meetings.appId = process.env.NB_MEET_APP_ID;
// Clean up data from older versions (Company field removed, "Training" renamed to "Training Team")
{ const changes = Core.tidyData(S); if (changes.length) { for (const c of changes) { Core._.audit(S, env, null, 'Data clean-up', S.site.name, c); console.log('Data clean-up: ' + c); } store.save(S); } }
// Demo mode keeps the demo accounts (including 'admin'); the remove list applies to the real site
removeAccounts(process.env.NB_REMOVE_ACCOUNTS !== undefined ? process.env.NB_REMOVE_ACCOUNTS.split(',') : DEMO ? [] : siteConfig.remove);

/* Run an operation. If it fails part-way, reload the last saved state so nothing half-done remains. */
function runOp(uid, name, payload) {
  try { const r = Core.run(S, uid, name, payload, env); store.save(S); return r; }
  catch (e) { S = store.load(); throw e; }
}
function mutate(fn) { try { const r = fn(); store.save(S); return r; } catch (e) { S = store.load(); throw e; } }

/* ---------- Scheduler and email delivery ---------- */
function runTick() { try { const n = Core.tick(S, env); if (n) store.save(S); } catch (e) { console.error('Scheduler error:', e.message); S = store.load(); } }
let mailing = false;
/* Plain-language advice for the most common mail server refusals */
function smtpHint(cfg, msg) {
  const google = /gmail|google/i.test(cfg.host || '') || /gsmtp|google\.com/i.test(msg), ms = /office365|outlook|microsoft/i.test(cfg.host || '');
  if (/\b535\b|BadCredentials|Username and Password not accepted|authentication failed/i.test(msg)) {
    if (google) return ' — Google did not accept the username or password. Use the full email address as the username and an app password (16 letters from myaccount.google.com/apppasswords, for that same account) as the password, not the normal password. Save, then test again. If you cannot create app passwords, your Google Workspace admin has turned them off: ask them to allow app passwords for this mailbox, or to set up the SMTP relay (smtp-relay.gmail.com).';
    if (ms) return ' — Microsoft did not accept the sign-in. SMTP sign-in (SMTP AUTH) must be allowed for this mailbox in the Microsoft 365 admin centre, and accounts with multi-factor sign-in need an app password.';
    return ' — The mail server did not accept the username or password.';
  }
  if (/ETIMEDOUT|ECONNREFUSED|timed out/i.test(msg)) return ' — The mail server could not be reached. Check the server name and port; your hosting may block outgoing mail ports (try 587, or 465 with "Use TLS from the start").';
  if (/ENOTFOUND/i.test(msg)) return ' — There is no server with that name. Check the SMTP server address.';
  return '';
}
async function deliverMail() {
  const cfg = S.site.email; if (mailing || !cfg?.enabled || !cfg.host) return; mailing = true;
  try {
    for (const m of S.outbox.filter(x => x.status === 'queued').slice(0, 20)) {
      try { m.body = absolutize(m.body, publicBase()); if (m.html) m.html = absolutize(m.html, publicBase()); await sendMail(cfg, m); m.status = 'sent'; m.sentAt = Date.now(); m.error = ''; }
      catch (e) { m.tries = (m.tries || 0) + 1; m.error = e.message + smtpHint(cfg, e.message); m.status = m.tries >= 3 ? 'failed' : 'queued'; }
    }
    store.save(S);
  } finally { mailing = false; }
}

/* ---------- SCORM ---------- */
function extractScorm(fileId, cmid) {
  const fp = store.filePath(fileId); if (!fs.existsSync(fp)) throw new Core.OpError('The package file is missing.', 400);
  let files, info;
  try { files = resolvePackage(unzip(fs.readFileSync(fp))).filter(f => !/(^|\/)__MACOSX\//.test(f.name)); info = scormLaunch(files); } catch (e) { throw new Core.OpError(`This SCORM package cannot be used: ${e.message}`, 400); }
  const dir = store.scormDir(cmid); fs.rmSync(dir, {recursive:true, force:true});
  for (const f of files) { const out = path.join(dir, f.name); if (!out.startsWith(dir + path.sep)) continue; fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out, f.data); }
  fs.writeFileSync(path.join(dir, '.package'), fileId);
  return info;
}
function ensureScorm(m) {
  const dir = store.scormDir(m.id), marker = path.join(dir, '.package');
  // Packages from before SCORM 2004 support (no scormVersion yet) are read again, so their launch file is found the new way
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === m.packageId && m.scormVersion) return;
  const info = extractScorm(m.packageId, m.id);
  if (m.launch !== info.launch || m.scormVersion !== info.version) mutate(() => { m.launch = info.launch; m.scormVersion = info.version; m.scormFiles = info.files; m.single = info.single; });
}
const SCORM_TYPES = {'.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.xml':'application/xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.svg':'image/svg+xml', '.webp':'image/webp', '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.pdf':'application/pdf', '.vtt':'text/vtt', '.swf':'application/x-shockwave-flash', '.mjs':'text/javascript', '.txt':'text/plain; charset=utf-8', '.xsd':'application/xml', '.dtd':'application/xml-dtd', '.ico':'image/x-icon', '.bmp':'image/bmp', '.otf':'font/otf', '.eot':'application/vnd.ms-fontobject', '.m4a':'audio/mp4', '.m4v':'video/mp4', '.ogg':'audio/ogg', '.oga':'audio/ogg', '.ogv':'video/ogg', '.aac':'audio/aac', '.wasm':'application/wasm', '.csv':'text/csv', '.webmanifest':'application/manifest+json', '.map':'application/json'};

const EMAIL_ICON_CACHE = new Map();
/* Uploads in pieces (for files over 16 MB). The server is far from many users (high latency), and one
   connection over a long distance is slow, so the browser sends 8 MB pieces on several connections at once.
   Each piece is written straight into its place in the file, so pieces may arrive in any order. Progress is
   kept on disk next to the file, so an upload survives a server restart. */
const PIECE_MAX = 16 * 1024 * 1024;
const upDir = () => path.join(DATA, 'uploads');
const upPart = id => path.join(upDir(), id + '.part'), upMeta = id => path.join(upDir(), id + '.json');
const upRead = id => { if (!/^up_[a-f0-9]{24}$/.test(id)) return null; try { return JSON.parse(fs.readFileSync(upMeta(id), 'utf8')); } catch (e) { return null; } };
const upWrite = (id, u) => fs.writeFileSync(upMeta(id), JSON.stringify(u));
const upDrop = id => { fs.rmSync(upPart(id), {force:true}); fs.rmSync(upMeta(id), {force:true}); };
function upClean() { // forget pieced uploads untouched for a day
  try { const old = Date.now() - 24 * 3600e3; for (const f of fs.readdirSync(upDir())) if (f.endsWith('.json')) { const id = f.slice(0, -5), u = upRead(id); if (!u || u.touched < old) upDrop(id); } } catch (e) {}
}
/* ---------- HTTP helpers ---------- */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; frame-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
/* Live sessions held in NB Academy run on a Jitsi server (set in Site administration, or NB_MEET_URL / NB_MEET_APP_ID / NB_MEET_SECRET).
   Each person gets a link signed with the shared secret (JWT, HS256), so only NB Academy accounts can get in;
   trainers and admins join as moderators. The page may frame the meeting server, with camera, microphone and screen sharing. */
function meetingConfig() {
  const x = S.site.meetings || {};
  return {server:(process.env.NB_MEET_URL || x.server || '').replace(/\/+$/, ''), appId:process.env.NB_MEET_APP_ID || x.appId || 'nbacademy', secret:process.env.NB_MEET_SECRET || x.secret || ''};
}
function meetOrigin() { try { const s = meetingConfig().server; return s ? new URL(s).origin : ''; } catch (e) { return ''; } }
function jitsiToken(mt, r) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000), mod = !!r.moderator;
  const payload = {aud:'jitsi', iss:mt.appId, sub:'*', room:r.room, iat:now, nbf:now - 60, exp:Math.floor(r.until / 1000), moderator:mod,
    context:{user:{id:r.id, name:r.name, email:r.email, moderator:String(mod), affiliation:mod ? 'owner' : 'member'}, features:{recording:String(mod), livestreaming:'false', 'screen-sharing':'true', transcription:'false', 'outbound-call':'false'}}};
  const data = b64({alg:'HS256', typ:'JWT'}) + '.' + b64(payload);
  return data + '.' + crypto.createHmac('sha256', mt.secret).update(data).digest('base64url');
}
function meetingUrl(mt, r) {
  const opts = ['config.prejoinConfig.enabled=false', 'config.disableDeepLinking=true', 'config.startWithAudioMuted=' + !r.moderator, 'config.enableWelcomePage=false', 'interfaceConfig.SHOW_JITSI_WATERMARK=false', 'interfaceConfig.MOBILE_APP_PROMO=false'];
  return `${mt.server}/${encodeURIComponent(r.room)}?jwt=${jitsiToken(mt, r)}#${opts.join('&')}`;
}
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
const BRAND_ASSETS = require('../public/js/brand-assets.js');
const FAVICON_PNG = Buffer.from(BRAND_ASSETS.icon.src.split(',')[1], 'base64'); // the red NoBroker mark
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
  const typed = String(username || '').trim();
  let u = Core.findUser(S, typed);
  const name = u ? u.username : typed.toLowerCase();
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
  while (Core.findUser(S, un)) un = `${base}${++i}`;
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
  if (req.headers.host && !siteUrl()) seenOrigin = `${req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { if (process.env.NODE_ENV !== 'production') SHELL = shell(); const mo = meetOrigin(); return send(res, 200, SHELL, {...(mo ? {'Content-Security-Policy':CSP.replace("frame-src 'self' blob:", `frame-src 'self' blob: ${mo}`)} : {}), 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache'}); }
    if (req.method === 'GET' && /^\/(core|core-ext|demo-media)\.js$/.test(p)) return send(res, 200, fs.readFileSync(path.join(PUBLIC, p)), {'Content-Type':MIME['.js'], 'Cache-Control':'no-cache'});
    if (req.method === 'GET' && /^\/js\/[a-z0-9-]+\.js$/.test(p) && fs.existsSync(path.join(PUBLIC, p))) return send(res, 200, fs.readFileSync(path.join(PUBLIC, p)), {'Content-Type':MIME['.js'], 'Cache-Control':'no-cache'});
    if (req.method === 'GET' && p === '/health') return send(res, 200, {ok:true, users:S.users.length, courses:S.courses.length, queuedEmails:S.outbox.filter(m => m.status === 'queued').length});
    if (req.method === 'GET' && /^\/cert\/[A-Za-z0-9]+\.pdf$/.test(p)) { const pdf = certPdfFor(p.slice(6, -4)); return pdf ? send(res, 200, pdf, {'Content-Type':'application/pdf', 'Content-Disposition':`inline; filename="certificate-${p.slice(6, -4)}.pdf"`}) : sendErr(res, 404, 'Certificate not found.'); }
    if (req.method === 'GET' && p.startsWith('/cert/')) return send(res, 200, certPage(decodeURIComponent(p.slice(6))), {'Content-Type':'text/html; charset=utf-8'});
    if (req.method === 'GET' && (p === '/favicon.ico' || p === '/favicon.png')) {
      // Tab icon: the uploaded site logo if set, otherwise the red NoBroker mark.
      const id = S.site.branding?.logo, f = id && S.files.find(x => x.id === id);
      if (f && fs.existsSync(store.filePath(id))) return send(res, 200, fs.readFileSync(store.filePath(id)), {'Content-Type':f.type, 'Cache-Control':'public, max-age=300', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
      return send(res, 200, FAVICON_PNG, {'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400'});
    }
    if (req.method === 'GET' && p === '/api/logo') { const id = S.site.branding?.logo, f = id && S.files.find(x => x.id === id); if (!f || !fs.existsSync(store.filePath(id))) return sendErr(res, 404, 'No logo.'); return send(res, 200, fs.readFileSync(store.filePath(id)), {'Content-Type':f.type, 'Cache-Control':'public, max-age=300', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}); }
    if (req.method === 'GET' && p === '/api/site') return send(res, 200, {site:{name:S.site.name, tagline:S.site.tagline, branding:S.site.branding, terms:S.site.terms?.version}, demo:!!S.site.demo, demoUsers:S.site.demo ? ['admin', 'rohan', 'priya', 'vikram', 'asha', 'kabir', 'nisha', 'sana'].filter(un => S.users.some(u => u.username === un && !u.suspended)) : [], codes:S.courses.filter(c => c.visible && c.status !== 'draft').slice(0, 8).map(c => c.shortname),
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
    // Email icons: public (mail apps fetch them without signing in), drawn once per colour and cached
    if (req.method === 'GET' && p.startsWith('/email-assets/')) {
      const mm = /^\/email-assets\/([a-z-]+)-([0-9A-Fa-f]{6})\.png$/.exec(p); if (!mm) return sendErr(res, 404, 'Not found.');
      const key = mm[1] + '-' + mm[2].toUpperCase(); let png = EMAIL_ICON_CACHE.get(key);
      if (!png) { const b = Core.emailIcon(mm[1], '#' + mm[2], x => zlib.deflateSync(x, {level:9})); if (!b) return sendErr(res, 404, 'Not found.'); png = Buffer.from(b); if (EMAIL_ICON_CACHE.size > 200) EMAIL_ICON_CACHE.clear(); EMAIL_ICON_CACHE.set(key, png); }
      return send(res, 200, png, {'Content-Type':'image/png', 'Cache-Control':'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy':'cross-origin'});
    }
    if (req.method === 'GET' && p.startsWith('/scorm/')) {
      const me = currentUser(req); if (!me) return sendErr(res, 401, 'Please log in.');
      const [, , cmid, ...rest] = p.split('/'); const m = S.mods[cmid];
      const V = m && Core.view(S, me.uid); if (!m || m.type !== 'scorm' || !V?.mods[cmid] || V.mods[cmid].oversightOnly) return sendErr(res, 404, 'Not found.');
      const page = (title, msg) => send(res, 200, `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px/1.5 system-ui,sans-serif;padding:24px;color:#15212b"><h2 style="margin:0 0 8px">${title}</h2><p>${msg.replace(/[<>&]/g, c => ({'<':'&lt;', '>':'&gt;', '&':'&amp;'}[c]))}</p></body>`, {'Content-Type':'text/html; charset=utf-8'});
      try { ensureScorm(m); } catch (e) { return page('This SCORM package could not be opened', e.message + ' Ask an administrator to upload the package again.'); }
      const dir = store.scormDir(cmid); let rel; try { rel = decodeURIComponent(rest.join('/')); } catch (e) { return sendErr(res, 400, 'Bad file name.'); }
      let fp = path.join(dir, rel);
      if (fp.startsWith(dir + path.sep) && !fs.existsSync(fp)) { // packages made on Windows sometimes differ only in capital letters from what they link to
        const parts = rel.split('/'); let cur = dir; for (const part of parts) { const hit = fs.existsSync(cur) && fs.statSync(cur).isDirectory() ? fs.readdirSync(cur).find(x => x.toLowerCase() === part.toLowerCase()) : null; if (!hit) { cur = null; break; } cur = path.join(cur, hit); } if (cur) fp = cur; }
      if (!fp.startsWith(dir + path.sep) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return rel === (m.launch || '').split('?')[0] ? page('The start page of this package is missing', `The package says it starts at "${rel}", but that file is not in it.`) : sendErr(res, 404, 'Not found.');
      const headers = {'Content-Type':SCORM_TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'private, max-age=600', 'Accept-Ranges':'bytes',
        'Content-Security-Policy':"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: mediastream:; frame-ancestors 'self'"};
      // Byte ranges, so audio and video inside packages can stream and seek (Safari needs this)
      const total = fs.statSync(fp).size, range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        let a = range[1] === '' ? Math.max(0, total - Number(range[2])) : Number(range[1]), b = range[1] !== '' && range[2] !== '' ? Number(range[2]) : total - 1; b = Math.min(b, total - 1);
        if (a > b || a >= total) { res.writeHead(416, {...SEC_HEADERS, 'Content-Range':`bytes */${total}`}); return res.end(); }
        res.writeHead(206, {...SEC_HEADERS, ...headers, 'Content-Range':`bytes ${a}-${b}/${total}`, 'Content-Length':b - a + 1}); return fs.createReadStream(fp, {start:a, end:b}).pipe(res);
      }
      res.writeHead(200, {...SEC_HEADERS, ...headers, 'Content-Length':total}); return fs.createReadStream(fp).pipe(res);
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
      const u = S.users.find(x => Core.sameName(x.username, q) || Core.sameName(x.email, q));
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
      if (['registerFile', 'loginAsCheck', 'liveJoin', 'sessionJoin'].includes(b.op)) return sendErr(res, 400, 'Not allowed.');
      const result = runOp(me.uid, b.op, b.payload);
      if (b.op === 'deleteUser' || (b.op === 'suspendUser' && b.payload?.on)) store.dropUserSessions(b.payload.id);
      if (['setOwnPassword', 'updateProfile'].includes(b.op) && b.payload?.password) { /* keep this session, end others */ }
      if (S.outbox.some(m => m.status === 'queued')) setImmediate(deliverMail);
      if (b.op === 'heartbeat' || b.op === 'touch' || b.op === 'saveProgress') return send(res, 200, {result});
      return send(res, 200, {result, state:Core.view(S, me.uid)});
    }
    if (p === '/api/live/join') {
      const b = await readJSON(req), mt = meetingConfig();
      if (!mt.server || !mt.secret) return sendErr(res, 503, 'Video meetings are not set up yet. An administrator needs to add the meeting server in Site administration › Email, sign-in and meetings.');
      const r = b.sid ? runOp(me.uid, 'sessionJoin', {id:b.sid}) : runOp(me.uid, 'liveJoin', {mid:b.mid});
      return send(res, 200, {url:meetingUrl(mt, r), origin:new URL(mt.server).origin, state:Core.view(S, me.uid)});
    }
    if (p === '/api/loginas') {
      const b = await readJSON(req);
      const r = runOp(me.uid, 'loginAsCheck', {id:b.id});
      mutate(() => Core._.audit(S, env, me.uid, 'Logged in as another user', S.users.find(u => u.id === r.id).username));
      store.dropSession(me.token);
      const token = crypto.randomBytes(32).toString('hex'); store.createSession(token, r.id, 4 * 3600e3, me.uid);
      return send(res, 200, {state:Core.view(S, r.id)}, {'Set-Cookie':sessionCookie(req, token, 4 * 3600e3)});
    }
    if (p === '/api/upload/start') {
      const b = await readJSON(req), size = Math.floor(Number(b.size) || 0), piece = Math.floor(Number(b.piece) || 8 * 1024 * 1024);
      if (size <= 0) return sendErr(res, 400, 'The file is empty.');
      if (size > MAX_UPLOAD) return sendErr(res, 413, `The file is larger than ${Math.round(MAX_UPLOAD / 1048576)} MB.`);
      if (piece < 256 * 1024 || piece > PIECE_MAX) return sendErr(res, 400, 'Bad piece size.');
      upClean(); fs.mkdirSync(upDir(), {recursive:true});
      const id = 'up_' + crypto.randomBytes(12).toString('hex'), pieces = Math.ceil(size / piece);
      const fd = fs.openSync(upPart(id), 'w'); fs.ftruncateSync(fd, size); fs.closeSync(fd);
      upWrite(id, {uid:me.uid, name:String(b.name || 'file').slice(0, 200), type:String(b.type || 'application/octet-stream').split(';')[0].slice(0, 100), size, piece, pieces, got:[], touched:Date.now()});
      return send(res, 200, {id, piece, pieces});
    }
    if (p === '/api/upload/piece' || p === '/api/upload/finish' || p === '/api/upload/abort') {
      const id = String(url.searchParams.get('id') || ''), u = upRead(id);
      if (!u || u.uid !== me.uid) return sendErr(res, 404, 'This upload was not found. Please choose the file again.');
      if (p === '/api/upload/abort') { upDrop(id); return send(res, 200, {ok:true}); }
      if (p === '/api/upload/piece') {
        const i = Number(url.searchParams.get('index'));
        if (!Number.isInteger(i) || i < 0 || i >= u.pieces) return sendErr(res, 400, 'Bad piece number.');
        const want = i === u.pieces - 1 ? u.size - i * u.piece : u.piece, body = await readBody(req, PIECE_MAX);
        if (body.length !== want) return sendErr(res, 400, `Piece ${i + 1} has ${body.length} bytes; expected ${want}.`);
        const fd = fs.openSync(upPart(id), 'r+'); try { fs.writeSync(fd, body, 0, body.length, i * u.piece); } finally { fs.closeSync(fd); }
        const now = upRead(id) || u; if (!now.got.includes(i)) now.got.push(i); now.touched = Date.now(); upWrite(id, now); // read again: other pieces may have landed meanwhile
        return send(res, 200, {received:now.got.length, pieces:now.pieces});
      }
      const missing = []; for (let i = 0; i < u.pieces; i++) if (!u.got.includes(i)) missing.push(i + 1);
      if (missing.length) return sendErr(res, 400, `The upload is missing ${missing.length} piece${missing.length === 1 ? '' : 's'}.`);
      const fid = 'f_' + crypto.randomBytes(10).toString('hex');
      fs.renameSync(upPart(id), store.filePath(fid)); fs.rmSync(upMeta(id), {force:true});
      const f = runOp(me.uid, 'registerFile', {id:fid, name:u.name, type:u.type, size:u.size});
      return send(res, 200, {result:f, state:Core.view(S, me.uid)});
    }
    if (p === '/api/upload') {
      const name = String(url.searchParams.get('name') || 'file').slice(0, 200);
      const type = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].slice(0, 100);
      // Stream the upload straight to disk, so large SCORM packages and videos do not fill memory
      const id = 'f_' + crypto.randomBytes(10).toString('hex'), fp = store.filePath(id);
      const size = await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(fp); let n = 0, failed = false;
        const fail = e => { if (failed) return; failed = true; out.destroy(); fs.rm(fp, {force:true}, () => {}); reject(e); };
        req.on('data', c => { n += c.length; if (n > MAX_UPLOAD) { fail(Object.assign(new Error(`The file is larger than ${Math.round(MAX_UPLOAD / 1048576)} MB.`), {status:413})); req.destroy(); } });
        req.on('error', fail); out.on('error', fail); out.on('finish', () => { if (!failed) resolve(n); });
        req.pipe(out);
      });
      if (!size) { fs.rmSync(fp, {force:true}); return sendErr(res, 400, 'The file is empty.'); }
      const f = runOp(me.uid, 'registerFile', {id, name, type, size});
      return send(res, 200, {result:f, state:Core.view(S, me.uid)});
    }
    if (p === '/api/admin/test-email') {
      const b = await readJSON(req); const u = S.users.find(x => x.id === me.uid);
      if (!Core.H(S, me.uid).has('site:config')) return sendErr(res, 403, 'Not allowed.');
      const cfg = S.site.email; if (!cfg.host) return sendErr(res, 400, 'Save the SMTP settings first.');
      try { const body = `Hi ${u.firstname},\n\nThis is a test email from ${S.site.name}. If you can read this, email delivery works.`;
        await sendMail(cfg, {to:b.to || u.email, toName:'', subject:`Test email from ${S.site.name}`, body, html:Core._.emailLayoutFor(S, `Test email from ${S.site.name}`, body)}); return send(res, 200, {ok:true}); }
      catch (er) { const tried = /\b535\b|BadCredentials|not accepted|authentication failed/i.test(er.message) ? ` (Tried username "${cfg.user || '(empty)'}" with a ${String(cfg.pass || '').length}-character password. A Google app password is 16 letters.)` : '';
        return sendErr(res, 400, `Sending failed: ${er.message}${smtpHint(cfg, er.message)}${tried}`); }
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
module.exports = {server, getState:() => S, runTick, deliverMail, removeAccounts, removeDemoData, _store:() => store};
