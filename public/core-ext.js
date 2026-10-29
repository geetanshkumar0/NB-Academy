/*
 * NB Academy core extension: learner lifecycle, team and trainer workspaces, governance.
 * Loaded after core.js in the browser; required by core.js in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(root.NBCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
'use strict';
const {OPS, op, need, req, str, D, notify, notifyT, queueEmail, log, audit, checkBadges, checkPassword, modOf, courseOf, mustSeeMod, mustLearn, cleanFiles, makeToken, useToken, assignCourse, applyRules, VIEW_HOOKS, SEED_HOOKS} = Core._;
const {H, clone, OpError, fmtD, linkTo, TYPES, CAPS} = Core;

/* ---------------- SHA-1, HMAC and TOTP (RFC 6238) for multi-factor sign-in ---------------- */
function sha1Bytes(bytes) {
  const b = bytes.slice(), bl = b.length * 8; b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0; const w = new Array(80);
  const rl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < b.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (b[i + 4 * t] << 24) | (b[i + 4 * t + 1] << 16) | (b[i + 4 * t + 2] << 8) | b[i + 4 * t + 3];
    for (let t = 16; t < 80; t++) w[t] = rl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (bb & c) | (~bb & d) : t < 40 ? bb ^ c ^ d : t < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = t < 20 ? 0x5A827999 : t < 40 ? 0x6ED9EBA1 : t < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
      const tmp = (rl(a, 5) + f + e + k + w[t]) | 0; e = d; d = c; c = rl(bb, 30); bb = a; a = tmp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = []; for (const x of [h0, h1, h2, h3, h4]) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); return out;
}
function hmacSha1(key, msg) {
  if (key.length > 64) key = sha1Bytes(key); key = key.concat(new Array(64 - key.length).fill(0));
  return sha1Bytes(key.map(x => x ^ 0x5c).concat(sha1Bytes(key.map(x => x ^ 0x36).concat(msg))));
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) { const out = []; let bits = 0, val = 0; for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return out; }
function randomBase32(env, n = 32) { let s = ''; const src = (env.uid('') + env.uid('') + env.uid('') + env.uid('') + env.uid('')).replace(/[^a-z0-9]/gi, ''); for (let i = 0; i < n; i++) s += B32[(src.charCodeAt(i % src.length) * 7 + i * 13 + Math.floor(Math.random() * 32)) % 32]; return s; }
function totp(secret, t, step = 30) {
  const c = Math.floor(t / 1000 / step); const msg = []; for (let i = 7; i >= 0; i--) msg.push(i > 3 ? Math.floor(c / 2 ** (i * 8)) & 255 : (c >>> (i * 8)) & 255);
  const hm = hmacSha1(base32Decode(secret), msg), o = hm[19] & 15;
  return String((((hm[o] & 127) << 24) | (hm[o + 1] << 16) | (hm[o + 2] << 8) | hm[o + 3]) % 1e6).padStart(6, '0');
}
function verifyTotp(secret, code, t) { code = String(code || '').replace(/\s/g, ''); for (const d of [-1, 0, 1]) if (totp(secret, t + d * 30000) === code) return true; return false; }

/* ---------------- Onboarding, preferences, MFA ---------------- */
op('setOwnPassword', (S, h, p, env) => { const u = h.me(); checkPassword(S, p.password); need(!env.verify(u, p.password), 'Choose a password you have not used here before.', 400); Object.assign(u, env.hash(String(p.password))); u.mustChangePassword = false; u.pwChanged = env.now(); log(S, env, u.id, 'Password set'); });
op('acceptTerms', (S, h, p, env) => { const u = h.me(); u.termsAccepted = S.site.terms?.version || 1; u.termsAcceptedAt = env.now(); audit(S, env, u.id, 'Platform terms accepted', u.username, `Version ${u.termsAccepted}`); });
op('savePrefs', (S, h, p) => { const u = h.me(); const x = p.prefs || {}; u.prefs = {contrast:!!x.contrast, text:['100', '115', '130'].includes(String(x.text)) ? String(x.text) : '100', captions:x.captions !== false, motion:!!x.motion}; u.prefsSet = true; });
op('mfaSetup', (S, h, p, env) => { const u = h.me(); u.mfaPending = randomBase32(env); return {secret:u.mfaPending, uri:`otpauth://totp/${encodeURIComponent(S.site.name)}:${encodeURIComponent(u.username)}?secret=${u.mfaPending}&issuer=${encodeURIComponent(S.site.name)}`}; });
op('mfaEnable', (S, h, p, env) => { const u = h.me(); need(u.mfaPending, 'Start the set-up again.', 400); need(verifyTotp(u.mfaPending, p.code, env.now()), 'That code is not correct. Check the time on your phone and try the newest code.', 400); u.mfaSecret = u.mfaPending; u.mfaEnabled = true; delete u.mfaPending; audit(S, env, u.id, 'Two-step sign-in turned on', u.username); });
op('mfaDisable', (S, h, p, env) => {
  const u = h.user(p.id || h.meId); need(u, 'User not found.', 404);
  if (u.id === h.meId) { need(!Core.mfaRequired(S, u), 'Two-step sign-in is required for your account by the site security policy.', 400); need(verifyTotp(u.mfaSecret, p.code, env.now()), 'That code is not correct.', 400); }
  else need(h.has('user:manage'), 'You cannot change this account.');
  u.mfaEnabled = false; delete u.mfaSecret; audit(S, env, h.meId, 'Two-step sign-in turned off', u.username);
});

/* ---------------- User administration ---------------- */
op('unlockUser', (S, h, p, env) => { need(h.has('user:manage'), 'You cannot unlock accounts.'); const u = h.user(p.id); need(u, 'User not found.', 404); u.lockedUntil = null; u.failedLogins = 0; audit(S, env, h.meId, 'Account unlocked', u.username); });
op('adminResetPassword', (S, h, p, env) => {
  need(h.has('user:manage'), 'You cannot reset passwords.'); const u = h.user(p.id); need(u && (!u.admin || h.isAdmin()), 'User not found.', 404);
  if (p.mode === 'temp') { checkPassword(S, p.password); Object.assign(u, env.hash(String(p.password))); u.mustChangePassword = true; }
  else { const tok = makeToken(S, env, u.id, 'reset', 24 * 3600e3); notifyT(S, env, 'passwordReset', u.id, {link:linkTo(S, 'setpassword', tok)}); }
  u.lockedUntil = null; u.failedLogins = 0; audit(S, env, h.meId, 'Password reset by administrator', u.username, p.mode === 'temp' ? 'Temporary password set' : 'Reset link emailed');
  return {mode:p.mode === 'temp' ? 'temp' : 'email'};
});
op('resendWelcome', (S, h, p, env) => { need(h.has('user:manage'), 'You cannot do this.'); const u = h.user(p.id); need(u, 'User not found.', 404); Core._.welcomeUser(S, env, u); });

