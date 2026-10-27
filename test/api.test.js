'use strict';
// Run with: node --test test/api.test.js   (Node 22.13+)
// Starts the server on a random port with a throwaway data folder, plus fake SMTP, LDAP and OpenID Connect servers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nbacademy-test-'));
process.env.NB_DATA_DIR = dir;
process.env.NB_DEMO = '1'; // the tests run against the demo data
process.env.NB_REMOVE_ACCOUNTS = ''; // the tests use the demo accounts; removal is tested directly below
const {server, getState, deliverMail, runTick, removeAccounts, removeDemoData, _store} = require('../server/server.js');
const Core = require('../public/core.js');
let base;
const extras = [];
test.before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.close(); extras.forEach(s => s.close()); fs.rmSync(dir, {recursive:true, force:true}); });

async function call(method, url, body, cookie, extra = {}) {
  const headers = {'X-NB-Request':'1', ...(cookie ? {Cookie:cookie} : {}), ...extra};
  let payload;
  if (body instanceof Buffer) payload = body; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + url, {method, headers, body:payload, redirect:'manual'});
  const buf = Buffer.from(await r.arrayBuffer()), text = buf.toString('utf8'); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return {status:r.status, json, text, buf, headers:r.headers, cookie:(r.headers.get('set-cookie') || '').split(';')[0]};
}
async function login(u, pw = 'demo') { const r = await call('POST', '/api/login', {username:u, password:pw}); assert.equal(r.status, 200, `login ${u}: ${r.text}`); return r.cookie; }
const op = (cookie, name, payload) => call('POST', '/api/op', {op:name, payload}, cookie);
const state = async c => (await call('GET', '/api/state', null, c)).json.state;

/* ---------- Sign-in and privacy ---------- */
test('login rejects a wrong password and accepts the right one', async () => {
  assert.equal((await call('POST', '/api/login', {username:'asha', password:'nope'})).status, 401);
  const c = await login('asha'); assert.match(c, /^nb_sid=/);
  assert.equal((await state(c)).me, 'u4');
});
test('passwords are stored hashed and never sent to the browser', async () => {
  assert.ok(getState().users.every(u => u.pwhash?.startsWith('scrypt$') && !u.password));
  const st = await call('GET', '/api/state', null, await login('admin'));
  assert.ok(!st.text.includes('pwhash') && !st.text.includes('scrypt$') && !st.text.includes('mfaSecret'));
});
test('requests without the X-NB-Request header are refused', async () => {
  const r = await fetch(base + '/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"username":"asha","password":"demo"}'});
  assert.equal(r.status, 403);
});
test('learners do not receive quiz answers or other learners\' submissions', async () => {
  const st = await state(await login('asha'));
  assert.ok(!JSON.stringify(st.mods.m7.questions).includes('correct'));
  assert.ok(st.mods.m7.questions.every(q => q.answer === undefined));
  assert.ok(st.submissions.every(s => s.userId === 'u4'));
  assert.ok(!st.mods.m32, 'draft course DA210 is not visible to a learner');
});

/* ---------- Roles from the lifecycle guide ---------- */
test('a learner cannot grade; a trainer can and the learner is notified', async () => {
  const asha = await login('asha'), rohan = await login('rohan');
  assert.equal((await op(asha, 'grade', {mid:'m11', uid:'u5', grade:90})).status, 403);
  const r = await op(rohan, 'grade', {mid:'m11', uid:'u5', grade:91, feedback:'Nice', rubric:{rc1:{level:2}, rc2:{level:2}, rc3:{level:1}}}); assert.equal(r.status, 200);
  const sub = getState().submissions.find(s => s.cmid === 'm11' && s.userId === 'u5'); assert.equal(sub.grade, 100, 'rubric overrides the typed grade');
  assert.ok((await state(await login('kabir'))).notifications.some(n => n.subject.includes('graded')));
});
test('trainers cannot create or edit course content', async () => {
  const rohan = await login('rohan');
  assert.equal((await op(rohan, 'addSection', {cid:'c1'})).status, 403);
  assert.equal((await op(rohan, 'saveQuestion', {mid:'m7', q:{type:'tf', text:'x', answer:true}})).status, 403);
  assert.equal((await op(rohan, 'newCourse', {fullname:'X', shortname:'X1', catId:'k1'})).status, 403);
});
test('trainers assign only within their scope; team leads cannot assign at all', async () => {
  const priya = await login('priya');
  const ok = await op(priya, 'assign', {kind:'course', id:'c4', cohorts:['co2'], due:Date.now() + 10 * 864e5}); assert.equal(ok.status, 200); assert.ok(ok.json.result.assigned >= 2);
  assert.equal((await op(priya, 'assign', {kind:'course', id:'c1', users:['u7']})).status, 403, 'DA101 is not tagged to Priya');
  assert.equal((await op(priya, 'assign', {kind:'course', id:'c4', users:['u5']})).status, 403, 'Kabir is outside her cohorts and courses');
  const vikram = await login('vikram');
  assert.equal((await op(vikram, 'assign', {kind:'course', id:'c1', users:['u4']})).status, 403);
  assert.ok(getState().outbox.some(m => m.key === 'assigned'), 'assignment emails are queued');
});
test('team leads see only their mapped team and can send reminders to them', async () => {
  const vikram = await login('vikram'); const st = await state(vikram);
  const h = Core.H(st, 'u11'); assert.deepEqual(h.teamMembers().sort(), ['u4', 'u5', 'u6']);
  assert.ok(st.attempts.filter(a => a.userId === 'u4').every(a => JSON.stringify(a.answers) === '{}'), 'answers hidden from team leads');
  assert.ok(st.enrol.some(e => e.userId === 'u4' && e.courseId === 'c3'));
  assert.equal((await op(vikram, 'nudge', {cid:'c1', users:['u4']})).status, 200);
  assert.equal((await op(vikram, 'nudge', {cid:'c2', users:['u9']})).status, 403, 'Dev is not in his team');
  assert.equal((await op(vikram, 'saveMod', {cid:'c1', type:'page', sid:'c1s0', name:'x', fields:{content:'x'}})).status, 403);
});