/* ---------------- Site settings ---------------- */
const hex = v => /^#[0-9a-f]{6}$/i.test(v) ? v : null;
op('saveBranding', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change branding.'); const b = S.site.branding;
  b.primary = hex(p.primary) || b.primary; b.accent = hex(p.accent) || b.accent;
  if (p.logo === null) b.logo = null; else if (p.logo) { const f = S.files.find(x => x.id === p.logo); need(f && /^image\//.test(f.type), 'The logo must be an image (PNG, JPG, SVG or WebP).', 400); b.logo = f.id; }
  if (p.cert) { const c = S.site.cert; c.template = ['classic', 'modern', 'minimal'].includes(p.cert.template) ? p.cert.template : 'classic'; c.signatureName = str(p.cert.signatureName, 100); c.signatureTitle = str(p.cert.signatureTitle, 100); c.body = str(p.cert.body, 200) || 'has successfully completed'; }
  audit(S, env, h.meId, 'Branding changed', 'Site', `Colours ${b.primary} / ${b.accent}${b.logo ? ', logo set' : ''}`);
});
op('saveSecurity', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change security settings.'); const x = S.site.security;
  x.minLength = Math.min(64, Math.max(6, Number(p.minLength) || 8)); for (const k of ['upper', 'lower', 'digit', 'special']) x[k] = !!p[k];
  x.lockoutAttempts = Math.max(0, Number(p.lockoutAttempts) || 0); x.lockoutMinutes = Math.max(1, Number(p.lockoutMinutes) || 30);
  x.sessionTimeout = Math.max(5, Number(p.sessionTimeout) || 60); x.mfa = ['off', 'admins', 'all'].includes(p.mfa) ? p.mfa : 'off';
  audit(S, env, h.meId, 'Security policy changed', 'Site', JSON.stringify(x));
});
/* Google and Microsoft show app passwords in groups ("abcd efgh ijkl mnop"); the spaces are not part of the password */
const cleanSmtpPass = v => { const x = str(v, 300).trim(); return /^[a-z0-9]{4}( [a-z0-9]{4}){3}$/i.test(x) ? x.replace(/ /g, '') : x; };
op('saveIntegration', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change integrations.');
  if (p.kind === 'email') { const e = S.site.email; Object.assign(e, {enabled:!!p.enabled, host:str(p.host, 200).trim(), port:Number(p.port) || 587, secure:!!p.secure, user:str(p.user, 200).trim(), from:str(p.from, 200).trim() || e.from}); if (p.pass) e.pass = cleanSmtpPass(p.pass); need(!e.enabled || e.host, 'Enter the SMTP server address.', 400); if (e.enabled) S.outbox.forEach(m => { if (m.status === 'not sent' && env.now() - m.time < 3 * D) m.status = 'queued'; }); }
  else if (p.kind === 'sso') { const x = S.site.sso; Object.assign(x, {enabled:!!p.enabled, label:str(p.label, 80) || 'Company single sign-on', issuer:str(p.issuer, 300).trim().replace(/\/+$/, ''), clientId:str(p.clientId, 300).trim(), autoCreate:!!p.autoCreate}); if (p.clientSecret) x.clientSecret = str(p.clientSecret, 500); need(!x.enabled || (/^https:\/\//.test(x.issuer) && x.clientId), 'Enter an https issuer URL and a client ID.', 400); }
  else if (p.kind === 'ldap') { const x = S.site.ldap; Object.assign(x, {enabled:!!p.enabled, url:str(p.url, 300).trim(), bindDn:str(p.bindDn, 300).trim() || x.bindDn, autoCreate:!!p.autoCreate, emailDomain:str(p.emailDomain, 120).trim()}); need(!x.enabled || (/^ldaps?:\/\//.test(x.url) && x.bindDn.includes('{username}')), 'Enter an ldap:// or ldaps:// URL and a bind DN that contains {username}.', 400); }
  else if (p.kind === 'meetings') {
    const x = S.site.meetings || (S.site.meetings = {server:'', appId:'nbacademy', secret:''});
    const server = str(p.server, 300).trim().replace(/\/+$/, '');
    need(!server || /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w.-]+)*$/i.test(server), 'Enter the meeting server address, starting with https:// (for example https://meet.yourcompany.com).', 400);
    Object.assign(x, {server, appId:str(p.appId, 100).trim().replace(/[^\w.-]/g, '') || 'nbacademy'}); if (p.secret) x.secret = str(p.secret, 500).trim();
    need(!x.server || x.secret || x.secretInEnv, 'Enter the shared secret (JWT_APP_SECRET on the meeting server).', 400);
    audit(S, env, h.meId, 'Integration settings changed', 'Meetings', x.server ? `Meeting server ${x.server}` : 'Meeting server removed'); return;
  }
  else throw new OpError('Unknown integration.', 400);
  audit(S, env, h.meId, 'Integration settings changed', p.kind.toUpperCase(), p.enabled ? 'Enabled' : 'Disabled');
});
op('saveTemplate', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change notification templates.'); const t = S.site.templates[p.key]; need(t, 'Unknown template.', 404);
  if (p.reset) { for (const k of Object.keys(t)) delete t[k]; Object.assign(t, clone(Core.DEFAULT_TEMPLATES[p.key])); }
  else { Object.assign(t, {subject:req(p.subject, 'Subject', 200), body:req(p.body, 'Message', 5000), email:!!p.email, inapp:!!p.inapp}); if (p.html !== undefined) t.html = str(p.html, 100000).trim(); }
  audit(S, env, h.meId, 'Notification template changed', t.label);
});
op('saveTeams', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change the team list.');
  const list = [...new Map((Array.isArray(p.teams) ? p.teams : String(p.teams || '').split('\n')).map(x => str(x, 120).trim()).filter(Boolean).map(x => [x.toLowerCase(), x])).values()];
  need(list.length, 'Add at least one team.', 400);
  // Remember standard teams an administrator removed, so start-up does not add them back
  S.site.teams = list; S.site.teamsRemoved = Core.TEAMS.filter(t => !list.some(x => x.toLowerCase() === t.toLowerCase()));
  audit(S, env, h.meId, 'Team list changed', 'Site', `${list.length} teams`);
});
op('saveEmailTheme', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change these settings.');
  const c = String(p.color || '').trim(); need(/^#[0-9a-f]{6}$/i.test(c), 'Choose a colour such as #FB3753.', 400);
  S.site.emailTheme = {...(S.site.emailTheme || {}), color:c.toUpperCase()}; audit(S, env, h.meId, 'Email colour changed', 'Site', c.toUpperCase());
});
op('saveNotifySettings', (S, h, p, env) => {
  need(h.has('site:config'), 'You cannot change these settings.');
  S.site.reminders = [...new Set(String(p.reminders || '').split(/[ ,]+/).map(Number).filter(n => n > 0 && n <= 90))].sort((a, b) => b - a);
  S.site.recertDays = Math.max(1, Number(p.recertDays) || 30);
  audit(S, env, h.meId, 'Reminder schedule changed', 'Site', `Reminders ${S.site.reminders.join(', ')} days before; recertification ${S.site.recertDays} days before expiry`);
});
op('saveTerms', (S, h, p, env) => { need(h.has('site:config'), 'You cannot change the platform terms.'); S.site.terms.text = req(p.text, 'Terms', 20000); if (p.bump) S.site.terms.version++; audit(S, env, h.meId, 'Platform terms changed', 'Site', `Version ${S.site.terms.version}${p.bump ? ' (everyone must accept again)' : ''}`); });
op('retryEmail', (S, h, p) => { need(h.has('site:config'), 'Not allowed.'); const m = S.outbox.find(x => x.id === p.id); need(m, 'Email not found.', 404); m.status = 'queued'; m.error = ''; });

/* ---------------- Cohorts, learning paths, rules ---------------- */
const uids = (S, a) => [...new Set((Array.isArray(a) ? a : []).filter(id => S.users.some(u => u.id === id)))];
/* ---------------- Personas: what a person does on the site (learner, trainer, team lead, administrator) ---------------- */
function applyPersonas(S, h, env, u, p) {
  const want = new Set((Array.isArray(p.personas) ? p.personas : []).filter(x => ['learner', 'trainer', 'teamlead', 'admin'].includes(x)));
  if (u.builtinAdmin) ['learner', 'trainer', 'teamlead', 'admin'].forEach(x => want.add(x)); // the super administrator always holds every persona
  need(want.size, 'Choose at least one persona.', 400);
  if (want.has('admin') !== !!u.admin) { need(h.isAdmin(), 'Only site administrators can grant or remove administrator access.'); need(!(u.id === h.meId && !want.has('admin')), 'You cannot remove your own administrator access.', 400); need(!(u.builtinAdmin && !want.has('admin')), 'This is a built-in site administrator set in the server configuration, so administrator access cannot be removed here.', 400); need(!(u.admin && !want.has('admin')) || h.isSuperAdmin(), 'Only the super administrator can remove administrator access.'); u.admin = want.has('admin'); }
  u.personas = ['learner', 'trainer'].filter(x => want.has(x));
  const tl = S.sysroles.find(r => r.userId === u.id && r.roleId === 'teamlead');
  if (want.has('teamlead') && !tl) S.sysroles.push({id:env.uid('sr'), userId:u.id, roleId:'teamlead'});
  if (!want.has('teamlead') && tl) S.sysroles = S.sysroles.filter(r => r !== tl);
  const ids = v => new Set((Array.isArray(v) ? v : []).filter(id => S.cohorts.some(c => c.id === id)));
  const member = ids(p.memberOf), leads = want.has('teamlead') ? ids(p.leads) : new Set(), trains = want.has('trainer') ? ids(p.trains) : new Set();
  const joined = [];
  for (const c of S.cohorts) {
    const set = (key, on) => { const has = c[key].includes(u.id); if (on && !has) { c[key].push(u.id); if (key === 'members') joined.push(c); } if (!on && has) c[key] = c[key].filter(x => x !== u.id); };
    if (p.memberOf !== undefined) set('members', member.has(c.id));
    set('leads', leads.has(c.id)); set('trainers', trains.has(c.id));
  }
  // Trainer for specific courses: course enrolments with the Trainer role
  const tc = new Set(want.has('trainer') ? (Array.isArray(p.trainerCourses) ? p.trainerCourses : []).filter(id => S.courses.some(c => c.id === id)) : []);
  for (const e of S.enrol.filter(e => e.userId === u.id && e.role === 'trainer' && !tc.has(e.courseId))) S.enrol = S.enrol.filter(x => x !== e);
  for (const cid of tc) { const e = S.enrol.find(x => x.userId === u.id && x.courseId === cid); if (!e) S.enrol.push({id:env.uid('e'), courseId:cid, userId:u.id, role:'trainer', time:env.now()}); else if (e.role === 'student' || e.role === 'teacher') e.role = 'trainer'; }
  if (joined.length) applyRules(S, env, u.id);
  const names = {learner:'Learner', trainer:'Trainer', teamlead:'Team Lead', admin:'Administrator'};
  audit(S, env, h.meId, 'Personas set', u.username, [...want].map(x => names[x]).join(', '));
}
const _newUser = OPS.newUser;
op('newUser', (S, h, p, env) => {
  const r = _newUser(S, h, p, env);
  if (p.personas) applyPersonas(S, h, env, S.users.find(u => u.id === r.id), p);
  return r;
});
op('setPersonas', (S, h, p, env) => {
  need(h.has('user:manage'), 'You cannot change what people do on the site.');
  const u = S.users.find(x => x.id === p.userId); need(u, 'User not found.', 404);
  need(!u.admin || h.isAdmin(), 'Only administrators can change an administrator.');
  applyPersonas(S, h, env, u, p);
});
/* ---------------- Super administrator: remove administrator access ---------------- */
op('removeAdmin', (S, h, p, env) => {
  need(h.isSuperAdmin(), 'Only the super administrator can remove administrators.');
  const u = S.users.find(x => x.id === p.id); need(u, 'User not found.', 404);
  need(u.id !== h.meId, 'You cannot remove your own administrator access.', 400);
  need(!u.builtinAdmin, 'This is a built-in site administrator set in the server configuration.', 400);
  need(u.admin || S.sysroles.some(r => r.userId === u.id && r.roleId === 'manager'), 'This person is not an administrator.', 400);
  u.admin = false; S.sysroles = S.sysroles.filter(r => !(r.userId === u.id && r.roleId === 'manager'));
  if (!(u.personas || []).length && !S.sysroles.some(r => r.userId === u.id && r.roleId === 'teamlead')) u.personas = ['learner'];
  notify(S, env, u.id, 'Your administrator access was removed', `By ${h.fullname(h.meId)}`, 'dashboard');
  audit(S, env, h.meId, 'Administrator access removed', u.username, `${u.firstname} ${u.lastname}`);
});

/* ---------------- Course group chats ---------------- */
const chatOf = (S, id) => { const c = (S.chats || []).find(x => x.id === id); need(c, 'Chat not found.', 404); return c; };
function saveChatFields(S, h, c, p) {
  c.name = req(p.name, 'Chat name', 120);
  c.mode = p.mode === 'custom' ? 'custom' : 'course';
  const inCourse = new Set(S.enrol.filter(e => e.courseId === c.courseId).map(e => e.userId));
  c.members = [...new Set((Array.isArray(p.members) ? p.members : []).filter(id => inCourse.has(id) || id === h.meId))];
  if (c.mode === 'custom') { if (!c.members.includes(h.meId)) c.members.push(h.meId); need(c.members.length >= 2, 'Choose at least one other person for the chat.', 400); }
  else c.members = [];
}
function createChat(S, h, env, cid, p) {
  need(h.canManageChats(cid), 'Only trainers of this course and administrators can create group chats.');
  const course = S.courses.find(x => x.id === cid); need(course.status !== 'archived', 'Archived courses cannot have new chats.', 400);
  S.chats ||= []; S.chatMessages ||= [];
  const c = {id:env.uid('ch'), courseId:cid, createdBy:h.meId, created:env.now(), reads:{[h.meId]:env.now()}};
  saveChatFields(S, h, c, {name:p.name || `${course.fullname} · group chat`, mode:p.mode, members:p.members});
  S.chats.push(c);
  for (const uid of H(S, h.meId).chatMembers(c)) if (uid !== h.meId) notify(S, env, uid, `You were added to the group chat ${c.name}`, course.fullname, 'messages', 'chat:' + c.id);
  log(S, env, h.meId, `Group chat created: ${c.name}`, cid);
  return c;
}
op('createChat', (S, h, p, env) => { const c = createChat(S, h, env, p.cid, p); return {id:c.id}; });
op('updateChat', (S, h, p, env) => {
  const c = chatOf(S, p.id); need(h.canManageChats(c.courseId), 'Only trainers of this course and administrators can change group chats.');
  const before = new Set(h.chatMembers(c)); saveChatFields(S, h, c, p);
  const course = S.courses.find(x => x.id === c.courseId);
  for (const uid of H(S, h.meId).chatMembers(c)) if (!before.has(uid)) notify(S, env, uid, `You were added to the group chat ${c.name}`, course?.fullname || '', 'messages', 'chat:' + c.id);
});
op('deleteChat', (S, h, p, env) => {
  const c = chatOf(S, p.id); need(h.canManageChats(c.courseId), 'Only trainers of this course and administrators can delete group chats.');
  S.chats = S.chats.filter(x => x !== c); S.chatMessages = S.chatMessages.filter(m => m.chatId !== c.id);
  log(S, env, h.meId, `Group chat deleted: ${c.name}`, c.courseId); audit(S, env, h.meId, 'Group chat deleted', c.name);
});
op('sendChatMessage', (S, h, p, env) => {
  const c = chatOf(S, p.id); need(h.inChat(c), 'You are not a member of this chat.');
  need(S.courses.find(x => x.id === c.courseId)?.status !== 'archived', 'This course is archived, so its chats are read-only.', 400);
  S.chatMessages.push({id:env.uid('cm'), chatId:c.id, from:h.meId, text:req(p.text, 'Message', 4000), time:env.now()});
  (c.reads ||= {})[h.meId] = env.now();
});
op('readChat', (S, h, p, env) => { const c = chatOf(S, p.id); need(h.inChat(c) || h.canManageChats(c.courseId), 'You cannot open this chat.'); (c.reads ||= {})[h.meId] = env.now(); });
// "Create a group chat" option when a course is created; chats go when their course is deleted
const _newCourse = OPS.newCourse;
op('newCourse', (S, h, p, env) => {
  const r = _newCourse(S, h, p, env);
  if (p.groupChat) createChat(S, H(S, h.meId), env, r.id, {mode:'course'});
  return r;
});
const _deleteCourse = OPS.deleteCourse;
op('deleteCourse', (S, h, p, env) => {
  const r = _deleteCourse(S, h, p, env);
  const gone = new Set((S.chats || []).filter(c => c.courseId === p.id).map(c => c.id));
  if (gone.size) { S.chats = S.chats.filter(c => !gone.has(c.id)); S.chatMessages = S.chatMessages.filter(m => !gone.has(m.chatId)); }
  return r;
});

op('saveCohort', (S, h, p, env) => {
  need(h.has('cohort:manage'), 'You cannot manage cohorts.');
  let c = p.id ? S.cohorts.find(x => x.id === p.id) : null; const before = c ? new Set(c.members) : new Set();
  if (!c) { c = {id:env.uid('co'), created:env.now()}; S.cohorts.push(c); }
  Object.assign(c, {name:req(p.name, 'Cohort name', 120), department:str(p.department, 120), members:uids(S, p.members), leads:uids(S, p.leads), trainers:uids(S, p.trainers), courses:(p.courses || []).filter(id => S.courses.some(x => x.id === id))});
  for (const l of c.leads) if (!S.sysroles.some(r => r.userId === l && r.roleId === 'teamlead')) S.sysroles.push({id:env.uid('sr'), userId:l, roleId:'teamlead'});
  let assigned = 0; for (const m of c.members.filter(x => !before.has(x))) assigned += applyRules(S, env, m);
  audit(S, env, h.meId, p.id ? 'Cohort changed' : 'Cohort created', c.name, `${c.members.length} members, ${c.leads.length} team leads, ${c.trainers.length} trainers, ${c.courses.length} courses`);
  return {id:c.id, assigned};
});
op('deleteCohort', (S, h, p, env) => { need(h.has('cohort:manage'), 'You cannot manage cohorts.'); const c = S.cohorts.find(x => x.id === p.id); need(c, 'Cohort not found.', 404); S.cohorts = S.cohorts.filter(x => x !== c); audit(S, env, h.meId, 'Cohort deleted', c.name); });
op('savePath', (S, h, p, env) => {
  need(h.has('path:manage'), 'You cannot manage learning paths.');
  let x = p.id ? S.paths.find(y => y.id === p.id) : null; if (!x) { x = {id:env.uid('lp'), created:env.now()}; S.paths.push(x); }
  Object.assign(x, {name:req(p.name, 'Path name', 120), description:str(p.description, 1000), sequential:!!p.sequential, courses:(p.courses || []).filter(id => S.courses.some(c => c.id === id))});
  need(x.courses.length, 'Add at least one course to the path.', 400);
  audit(S, env, h.meId, p.id ? 'Learning path changed' : 'Learning path created', x.name, x.courses.map(id => S.courses.find(c => c.id === id)?.shortname).join(' → '));
  return {id:x.id};
});
op('deletePath', (S, h, p, env) => { need(h.has('path:manage'), 'You cannot manage learning paths.'); const x = S.paths.find(y => y.id === p.id); need(x, 'Path not found.', 404); S.paths = S.paths.filter(y => y !== x); audit(S, env, h.meId, 'Learning path deleted', x.name); });
op('saveRule', (S, h, p, env) => {
  need(h.has('path:manage'), 'You cannot manage assignment rules.');
  const kind = p.targetType === 'path' ? 'path' : 'course'; need(kind === 'path' ? S.paths.some(x => x.id === p.targetId) : S.courses.some(x => x.id === p.targetId), 'Choose what to assign.', 400);
  const mt = p.matchType || 'all'; need(['all', 'department', 'cohort'].includes(mt), 'Rules can apply to everyone, a team or a cohort.', 400); need(mt === 'all' || str(p.matchValue).trim(), 'Choose who the rule applies to.', 400);
  let r = p.id ? S.rules.find(x => x.id === p.id) : null; if (!r) { r = {id:env.uid('ru'), created:env.now()}; S.rules.push(r); }
  Object.assign(r, {name:req(p.name, 'Rule name', 120), target:{type:kind, id:p.targetId}, match:{type:mt, value:mt === 'all' ? '' : str(p.matchValue, 120).trim()}, days:Math.max(0, Number(p.days) || 0), active:p.active !== false});
  audit(S, env, h.meId, p.id ? 'Assignment rule changed' : 'Assignment rule created', r.name, `${mt}${r.match.value ? ' = ' + r.match.value : ''} → ${kind} ${p.targetId}, ${r.days} days`);
  return {id:r.id};
});
op('deleteRule', (S, h, p, env) => { need(h.has('path:manage'), 'You cannot manage assignment rules.'); const r = S.rules.find(x => x.id === p.id); need(r, 'Rule not found.', 404); S.rules = S.rules.filter(x => x !== r); audit(S, env, h.meId, 'Assignment rule deleted', r.name); });
op('runRule', (S, h, p, env) => { need(h.has('path:manage'), 'You cannot run assignment rules.'); const r = S.rules.find(x => x.id === p.id); need(r && r.active, 'Activate the rule first.', 400); let n = 0; for (const u of S.users) n += applyRules(S, env, u.id, r.id); audit(S, env, h.meId, 'Assignment rule applied to existing users', r.name, `${n} assignments`); return {assigned:n}; });

/* ---------------- Assignment, deadlines and nudges ---------------- */
op('assign', (S, h, p, env) => {
  const kind = p.kind === 'path' ? 'path' : 'course';
  const cids = kind === 'path' ? (S.paths.find(x => x.id === p.id)?.courses || []) : [p.id];
  need(cids.length && cids.every(id => S.courses.some(c => c.id === id)), 'Choose a course or learning path.', 400);
  const global = h.has('course:assign', null);
  need(global || cids.every(cid => h.has('course:assign', cid)), kind === 'path' ? 'You can only assign learning paths whose courses are all tagged to you.' : 'You cannot assign this course.');
  const scope = h.trainerScope();
  let targets = uids(S, p.users);
  for (const cid of p.cohorts || []) { const co = S.cohorts.find(x => x.id === cid); need(co, 'Cohort not found.', 404); need(global || co.trainers.includes(h.meId), `The cohort ${co.name} is not mapped to you.`); targets.push(...co.members); }
  targets = [...new Set(targets)].filter(id => { const u = S.users.find(x => x.id === id); return u && (!u.admin || u.builtinAdmin || u.personas?.includes('learner')); });
  need(targets.length, 'Choose at least one learner or cohort.', 400);
  if (!global) need(targets.every(id => scope.has(id)), 'You can only assign learners in the cohorts or courses tagged to you.');
  const due = p.due ? Number(p.due) : p.dueDays ? env.now() + Number(p.dueDays) * D : null;
  need(!due || due > env.now(), 'The due date must be in the future.', 400);
  let assigned = 0, skipped = 0;
  for (const uid of targets) for (const cid of cids) { if (assignCourse(S, env, h.meId, uid, cid, due, {mandatory:p.mandatory !== false, source:global ? 'admin' : 'trainer', pathId:kind === 'path' ? p.id : null})) assigned++; else skipped++; }
  audit(S, env, h.meId, 'Training assigned', kind === 'path' ? S.paths.find(x => x.id === p.id).name : S.courses.find(c => c.id === p.id).shortname, `${assigned} assignments to ${targets.length} learners, due ${due ? fmtD(due) : 'none'}`);
  return {assigned, skipped, learners:targets.length};
});
op('setDue', (S, h, p, env) => {
  need(h.has('course:assign', p.cid), 'You cannot change due dates in this course.'); const e = h.enrolOf(p.cid, p.userId); need(e, 'Enrolment not found.', 404);
  const old = e.due; e.due = p.due ? Number(p.due) : null; e.remindersSent = []; e.lockNotified = false;
  audit(S, env, h.meId, 'Due date changed', `${h.course(p.cid).shortname} › ${h.fullname(p.userId)}`, `${fmtD(old)} → ${fmtD(e.due)}`);
});
op('nudge', (S, h, p, env) => {
  const c = courseOf(S, p.cid); const team = new Set(h.teamMembers()), scope = h.trainerScope();
  const list = uids(S, p.users); need(list.length, 'Choose who to remind.', 400);
  for (const uid of list) need(h.isAdmin() || team.has(uid) || (scope.has(uid) && h.has('grade:viewall', c.id)), 'You can only remind people in your team or your courses.');
  for (const uid of list) { const e = h.enrolOf(c.id, uid); notifyT(S, env, 'nudge', uid, {course:c.fullname, sender:h.fullname(h.me()), duepart:e?.due ? ` It is due on ${fmtD(e.due)}.` : '', short:`From ${h.fullname(h.me())}${e?.due ? ` · due ${fmtD(e.due)}` : ''}`}, 'course', c.id); }
  log(S, env, h.meId, `Reminder sent to ${list.length} learner${list.length > 1 ? 's' : ''}`, c.id);
  return {sent:list.length};
});

/* ---------------- Overdue lockout: access requests ---------------- */
op('requestAccess', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.isLocked(c.id), 'This course is not locked.', 400);
  const reason = req(p.reason, 'A justification', 2000); need(reason.length >= 10, 'Please explain in at least a sentence why you need more time.', 400);
  need(!S.accessRequests.some(r => r.courseId === c.id && r.userId === h.meId && r.status === 'pending'), 'You already have a pending request for this course.', 400);
  const r = {id:env.uid('ar'), courseId:c.id, userId:h.meId, reason, time:env.now(), status:'pending'}; S.accessRequests.push(r);
  const approvers = S.users.filter(u => !u.suspended && H(S, u.id).has('access:approve'));
  for (const a of approvers) notifyT(S, env, 'accessRequest', a.id, {learner:h.fullname(h.me()), course:c.fullname, reason, short:`${h.fullname(h.me())} · ${c.shortname}`}, 'approvals', null);
  audit(S, env, h.meId, 'Access requested', `${c.shortname} › ${h.fullname(h.me())}`, reason);
  return {id:r.id};
});
op('decideAccess', (S, h, p, env) => {
  need(h.has('access:approve'), 'You cannot approve access requests.'); const r = S.accessRequests.find(x => x.id === p.id); need(r && r.status === 'pending', 'This request has already been decided.', 400);
  const c = courseOf(S, r.courseId), e = h.enrolOf(c.id, r.userId);
  const remarks = str(p.remarks, 1000).trim();
  if (p.approve) {
    const due = Number(p.due); need(due && due > env.now(), 'Choose a new due date in the future.', 400);
    const old = e?.due; if (e) Object.assign(e, {due, remindersSent:[], lockNotified:false, extensions:(e.extensions || 0) + 1});
    Object.assign(r, {status:'approved', decidedBy:h.meId, decidedAt:env.now(), newDue:due, remarks});
    notifyT(S, env, 'accessApproved', r.userId, {course:c.fullname, due:fmtD(due), remarks:remarks ? `Remarks: ${remarks}` : '', short:`New due date ${fmtD(due)}`}, 'course', c.id);
    audit(S, env, h.meId, 'Overdue access approved', `${c.shortname} › ${h.fullname(r.userId)}`, `Due ${fmtD(old)} → ${fmtD(due)}${remarks ? `. ${remarks}` : ''}`);
  } else {
    need(remarks, 'Add a remark explaining why the request is declined.', 400);
    Object.assign(r, {status:'rejected', decidedBy:h.meId, decidedAt:env.now(), remarks});
    notifyT(S, env, 'accessRejected', r.userId, {course:c.fullname, remarks, short:remarks}, 'course', c.id);
    audit(S, env, h.meId, 'Overdue access rejected', `${c.shortname} › ${h.fullname(r.userId)}`, remarks);
  }
});