/* ---------- Learner lifecycle ---------- */
test('overdue courses lock; access requests are approved with a new due date', async () => {
  const asha = await login('asha'), admin = await login('admin');
  const locked = await op(asha, 'startQuiz', {mid:'m28'}); assert.equal(locked.status, 423); assert.match(locked.json.error, /overdue and locked/);
  assert.equal((await op(asha, 'requestAccess', {cid:'c3', reason:'short'})).status, 400, 'justification required');
  const rq = await op(asha, 'requestAccess', {cid:'c3', reason:'I was on approved leave and need one more week.'}); assert.equal(rq.status, 200);
  assert.equal((await op(asha, 'requestAccess', {cid:'c3', reason:'Another request while one is pending'})).status, 400);
  assert.equal((await op(await login('rohan'), 'decideAccess', {id:rq.json.result.id, approve:true, due:Date.now() + 7 * 864e5})).status, 403, 'trainers do not approve');
  assert.equal((await op(admin, 'decideAccess', {id:rq.json.result.id, approve:false})).status, 400, 'rejection needs remarks');
  assert.equal((await op(admin, 'decideAccess', {id:rq.json.result.id, approve:true, due:Date.now() + 7 * 864e5, remarks:'One week'})).status, 200);
  const st = await op(asha, 'startQuiz', {mid:'m28'}); assert.equal(st.status, 200, 'unlocked with progress intact');
  assert.ok(getState().audit.some(a => a.action === 'Overdue access approved'));
});
test('sequential courses unlock step by step; pre-tests do not block', async () => {
  const zoya = await login('zoya');
  assert.equal((await op(zoya, 'startQuiz', {mid:'m45'})).status, 423, 'final assessment locked until earlier modules are done');
  assert.equal((await op(zoya, 'startQuiz', {mid:'m41'})).status, 400, 'pre-test already used its single attempt');
  const sv = await op(zoya, 'saveProgress', {mid:'m42', position:28, duration:30}); assert.equal(sv.status, 200); assert.equal(sv.json.result.completed, true);
});
test('SCORM content is served only to people in the course and saves progress', async () => {
  const asha = await login('asha');
  const r = await call('GET', '/scorm/m43/index.html', null, asha); assert.equal(r.status, 200); assert.match(r.text, /LMSInitialize/);
  assert.equal((await call('GET', '/scorm/m43/index.html', null, await login('dev'))).status, 404);
  assert.equal((await op(asha, 'scormCommit', {mid:'m43', cmi:{'cmi.core.lesson_location':'1'}})).status, 423, 'step-by-step: the video comes first');
  assert.equal((await op(asha, 'saveProgress', {mid:'m42', position:30, duration:30})).status, 200);
  const c = await op(asha, 'scormCommit', {mid:'m43', cmi:{'cmi.core.lesson_location':'2', 'cmi.suspend_data':'q1=b', 'cmi.core.lesson_status':'incomplete'}}); assert.equal(c.status, 200);
  assert.equal(getState().resume['u4:m43'].location, '2');
  const admin = await login('admin');
  const up = await call('POST', '/api/upload?name=pkg.zip', fs.readFileSync(path.join(__dirname, '../tools/demo-media/fire-safety-scorm12.zip')), admin, {'Content-Type':'application/zip'});
  const sm = await op(admin, 'saveMod', {cid:'c3', type:'scorm', sid:'c3s1', name:'Uploaded package', visible:true, fields:{packageId:up.json.result.id, maxgrade:100}});
  assert.equal(sm.status, 200); assert.equal(getState().mods[sm.json.result.id].launch, 'index.html');
  const bad = await call('POST', '/api/upload?name=bad.zip', Buffer.from('not a zip'), admin, {'Content-Type':'application/zip'});
  assert.equal((await op(admin, 'saveMod', {cid:'c3', type:'scorm', sid:'c3s1', name:'Bad', visible:true, fields:{packageId:bad.json.result.id}})).status, 400);
});
/* Builds a zip (stored entries) for SCORM tests */
function makeZip(entries) {
  const zlib = require('node:zlib'); const locals = [], centrals = []; let off = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content), nm = Buffer.from(name), crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const MAN_2004 = `<?xml version="1.0" encoding="UTF-8"?><manifest identifier="NB" version="1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"><metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="ORG"><organization identifier="ORG"><title>NoBroker Story</title><item identifier="I1" identifierref="RES_SCO" parameters="?start=1"><title>Story</title></item></organization></organizations>
  <resources xml:base="content/"><resource identifier="RES_ASSET" type="webcontent" adlcp:scormType="asset" href="shared/player.js"><file href="shared/player.js"/></resource>
  <resource identifier="RES_SCO" type="webcontent" adlcp:scormType="sco" href="scormdriver/indexAPI.html"><file href="scormdriver/indexAPI.html"/></resource></resources></manifest>`;

test('SCORM 2004 packages zipped one folder deep: found, served, streamed and re-read when older', async () => {
  const admin = await login('admin'), asha = await login('asha');
  const audio = Buffer.alloc(5000, 7); audio.write('ID3', 0);
  const zip = makeZip([['NoBroker Story/imsmanifest.xml', MAN_2004], ['NoBroker Story/content/scormdriver/indexAPI.html', '<!doctype html><script src="../shared/player.mjs" type="module"></script>API_1484_11'],
    ['NoBroker Story/content/shared/player.js', 'x'], ['NoBroker Story/content/shared/player.mjs', 'export default 1'], ['NoBroker Story/content/Media/Intro.MP3', audio]]);
  const up = await call('POST', '/api/upload?name=story.zip', zip, admin, {'Content-Type':'application/zip'}); assert.equal(up.status, 200, up.text);
  const sid = getState().courses.find(c => c.id === 'c1').sections[0].id;
  const sm = await op(admin, 'saveMod', {cid:'c1', type:'scorm', sid, name:'NoBroker Story', visible:true, fields:{packageId:up.json.result.id, maxgrade:100}});
  assert.equal(sm.status, 200, sm.text); const mid = sm.json.result.id, m = getState().mods[mid];
  assert.equal(m.scormVersion, '2004'); assert.equal(m.launch, 'NoBroker Story/content/scormdriver/indexAPI.html?start=1');
  const page = await call('GET', `/scorm/${mid}/NoBroker%20Story/content/scormdriver/indexAPI.html?start=1`, null, asha);
  assert.equal(page.status, 200); assert.match(page.text, /API_1484_11/);
  const mjs = await fetch(`${base}/scorm/${mid}/NoBroker%20Story/content/shared/player.mjs`, {headers:{Cookie:asha}}); assert.equal(mjs.headers.get('content-type'), 'text/javascript');
  // a link that differs only in capital letters still works; byte ranges for media
  const part = await fetch(`${base}/scorm/${mid}/NoBroker%20Story/content/media/intro.mp3`, {headers:{Cookie:asha, Range:'bytes=0-2'}});
  assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 0-2/5000'); assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'ID3');
  // A package saved before SCORM 2004 support (wrong launch, no version) is read again when opened
  const S = getState(); S.mods[mid].launch = 'content/shared/player.js'; delete S.mods[mid].scormVersion;
  assert.equal((await call('GET', `/scorm/${mid}/x`, null, asha)).status, 404);
  assert.equal(getState().mods[mid].launch, 'NoBroker Story/content/scormdriver/indexAPI.html?start=1'); assert.equal(getState().mods[mid].scormVersion, '2004');
  // SCORM 2004 progress is saved through the same record (status and a percentage score)
  const c = await op(asha, 'scormCommit', {mid, cmi:{'cmi.core.lesson_location':'slide-4', 'cmi.suspend_data':'abc', 'cmi.core.lesson_status':'passed', 'cmi.core.score.raw':'90'}, finish:true});
  assert.equal(c.status, 200, c.text); assert.equal(c.json.result.completed, true);
  // A package whose manifest names a missing start page is refused with a clear message
  const broken = makeZip([['imsmanifest.xml', MAN_2004.replace('xml:base="content/"', '')]]);
  const up2 = await call('POST', '/api/upload?name=broken.zip', broken, admin, {'Content-Type':'application/zip'});
  const r2 = await op(admin, 'saveMod', {cid:'c1', type:'scorm', sid, name:'Broken', visible:true, fields:{packageId:up2.json.result.id}});
  assert.equal(r2.status, 400); assert.match(r2.json.error, /launch file "scormdriver\/indexAPI.html".*not in the package/);
});

test('SCORM packages inside folders, inside another zip, or made on a Mac are found; bundles are refused clearly', async () => {
  const admin = await login('admin'), asha = await login('asha'), sid = getState().courses.find(c => c.id === 'c1').sections[0].id;
  const MAN = name => `<manifest identifier="x"><metadata><schemaversion>1.2</schemaversion></metadata><organizations default="O"><organization identifier="O"><title>${name}</title><item identifier="i" identifierref="r"/></organization></organizations><resources><resource identifier="r" adlcp:scormtype="sco" href="index_lms.html"/></resources></manifest>`;
  const add = async (zip, name) => { const up = await call('POST', `/api/upload?name=${encodeURIComponent(name)}.zip`, zip, admin, {'Content-Type':'application/zip'}); return op(admin, 'saveMod', {cid:'c1', type:'scorm', sid, name, visible:true, fields:{packageId:up.json.result.id}}); };
  const cases = [
    ['two folders deep', makeZip([['Exports/NoBroker Introduction - SCORM/imsmanifest.xml', MAN('Intro')], ['Exports/NoBroker Introduction - SCORM/index_lms.html', 'intro page']]), 'Exports/NoBroker Introduction - SCORM/index_lms.html'],
    ['zip inside a zip', makeZip([['NoBroker Story.zip', makeZip([['imsmanifest.xml', MAN('Story')], ['index_lms.html', 'story page']])], ['readme.txt', 'upload this']]), 'index_lms.html'],
    ['made on a Mac', makeZip([['Story/imsmanifest.xml', MAN('Mac')], ['Story/index_lms.html', 'mac page'], ['__MACOSX/Story/._imsmanifest.xml', 'junk'], ['__MACOSX/Story/._index_lms.html', 'junk']]), 'Story/index_lms.html'],
  ];
  for (const [label, zip, launch] of cases) {
    const r = await add(zip, label); assert.equal(r.status, 200, `${label}: ${r.text}`);
    const m = getState().mods[r.json.result.id]; assert.equal(m.launch, launch, label);
    const page = await call('GET', `/scorm/${m.id}/${launch.split('/').map(encodeURIComponent).join('/')}`, null, asha); assert.equal(page.status, 200, label); assert.match(page.text, /page/, label);
  }
  const bundle = makeZip([['Intro/imsmanifest.xml', MAN('Intro')], ['Intro/index_lms.html', 'a'], ['Story/imsmanifest.xml', MAN('Story')], ['Story/index_lms.html', 'b']]);
  const r = await add(bundle, 'bundle'); assert.equal(r.status, 400); assert.match(r.json.error, /holds 2 SCORM packages \(Intro, Story\)/);
});

test('essay questions wait for a trainer, then count', async () => {
  const dev = await login('dev');
  const s = await op(dev, 'startQuiz', {mid:'m21'}); assert.equal(s.status, 200);
  const r = await op(dev, 'submitQuiz', {aid:s.json.result.id, answers:{q1:'true', q2:'1', q3:'2', q4:'FYI', q5:'Approval needed by Friday: Q3 budget'}});
  const a = getState().attempts.find(x => x.id === r.json.result.id); assert.equal(a.pending, true); assert.equal(a.score, 4);
  const g = await op(await login('priya'), 'gradeEssay', {aid:a.id, qid:'q5', mark:2, comment:'Clear'}); assert.equal(g.status, 200);
  const a2 = getState().attempts.find(x => x.id === a.id); assert.equal(a2.score, 6); assert.equal(a2.pending, false);
});
test('trainers can reset attempts and grant extra ones', async () => {
  const priya = await login('priya');
  assert.equal((await op(await login('zoya'), 'startQuiz', {mid:'m21'})).status, 400, 'Zoya used her only attempt');
  assert.equal((await op(priya, 'grantAttempts', {mid:'m21', userId:'u8', n:1})).status, 200);
  assert.equal((await op(await login('zoya'), 'startQuiz', {mid:'m21'})).status, 200);
  assert.equal((await op(priya, 'resetAttempts', {mid:'m21', userId:'u8'})).status, 200);
  assert.ok(getState().attempts.filter(x => x.cmid === 'm21' && x.userId === 'u8').every(x => x.archived));
});
test('live sessions: register, attendance completes the activity', async () => {
  const asha = await login('asha'), rohan = await login('rohan');
  assert.equal((await op(rohan, 'liveAttendance', {mid:'m49', marks:{u4:'present', u5:'absent'}})).status, 200);
  assert.ok(Core.H(getState(), 'u4').isDone(getState().mods.m49, 'u4'));
  assert.equal((await op(asha, 'liveAttendance', {mid:'m49', marks:{u4:'present'}})).status, 403);
});
test('feedback survey is required before the certificate, then it is issued automatically', async () => {
  const S = getState(), h = Core.H(S, 'u5');
  assert.equal(h.status('c6', 'u5'), 'completed'); const cert = S.certIssued.find(c => c.userId === 'u5' && c.cmid === 'm47');
  assert.ok(cert.expires > Date.now() + 300 * 864e5, 'valid for a year');
  const pdf = await call('GET', `/cert/${cert.code}.pdf`); assert.equal(pdf.status, 200); assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  assert.match((await call('GET', `/cert/${cert.code}`)).text, /Certificate verified/);
  const asha = await login('asha'); const r = await op(asha, 'claimCertificate', {mid:'m47'}); assert.equal(r.status, 400); assert.match(r.json.error, /feedback survey|required activity/);
});
test('recertification: certificates close to expiry re-assign the course', async () => {
  const S = getState(), meera = S.certIssued.find(c => c.id === 'ci_meera');
  assert.ok(meera.archived && meera.renewalStarted); const e = S.enrol.find(x => x.courseId === 'c6' && x.userId === 'u6');
  assert.equal(e.due, meera.expires); assert.equal(e.completedAt, null);
  assert.ok(S.outbox.some(m => m.userId === 'u6' && m.key === 'recert'));
});
test('deadline warnings and overdue notices are generated once', async () => {
  const S = getState(); const before = S.outbox.length;
  const e = S.enrol.find(x => x.courseId === 'c1' && x.userId === 'u8'); e.due = Date.now() + 2 * 864e5; e.remindersSent = [];
  runTick(); const after = S.outbox.length; assert.ok(after > before);
  assert.ok(S.outbox.slice(before).some(m => m.userId === 'u8' && m.key === 'deadline'));
  runTick(); assert.equal(S.outbox.filter(m => m.userId === 'u8' && m.key === 'deadline').length, S.outbox.slice(before).filter(m => m.userId === 'u8' && m.key === 'deadline').length + S.outbox.slice(0, before).filter(m => m.userId === 'u8' && m.key === 'deadline').length, 'no duplicate reminder');
});