/* ---------------- Live sessions (ILT / VILT) ---------------- */
op('liveRegister', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'live', 'Not a live session.', 400);
  need(!m.start || m.start + (m.duration || 60) * 6e4 > env.now(), 'This session has already taken place.', 400);
  const taken = S.liveSignups.filter(x => x.cmid === m.id && !x.archived).length; need(!m.capacity || taken < m.capacity, 'This session is full.', 400);
  if (!S.liveSignups.some(x => x.cmid === m.id && x.userId === h.meId && !x.archived)) S.liveSignups.push({id:env.uid('ls'), cmid:m.id, userId:h.meId, status:'registered', time:env.now()});
});
/* ---------------- Live sessions tab: sessions scheduled by administrators, outside courses ----------------
   The administrator picks invitees from all registered users. Invitations, changes and cancellations are emailed
   from the site's own address with a link to the session page (?go=session). Joining records attendance. */
const canSchedule = h => h.isAdmin() || h.has('site:config');
const sessOf = (S, id) => { const s = (S.sessions || []).find(x => x.id === id); need(s, 'Live session not found.', 404); return s; };
const sessEnd = s => s.start + (s.duration || 60) * 6e4;
function sessVars(s, extra) { return {item:s.name, when:fmtD(s.start), duration:`${s.duration || 60} minutes`, where:Core.liveWhere(s), about:s.description ? `\n${s.description}\n` : '', reason:'', short:fmtD(s.start), ...extra}; }
const newRoom = env => ('nbacademy-' + env.uid('').replace(/[^a-z0-9]/gi, '') + Math.random().toString(36).slice(2, 10)).toLowerCase();
op('saveSession', (S, h, p, env) => {
  need(canSchedule(h), 'Only administrators can schedule live sessions.');
  S.sessions ||= []; const isNew = !p.id, s = isNew ? {id:env.uid('ls'), created:env.now(), createdBy:h.meId, attendance:{}, invited:[]} : sessOf(S, p.id);
  need(!s.cancelled, 'This session was cancelled.', 400);
  const was = isNew ? null : JSON.stringify([s.start, s.duration, s.mode, s.location, s.link]);
  s.name = req(p.name, 'Title', 200); s.description = str(p.description, 5000).trim();
  const start = Number(p.start); need(start > 0, 'Set the date and time.', 400); need(!isNew || start > env.now() - 6e4, 'The start time is in the past.', 400); s.start = start;
  s.duration = Math.min(600, Math.max(5, Number(p.duration) || 60));
  s.mode = ['room', 'vilt', 'ilt'].includes(p.mode) ? p.mode : 'room';
  s.link = str(p.link, 500).trim(); s.location = str(p.location, 300).trim();
  if (s.mode === 'vilt') need(/^https?:\/\//i.test(s.link), 'Enter the meeting link, starting with https://', 400);
  if (s.mode === 'ilt') need(s.location, 'Enter the location.', 400);
  if (s.mode === 'room' && !s.room) s.room = newRoom(env);
  const ids = [...new Set(Array.isArray(p.invitees) ? p.invitees.map(String) : [])];
  const missing = ids.filter(id => !h.user(id)); need(!missing.length, 'Some of the people chosen no longer exist. Reload the page and try again.', 400);
  const off = ids.filter(id => h.user(id).suspended); need(!off.length, `Suspended: ${off.map(id => h.fullname(id)).join(', ')}`, 400);
  need(ids.length, 'Choose at least one person to invite.', 400); need(ids.length <= 2000, 'Invite at most 2,000 people to one session.', 400);
  const removed = (s.invitees || []).filter(id => !ids.includes(id)); s.invitees = ids;
  if (isNew) S.sessions.push(s);
  const changed = !isNew && was !== JSON.stringify([s.start, s.duration, s.mode, s.location, s.link]);
  // Emails, only for sessions still to come
  const sent = new Set(s.invited || []), v = sessVars(s);
  if (sessEnd(s) > env.now()) {
    for (const id of ids) { if (!sent.has(id)) { notifyT(S, env, 'sessionInvite', id, v, 'session', s.id); sent.add(id); } else if (changed) notifyT(S, env, 'sessionUpdated', id, v, 'session', s.id); }
    for (const id of removed) if (sent.has(id)) { notifyT(S, env, 'sessionCancelled', id, {...v, reason:'You are no longer invited to this session.'}, 'dashboard'); sent.delete(id); }
  }
  s.invited = [...sent]; if (changed) s.reminded = [];
  audit(S, env, h.meId, isNew ? 'Live session scheduled' : 'Live session changed', s.name, `${fmtD(s.start)} · ${ids.length} invited${removed.length ? ` · ${removed.length} removed` : ''}`);
  return {id:s.id, invited:ids.length};
});
op('cancelSession', (S, h, p, env) => {
  need(canSchedule(h), 'Only administrators can cancel live sessions.'); const s = sessOf(S, p.id); need(!s.cancelled, 'This session is already cancelled.', 400);
  s.cancelled = env.now(); const reason = str(p.reason, 500).trim();
  if (sessEnd(s) > env.now()) for (const id of s.invited || []) notifyT(S, env, 'sessionCancelled', id, sessVars(s, {reason}), 'dashboard');
  audit(S, env, h.meId, 'Live session cancelled', s.name, fmtD(s.start));
});
op('sessionAttendance', (S, h, p, env) => {
  need(canSchedule(h), 'Only administrators can change attendance.'); const s = sessOf(S, p.id); s.attendance ||= {};
  for (const [uid, st] of Object.entries(p.marks || {})) { if (!(s.invitees || []).includes(uid)) continue;
    if (!st) delete s.attendance[uid]; else if (['present', 'late', 'absent'].includes(st)) s.attendance[uid] = {...(s.attendance[uid] || {}), status:st, by:h.meId}; }
  audit(S, env, h.meId, 'Live session attendance saved', s.name);
});
op('sessionJoin', (S, h, p, env) => {
  const s = sessOf(S, p.id), admin = canSchedule(h), invited = (s.invitees || []).includes(h.meId);
  need(admin || invited, 'You are not invited to this session.'); need(!s.cancelled, 'This session was cancelled.', 400);
  need(s.mode === 'room', 'This session is not held in NB Academy.', 400);
  const t = env.now(); need(t >= s.start - (admin ? 60 : 15) * 6e4, `The room opens ${admin ? 60 : 15} minutes before the session starts (${fmtD(s.start)}).`, 400);
  need(t <= sessEnd(s) + (admin ? 120 : 30) * 6e4, 'This session has ended.', 400);
  if (invited) { s.attendance ||= {}; const a = s.attendance[h.meId] ||= {}; if (!a.status || a.status === 'absent' && !a.by) a.status = t > s.start + 10 * 6e4 ? 'late' : 'present'; a.joinedAt ||= t; a.lastJoin = t; }
  if (!s.room) s.room = newRoom(env);
  const u = h.me(); return {room:s.room, name:`${u.firstname} ${u.lastname}`.trim(), email:u.email || '', id:u.id, moderator:admin, until:sessEnd(s) + 3 * 3600e3};
});
// Reminders the day before, and what each person may see
function sessionTick(S, env) { let n = 0; const now = env.now();
  for (const s of S.sessions || []) { if (s.cancelled || s.start <= now || s.start - now > D) continue; s.reminded ||= [];
    for (const id of s.invited || []) if (!s.reminded.includes(id)) { notifyT(S, env, 'sessionReminder', id, sessVars(s), 'session', s.id); s.reminded.push(id); n++; } }
  return n; }
VIEW_HOOKS.push((S, h, V) => { const meId = h.meId;
  if (canSchedule(h)) { V.sessions = clone(S.sessions || []).map(s => { delete s.room; return s; }); return; }
  V.sessions = (S.sessions || []).filter(s => (s.invitees || []).includes(meId)).map(s => ({id:s.id, name:s.name, description:s.description, start:s.start, duration:s.duration, mode:s.mode, location:s.location, link:s.link, cancelled:s.cancelled || null, invitedCount:(s.invitees || []).length, mine:clone(s.attendance?.[meId] || null)}));
});
/* Joining a session held in NB Academy: checks who and when, records attendance, and returns what the server needs
   to sign the meeting link (the server adds the Jitsi address and the signed token; see /api/live/join). */
op('liveJoin', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'live' && m.mode === 'room', 'This session is not held in NB Academy.', 400); mustSeeMod(h, m);
  const manage = h.has('live:manage', m.courseId), learner = h.isLearner(m.courseId), t = env.now(), end = Core.liveEnd(m);
  let x = S.liveSignups.find(y => y.cmid === m.id && y.userId === h.meId && !y.archived);
  need(manage || learner, 'Only the learners and trainers of this course can join.');
  need(t >= m.start - (manage ? 60 : 15) * 6e4, `The room opens ${manage ? 60 : 15} minutes before the session starts (${fmtD(m.start)}).`, 400);
  need(t <= end + (manage ? 120 : 30) * 6e4, 'This session has ended.', 400);
  if (learner && !manage) {
    if (!x) { const taken = S.liveSignups.filter(y => y.cmid === m.id && !y.archived).length; need(!m.capacity || taken < m.capacity, 'This session is full.', 400); x = {id:env.uid('ls'), cmid:m.id, userId:h.meId, status:'registered', time:t}; S.liveSignups.push(x); }
    if (x.status === 'registered') { x.status = t > m.start + 10 * 6e4 ? 'late' : 'present'; x.auto = true; log(S, env, h.meId, `Joined live session: ${m.name}`, m.courseId); checkBadges(S, env, h.meId, m.courseId); }
    x.joinedAt ||= t; x.lastJoin = t;
  }
  if (!m.room) m.room = ('nbacademy-' + env.uid('').replace(/[^a-z0-9]/gi, '') + Math.random().toString(36).slice(2, 10)).toLowerCase();
  const u = h.me(); return {room:m.room, name:`${u.firstname} ${u.lastname}`.trim(), email:u.email || '', id:u.id, moderator:manage, until:end + 3 * 3600e3};
});
op('liveCancel', (S, h, p) => { const m = modOf(S, p.mid); mustLearn(h, m); S.liveSignups = S.liveSignups.filter(x => !(x.cmid === m.id && x.userId === h.meId && x.status === 'registered' && !x.archived)); });
op('liveAttendance', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'live' && h.has('live:manage', m.courseId), 'You cannot take attendance for this session.');
  let n = 0;
  for (const [uid, st] of Object.entries(p.marks || {})) {
    if (!['present', 'late', 'absent', 'registered'].includes(st) || !h.isLearner(m.courseId, uid)) continue;
    let x = S.liveSignups.find(y => y.cmid === m.id && y.userId === uid && !y.archived);
    if (!x) { x = {id:env.uid('ls'), cmid:m.id, userId:uid, status:'registered', time:env.now()}; S.liveSignups.push(x); }
    if (x.status !== st) { x.status = st; x.markedBy = h.meId; x.markedAt = env.now(); n++; }
    checkBadges(S, env, uid, m.courseId);
  }
  audit(S, env, h.meId, 'Attendance recorded', `${h.course(m.courseId).shortname} › ${m.name}`, `${n} changes`);
  return {changed:n};
});
op('liveRecording', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'live' && h.has('live:manage', m.courseId), 'You cannot add recordings to this session.');
  if (p.fileId) { const f = S.files.find(x => x.id === p.fileId); need(f, 'Upload the recording first.', 400); m.recordingFileId = f.id; }
  if (p.url !== undefined) { const u = str(p.url, 500).trim(); need(!u || /^https?:\/\//.test(u), 'Links must start with http:// or https://', 400); m.recordingUrl = u; }
  log(S, env, h.meId, `Recording added: ${m.name}`, m.courseId);
});