/* ---------- Security ---------- */
test('password policy and account lockout', async () => {
  const admin = await login('admin');
  assert.equal((await op(admin, 'newUser', {firstname:'A', lastname:'B', username:'weak.one', email:'w@example.com', password:'abc'})).status, 400);
  for (let i = 0; i < 5; i++) await call('POST', '/api/login', {username:'arjun', password:'wrong'});
  const locked = await call('POST', '/api/login', {username:'arjun', password:'demo'}); assert.equal(locked.status, 401); assert.match(locked.json.error, /locked/);
  assert.equal((await op(admin, 'unlockUser', {id:'u7'})).status, 200);
  await login('arjun');
});
test('two-step sign-in with an authenticator code', async () => {
  const meera = await login('meera');
  const setup = await op(meera, 'mfaSetup', {}); const secret = setup.json.result.secret;
  assert.equal((await op(meera, 'mfaEnable', {code:'000000'})).status, 400);
  assert.equal((await op(meera, 'mfaEnable', {code:Core.totp(secret, Date.now())})).status, 200);
  const step1 = await call('POST', '/api/login', {username:'meera', password:'demo'}); assert.equal(step1.json.mfa, true); assert.ok(!step1.cookie.startsWith('nb_sid=') || step1.cookie === '');
  assert.equal((await call('POST', '/api/login/mfa', {ticket:step1.json.ticket, code:'123456'})).status, 401);
  const ok = await call('POST', '/api/login/mfa', {ticket:step1.json.ticket, code:Core.totp(secret, Date.now())}); assert.equal(ok.status, 200); assert.match(ok.cookie, /^nb_sid=/);
});
test('forgotten password: emailed link sets a new password (no account enumeration)', async () => {
  assert.equal((await call('POST', '/api/forgot', {login:'nobody-here'})).status, 200);
  assert.equal((await call('POST', '/api/forgot', {login:'zoya@nbacademy.example'})).status, 200);
  const mail = getState().outbox.filter(m => m.userId === 'u8' && m.key === 'passwordReset').pop(); assert.ok(mail);
  const token = /id=([\w-]+)/.exec(mail.body)[1];
  assert.equal((await call('GET', '/api/token?t=' + token)).json.valid, true);
  assert.equal((await call('POST', '/api/token-password', {token, password:'short'})).status, 400);
  assert.equal((await call('POST', '/api/token-password', {token, password:'Zoya@Reset2026'})).status, 200);
  assert.equal((await call('POST', '/api/token-password', {token, password:'Zoya@Again2026'})).status, 400, 'link works once');
  await login('zoya', 'Zoya@Reset2026');
});
test('new users must set a password and accept terms before doing anything else', async () => {
  const nisha = await login('nisha');
  assert.equal((await op(nisha, 'enrolMe', {cid:'c1'})).status, 428);
  assert.equal((await op(nisha, 'setOwnPassword', {password:'Nisha@2026'})).status, 200);
  assert.equal((await op(nisha, 'acceptTerms', {})).status, 200);
  assert.equal((await op(nisha, 'touch', {cid:'c6'})).status, 200);
});
test('sessions end after the inactivity timeout', async () => {
  const c = await login('dev');
  _store().db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(Date.now() - 61 * 60e3, c.split('=')[1]);
  assert.equal((await call('GET', '/api/state', null, c)).json.state, null);
});
test('the audit log is hash-chained and the database refuses to change it', async () => {
  const admin = await login('admin');
  const v = await op(admin, 'verifyAudit', {}); assert.equal(v.json.result.ok, true); assert.ok(v.json.result.count > 5);
  assert.throws(() => _store().db.prepare("UPDATE records SET data = '{}' WHERE coll = 'audit'").run(), /append-only/);
  assert.throws(() => _store().db.prepare("DELETE FROM records WHERE coll = 'audit'").run(), /append-only/);
  const tampered = Core.clone(getState().audit); tampered[2].detail = 'changed'; assert.equal(Core.verifyAudit(tampered).ok, false);
});

/* ---------- Integrations with fake servers ---------- */
test('email is delivered over SMTP', async () => {
  const got = [];
  const smtp = net.createServer(sock => {
    let data = false, buf = ''; sock.write('220 fake ESMTP\r\n');
    sock.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; sock.write('250 queued\r\n'); } else got[got.length - 1] += line + '\n'; continue; }
      if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n'); else if (/^AUTH PLAIN/i.test(line)) sock.write('235 ok\r\n'); else if (/^(MAIL|RCPT)/i.test(line)) sock.write('250 ok\r\n');
      else if (/^DATA/i.test(line)) { data = true; got.push(''); sock.write('354 go\r\n'); } else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); } } });
  });
  await new Promise(r => smtp.listen(0, '127.0.0.1', r)); extras.push(smtp);
  const S = getState(); Object.assign(S.site.email, {enabled:true, host:'127.0.0.1', port:smtp.address().port, secure:false, user:'u', pass:'p', from:'NB Academy <no-reply@nb.test>'});
  S.outbox.forEach(m => { if (m.status === 'not sent') m.status = 'queued'; });
  await deliverMail();
  assert.ok(got.length > 0); assert.match(got[0], /Subject: /); assert.ok(S.outbox.some(m => m.status === 'sent'));
  // Links in emails are full web addresses even when no site address is set
  assert.ok(!S.site.url);
  const sentWithLinks = S.outbox.filter(m => m.status === 'sent' && m.body.includes('?go='));
  assert.ok(sentWithLinks.length > 0 && sentWithLinks.every(m => m.body.includes(base + '/?go=')), 'links are absolute');
  const decoded = got.map(g => Buffer.from(g.split('\n\n').slice(1).join('').replace(/\s/g, ''), 'base64').toString('utf8')).join('\n');
  assert.ok(decoded.includes(base + '/?go='), 'the delivered message carries the absolute link');
  S.site.email.enabled = false;
});
test('SMTP settings: spaces are trimmed, app-password groups joined, and Google refusals explained', async () => {
  const seen = [];
  const smtp = net.createServer(sock => {
    let buf = ''; sock.write('220 smtp.gmail.com ESMTP gsmtp\r\n');
    sock.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/i.test(line)) sock.write('250-smtp.gmail.com\r\n250 AUTH LOGIN PLAIN\r\n');
      else if (/^AUTH PLAIN /i.test(line)) { const [, u, pw] = Buffer.from(line.slice(11), 'base64').toString().split('\0'); seen.push([u, pw]);
        sock.write(pw === 'abcdefghijklmnop' && u === 'learning@nobroker.in' ? '235 ok\r\n' : '535 5.7.8 https://support.google.com/mail/?p=BadCredentials 2adb3069b0e04-5bfb7a86383sm1950569e87.44 - gsmtp\r\n'); }
      else if (/^(MAIL|RCPT)/i.test(line)) sock.write('250 ok\r\n'); else if (/^DATA/i.test(line)) sock.write('354 go\r\n'); else if (line === '.') sock.write('250 queued\r\n'); else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); } } });
  });
  await new Promise(r => smtp.listen(0, '127.0.0.1', r)); extras.push(smtp);
  const a = await login('admin'), port = smtp.address().port;
  // Wrong password: the error explains what Google wants
  assert.equal((await op(a, 'saveIntegration', {kind:'email', enabled:false, host:'127.0.0.1', port, secure:false, user:'learning@nobroker.in', pass:'NormalPassword1', from:'NB Academy <learning@nobroker.in>'})).status, 200);
  let t = await call('POST', '/api/admin/test-email', {to:'x@example.com'}, a);
  assert.equal(t.status, 400); assert.match(t.json.error, /app password/);
  // App password pasted with spaces and a username with a stray space: cleaned up and accepted
  assert.equal((await op(a, 'saveIntegration', {kind:'email', enabled:false, host:'127.0.0.1', port, secure:false, user:' learning@nobroker.in ', pass:' abcd efgh ijkl mnop ', from:'NB Academy <learning@nobroker.in>'})).status, 200);
  assert.equal(getState().site.email.user, 'learning@nobroker.in'); assert.equal(getState().site.email.pass, 'abcdefghijklmnop');
  t = await call('POST', '/api/admin/test-email', {to:'x@example.com'}, a);
  assert.equal(t.status, 200, t.text); assert.deepEqual(seen[seen.length - 1], ['learning@nobroker.in', 'abcdefghijklmnop']);
  // An ordinary password that happens to contain spaces is kept as typed
  await op(a, 'saveIntegration', {kind:'email', enabled:false, host:'127.0.0.1', port, secure:false, user:'u', pass:'my long pass phrase', from:''});
  assert.equal(getState().site.email.pass, 'my long pass phrase');
});

test('LDAP sign-in creates the account on first use', async () => {
  const ldap = net.createServer(sock => sock.on('data', d => { const ok = d.includes(Buffer.from('dirpass')); sock.write(Buffer.from([0x30, 0x0c, 0x02, 0x01, 0x01, 0x61, 0x07, 0x0a, 0x01, ok ? 0 : 49, 0x04, 0x00, 0x04, 0x00])); }));
  await new Promise(r => ldap.listen(0, '127.0.0.1', r)); extras.push(ldap);
  const admin = await login('admin');
  assert.equal((await op(admin, 'saveIntegration', {kind:'ldap', enabled:true, url:`ldap://127.0.0.1:${ldap.address().port}`, bindDn:'uid={username},ou=people,dc=nb', autoCreate:true, emailDomain:'corp.test'})).status, 200);
  assert.equal((await call('POST', '/api/login', {username:'dir.user', password:'wrong'})).status, 401);
  const ok = await call('POST', '/api/login', {username:'dir.user', password:'dirpass'}); assert.equal(ok.status, 200);
  const u = getState().users.find(x => x.username === 'dir.user'); assert.equal(u.auth, 'ldap'); assert.equal(u.email, 'dir.user@corp.test');
  assert.ok(getState().enrol.some(e => e.userId === u.id && e.courseId === 'c6'), 'new-hire rule assigned the safety course');
  getState().site.ldap.enabled = false;
});
test('single sign-on with OpenID Connect', async () => {
  const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength:2048});
  const jwk = {...publicKey.export({format:'jwk'}), kid:'k1', alg:'RS256', use:'sig'}; let nonce = '', iss = '';
  const idp = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const json = o => { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(o)); };
    if (u.pathname === '/.well-known/openid-configuration') return json({issuer:iss, authorization_endpoint:iss + '/authorize', token_endpoint:iss + '/token', jwks_uri:iss + '/jwks'});
    if (u.pathname === '/jwks') return json({keys:[jwk]});
    if (u.pathname === '/token') { const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const hdr = b64({alg:'RS256', kid:'k1'}), pl = b64({iss, aud:'nb-client', sub:'123', email:'zoya@nbacademy.example', email_verified:true, nonce, exp:Math.floor(Date.now() / 1000) + 300});
      return json({id_token:`${hdr}.${pl}.${crypto.sign('sha256', Buffer.from(`${hdr}.${pl}`), privateKey).toString('base64url')}`, access_token:'x'}); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => idp.listen(0, '127.0.0.1', r)); extras.push(idp); iss = `http://127.0.0.1:${idp.address().port}`;
  Object.assign(getState().site.sso, {enabled:true, issuer:iss, clientId:'nb-client', clientSecret:'s', autoCreate:false, label:'Test SSO'});
  const start = await call('GET', '/auth/sso'); assert.equal(start.status, 302);
  const loc = new URL(start.headers.get('location')); nonce = loc.searchParams.get('nonce'); assert.ok(loc.searchParams.get('code_challenge'));
  const cb = await call('GET', `/auth/sso/callback?code=abc&state=${loc.searchParams.get('state')}`); assert.equal(cb.status, 302); assert.equal(cb.headers.get('location'), '/');
  assert.equal((await state(cb.cookie)).me, 'u8');
  const replay = await call('GET', `/auth/sso/callback?code=abc&state=${loc.searchParams.get('state')}`); assert.match(replay.headers.get('location'), /sso_error/);
  getState().site.sso.enabled = false;
});