/* ---------------- Resume where you left off: video and SCORM ---------------- */
op('saveProgress', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'video', 'Not a video.', 400);
  const k = h.meId + ':' + m.id, r = S.resume[k] || (S.resume[k] = {});
  r.position = Math.max(0, Number(p.position) || 0); r.duration = Math.max(0, Number(p.duration) || 0); r.updated = env.now();
  r.watched = Math.max(r.watched || 0, r.position);
  if (!r.completed && r.duration && r.watched / r.duration * 100 >= (m.completePct || 90)) { r.completed = env.now(); log(S, env, h.meId, `Video watched: ${m.name}`, m.courseId); checkBadges(S, env, h.meId, m.courseId); }
  return {completed:!!r.completed};
});
op('scormCommit', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'scorm', 'Not a SCORM package.', 400);
  const k = h.meId + ':' + m.id, r = S.resume[k] || (S.resume[k] = {}); const c = p.cmi || {};
  r.location = str(c['cmi.core.lesson_location'] ?? r.location, 255); r.suspend = str(c['cmi.suspend_data'] ?? r.suspend, 64000);
  const st = String(c['cmi.core.lesson_status'] || r.status || 'incomplete'); r.status = st;
  if (c['cmi.core.score.raw'] !== undefined && c['cmi.core.score.raw'] !== '') r.score = Math.max(0, Math.min(100, Number(c['cmi.core.score.raw']) || 0));
  r.updated = env.now(); r.sessions = (r.sessions || 0) + (p.finish ? 1 : 0);
  if (!r.completed && ['completed', 'passed'].includes(st)) { r.completed = env.now(); log(S, env, h.meId, `SCORM completed: ${m.name}`, m.courseId); }
  checkBadges(S, env, h.meId, m.courseId);
  return {status:r.status, completed:!!r.completed};
});