/* ---------- Content governance ---------- */
test('versions: publish, restart in-progress learners, roll back', async () => {
  const admin = await login('admin');
  const p = await op(admin, 'publishCourse', {cid:'c3', notes:'Updated Topic 2', mode:'restart'}); assert.equal(p.status, 200); assert.equal(p.json.result.version, 2); assert.ok(p.json.result.restarted >= 1);
  const v = getState().courseVersions.find(x => x.courseId === 'c3' && x.version === 2);
  assert.equal((await op(admin, 'restoreVersion', {id:v.id})).status, 200);
});
test('courses with learner records can only be archived, not deleted', async () => {
  const admin = await login('admin');
  const d = await op(admin, 'deleteCourse', {id:'c2'}); assert.equal(d.status, 400); assert.match(d.json.error, /Archive it instead/);
  assert.equal((await op(admin, 'archiveCourse', {cid:'c2', on:true})).status, 200);
  assert.equal((await op(admin, 'enrolUser', {cid:'c2', userId:'u5', role:'student'})).status, 400, 'archived courses take no new enrolments');
  assert.equal((await op(admin, 'archiveCourse', {cid:'c2', on:false})).status, 200);
  assert.equal((await op(admin, 'deleteCourse', {id:'c5'})).status, 200, 'drafts can be deleted');
});
test('automatic assignment rules apply to new users and cohorts', async () => {
  const admin = await login('admin');
  const r = await op(admin, 'newUser', {firstname:'Ravi', lastname:'K', username:'ravi.k', email:'ravi@example.com', department:'Analytics', company:'NB Retail'}); assert.equal(r.status, 200);
  const S = getState(); const e = S.enrol.find(x => x.userId === r.json.result.id && x.courseId === 'c6');
  assert.ok(e && e.due > Date.now() + 14 * 864e5 && e.source === 'rule'); assert.ok(S.users.find(u => u.id === r.json.result.id).mustChangePassword);
  assert.ok(S.outbox.some(m => m.userId === r.json.result.id && m.key === 'welcome'));
  const rule = await op(admin, 'saveRule', {name:'Analytics get Excel', matchType:'department', matchValue:'Analytics', targetType:'course', targetId:'c1', days:30}); assert.equal(rule.status, 200);
  const run = await op(admin, 'runRule', {id:rule.json.result.id}); assert.ok(run.json.result.assigned >= 1);
});
test('question bank edits flow into quizzes', async () => {
  const admin = await login('admin');
  const b = getState().qbank.find(q => q.id === 'qb2');
  const r = await op(admin, 'saveBankQuestion', {id:'qb2', category:b.category, q:{type:'tf', text:'Never use a lift during a fire evacuation.', mark:1, answer:true}});
  assert.equal(r.status, 200); assert.ok(r.json.result.synced >= 1);
  assert.equal(getState().mods.m45.questions.find(q => q.bankId === 'qb2').text, 'Never use a lift during a fire evacuation.');
});
test('backup and restore round trip, including users', async () => {
  const admin = await login('admin');
  const b = await call('GET', '/api/backup/c1?users=1', null, admin); assert.equal(b.status, 200);
  const backup = JSON.parse(b.text); assert.equal(backup.format, 'nb-academy-course-backup'); assert.ok(backup.users.length >= 5);
  const r = await op(admin, 'restoreCourse', {backup:b.text, catId:'k1', includeUsers:true});
  assert.equal(r.status, 200); assert.equal(r.json.result.shortname, 'DA101-2'); assert.ok(r.json.result.enrolments >= 6);
});
test('CSV upload creates users with company, department, enrolments and due dates', async () => {
  const admin = await login('admin');
  const csv = 'username,firstname,lastname,email,company,department,course1,role1,group1\nnew.one,New,One,new.one@example.com,NB Retail,Sales,DA101,student,Batch Z\nbad user,Bad,User,nope,,,DA101,student,';
  const r = await op(admin, 'uploadUsers', {csv, defaultPassword:'Pass@2026', dueDays:21});
  assert.equal(r.json.result.created, 1); assert.equal(r.json.result.skipped, 1);
  const S = getState(); const u = S.users.find(x => x.username === 'new.one'); assert.equal(u.department, 'Sales');
  const e = S.enrol.find(x => x.userId === u.id && x.courseId === 'c1'); assert.ok(e.due > Date.now() + 20 * 864e5);
  assert.ok(S.groups.some(g => g.name === 'Batch Z' && g.members.includes(u.id)));
  await login('new.one', 'Pass@2026');
});
test('uploads: owner and course members can download, outsiders cannot', async () => {
  const kabir = await login('kabir');
  const up = await call('POST', '/api/upload?name=sheet.txt', Buffer.from('hello workbook'), kabir, {'Content-Type':'text/plain'});
  const fid = up.json.result.id;
  assert.equal((await op(kabir, 'submit', {mid:'m13', text:'see file', files:[fid]})).status, 200);
  assert.equal((await call('GET', `/files/${fid}/sheet.txt`, null, kabir)).text, 'hello workbook');
  assert.equal((await call('GET', `/files/${fid}/sheet.txt`, null, await login('rohan'))).status, 200);
  assert.equal((await call('GET', `/files/${fid}/sheet.txt`, null, await login('dev'))).status, 404);
});
test('messages only between people who share a course or cohort', async () => {
  const dev = await login('dev');
  assert.equal((await op(dev, 'sendMessage', {to:'u8', text:'Hi Zoya'})).status, 200);
  assert.equal((await op(await login('sana'), 'sendMessage', {to:'u4', text:'Hi'})).status, 403);
});
test('a failed operation leaves no partial changes', async () => {
  const before = JSON.stringify(getState().courses);
  const r = await op(await login('admin'), 'restoreCourse', {backup:'{"format":"nb-academy-course-backup","course":{"sections":[]}}', catId:'nope'});
  assert.equal(r.status, 400); assert.equal(JSON.stringify(getState().courses), before);
});
test('data survives a restart', async () => {
  const Store = require('../server/store.js');
  const S2 = new Store(dir).load(), S = getState();
  for (const k of ['users', 'courses', 'submissions', 'audit', 'cohorts', 'accessRequests', 'certIssued']) assert.equal(S2[k].length, S[k].length, k);
  assert.equal(Object.keys(S2.mods).length, Object.keys(S.mods).length); assert.deepEqual(S2.audit.map(a => a.hash), S.audit.map(a => a.hash));
});
test('logging out ends the session', async () => {
  const c = await login('kabir'); await call('POST', '/api/logout', {}, c);
  assert.equal((await call('GET', '/api/state', null, c)).json.state, null);
  assert.equal((await op(c, 'touch', {cid:'c1'})).status, 401);
});