/* ---------------- Feedback survey ---------------- */
op('submitFeedback', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'feedback', 'Not a feedback survey.', 400);
  need(!S.feedbackResponses.some(r => r.cmid === m.id && r.userId === h.meId && !r.archived), 'You have already completed this survey. Thank you!', 400);
  const ans = {};
  for (const q of m.questions) {
    const v = p.answers?.[q.id];
    if (q.type === 'rating') { const n = Number(v); if (n >= 1 && n <= 5) ans[q.id] = n; }
    else if (q.type === 'choice') { const i = Number(v); if (Number.isInteger(i) && q.options[i] != null) ans[q.id] = i; }
    else if (str(v).trim()) ans[q.id] = str(v, 4000).trim();
    need(!q.required || ans[q.id] != null, `Answer "${q.text}".`, 400);
  }
  S.feedbackResponses.push({id:env.uid('fr'), cmid:m.id, userId:h.meId, answers:ans, time:env.now()});
  log(S, env, h.meId, `Feedback submitted: ${m.name}`, m.courseId); checkBadges(S, env, h.meId, m.courseId);
});

/* ---------------- Quiz: essays, attempts, item analysis ---------------- */
op('gradeEssay', (S, h, p, env) => {
  const a = S.attempts.find(x => x.id === p.aid); need(a && a.state === 'finished', 'Attempt not found.', 404);
  const m = modOf(S, a.cmid); need(h.has('grade:edit', m.courseId), 'You cannot grade this quiz.');
  const rv = a.review?.[p.qid]; need(rv && rv.type === 'essay', 'Essay question not found.', 404);
  const mark = Number(p.mark); need(!isNaN(mark) && mark >= 0 && mark <= rv.mark, `Enter a mark between 0 and ${rv.mark}.`, 400);
  const old = rv.got; a.score = a.score - (rv.got || 0) + mark; rv.got = mark; rv.pending = false; rv.comment = str(p.comment, 2000); rv.gradedBy = h.meId;
  a.pending = Object.values(a.review).some(x => x.pending);
  if (!a.pending) notifyT(S, env, 'graded', a.userId, {item:m.name, course:h.course(m.courseId)?.fullname, grade:`${(a.score / a.max * m.maxgrade).toFixed(2)} / ${m.maxgrade}`, short:`${m.name}: essay graded`}, 'review', a.id);
  audit(S, env, h.meId, old ? 'Essay mark changed' : 'Essay graded', `${h.course(m.courseId).shortname} › ${m.name} › ${h.fullname(a.userId)}`, `${old || 0} → ${mark} of ${rv.mark}`);
  checkBadges(S, env, a.userId, m.courseId);
});
op('resetAttempts', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'quiz' && h.has('attempts:manage', m.courseId), 'You cannot reset attempts for this quiz.');
  let n = 0; for (const a of S.attempts) if (a.cmid === m.id && a.userId === p.userId && !a.archived) { a.archived = true; a.resetBy = h.meId; n++; }
  audit(S, env, h.meId, 'Quiz attempts reset', `${h.course(m.courseId).shortname} › ${m.name} › ${h.fullname(p.userId)}`, `${n} attempts archived`);
  notify(S, env, p.userId, `Your attempts were reset: ${m.name}`, 'You can attempt the quiz again', 'mod', m.id);
  return {reset:n};
});
op('grantAttempts', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'quiz' && h.has('attempts:manage', m.courseId), 'You cannot grant attempts for this quiz.');
  const n = Math.max(1, Math.min(10, Number(p.n) || 1)); const k = p.userId + ':' + m.id; S.extraAttempts[k] = (Number(S.extraAttempts[k]) || 0) + n;
  audit(S, env, h.meId, 'Extra quiz attempts granted', `${h.course(m.courseId).shortname} › ${m.name} › ${h.fullname(p.userId)}`, `+${n}`);
  notify(S, env, p.userId, `Extra attempt${n > 1 ? 's' : ''} granted: ${m.name}`, `You have ${n} more attempt${n > 1 ? 's' : ''}`, 'mod', m.id);
});
function itemAnalysis(S, m) {
  const at = S.attempts.filter(a => a.cmid === m.id && a.state === 'finished' && !a.preview && !a.archived && a.review);
  const pass = m.gradepass || 0;
  const pct = at.map(a => a.max ? a.score / a.max * 100 : 0);
  const items = (m.questions || []).map(q => {
    const rows = at.map(a => ({ans:a.answers?.[q.id], rv:a.review[q.id]})).filter(r => r.rv);
    const answered = rows.filter(r => r.ans != null && r.ans !== '');
    const correct = rows.filter(r => r.rv.got >= r.rv.mark && r.rv.mark > 0).length;
    const avg = rows.length ? rows.reduce((s, r) => s + (r.rv.got || 0), 0) / rows.length / (q.mark || 1) * 100 : null;
    let options = null;
    if (q.type === 'mc' || q.type === 'tf') { const opts = q.type === 'mc' ? q.options.map((o, i) => ({key:String(i), text:o.text, correct:!!o.correct})) : [{key:'true', text:'True', correct:q.answer === true}, {key:'false', text:'False', correct:q.answer === false}]; options = opts.map(o => ({...o, n:answered.filter(r => String(r.ans) === o.key).length})); }
    return {id:q.id, text:q.text, type:q.type, attempts:rows.length, answered:answered.length, facility:rows.length ? correct / rows.length * 100 : null, avg, options};
  });
  return {attempts:at.length, average:pct.length ? pct.reduce((a, b) => a + b, 0) / pct.length : null, passRate:pass && pct.length ? pct.filter(x => x >= pass).length / pct.length * 100 : null, pass, items};
}