test('personas: users are created with several personas, and only administrators can change them', async () => {
  const a = await login('admin');
  let r = await op(a, 'newUser', {firstname:'Ravi', lastname:'Menon', username:'ravi.p', email:'ravi.p@example.com', password:'Strong@123', forceChange:false, welcome:false,
    personas:['learner', 'trainer', 'teamlead'], memberOf:['co1'], leads:['co2'], trains:['co3'], trainerCourses:['c1']});
  assert.equal(r.status, 200, r.text);
  const id = r.json.result.id, st = r.json.state;
  assert.ok(st.users.find(u => u.id === id).personas.includes('trainer'));
  assert.ok(st.sysroles.some(x => x.userId === id && x.roleId === 'teamlead'));
  assert.ok(st.cohorts.find(c => c.id === 'co2').leads.includes(id) && st.cohorts.find(c => c.id === 'co3').trainers.includes(id) && st.cohorts.find(c => c.id === 'co1').members.includes(id));
  assert.ok(st.enrol.some(e => e.userId === id && e.courseId === 'c1' && e.role === 'trainer'));
  // The administrator gives themselves the Learner persona
  r = await op(a, 'setPersonas', {userId:'u1', personas:['admin', 'learner']}); assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.state.users.find(u => u.id === 'u1').personas, ['learner']);
  assert.equal((await op(a, 'setPersonas', {userId:'u1', personas:['learner']})).status, 400); // cannot drop own admin
  // Removing a persona removes its mappings
  r = await op(a, 'setPersonas', {userId:id, personas:['learner'], memberOf:['co1']}); assert.equal(r.status, 200, r.text);
  assert.ok(!r.json.state.cohorts.find(c => c.id === 'co2').leads.includes(id) && !r.json.state.enrol.some(e => e.userId === id && e.role === 'trainer'));
  const l = await login('kabir'); assert.equal((await op(l, 'setPersonas', {userId:'u5', personas:['admin']})).status, 403);
});

test('built-in site administrators are created at start-up and cannot be removed in the app', async () => {
  const a = await login('admin'); const st = (await call('GET', '/api/state', null, a)).json.state;
  assert.ok(!st.users.some(x => x.email === 'rohit.chakrabarti@nobroker.in' || x.email === 'gaurav.garg@nobroker.in'), 'only geetansh.kumar is built in');
  for (const email of ['geetansh.kumar@nobroker.in']) {
    const u = st.users.find(x => x.email === email); assert.ok(u && u.admin && u.builtinAdmin, email);
    assert.ok(st.outbox.some(m => m.to === email), 'welcome email queued for ' + email);
  }
  const g = st.users.find(x => x.email === 'geetansh.kumar@nobroker.in'); assert.equal(g.username, 'geetansh.kumar');
  assert.equal((await op(a, 'deleteUser', {id:g.id})).status, 400);
  assert.equal((await op(a, 'setPersonas', {userId:g.id, personas:['learner']})).status, 200);
  assert.ok(getState().users.find(u => u.id === g.id).admin, 'the super administrator keeps administrator access');
  assert.equal((await op(a, 'updateProfile', {id:g.id, firstname:'G', lastname:'K', email:'other@example.com'})).status, 400);
  assert.equal((await op(a, 'suspendUser', {id:g.id, on:true})).status, 400);
  assert.equal((await op(a, 'setPersonas', {userId:g.id, personas:['admin', 'learner']})).status, 200);
});

test('new accounts, including built-in administrators, start with the default password and must change it', async () => {
  const a = await login('admin');
  const r = await op(a, 'newUser', {firstname:'Default', lastname:'Pw', username:'default.pw', email:'default.pw@example.com', welcome:false, personas:['learner']});
  assert.equal(r.status, 200, r.text);
  for (const un of ['default.pw', 'geetansh.kumar']) {
    const res = await call('POST', '/api/login', {username:un, password:'Welcome@1'});
    assert.equal(res.status, 200, `${un}: ${res.text}`);
    assert.equal(res.json.state.users.find(u => u.id === res.json.state.me).mustChangePassword, true, un);
    assert.equal((await op(res.cookie, 'sendMessage', {to:'u1', text:'hi'})).status, 428, `${un} must change the password before doing anything`);
  }
});

test('usernames may use capital letters, keep them, and are matched without regard to case', async () => {
  const a = await login('admin');
  let r = await op(a, 'newUser', {firstname:'Rahul', lastname:'Sharma', username:'Rahul.Sharma', email:'rahul.sharma@example.com', welcome:false, personas:['learner']});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.state.users.find(u => u.id === r.json.result.id).username, 'Rahul.Sharma');
  r = await op(a, 'newUser', {firstname:'R', lastname:'S', username:'rahul.SHARMA', email:'r2@example.com', welcome:false, personas:['learner']});
  assert.equal(r.status, 400); assert.match(r.json.error, /already exists/);
  assert.equal((await op(a, 'newUser', {firstname:'R', lastname:'S', username:'rahul sharma', email:'r3@example.com', welcome:false, personas:['learner']})).status, 400);
  for (const typed of ['Rahul.Sharma', 'rahul.sharma', 'RAHUL.SHARMA']) assert.equal((await call('POST', '/api/login', {username:typed, password:'Welcome@1'})).status, 200, typed);
});

test('only the super administrator can remove, suspend or delete other administrators', async () => {
  const a = await login('admin');
  let r = await op(a, 'newUser', {firstname:'Second', lastname:'Admin', username:'admin2', email:'admin2@example.com', welcome:false, personas:['admin'], admin:true});
  assert.equal(r.status, 200, r.text); const id2 = r.json.result.id;
  assert.equal((await op(a, 'removeAdmin', {id:id2})).status, 403);
  assert.equal((await op(a, 'deleteUser', {id:id2})).status, 403);
  assert.equal((await op(a, 'suspendUser', {id:id2, on:true})).status, 403);
  assert.equal((await op(a, 'setPersonas', {userId:id2, personas:['learner']})).status, 403);
  // The super administrator signs in, sets a password and removes the other administrators' access
  const g = (await call('POST', '/api/login', {username:'geetansh.kumar', password:'Welcome@1'})).cookie;
  assert.equal((await op(g, 'setOwnPassword', {password:'Super@2026x'})).status, 200);
  r = await op(g, 'removeAdmin', {id:id2}); assert.equal(r.status, 200, r.text);
  const u2 = r.json.state.users.find(u => u.id === id2); assert.equal(u2.admin, false); assert.deepEqual(u2.personas, ['learner']);
  assert.ok(r.json.state.audit.some(x => x.action === 'Administrator access removed' && x.target === 'admin2'));
  assert.equal((await op(g, 'removeAdmin', {id:'u1'})).status, 200);
  assert.equal((await op(a, 'deleteUser', {id:id2})).status, 403, 'a former admin cannot manage users any more');
  assert.equal((await op(g, 'deleteUser', {id:id2})).status, 200);
  const me = (await call('GET', '/api/state', null, g)).json.state.users.find(u => u.username === 'geetansh.kumar');
  assert.equal((await op(g, 'removeAdmin', {id:me.id})).status, 400, 'cannot remove own access');
  // give the demo admin its access back for the remaining tests
  assert.equal((await op(g, 'setPersonas', {userId:'u1', personas:['admin']})).status, 200);
});

test('the super administrator holds every persona and can be assigned training', async () => {
  const g = (await call('POST', '/api/login', {username:'geetansh.kumar', password:'Super@2026x'})).cookie; assert.ok(g);
  let st = (await call('GET', '/api/state', null, g)).json.state;
  const me = st.users.find(u => u.id === st.me), H = require('../public/core.js').H(getState(), me.id);
  assert.deepEqual(H.personas(), ['learner', 'trainer', 'teamlead', 'admin']);
  assert.ok(H.isTrainer() && H.isTeamLead() && H.learnerPersona());
  assert.equal(H.cohortsLed().length, getState().cohorts.length, 'sees every cohort as team lead');
  // unticking personas does not take them away
  assert.equal((await op(g, 'setPersonas', {userId:me.id, personas:['admin']})).status, 200);
  assert.deepEqual(require('../public/core.js').H(getState(), me.id).personas(), ['learner', 'trainer', 'teamlead', 'admin']);
  // can be assigned a course like any learner
  const a = await login('admin');
  const r = await op(a, 'assign', {kind:'course', id:'c1', users:[me.id], due:Date.now() + 7 * 864e5, mandatory:true});
  assert.equal(r.status, 200, r.text);
  assert.ok(getState().enrol.some(e => e.courseId === 'c1' && e.userId === me.id && e.role === 'student'));
});

test('course group chats: trainers and admins create them; only members (and course managers) see them', async () => {
  const rohan = await login('rohan'), asha = await login('asha'), dev = await login('dev'), a = await login('admin');
  assert.equal((await op(asha, 'createChat', {cid:'c1', name:'Learners only'})).status, 403, 'learners cannot create chats');
  assert.equal((await op(rohan, 'createChat', {cid:'c2', name:'Not my course'})).status, 403, 'trainers only in their own courses');
  let r = await op(rohan, 'createChat', {cid:'c1', name:'DA101 everyone', mode:'course'}); assert.equal(r.status, 200, r.text);
  const everyone = r.json.result.id;
  const chat = r.json.state.chats.find(c => c.id === everyone);
  for (const id of ['u2', 'u4', 'u5']) assert.ok(chat.memberIds.includes(id));
  r = await op(asha, 'sendChatMessage', {id:everyone, text:'Hello team'}); assert.equal(r.status, 200, r.text);
  let st = (await call('GET', '/api/state', null, rohan)).json.state;
  assert.ok(st.chatMessages.some(m => m.chatId === everyone && m.text === 'Hello team'));
  st = (await call('GET', '/api/state', null, dev)).json.state;
  assert.ok(!st.chats.some(c => c.id === everyone) && !st.chatMessages.some(m => m.chatId === everyone), 'not in the course, cannot see it');
  assert.equal((await op(dev, 'sendChatMessage', {id:everyone, text:'hi'})).status, 403);
  // A smaller chat with chosen people
  r = await op(rohan, 'createChat', {cid:'c1', name:'Asha and Rohan', mode:'custom', members:['u4']}); assert.equal(r.status, 200, r.text);
  const small = r.json.result.id;
  st = (await call('GET', '/api/state', null, await login('kabir'))).json.state;
  assert.ok(!st.chats.some(c => c.id === small), 'kabir is not in the small chat');
  st = (await call('GET', '/api/state', null, a)).json.state;
  assert.ok(st.chats.some(c => c.id === small), 'admins can see every chat to moderate');
  assert.equal((await op(asha, 'updateChat', {id:small, name:'x', mode:'course'})).status, 403);
  assert.equal((await op(asha, 'deleteChat', {id:small})).status, 403);
  assert.equal((await op(rohan, 'deleteChat', {id:small})).status, 200);
  // Created together with a course, and removed with it
  r = await op(a, 'newCourse', {fullname:'Chat course', shortname:'CHAT1', catId:getState().categories[0].id, sections:1, groupChat:'on'});
  assert.equal(r.status, 200, r.text); const cid = r.json.result.id;
  assert.ok(r.json.state.chats.some(c => c.courseId === cid && c.mode === 'course'));
  r = await op(a, 'deleteCourse', {id:cid}); assert.equal(r.status, 200, r.text);
  assert.ok(!r.json.state.chats.some(c => c.courseId === cid));
});

test('accounts listed for removal are deleted at start-up, but never a built-in administrator', async () => {
  const S0 = getState(); const admin = S0.users.find(u => u.username === 'admin'), dev = S0.users.find(u => u.username === 'dev');
  const devEnrolments = S0.enrol.filter(e => e.userId === dev.id).length; assert.ok(devEnrolments > 0);
  const c = await login('admin');
  removeAccounts(['admin', 'dev@nbacademy.example', 'geetansh.kumar', 'geetansh.kumar@nobroker.in', 'nobody']);
  const S1 = getState();
  assert.ok(!S1.users.some(u => u.id === admin.id || u.id === dev.id), 'admin and dev removed');
  assert.equal(S1.enrol.filter(e => e.userId === dev.id).length, 0);
  assert.ok(S1.users.some(u => u.username === 'geetansh.kumar' && u.admin), 'built-in admin kept');
  assert.ok(S1.audit.some(a => a.action === 'User removed by server configuration' && a.target === 'admin'));
  assert.equal((await call('GET', '/api/state', null, c)).json.state, null, 'the removed admin is signed out');
  const site = (await call('GET', '/api/site')).json; assert.ok(!site.demoUsers.includes('admin'));
});

test('a demo site started without --demo is cleaned: backup first, then only real accounts remain', async () => {
  const {spawn} = require('node:child_process'); const {DatabaseSync} = require('node:sqlite');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nbacademy-demo-'));
  const run = (args) => new Promise(resolve => {
    const env = {...process.env, NB_DATA_DIR:d, PORT:'0'}; delete env.NB_DEMO; delete env.NB_REMOVE_ACCOUNTS;
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), ...args], {env}); let out = '';
    p.stdout.on('data', b => { out += b; if (out.includes('running at')) p.kill(); }); p.stderr.on('data', b => { out += b; });
    p.on('exit', () => resolve(out));
  });
  assert.match(await run(['--demo']), /Loaded demo data/);
  const out = await run([]);
  assert.match(out, /Demo data removed: 6 courses/);
  const db = new DatabaseSync(path.join(d, 'nbacademy.db'));
  const rows = coll => db.prepare('SELECT data FROM records WHERE coll = ?').all(coll).map(r => JSON.parse(r.data));
  const users = rows('users');
  assert.deepEqual(users.map(u => u.username), ['geetansh.kumar']);
  assert.equal(rows('courses').length, 0); assert.equal(rows('cohorts').length, 0);
  assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE coll = 'site'").get().data).demo, false);
  assert.ok(rows('audit').some(a => a.action === 'Demo data removed'));
  const backups = fs.readdirSync(path.join(d, 'backups')); assert.equal(backups.length, 1);
  assert.ok(fs.existsSync(path.join(d, 'backups', backups[0], 'nbacademy.db')));
  db.close();
  assert.doesNotMatch(await run([]), /Demo data removed/, 'only once');
});