/* ---------------- Central question bank ---------------- */
const canBank = (S, h) => h.has('qbank:manage');
op('saveBankQuestion', (S, h, p, env) => {
  need(canBank(S, h), 'You cannot manage the question bank.');
  const tmp = {id:'tmpquiz', type:'quiz', courseId:null, questions:[]};
  // reuse quiz validation by running the same checks inline
  const q = {type:p.q?.type, text:req(p.q?.text, 'Question text', 4000), mark:Math.max(0.5, Number(p.q?.mark) || 1)};
  need(Core.QTYPES[q.type], 'Unknown question type.', 400);
  if (q.type === 'mc') { q.options = (p.q.options || []).map(o => ({text:str(o.text, 500).trim(), correct:!!o.correct})).filter(o => o.text); need(q.options.length >= 2 && q.options.filter(o => o.correct).length === 1, 'Add at least two choices and mark exactly one as correct with *.', 400); q.options.forEach(o => { if (!o.correct) delete o.correct; }); }
  if (q.type === 'tf') q.answer = !!p.q.answer;
  if (q.type === 'short') q.answer = req(p.q.answer, 'Accepted answer', 500);
  if (q.type === 'num') { need(p.q.answer !== '' && !isNaN(Number(p.q.answer)), 'Enter the correct numerical answer.', 400); q.answer = Number(p.q.answer); q.tol = Math.abs(Number(p.q.tol) || 0); }
  if (q.type === 'essay') q.guidance = str(p.q.guidance, 2000);
  void tmp;
  let b = p.id ? S.qbank.find(x => x.id === p.id) : null; if (!b) { b = {id:env.uid('qb'), created:env.now()}; S.qbank.push(b); }
  Object.assign(b, q, {category:req(p.category, 'Category', 80), updated:env.now()});
  // keep linked quiz copies in sync
  let synced = 0; for (const m of Object.values(S.mods)) if (m.type === 'quiz') for (let i = 0; i < (m.questions || []).length; i++) if (m.questions[i].bankId === b.id) { const keep = m.questions[i].id; m.questions[i] = {...clone(q), id:keep, bankId:b.id}; synced++; }
  audit(S, env, h.meId, p.id ? 'Bank question edited' : 'Bank question created', b.category, `${b.text.slice(0, 80)}${synced ? ` (updated in ${synced} quizzes)` : ''}`);
  return {id:b.id, synced};
});
op('deleteBankQuestion', (S, h, p, env) => { need(canBank(S, h), 'You cannot manage the question bank.'); const b = S.qbank.find(x => x.id === p.id); need(b, 'Question not found.', 404); S.qbank = S.qbank.filter(x => x !== b); audit(S, env, h.meId, 'Bank question deleted', b.category, b.text.slice(0, 80)); });
op('addFromBank', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(m.type === 'quiz' && h.canEdit(m.courseId), 'You cannot edit this quiz.');
  let ids = Array.isArray(p.ids) ? p.ids : [];
  if (p.random && p.category) { const pool = S.qbank.filter(b => b.category === p.category && !(m.questions || []).some(q => q.bankId === b.id)); ids = pool.sort(() => Math.random() - .5).slice(0, Math.max(1, Number(p.random) || 1)).map(b => b.id); }
  let n = 0; m.questions ||= [];
  for (const id of ids) { const b = S.qbank.find(x => x.id === id); if (!b || m.questions.some(q => q.bankId === id)) continue; const {id:_, category, created, updated, ...q} = clone(b); m.questions.push({...q, id:'q' + Math.random().toString(36).slice(2, 8), bankId:b.id}); n++; }
  need(n, 'No new questions to add.', 400);
  audit(S, env, h.meId, 'Questions added from bank', `${h.course(m.courseId).shortname} › ${m.name}`, `${n} questions`);
  return {added:n};
});

/* ---------------- Course versions, publishing and archiving ---------------- */
function snapshot(S, h, c) { return {sections:clone(c.sections), mods:Object.fromEntries(h.courseMods(c.id).map(m => [m.id, clone(m)]))}; }
function restartLearner(S, env, h, cid, uid) {
  const mids = new Set(h.courseMods(cid).map(m => m.id));
  for (const k of ['submissions', 'attempts', 'lessonAttempts', 'choiceAnswers', 'wsSubs', 'feedbackResponses', 'liveSignups', 'certIssued']) for (const x of S[k]) if (x.userId === uid && mids.has(x.cmid) && !x.archived) x.archived = true;
  for (const k of Object.keys(S.completion)) { const [u, m] = k.split(':'); if (u === uid && mids.has(m)) delete S.completion[k]; }
  for (const k of Object.keys(S.resume)) { const [u, m] = k.split(':'); if (u === uid && mids.has(m)) delete S.resume[k]; }
  const e = h.enrolOf(cid, uid); if (e) Object.assign(e, {completedAt:null, startedAt:null, cycleStart:env.now(), remindersSent:[], lockNotified:false, lastMod:null});
}
op('publishCourse', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('course:update', c.id), 'You cannot publish this course.'); need(c.status !== 'archived', 'Unarchive the course first.', 400);
  const mode = p.mode === 'restart' ? 'restart' : 'keep';
  c.version = (c.version || 0) + 1; c.status = 'published';
  S.courseVersions.push({id:env.uid('cv'), courseId:c.id, version:c.version, notes:str(p.notes, 1000) || (c.version === 1 ? 'First published version' : ''), mode, time:env.now(), by:h.meId, snapshot:snapshot(S, h, c)});
  let restarted = 0;
  if (mode === 'restart' && c.version > 1) for (const u of h.students(c.id)) { const st = h.status(c.id, u.id); if (st === 'inprogress' || st === 'overdue') { restartLearner(S, env, h, c.id, u.id); notify(S, env, u.id, `${c.fullname} has been updated`, `Please restart it on version ${c.version}`, 'course', c.id); restarted++; } }
  audit(S, env, h.meId, 'Course version published', c.shortname, `v${c.version}${mode === 'restart' ? `, ${restarted} in-progress learners restarted` : ', in-progress learners keep their progress'}${p.notes ? `. ${p.notes}` : ''}`);
  return {version:c.version, restarted};
});
op('restoreVersion', (S, h, p, env) => {
  const v = S.courseVersions.find(x => x.id === p.id); need(v?.snapshot, 'Version not found.', 404); const c = courseOf(S, v.courseId); need(h.has('course:update', c.id) && h.canEdit(c.id), 'You cannot change this course.');
  for (const m of h.courseMods(c.id)) if (!v.snapshot.mods[m.id]) delete S.mods[m.id];
  for (const [id, m] of Object.entries(v.snapshot.mods)) S.mods[id] = clone(m);
  c.sections = clone(v.snapshot.sections);
  audit(S, env, h.meId, 'Course content rolled back', c.shortname, `Content restored from v${v.version}. Publish to make it a new version.`);
});
op('archiveCourse', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('course:delete') || h.has('course:update', c.id), 'You cannot archive this course.');
  c.status = p.on === false ? 'published' : 'archived'; c.selfenrol = c.status === 'archived' ? false : c.selfenrol;
  if (c.status === 'archived') S.rules.forEach(r => { if (r.target.type === 'course' && r.target.id === c.id) r.active = false; });
  audit(S, env, h.meId, p.on === false ? 'Course unarchived' : 'Course archived', c.shortname, p.on === false ? '' : 'Hidden from new enrolments; history kept');
});

/* ---------------- Audit verification ---------------- */
op('verifyAudit', (S, h) => { need(h.has('audit:view'), 'You cannot view the audit log.'); return Core.verifyAudit(S.audit); });

/* ---------------- Scheduler: reminders, overdue locks, recertification, live sessions ---------------- */
function tick(S, env) {
  const now = env.now(); let n = 0;
  const days = (S.site.reminders || [7, 3, 1]).slice().sort((a, b) => b - a);
  for (const e of S.enrol) {
    const h = H(S, e.userId); if (!h.user(e.userId) || h.user(e.userId).suspended || !e.due || !h.isLearner(e.courseId, e.userId)) continue;
    const c = h.course(e.courseId); if (!c || c.status === 'archived') continue;
    const st = h.status(c.id, e.userId); if (st === 'completed') continue;
    if (now > e.due) {
      if (!e.lockNotified) { e.lockNotified = true; e.lockedAt = now; n++; notifyT(S, env, 'overdue', e.userId, {course:c.fullname, due:fmtD(e.due), short:'Request access to continue'}, 'course', c.id); log(S, env, e.userId, 'Course locked: overdue', c.id);
        for (const co of S.cohorts.filter(x => x.members.includes(e.userId))) for (const l of co.leads) notify(S, env, l, `Overdue: ${h.fullname(e.userId)} · ${c.shortname}`, 'Course locked after the deadline', 'team', null); }
      continue;
    }
    e.remindersSent ||= [];
    const left = e.due - now;
    const d = days.find(x => left <= x * D && !e.remindersSent.includes(x));
    if (d != null) { for (const x of days) if (x >= d && !e.remindersSent.includes(x)) e.remindersSent.push(x); n++;
      const dl = left < D ? `${Math.max(1, Math.round(left / 36e5))} hours` : `${Math.round(left / D)} days`;
      notifyT(S, env, 'deadline', e.userId, {course:c.fullname, due:fmtD(e.due), days:dl, progress:h.progress(c.id, e.userId), short:`Due in ${dl}`}, 'course', c.id); }
  }
  // recertification: re-assign before the certificate expires
  const before = (S.site.recertDays || 30) * D;
  for (const ci of S.certIssued) {
    if (!ci.expires || ci.archived || ci.renewalStarted || ci.expires - now > before) continue;
    const m = S.mods[ci.cmid]; if (!m) continue; const h = H(S, ci.userId), c = h.course(m.courseId); if (!c || c.status === 'archived' || !h.enrolOf(c.id, ci.userId)) continue;
    ci.renewalStarted = now; restartLearner(S, env, h, c.id, ci.userId); ci.archived = true; ci.renewalStarted = now;
    const e = h.enrolOf(c.id, ci.userId); Object.assign(e, {due:ci.expires, mandatory:true, source:'recertification', assignedAt:now});
    notifyT(S, env, 'recert', ci.userId, {course:c.fullname, expires:fmtD(ci.expires), due:fmtD(ci.expires), short:`Complete by ${fmtD(ci.expires)}`}, 'course', c.id);
    audit(S, env, null, 'Recertification started', `${c.shortname} › ${h.fullname(ci.userId)}`, `Certificate ${ci.code} expires ${fmtD(ci.expires)}`); n++;
  }
  n += sessionTick(S, env); // Live sessions tab: reminders the day before
  // live session reminders 24 hours before
  for (const x of S.liveSignups) {
    if (x.archived || x.reminded || x.status !== 'registered') continue; const m = S.mods[x.cmid]; if (!m?.start) continue;
    if (m.start > now && m.start - now <= D) { x.reminded = true; n++; const h = H(S, x.userId);
      notifyT(S, env, 'liveSession', x.userId, {item:m.name, course:h.course(m.courseId)?.fullname, when:fmtD(m.start), where:Core.liveWhere(m), short:fmtD(m.start)}, 'mod', m.id); }
  }
  S.tokens = S.tokens.filter(t => t.expires > now);
  return n;
}

/* ---------------- Analytics helpers (run on whatever data the viewer can see) ---------------- */
function learnerRows(S, h, filter = {}) {
  const rows = [];
  for (const e of S.enrol) {
    const u = h.user(e.userId), c = h.course(e.courseId); if (!u || !c || u.admin || !h.role(e.role)?.caps?.['mod:submit']) continue;
    if (filter.users && !filter.users.has(u.id)) continue; if (filter.courses && !filter.courses.has(c.id)) continue;
    if (filter.department && (u.department || '') !== filter.department) continue;
    const status = h.status(c.id, u.id), prog = h.progress(c.id, u.id), total = h.courseTotal(c.id, u.id);
    const quizzes = h.courseMods(c.id).filter(m => m.type === 'quiz' && !m.pretest).map(m => ({m, p:h.quizPercent(m, u.id)})).filter(x => x.p != null);
    const lowQuiz = quizzes.find(x => x.p < (x.m.gradepass || 60));
    const dueSoon = e.due && status !== 'completed' && status !== 'overdue' && e.due - Date.now() <= 7 * D;
    rows.push({e, u, c, status, progress:prog, total, due:e.due || null, hours:(e.timeSpent || 0) / 3600, credit:status === 'completed' ? (c.hours || 0) : 0,
      atRisk:status === 'overdue' || !!dueSoon || !!lowQuiz, riskWhy:status === 'overdue' ? 'Overdue' : dueSoon ? `Due ${fmtD(e.due)}, ${prog}% done` : lowQuiz ? `${Math.round(lowQuiz.p)}% in ${lowQuiz.m.name}` : '',
      completedAt:e.completedAt || null, startedAt:e.startedAt || null, assignedAt:e.assignedAt || e.time});
  }
  return rows;
}
function summarize(rows) {
  const by = {notstarted:0, inprogress:0, completed:0, overdue:0}; rows.forEach(r => by[r.status]++);
  const done = rows.filter(r => r.completedAt && r.startedAt);
  return {total:rows.length, ...by, completionRate:rows.length ? by.completed / rows.length * 100 : 0, atRisk:rows.filter(r => r.atRisk).length,
    hours:rows.reduce((a, r) => a + r.hours, 0), creditHours:rows.reduce((a, r) => a + r.credit, 0),
    avgDays:done.length ? done.reduce((a, r) => a + (r.completedAt - r.startedAt) / D, 0) / done.length : null,
    learners:new Set(rows.map(r => r.u.id)).size};
}
function dropOff(S, h, cid) {
  const learners = h.students(cid), mods = h.courseMods(cid).filter(h.trackable);
  return mods.map(m => ({m, done:learners.filter(u => h.isDone(m, u.id)).length, of:learners.length}));
}

/* ---------------- Per-user view additions ---------------- */
VIEW_HOOKS.push((S, h, V) => {
  // live session recordings are only for people in the course
  for (const m of Object.values(V.mods)) if (m.type === 'live' && m.oversightOnly) { delete m.link; delete m.recordingUrl; delete m.recordingFileId; }
});

/* ---------------- Demo data for the lifecycle features ---------------- */
// Demo data: its departments (Analytics, Sales…) join the team list so demo users stay valid
SEED_HOOKS.push(S => { S.site.teams = [...new Set([...Core.TEAMS, ...S.users.map(u => u.department).filter(Boolean), 'Analytics', 'Sales', 'Operations', 'Learning & Development', 'IT'])]; });
SEED_HOOKS.push((S, env, files, ids) => {
  const t0 = env.now(), day = n => t0 + n * D, at = (n, hh, mi = 0) => { const d = new Date(day(n)); d.setHours(hh, mi, 0, 0); return d.getTime(); };
  const pw = env.hash ? env.hash('demo') : {password:'demo'};
  const org = {u1:['NB Academy', 'IT'], u2:['NB Academy', 'Learning & Development'], u3:['NB Academy', 'Learning & Development'], u4:['NB Retail', 'Analytics'], u5:['NB Retail', 'Analytics'], u6:['NB Retail', 'Analytics'], u7:['NB Retail', 'Sales'], u8:['NB Retail', 'Sales'], u9:['NB Retail', 'Sales'], u10:['NB Academy', 'Quality']};
  const seen = {u1:0.1, u2:0.2, u3:1, u4:0.3, u5:2, u6:1.5, u7:4, u8:0.5, u9:41, u10:6};
  for (const u of S.users) Object.assign(u, {department:org[u.id]?.[1] || '', lastLogin:day(-(seen[u.id] ?? 3)), termsAccepted:1, prefsSet:true, mustChangePassword:false});
  S.users.push({id:'u11', firstname:'Vikram', lastname:'Rao', username:'vikram', email:'vikram@nbacademy.example', admin:false, department:'Analytics', created:day(-200), lastLogin:day(-1), termsAccepted:1, prefsSet:true, ...pw});
  S.users.push({id:'u12', firstname:'Nisha', lastname:'Rao', username:'nisha', email:'nisha@nbacademy.example', admin:false, department:'Operations', created:day(-1), termsAccepted:0, prefsSet:false, mustChangePassword:true, ...pw});
  S.sysroles.push({id:'sr2', userId:'u11', roleId:'teamlead'});
  // Persona mapping from the lifecycle guide: administrators author content; trainers deliver
  S.enrol = S.enrol.filter(e => !(e.courseId === 'c1' && e.userId === 'u3'));
  for (const e of S.enrol) if (e.role === 'editingteacher') e.role = 'trainer';
  const hours = {c1:6, c2:4, c3:8, c4:3, c5:5};
  for (const c of S.courses) Object.assign(c, {status:c.id === 'c5' ? 'draft' : 'published', version:c.id === 'c5' ? 0 : 1, hours:hours[c.id] || 2, sequential:false, visible:true});
  // Compliance course with every new content type
  S.categories.push({id:'k4', name:'Compliance'});
  const c6 = {id:'c6', fullname:'Workplace Safety Essentials', shortname:'SAFE100', catId:'k4', summary:'Mandatory safety training for every employee: hazards, fire safety and how to report an incident. Certificate valid for one year.', visible:true, selfenrol:false, status:'published', version:1, hours:1.5, sequential:true, created:day(-400),
    sections:['General', 'Module 1 · Before you start', 'Module 2 · Learn', 'Module 3 · Assessment', 'Module 4 · Feedback and certificate'].map((n, i) => ({id:`c6s${i}`, name:n, summary:'', mods:[]}))};
  S.courses.push(c6);
  const M = (id, cid, si, type, props) => { S.mods[id] = {id, courseId:cid, type, visible:true, intro:'', ...props}; S.courses.find(c => c.id === cid).sections[si].mods.push(id); return id; };
  const bank = [
    ['Workplace safety', {type:'mc', text:'You see a spill in a corridor. What should you do first?', mark:1, options:[{text:'Walk around it'}, {text:'Make the area safe and warn others', correct:true}, {text:'Email facilities tomorrow'}, {text:'Mop it with paper'}]}],
    ['Workplace safety', {type:'tf', text:'You should use a lift during a fire evacuation if it is still working.', mark:1, answer:false}],
    ['Workplace safety', {type:'mc', text:'Which fire extinguisher is safe on electrical fires?', mark:1, options:[{text:'Water'}, {text:'Foam'}, {text:'CO₂', correct:true}, {text:'Wet chemical'}]}],
    ['Workplace safety', {type:'short', text:'What does PPE stand for? (three words)', mark:1, answer:'Personal protective equipment|personal protective equipment'}],
    ['Workplace safety', {type:'tf', text:'Near misses should be reported even when nobody was hurt.', mark:1, answer:true}],
    ['Workplace safety', {type:'num', text:'Within how many hours must a workplace injury be reported to your supervisor under our policy?', mark:1, answer:24, tol:0}],
    ['Excel basics', {type:'mc', text:'Which reference stays fixed when you copy a formula to another cell?', mark:1, options:[{text:'A1'}, {text:'$A$1', correct:true}, {text:'A$1'}, {text:'R[1]C[1]'}]}],
    ['Excel basics', {type:'tf', text:'SUM ignores text values inside the range it adds up.', mark:1, answer:true}]
  ];
  bank.forEach(([category, q], i) => S.qbank.push({id:'qb' + (i + 1), category, ...q, created:day(-90), updated:day(-90)}));
  const fromBank = (ids2) => ids2.map((bid, i) => { const b = S.qbank.find(x => x.id === bid); const {id, category, created, updated, ...q} = clone(b); return {...q, id:'q' + (i + 1), bankId:bid}; });
  M('m40', 'c6', 0, 'forum', {name:'Announcements', intro:'News from the safety team.', news:true});
  M('m41', 'c6', 1, 'quiz', {name:'Pre-test: what do you already know?', intro:'A short baseline check. It does not count towards your grade or completion.', pretest:true, attempts:1, timelimit:0, maxgrade:10, close:null, questions:fromBank(['qb1', 'qb2', 'qb3'])});
  M('m42', 'c6', 2, 'video', {name:'Safety walkthrough', intro:'A short walkthrough of the office safety points. Captions are available.', fileId:'f_safetyvid', captionsId:'f_safetyvtt', completePct:90});
  M('m43', 'c6', 2, 'scorm', {name:'Fire safety e-learning', intro:'Interactive SCORM module. Your place is saved if you stop part-way.', packageId:'f_firescorm', launch:'index.html', single:true, launchFileId:'f_firescorm_index', maxgrade:100});
  M('m44', 'c6', 2, 'page', {name:'Reporting a hazard or incident', intro:'What to report, when and how.', content:'## Report within 24 hours\nTell your supervisor about any injury, hazard or near miss within **24 hours**, then log it in the incident form.\n\n## What to include\n- What happened, where and when\n- Who was involved or saw it\n- What you did to make the area safe\n\n## Near misses matter\nA near miss is an incident where nobody was hurt this time. Reporting them prevents the next accident.'});
  M('m45', 'c6', 3, 'quiz', {name:'Final assessment', intro:'Pass mark 80%. Two attempts. Your highest score counts.', gradepass:80, attempts:2, timelimit:10, maxgrade:10, close:null, questions:fromBank(['qb1', 'qb2', 'qb3', 'qb4', 'qb5'])});
  M('m46', 'c6', 4, 'feedback', {name:'Course feedback', intro:'Required before you receive your certificate. Takes one minute.', anonymous:false, questions:[
    {id:'f1', type:'rating', text:'How useful was this course for your job?', options:[], required:true},
    {id:'f2', type:'choice', text:'Was the length right?', options:['Too short', 'About right', 'Too long'], required:true},
    {id:'f3', type:'text', text:'What should we improve?', options:[], required:false}]});
  M('m47', 'c6', 4, 'certificate', {name:'Safety certificate', intro:'Issued automatically when you complete the course and the feedback survey. Valid for 365 days.', requireCompletion:true, requireFeedback:true, validityDays:365, autoIssue:true, minGrade:0});
  // DA101 additions: live clinic, feedback, rubric, pass mark
  M('m49', 'c1', 3, 'live', {name:'Live clinic: pivot tables', intro:'Bring your questions on pivot tables. Online session, camera optional.', mode:'vilt', start:at(2, 16), duration:60, link:'https://meet.example.com/nb-da101-clinic', capacity:25, location:''});
  M('m48', 'c1', 4, 'feedback', {name:'Course feedback', intro:'Tell us what worked and what did not.', anonymous:true, questions:[
    {id:'f1', type:'rating', text:'Overall, how would you rate this course?', options:[], required:true},
    {id:'f2', type:'text', text:'What was most useful?', options:[], required:false}]});
  const sec4 = S.courses.find(c => c.id === 'c1').sections[4]; sec4.mods = ['m48', ...sec4.mods.filter(x => x !== 'm48')];
  S.mods[ids.cert1].requireFeedback = true;
  S.mods[ids.q1].gradepass = 60;
  S.mods[ids.as1].rubric = {criteria:[
    {id:'rc1', text:'Lookup formula', levels:[{text:'Missing or wrong', points:0}, {text:'Works for most rows', points:5}, {text:'Correct for every row', points:10}]},
    {id:'rc2', text:'Missing product codes', levels:[{text:'Not handled', points:0}, {text:'Handled', points:5}, {text:'Handled and clearly flagged', points:10}]},
    {id:'rc3', text:'Explanation', levels:[{text:'Unclear', points:0}, {text:'Clear and short', points:5}]}]};
  S.mods[ids.q2].questions.push({id:'q5', type:'essay', text:'Rewrite this vague subject line so the reader knows what you need and by when: "Quick question"', mark:2, guidance:'2 marks: action + deadline + topic. 1 mark: two of these.'});
  // BS201 classroom session with attendance and a recording
  M('m50', 'c2', 1, 'live', {name:'Classroom: writing under pressure', intro:'In-person workshop at the Mumbai office.', mode:'ilt', start:at(-5, 10), duration:120, location:'Training Room 2, Mumbai office', capacity:16, link:'', recordingUrl:'https://videos.example.com/bs201-classroom'});
  [['u4', 'present'], ['u8', 'present'], ['u7', 'absent'], ['u9', 'late']].forEach(([u, st], i) => S.liveSignups.push({id:'ls' + i, cmid:'m50', userId:u, status:st, time:day(-9), markedBy:'u3', markedAt:day(-5)}));
  S.liveSignups.push({id:'ls9', cmid:'m49', userId:'u4', status:'registered', time:day(-1)});
  // Files for the video and the SCORM package (generated at build time; see tools/demo-media)
  S.files.push({id:'f_safetyvid', name:'safety-walkthrough.mp4', type:'video/mp4', size:0, owner:'u1', time:day(-400)},
    {id:'f_safetyvtt', name:'safety-walkthrough.en.vtt', type:'text/vtt', size:0, owner:'u1', time:day(-400)},
    {id:'f_firescorm', name:'fire-safety-scorm12.zip', type:'application/zip', size:0, owner:'u1', time:day(-400)},
    {id:'f_firescorm_index', name:'index.html', type:'text/html', size:0, owner:'u1', time:day(-400)});
  // Enrolments, deadlines and progress
  const E = (cid, uid, role, extra) => { let e = S.enrol.find(x => x.courseId === cid && x.userId === uid); if (!e) { e = {id:`e${S.enrol.length + 1}x`, courseId:cid, userId:uid, role:role || 'student', time:day(-30)}; S.enrol.push(e); } Object.assign(e, extra || {}); return e; };
  const A = (cid, uid, due, extra) => E(cid, uid, 'student', {due:due == null ? null : day(due), mandatory:true, assignedBy:cid === 'c6' ? null : (['c1', 'c3'].includes(cid) ? 'u2' : 'u3'), assignedAt:day(-30), source:cid === 'c6' ? 'rule' : 'trainer', remindersSent:[], ...extra});
  A('c1', 'u4', 20, {startedAt:day(-25), timeSpent:3.2 * 3600}); A('c2', 'u4', 6, {startedAt:day(-20), timeSpent:2.1 * 3600}); A('c3', 'u4', -2, {startedAt:day(-24), timeSpent:1.4 * 3600, lockNotified:true, lockedAt:day(-2), remindersSent:[7, 3, 1]});
  A('c6', 'u4', 12, {});
  A('c1', 'u5', 20, {startedAt:day(-22), timeSpent:2.4 * 3600}); A('c3', 'u5', -4, {startedAt:day(-26), timeSpent:0.8 * 3600, lockNotified:true, lockedAt:day(-4), remindersSent:[7, 3, 1]});
  A('c1', 'u6', 20, {startedAt:day(-25), timeSpent:4.6 * 3600}); A('c3', 'u6', 15, {startedAt:day(-10), timeSpent:1.1 * 3600}); A('c6', 'u6', null, {startedAt:day(-345), completedAt:day(-340), timeSpent:1.6 * 3600, source:'rule'});
  A('c1', 'u7', 3, {startedAt:day(-12), timeSpent:0.6 * 3600}); A('c2', 'u7', 6, {startedAt:day(-15), timeSpent:1.2 * 3600});
  A('c1', 'u8', 20, {startedAt:day(-18), timeSpent:1.9 * 3600}); A('c2', 'u8', 6, {startedAt:day(-18), timeSpent:3.1 * 3600}); A('c6', 'u8', 9, {startedAt:day(-3), timeSpent:0.3 * 3600});
  A('c2', 'u9', 6, {timeSpent:0}); A('c3', 'u9', 10, {startedAt:day(-6), timeSpent:0.9 * 3600});
  A('c2', 'u2', 30, {startedAt:day(-3), timeSpent:0.4 * 3600, assignedBy:'u3'});
  A('c6', 'u11', 9, {startedAt:day(-2), timeSpent:0.5 * 3600}); A('c2', 'u11', 25, {assignedBy:'u3'});
  // Meera completed the safety course 340 days ago; her certificate expires in 25 days, so the scheduler re-assigns it
  S.completion['u6:m44'] = day(-341);
  S.resume['u6:m42'] = {position:58, duration:60, watched:60, completed:day(-342), updated:day(-342)};
  S.resume['u6:m43'] = {location:'4', status:'passed', score:90, completed:day(-341), updated:day(-341)};
  S.attempts.push({id:'a_m45_u6', cmid:'m45', userId:'u6', state:'finished', answers:{q1:'1', q2:'false', q3:'2', q4:'personal protective equipment', q5:'true'}, score:5, max:5, start:day(-340) - 4e5, finish:day(-340), review:Core.reviewOf(S.mods.m45, {q1:'1', q2:'false', q3:'2', q4:'personal protective equipment', q5:'true'})});
  S.feedbackResponses.push({id:'fr1', cmid:'m46', userId:'u6', answers:{f1:5, f2:1, f3:'Short and practical.'}, time:day(-340)});
  S.certIssued.push({id:'ci_meera', cmid:'m47', userId:'u6', code:'SAFE7Q2M4K', time:day(-340), expires:day(25), grade:100});
  // Zoya part-way through the SCORM module; Asha half-way through the video
  S.resume['u8:m43'] = {location:'2', suspend:'answers=1', status:'incomplete', updated:day(-1)};
  S.resume['u4:m42'] = {position:24, duration:60, watched:24, updated:day(-1)};
  S.attempts.push({id:'a_m41_u8', cmid:'m41', userId:'u8', state:'finished', preview:false, answers:{q1:'1', q2:'true', q3:'0'}, score:1, max:3, start:day(-3) - 2e5, finish:day(-3), review:Core.reviewOf(S.mods.m41, {q1:'1', q2:'true', q3:'0'})});
  S.feedbackResponses.push({id:'fr2', cmid:'m48', userId:'u6', answers:{f1:4, f2:'The XLOOKUP examples.'}, time:day(-1)});
  // Cohorts, path, rule, access request
  S.cohorts.push({id:'co1', name:'Analytics Team · Mumbai', department:'Analytics', members:['u4', 'u5', 'u6'], leads:['u11'], trainers:['u2'], courses:['c1', 'c3', 'c6'], created:day(-60)});
  S.cohorts.push({id:'co2', name:'Sales Team · Pune', department:'Sales', members:['u7', 'u8', 'u9'], leads:[], trainers:['u3'], courses:['c2', 'c4', 'c6'], created:day(-60)});
  S.cohorts.push({id:'co3', name:'New hires · October 2026', department:'', members:['u12'], leads:[], trainers:['u3'], courses:['c6'], created:day(-2)});
  S.paths.push({id:'lp1', name:'Analyst onboarding', description:'Start with safety, then build Excel and Python skills in order.', sequential:true, courses:['c6', 'c1', 'c3'], created:day(-90)});
  S.rules.push({id:'ru1', name:'New hires: Workplace Safety Essentials', target:{type:'course', id:'c6'}, match:{type:'all', value:''}, days:15, active:true, created:day(-200)});
  S.accessRequests.push({id:'ar1', courseId:'c3', userId:'u5', reason:'I was on approved leave for two weeks and missed the deadline. I need about five more days to finish the last topic.', time:day(-1), status:'pending'});
  E('c6', 'u12', 'student', {due:day(14), mandatory:true, assignedBy:null, assignedAt:day(-1), source:'rule', remindersSent:[]});
  // A few finished courses so analytics have history: Zoya finished BS150, Kabir finished the safety course 60 days ago
  S.completion['u8:m31'] = day(-12); E('c4', 'u8', 'student', {startedAt:day(-14), completedAt:day(-12), timeSpent:2.6 * 3600, source:'self'});
  const finishSafety = (uid, when, code) => {
    S.completion[uid + ':m44'] = when - 3e5; S.resume[uid + ':m42'] = {position:30, duration:30, watched:30, completed:when - 6e5, updated:when - 6e5};
    S.resume[uid + ':m43'] = {location:'4', status:'passed', score:100, completed:when - 4e5, updated:when - 4e5};
    const ans = {q1:'1', q2:'false', q3:'2', q4:'personal protective equipment', q5:'true'};
    S.attempts.push({id:'a_m45_' + uid, cmid:'m45', userId:uid, state:'finished', answers:ans, score:5, max:5, start:when - 3e5, finish:when - 2e5, review:Core.reviewOf(S.mods.m45, ans)});
    S.feedbackResponses.push({id:'fr_' + uid, cmid:'m46', userId:uid, answers:{f1:4, f2:1, f3:''}, time:when - 1e5});
    S.certIssued.push({id:'ci_' + uid, cmid:'m47', userId:uid, code, time:when, expires:when + 365 * D, grade:100});
  };
  A('c6', 'u5', null, {startedAt:day(-61), completedAt:day(-60), timeSpent:1.7 * 3600, source:'rule'}); finishSafety('u5', day(-60), 'SAFE4K8P2X');
  A('c6', 'u7', null, {startedAt:day(-31), completedAt:day(-30), timeSpent:1.4 * 3600, source:'rule'}); finishSafety('u7', day(-30), 'SAFE9T3W6B');
  // Course versions and initial audit entries
  for (const c of S.courses.filter(x => x.status === 'published')) S.courseVersions.push({id:'cv_' + c.id, courseId:c.id, version:1, notes:'First published version', mode:'keep', time:c.created + D, by:'u1', snapshot:null});
  Core._.audit(S, env, 'u1', 'Site installed', 'NB Academy', 'Demo data loaded');
  Core._.audit(S, env, 'u1', 'Assignment rule created', 'New hires: Workplace Safety Essentials', 'all → course c6, 15 days');
  Core._.audit(S, env, 'u3', 'Grade given', 'BS201 › Write a weekly status update › Asha Verma', '78');
  let media = {};
  try { media = typeof NBDemoMedia !== 'undefined' ? NBDemoMedia : (typeof require === 'function' ? require('./demo-media.js') : {}); } catch (e) {}
  for (const id of ['f_safetyvid', 'f_safetyvtt', 'f_firescorm', 'f_firescorm_index']) {
    const x = media[id]; const f = S.files.find(y => y.id === id); if (!x) { files[id] = ''; continue; }
    files[id] = x.text != null ? x.text : {type:x.type, base64:x.base64};
    if (f) f.size = x.text != null ? x.text.length : Math.floor(x.base64.length * 3 / 4);
  }
});

Object.assign(Core, {tick, totp, verifyTotp, itemAnalysis, learnerRows, summarize, dropOff, restartLearner});
return Core;
});
