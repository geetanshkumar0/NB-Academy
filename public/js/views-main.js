/* NB Academy front end · login, onboarding, learner dashboard and tabs, library, calendar, profile, record, messages */
'use strict';

/* ---------- Login, forgot password, two-step code, set password from a link ---------- */
function viewLogin() {
  const demo = [['admin', 'Administrator'], ['rohan', 'Trainer · DA101, TE110 · also a learner'], ['priya', 'Trainer · BS201, BS150, new hires'], ['vikram', 'Team Lead · Analytics Team'], ['asha', 'Learner · one course overdue'], ['kabir', 'Learner · access request pending'], ['nisha', 'New hire · first login'], ['sana', 'Custom role · Course reviewer']]
    .filter(([un]) => !window.__demoUsers || window.__demoUsers.includes(un));
  const site = window.__site || {name:S?.site?.name || 'NB Academy', tagline:'Courses, assessments and progress tracking for every learner.'};
  const lv = ui.loginView;
  let form;
  if (lv === 'mfa') form = `<div class="stack" style="gap:6px"><h2 style="font-size:1.5rem">Two-step sign-in</h2><p class="muted">Enter the 6-digit code from your authenticator app.</p></div>
      ${ui.loginErr ? `<div class="err" role="alert">${esc(ui.loginErr)}</div>` : ''}
      <form data-form="loginMfa" class="stack"><div class="field"><label for="mcode">Authentication code</label><input id="mcode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required></div><button class="btn primary" type="submit">Verify</button><button class="link small" type="button" data-act="loginView" data-v="login">Use a different account</button></form>`;
  else if (lv === 'forgot') form = `<div class="stack" style="gap:6px"><h2 style="font-size:1.5rem">Forgotten your password?</h2><p class="muted">Enter your username or email address. If an account matches, we send a link to choose a new password.</p></div>
      ${ui.loginErr ? `<div class="err" role="alert">${esc(ui.loginErr)}</div>` : ''}
      <form data-form="forgot" class="stack"><div class="field"><label for="flogin">Username or email</label><input id="flogin" name="login" type="text" autocapitalize="none" required></div><button class="btn primary" type="submit">Send reset link</button><button class="link small" type="button" data-act="loginView" data-v="login">Back to log in</button></form>`;
  else if (lv === 'sent') form = `<div class="stack"><h2 style="font-size:1.5rem">Check your email</h2><p>If an account matches, a link to set a new password is on its way. The link works for 2 hours.</p>${!B.server ? '<p class="muted small">In the preview, emails are not sent. An administrator can see them in Site administration › Email log.</p>' : ''}<button class="btn" data-act="loginView" data-v="login">Back to log in</button></div>`;
  else if (lv === 'token') form = `<div class="stack" style="gap:6px"><h2 style="font-size:1.5rem">Choose a password</h2><p class="muted">${ui.token?.name ? `Hi ${esc(ui.token.name)}, set` : 'Set'} a password for your account${ui.token?.username ? ` <b class="mono">${esc(ui.token.username)}</b>` : ''}.</p></div>
      ${ui.loginErr ? `<div class="err" role="alert">${esc(ui.loginErr)}</div>` : ''}
      ${ui.token?.valid === false ? '<div class="err">This link has expired or was already used. Ask for a new one with "Forgotten your password?".</div><button class="btn" data-act="loginView" data-v="forgot">Get a new link</button>' : `<form data-form="tokenPassword" class="stack"><div class="field"><label for="tp1">New password</label><input id="tp1" name="password" type="password" autocomplete="new-password" required><span class="hint">${esc(pwRuleText(window.__security))}</span></div><div class="field"><label for="tp2">Repeat the password</label><input id="tp2" name="password2" type="password" autocomplete="new-password" required></div><button class="btn primary" type="submit">Set password</button></form>`}`;
  else form = `<div class="stack" style="gap:6px"><h2 style="font-size:1.5rem">Log in</h2><p class="muted">Use your ${esc(site.name)} username and password.</p></div>
      ${ui.loginErr ? `<div class="err" role="alert">${esc(ui.loginErr)}</div>` : ''}
      <form data-form="login" class="stack">
        <div class="field"><label for="lu">Username</label><input id="lu" name="username" type="text" autocomplete="username" autocapitalize="none" required></div>
        <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Log in</button>
        <button class="link small" type="button" data-act="loginView" data-v="forgot">Forgotten your password?</button>
      </form>
      ${window.__sso ? `<div class="or"><span>or</span></div><a class="btn" href="/auth/sso">${esc(window.__sso.label)}</a>` : ''}
      ${window.__demo !== false ? `<div class="stack" style="gap:10px"><div class="spread"><span class="eyebrow">Demo accounts</span><span class="chip demo">password: demo</span></div>
        <div class="demo-list">${demo.map(([un, d]) => `<button data-act="quickLogin" data-u="${un}">${avatar({id:'u' + un, firstname:un, lastname:''}, 30)}<span><b style="text-transform:capitalize">${un}</b><br><span class="muted small">${d}</span></span></button>`).join('')}</div></div>` : ''}`;
  return `<div class="login">
    <section class="login-art"><div class="row">${logoHTML()}<b style="font-family:var(--f-display);font-size:1.1rem">${esc(site.name)}</b></div>
      <div class="stack"><h1>Learn, practise, and track every step.</h1><p>${esc(site.tagline)}</p></div>
      <div class="codes">${(window.__codes || ['DA101', 'BS201', 'TE110', 'SAFE100']).map(c => `<span>${esc(c)}</span>`).join('')}</div></section>
    <section class="login-form">${form}</section></div>`;
}
function pwRuleText(sec) {
  sec = sec || S?.site?.security || {minLength:8, upper:true, lower:true, digit:true};
  const parts = [`at least ${sec.minLength || 8} characters`]; if (sec.upper) parts.push('an uppercase letter'); if (sec.lower) parts.push('a lowercase letter'); if (sec.digit) parts.push('a number'); if (sec.special) parts.push('a symbol');
  return `Use ${parts.join(', ')}.`;
}

/* ---------- First login: password, two-step sign-in, terms, accessibility ---------- */
function viewOnboarding(step) {
  const u = me(), steps = ['password', 'mfa', 'terms', 'prefs'].filter(s => s !== 'mfa' || C.mfaRequired(S, u)), i = steps.indexOf(step);
  let body = '';
  if (step === 'password') body = `<h2>Set your password</h2><p class="muted">Welcome, ${esc(u.firstname)}. Choose a new password to replace the temporary one.</p>
    <form data-form="setOwnPassword" class="stack"><div class="field"><label for="np1">New password</label><input id="np1" name="password" type="password" autocomplete="new-password" required><span class="hint">${esc(pwRuleText())}</span></div>
    <div class="field"><label for="np2">Repeat the password</label><input id="np2" name="password2" type="password" autocomplete="new-password" required></div><p class="err" id="pwerr" hidden></p><button class="btn primary" type="submit">Save and continue</button></form>`;
  if (step === 'mfa') body = `<h2>Set up two-step sign-in</h2><p class="muted">Your organisation requires a code from an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) each time you sign in.</p>${mfaSetupHTML()}`;
  if (step === 'terms') body = `<h2>Platform terms</h2><p class="muted">Please read and accept the terms to continue.</p><div class="card prose" style="max-height:320px;overflow:auto">${md(S.site.terms?.text || '')}</div>
    <form data-form="acceptTerms" class="stack"><label class="check"><input type="checkbox" name="agree" required> I have read and accept these terms</label><button class="btn primary" type="submit">Accept and continue</button></form>`;
  if (step === 'prefs') body = `<h2>Accessibility preferences</h2><p class="muted">Set how ${esc(S.site.name)} looks and plays for you. You can change these at any time from the user menu.</p>${prefsForm(true)}`;
  return `<div class="page" style="max-width:640px"><div class="row" style="margin-bottom:18px">${logoHTML()}<b style="font-family:var(--f-display)">${esc(S.site.name)}</b><span class="muted small" style="margin-left:auto">Step ${i + 1} of ${steps.length}</span><button class="link small" data-act="logout">Log out</button></div>
    <div class="card stack">${body}</div></div>`;
}
function mfaSetupHTML() {
  const s = ui.mfaSetup;
  if (!s) return `<div><button class="btn primary" data-act="mfaSetup">Start set-up</button></div>`;
  return `<ol class="stack" style="gap:10px;padding-left:20px"><li>Open your authenticator app and add an account with <b>Enter a setup key</b>.</li>
    <li>Account name: <b class="mono">${esc(me().username)}</b>. Key (time-based):<div class="row" style="margin-top:6px"><code class="mono" id="mfakey" style="font-size:1.05rem;letter-spacing:.08em;word-break:break-all">${esc(s.secret.replace(/(.{4})/g, '$1 ').trim())}</code><button class="btn sm" data-act="copyText" data-t="mfakey">Copy</button></div></li>
    <li>Enter the 6-digit code the app shows.</li></ol>
    <form data-form="mfaEnable" class="row"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456" aria-label="Code" style="max-width:160px" required><button class="btn primary" type="submit">Turn on</button></form><p class="err" id="mfaerr" hidden></p>`;
}
function prefsForm(onboarding) {
  const p = me().prefs || {};
  return `<form data-form="savePrefs" class="stack">
    <label class="check"><input type="checkbox" name="contrast" ${p.contrast ? 'checked' : ''}> High contrast colours</label>
    <div class="field"><span class="lbl">Text size</span><div class="row">${[['100', 'Standard'], ['115', 'Large'], ['130', 'Extra large']].map(([v, l]) => `<label class="check"><input type="radio" name="text" value="${v}" ${(p.text || '100') === v ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
    <label class="check"><input type="checkbox" name="captions" ${p.captions !== false ? 'checked' : ''}> Show closed captions on videos by default</label>
    <label class="check"><input type="checkbox" name="motion" ${p.motion ? 'checked' : ''}> Reduce motion and animations</label>
    <div><button class="btn primary" type="submit">${onboarding ? 'Save and go to my dashboard' : 'Save preferences'}</button></div></form>`;
}
VIEWS.prefs = () => `${phead([['Dashboard', 'dashboard'], ['Accessibility']], 'Accessibility preferences')}<div class="card" style="max-width:640px">${prefsForm(false)}</div>`;

/* ---------- Learner dashboard ---------- */
function courseCard(c, opts = {}) {
  const u = me(), st = h.isLearner(c.id) ? h.status(c.id, u.id) : null, e = h.enrolOf(c.id);
  const role = e ? (st ? '' : `Your role: ${roleName(e.role)}`) : h.isAdmin() ? 'Site administrator' : 'Not enrolled';
  const lock = st && (st === 'overdue' || h.pathLock(c.id));
  return `<article class="ccard" data-s="${esc((c.fullname + ' ' + c.shortname).toLowerCase())}">
    <button class="ccard-img" style="${pattern(c.id)}" data-go="course" data-id="${c.id}" aria-label="Open ${esc(c.fullname)}">${esc(c.shortname)}${lock ? `<span style="margin-left:auto">${lockIcon()}</span>` : ''}</button>
    <div class="ccard-b"><div class="eyebrow">${esc(h.cat(c.catId)?.name || '')}</div>
      <h3><button class="link" data-go="course" data-id="${c.id}">${esc(c.fullname)}</button></h3>
      <div class="row" style="gap:6px">${st ? statusChip(st) : ''}${e?.mandatory && st && st !== 'completed' ? '<span class="chip warn">Mandatory</span>' : ''}${c.status === 'archived' ? '<span class="chip">Archived</span>' : c.status === 'draft' ? '<span class="chip">Draft</span>' : ''}${!c.visible ? '<span class="chip">Hidden</span>' : ''}</div>
      ${st && e?.due && st !== 'completed' ? `<div class="small ${st === 'overdue' ? '' : 'muted'}" style="${st === 'overdue' ? 'color:var(--bad)' : ''}">${st === 'overdue' ? 'Was due' : 'Due'} ${fmtDate(e.due)}</div>` : ''}
      ${st === 'completed' ? `<div class="small muted">Completed ${fmtDateOnly(e.completedAt)}${h.courseTotal(c.id, u.id) != null ? ` · Grade ${fmtPct(h.courseTotal(c.id, u.id))}` : ''}</div>` : ''}
      ${st ? progressBar(h.progress(c.id, u.id)) : `<div class="prog">${esc(role)}</div>`}</div></article>`;
}
function myAssignments() { return S.enrol.filter(e => e.userId === S.me && h.isLearner(e.courseId) && h.course(e.courseId)).map(e => ({e, c:h.course(e.courseId), st:h.status(e.courseId)})); }
function events(range = [-14, 60]) {
  const out = [], lo = now() + range[0] * D, hi = now() + range[1] * D;
  for (const cid of h.myCourseIds()) {
    if (!h.canView(cid)) continue; const learner = h.isLearner(cid);
    for (const m of h.visibleMods(cid)) {
      const due = h.dueOf(m); if (!due || due < lo || due > hi) continue;
      if (m.type === 'workshop' && (m.phase || 1) !== 2) continue;
      out.push({m, due, c:h.course(cid), done:learner && h.isDone(m, S.me), learner});
    }
  }
  for (const {e, c, st} of myAssignments()) if (e.due && e.due >= lo && e.due <= hi && st !== 'completed') out.push({course:true, due:e.due, c, done:false, learner:true, st});
  // Live sessions I am invited to (Live sessions tab)
  for (const s of S.sessions || []) if (!s.cancelled && s.start >= lo && s.start <= hi && (!s.invitees || s.invitees.includes(S.me))) out.push({sess:s, due:s.start, done:!!s.mine?.status && s.mine.status !== 'absent', learner:true});
  return out.sort((a, b) => a.due - b.due);
}
const dueVerb = m => ({assign:'Assignment is due', quiz:'Quiz closes', workshop:'Submissions close', lesson:'Lesson closes', live:'Live session starts'}[m.type] || 'Due');
const actLabel = m => ({assign:'Add submission', quiz:'Attempt quiz', workshop:'Submit work', lesson:'Start lesson', live:'View session'}[m.type] || 'Open');

VIEWS.dashboard = () => {
  const mode = currentMode();
  if (mode === 'teamlead') return VIEWS.team({}); if (mode === 'trainer') return VIEWS.trainer({}); if (mode === 'admin') return VIEWS.analytics({}); if (mode === 'moderator') return VIEWS.home({});
  const u = me(), mine = myAssignments(), ev = events([-14, 30]).filter(x => x.learner);
  const cnt = k => mine.filter(x => x.st === k).length;
  const tiles = [['notstarted', 'Assigned · not started', 'assigned'], ['inprogress', 'In progress', 'progress'], ['completed', 'Completed', 'done'], ['overdue', 'Overdue · locked', 'overdue']];
  const resume = mine.filter(x => x.st === 'inprogress' && x.e.lastMod).map(x => ({...x, m:resumeTarget(x.c.id)})).filter(x => x.m).sort((a, b) => (S.access[S.me]?.[b.c.id] || 0) - (S.access[S.me]?.[a.c.id] || 0))[0];
  let lastDay = '';
  const tl = ev.filter(e => !(e.done && e.due < now()) && !(e.sess && e.due + (e.sess.duration || 60) * 6e4 < now())).map(e => {
    const late = !e.done && e.due < now(); const dayLbl = late ? 'Overdue' : fmtDay(e.due);
    const head = dayLbl !== lastDay ? `<div class="tl-day">${esc(dayLbl)}</div>` : ''; lastDay = dayLbl;
    if (e.sess) return `${head}<div class="tl-item"><span class="tl-time num">${fmtTime(e.due)}</span>${icon('live', 'sm')}<div class="t"><button class="link" data-go="session" data-id="${e.sess.id}">${esc(e.sess.name)}</button><div class="muted small">Live session · ${e.sess.duration || 60} min</div></div><div class="act"><button class="btn sm" data-go="session" data-id="${e.sess.id}">View session</button></div></div>`;
    if (e.course) return `${head}<div class="tl-item"><span class="tl-time num">${fmtTime(e.due)}</span><span class="ic sm p-other" aria-hidden="true"><svg viewBox="0 0 24 24">${SVG.lock}</svg></span><div class="t"><button class="link" data-go="course" data-id="${e.c.id}">${esc(e.c.fullname)}</button><div class="muted small">Course deadline · ${h.progress(e.c.id, S.me)}% done${late ? ' · <span style="color:var(--bad)">locked</span>' : ''}</div></div><div class="act"><button class="btn sm" data-go="course" data-id="${e.c.id}">${late ? 'Request access' : 'Continue'}</button></div></div>`;
    const action = e.done ? `<span class="chip ok">Done</span>` : `<button class="btn sm" data-go="mod" data-id="${e.m.id}">${actLabel(e.m)}</button>`;
    return `${head}<div class="tl-item"><span class="tl-time num">${fmtTime(e.due)}</span>${icon(e.m.type, 'sm')}<div class="t"><button class="link" data-go="mod" data-id="${e.m.id}">${esc(e.m.name)}</button><div class="muted small">${dueVerb(e.m)} · ${esc(e.c.shortname)}${late ? ` · <span style="color:var(--bad)">${dur(now() - e.due)} late</span>` : ''}</div></div><div class="act">${action}</div></div>`;
  }).join('');
  const paths = S.paths.filter(p => S.enrol.some(e => e.userId === S.me && e.pathId === p.id));
  const expiring = S.certIssued.filter(c => c.userId === S.me && c.expires && !c.archived && c.expires - now() < 60 * D);
  const earned = S.badgeIssued.filter(i => i.userId === S.me).map(i => S.badges.find(b => b.id === i.badgeId)).filter(Boolean);
  return `${phead([['Dashboard']], `Welcome back, ${u.firstname}`)}
  <div class="stats" style="margin-bottom:20px">${tiles.map(([k, l, tab]) => `<button class="stat statbtn st-${k}" data-go="mycourses" data-tab="${tab}"><b>${cnt(k)}</b><span class="muted small">${l}</span></button>`).join('')}</div>
  <div class="dash"><div class="stack" style="gap:20px">
    ${resume ? `<section class="card row" style="justify-content:space-between"><div class="row">${icon(resume.m.type)}<div><div class="eyebrow">Resume where you left off</div><b>${esc(resume.m.name)}</b><div class="muted small">${esc(resume.c.fullname)} · ${h.progress(resume.c.id, S.me)}% complete</div></div></div><button class="btn primary" data-go="mod" data-id="${resume.m.id}">Resume</button></section>` : ''}
    ${cnt('overdue') ? `<section class="card" style="background:var(--bad-soft);border-color:transparent"><b style="color:var(--bad)">${lockIcon()} ${cnt('overdue')} course${cnt('overdue') > 1 ? 's are' : ' is'} overdue and locked.</b><p class="small" style="margin-top:4px">Open ${cnt('overdue') > 1 ? 'each course' : 'the course'} and request access with a short justification. Your progress is kept.</p><div class="row" style="margin-top:8px">${mine.filter(x => x.st === 'overdue').map(x => `<button class="btn sm" data-go="course" data-id="${x.c.id}">${esc(x.c.shortname)}</button>`).join('')}</div></section>` : ''}
    <section class="block"><header><h2>Timeline</h2><span class="muted small">Next 30 days</span></header><div class="tl">${tl || '<div class="empty">Nothing due in the next 30 days. You are all caught up.</div>'}</div></section>
    ${paths.length ? `<section class="stack" style="gap:12px"><h2>My learning paths</h2>${paths.map(pathCard).join('')}</section>` : ''}
    <section class="stack" style="gap:12px"><div class="spread"><h2>My courses</h2><button class="link" data-go="mycourses">See all</button></div>
      <div class="cgridcards">${mine.filter(x => x.st !== 'completed').sort((a, b) => (a.e.due || 9e15) - (b.e.due || 9e15)).slice(0, 6).map(x => courseCard(x.c)).join('') || '<div class="empty">No courses in progress. Browse the Library to find one.</div>'}</div></section>
  </div>
  <aside class="stack" style="gap:20px">${miniCal()}
    ${expiring.length ? `<section class="block"><header><h3>Certificates expiring</h3></header><div class="bb stack" style="gap:8px">${expiring.map(c => `<div><b class="small">${esc(h.course(S.mods[c.cmid]?.courseId)?.fullname || '')}</b><div class="muted small">Expires ${fmtDateOnly(c.expires)}</div></div>`).join('')}</div></section>` : ''}
    <section class="block"><header><h3>Upcoming events</h3><button class="link small" data-go="calendar">Full calendar</button></header>
      <div class="bb stack" style="gap:12px">${ev.filter(e => e.due >= now() && !e.course).slice(0, 5).map(e => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start">${icon(e.sess ? 'live' : e.m.type, 'sm')}<div style="min-width:0"><button class="link" data-go="${e.sess ? 'session' : 'mod'}" data-id="${(e.sess || e.m).id}">${esc((e.sess || e.m).name)}</button><div class="muted small">${fmtDate(e.due)}</div></div></div>`).join('') || '<p class="muted small">No upcoming events.</p>'}</div></section>
    ${earned.length ? `<section class="block"><header><h3>My latest badges</h3><button class="link small" data-go="mybadges">All badges</button></header><div class="bb bstrip">${earned.slice(-3).reverse().map(b => `<div class="bmini">${medal(b)}<span>${esc(b.name)}</span></div>`).join('')}</div></section>` : ''}
  </aside></div>`;
};
function pathCard(p) {
  const cs = p.courses.map(id => h.course(id)).filter(Boolean); const done = cs.filter(c => h.status(c.id) === 'completed').length;
  return `<div class="card stack" style="gap:10px"><div class="spread"><div><b>${esc(p.name)}</b><div class="muted small">${esc(p.description)}</div></div><span class="chip ${done === cs.length ? 'ok' : 'brand'}">${done} of ${cs.length} courses</span></div>
    <div class="pathsteps">${cs.map((c, i) => { const st = h.enrolOf(c.id) ? h.status(c.id) : null; const locked = h.pathLock(c.id); return `<button class="pstep st-${st || 'none'}" data-go="course" data-id="${c.id}"><span class="num">${i + 1}</span><span><b>${esc(c.shortname)}</b><br><span class="small">${locked ? 'Locked until previous course is done' : st ? STATUS[st][0] : 'Not assigned'}</span></span></button>`; }).join('<span class="parrow" aria-hidden="true">→</span>')}</div></div>`;
}
function miniCal() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const off = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const evd = new Set(events([-40, 40]).map(e => { const x = new Date(e.due); return x.getMonth() === m ? x.getDate() : -1; }));
  let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<span class="h">${x}</span>`).join('');
  for (let i = 0; i < off; i++) cells += '<span class="o"></span>';
  for (let i = 1; i <= days; i++) cells += `<span class="${i === d.getDate() ? 't' : ''} ${evd.has(i) ? 'e' : ''}">${i}</span>`;
  return `<section class="block"><header><h3>${d.toLocaleDateString('en-IN', {month:'long', year:'numeric'})}</h3></header><div class="bb"><div class="mini">${cells}</div></div></section>`;
}

/* ---------- My learning (learner tabs) / My courses (trainers) ---------- */
VIEWS.mycourses = (p) => {
  const mode = currentMode();
  if (mode !== 'learner') {
    const cs = h.myCourseIds().map(id => h.course(id)).filter(c => c && h.canView(c.id) && (mode === 'admin' || mode === 'moderator' || (h.enrolOf(c.id) && !h.isLearner(c.id))));
    return `${phead([['My courses']], mode === 'trainer' ? 'Courses I deliver' : 'Courses')}<div class="spread" style="margin-bottom:18px"><span class="muted small">${cs.length} courses</span><input type="search" id="msearch" data-filter="#mcards" placeholder="Search courses" aria-label="Search courses" style="max-width:260px"></div>
      <div class="cgridcards" id="mcards">${cs.map(c => courseCard(c)).join('') || '<div class="empty">No courses are tagged to you yet.</div>'}</div>`;
  }
  const tab = p.tab || 'assigned', mine = myAssignments();
  const T = [['assigned', 'Assigned', 'notstarted'], ['progress', 'In progress', 'inprogress'], ['done', 'Completed', 'completed'], ['overdue', 'Overdue', 'overdue'], ['library', 'Course library', null]];
  let body;
  if (tab === 'library') body = libraryHTML();
  else {
    const st = T.find(x => x[0] === tab)[2]; const list = mine.filter(x => x.st === st).sort((a, b) => (a.e.due || 9e15) - (b.e.due || 9e15));
    const empty = {notstarted:'No new assignments. Training pushed to you by a trainer or administrator appears here.', inprogress:'Nothing in progress. Open an assigned course to start it.', completed:'No completed courses yet.', overdue:'Nothing overdue. Well done.'}[st];
    body = st === 'completed' ? completedTable(list) : `<div class="cgridcards" id="mcards">${list.map(x => courseCard(x.c)).join('') || `<div class="empty">${empty}</div>`}</div>`;
  }
  return `${phead([['My learning']], 'My learning')}
    <nav class="tabs" aria-label="My learning">${T.map(([k, l, st]) => `<button class="tab ${k === tab ? 'on' : ''}" data-go="mycourses" data-tab="${k}">${l}${st ? ` <span class="chip ${st === 'overdue' && mine.some(x => x.st === 'overdue') ? 'bad' : ''}">${mine.filter(x => x.st === st).length}</span>` : ''}</button>`).join('')}</nav>${body}`;
};
function completedTable(list) {
  if (!list.length) return '<div class="card empty">No completed courses yet.</div>';
  return `<div class="tw"><table><thead><tr><th>Course</th><th>Completed</th><th class="n">Grade</th><th>Certificate</th></tr></thead><tbody>${list.map(({c, e}) => {
    const cert = S.certIssued.filter(x => x.userId === S.me && S.mods[x.cmid]?.courseId === c.id).sort((a, b) => b.time - a.time)[0];
    return `<tr><td><button class="link" data-go="course" data-id="${c.id}">${esc(c.fullname)}</button><br><span class="muted small mono">${esc(c.shortname)}</span></td><td class="small">${fmtDateOnly(e.completedAt)}</td><td class="n">${fmtPct(h.courseTotal(c.id, S.me))}</td>
      <td class="small">${cert ? `<button class="link" data-go="mod" data-id="${cert.cmid}">View</button>${B.server ? ` · <a href="${B.certPdfUrl(cert.code)}" target="_blank" rel="noopener">PDF</a>` : ''}<br><span class="muted">${cert.expires ? `Valid until ${fmtDateOnly(cert.expires)}` : 'No expiry'}</span>` : '<span class="muted">–</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function libraryHTML() {
  const cs = S.courses.filter(c => (c.status || 'published') === 'published' && c.visible && c.selfenrol !== false);
  return `<div class="spread" style="margin-bottom:14px"><p class="muted">Optional courses you can join yourself.</p><input type="search" id="lsearch2" data-filter="#libcards" placeholder="Search the library" aria-label="Search the library" style="max-width:260px"></div>
    <div class="cgridcards" id="libcards">${cs.map(c => { const en = h.enrolOf(c.id);
      return `<article class="ccard" data-s="${esc((c.fullname + ' ' + c.shortname + ' ' + c.summary).toLowerCase())}"><div class="ccard-img" style="${pattern(c.id)};cursor:default">${esc(c.shortname)}</div><div class="ccard-b"><div class="eyebrow">${esc(h.cat(c.catId)?.name || '')} · ${c.hours || 0} h</div><h3>${esc(c.fullname)}</h3><p class="small muted">${esc(c.summary)}</p>
        <div style="margin-top:auto">${en ? `<button class="btn sm" data-go="course" data-id="${c.id}">Open</button>` : `<button class="btn sm primary" data-act="enrolMe" data-id="${c.id}">Enrol me</button>`}</div></div></article>`; }).join('') || '<div class="empty">No optional courses are open for self-enrolment right now.</div>'}</div>`;
}

VIEWS.home = () => {
  if (currentMode() === 'learner') return VIEWS.mycourses({tab:'library'});
  const byCat = S.categories.map(k => ({k, cs:S.courses.filter(c => c.catId === k.id)})).filter(x => x.cs.length);
  return `${phead([['Courses']], 'Courses')}
    <div class="dash"><div>
    <div class="spread" style="margin-bottom:14px"><span class="muted small">${S.courses.length} courses in ${byCat.length} categories</span><div class="row"><input type="search" id="hsearch" data-filter="#catalog" placeholder="Search all courses" aria-label="Search all courses" style="max-width:260px">${h.has('course:create') ? '<button class="btn primary" data-act="newCourse">Create course</button>' : ''}</div></div>
    <div id="catalog" class="stack" style="gap:24px">${byCat.map(({k, cs}) => `<section class="stack" style="gap:10px" data-group><div class="eyebrow">${esc(k.name)}</div>
      ${cs.map(c => { const t = h.teachers(c.id); const n = h.students(c.id).length;
        return `<article class="card" data-s="${esc((c.fullname + ' ' + c.shortname + ' ' + c.summary).toLowerCase())}" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;padding:16px">
          <div style="${pattern(c.id)};width:64px;height:64px;border-radius:8px;flex:none" aria-hidden="true"></div>
          <div style="flex:1;min-width:200px" class="stack" style="gap:4px"><div class="row"><h3><button class="link" data-go="course" data-id="${c.id}">${esc(c.fullname)}</button></h3><span class="chip mono">${esc(c.shortname)}</span>${c.status === 'draft' ? '<span class="chip warn">Draft</span>' : c.status === 'archived' ? '<span class="chip">Archived</span>' : `<span class="chip ok">Published v${c.version || 1}</span>`}</div>
            <p class="muted small">${esc(c.summary)}</p><p class="small">Trainers: ${t.map(x => esc(fullname(x))).join(', ') || '<span class="muted">none</span>'} · ${n} learners · ${c.hours || 0} h</p></div>
          <div class="row">${h.canView(c.id) ? `<button class="btn" data-go="course" data-id="${c.id}">Open</button>` : ''}${h.has('course:assign', c.id) && c.status === 'published' ? `<button class="btn" data-act="assignModal" data-kind="course" data-id="${c.id}">Assign</button>` : ''}</div></article>`; }).join('')}</section>`).join('')}</div></div>
    <aside class="stack"><form data-form="verifyCert" class="block"><header><h3>Verify a certificate</h3></header><div class="bb stack" style="gap:10px">
      <p class="muted small">Enter the code printed on an ${esc(S.site.name)} certificate to confirm it is genuine.</p>
      <input id="vcode" name="code" type="text" placeholder="e.g. SAFE7Q2M4K" aria-label="Certificate code" required autocomplete="off" style="text-transform:uppercase">
      <button class="btn" type="submit">Check code</button><div id="vres"></div></div></form>
      ${S.paths.length ? `<section class="block"><header><h3>Learning paths</h3></header><div class="bb stack" style="gap:10px">${S.paths.map(p => `<div><b>${esc(p.name)}</b><div class="muted small">${p.courses.map(id => esc(h.course(id)?.shortname || '')).join(' → ')}</div>${h.has('course:assign', null) || p.courses.every(id => h.has('course:assign', id)) ? `<button class="link small" data-act="assignModal" data-kind="path" data-id="${p.id}">Assign path</button>` : ''}</div>`).join('')}</div></section>` : ''}</aside></div>`;
};

/* ---------- Calendar ---------- */
VIEWS.calendar = () => {
  const d0 = new Date(); ui.cal ||= {y:d0.getFullYear(), m:d0.getMonth()};
  const {y, m} = ui.cal, first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const evs = events([-400, 400]).filter(e => { const x = new Date(e.due); return x.getFullYear() === y && x.getMonth() === m; });
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="dow">${x}</div>`).join('');
  for (let i = 0; i < off; i++) cells += '<div class="out"></div>';
  for (let i = 1; i <= days; i++) {
    const today = d0.getFullYear() === y && d0.getMonth() === m && d0.getDate() === i;
    const de = evs.filter(e => new Date(e.due).getDate() === i);
    cells += `<div class="${today ? 'today' : ''}"><span class="dn num">${i}</span>${de.map(e => e.sess ? `<button class="ev p-collab" data-go="session" data-id="${e.sess.id}" title="Live session: ${esc(e.sess.name)}">${esc(e.sess.name)}</button>` : e.course ? `<button class="ev p-other" data-go="course" data-id="${e.c.id}" title="Course deadline: ${esc(e.c.fullname)}">Due: ${esc(e.c.shortname)}</button>` : `<button class="ev p-${C.TYPES[e.m.type].p}" data-go="mod" data-id="${e.m.id}" title="${esc(e.m.name)} · ${esc(e.c.shortname)}">${esc(e.m.name)}</button>`).join('')}</div>`;
  }
  const tail = (7 - (off + days) % 7) % 7; for (let i = 0; i < tail; i++) cells += '<div class="out"></div>';
  return `${phead([['Dashboard', 'dashboard'], ['Calendar']], 'Calendar')}
    <div class="spread" style="margin-bottom:14px"><div class="row"><button class="btn sm" data-act="calMove" data-d="-1" aria-label="Previous month">←</button><h2 style="min-width:170px;text-align:center">${first.toLocaleDateString('en-IN', {month:'long', year:'numeric'})}</h2><button class="btn sm" data-act="calMove" data-d="1" aria-label="Next month">→</button><button class="btn sm ghost" data-act="calMove" data-d="0">Today</button></div></div>
    <div class="block" style="overflow:hidden"><div class="cal">${cells}</div></div>
    <h2 style="margin:24px 0 10px">Events this month</h2>
    <div class="block"><div class="tl">${evs.map(e => e.sess ? `<div class="tl-item"><span class="tl-time">${fmtShort(e.due)}</span>${icon('live', 'sm')}<div class="t"><button class="link" data-go="session" data-id="${e.sess.id}">${esc(e.sess.name)}</button><div class="muted small">Live session ${fmtDate(e.due)} · ${e.sess.duration || 60} min</div></div><div class="act"></div></div>` : e.course ? `<div class="tl-item"><span class="tl-time">${fmtShort(e.due)}</span><span class="ic sm p-other" aria-hidden="true"><svg viewBox="0 0 24 24">${SVG.lock}</svg></span><div class="t"><button class="link" data-go="course" data-id="${e.c.id}">${esc(e.c.fullname)}</button><div class="muted small">Course deadline ${fmtDate(e.due)}</div></div><div class="act">${statusChip(e.st)}</div></div>`
      : `<div class="tl-item"><span class="tl-time">${fmtShort(e.due)}</span>${icon(e.m.type, 'sm')}<div class="t"><button class="link" data-go="mod" data-id="${e.m.id}">${esc(e.m.name)}</button><div class="muted small">${dueVerb(e.m)} ${fmtDate(e.due)} · ${esc(e.c.shortname)}</div></div><div class="act">${e.done ? '<span class="chip ok">Done</span>' : ''}</div></div>`).join('') || '<div class="empty">No events this month.</div>'}</div></div>`;
};

/* ---------- Profile and security ---------- */
VIEWS.profile = (p) => {
  const u = h.user(p.id) || me(), self = u.id === S.me, admin = h.has('user:manage');
  const en = S.enrol.filter(e => e.userId === u.id).map(e => ({e, c:h.course(e.courseId)})).filter(x => x.c);
  const earned = S.badgeIssued.filter(i => i.userId === u.id).map(i => S.badges.find(b => b.id === i.badgeId)).filter(Boolean);
  const sys = S.sysroles.filter(r => r.userId === u.id).map(r => roleName(r.roleId));
  const cohorts = S.cohorts.filter(c => c.members.includes(u.id) || c.leads.includes(u.id) || c.trainers.includes(u.id));
  return `${phead([['Dashboard', 'dashboard'], ['Profile']], fullname(u), avatar(u, 56))}
    <div class="dash"><div class="stack">
      <section class="block"><header><h2>User details</h2>${!self ? `<button class="btn sm" data-go="messages" data-with="${u.id}">Message</button>` : ''}</header><div class="bb"><table class="kv" style="border:0"><tbody>
        <tr><th>Email address</th><td>${esc(u.email)}</td></tr>${u.username ? `<tr><th>Username</th><td class="mono">${esc(u.username)}</td></tr>` : ''}
        <tr><th>Team</th><td>${esc(u.department || '–')}</td></tr>
        <tr><th>Site roles</th><td>${u.admin ? 'Site administrator' : sys.length ? esc(sys.join(', ')) : 'Authenticated user'}${u.suspended ? ' <span class="chip bad">Suspended</span>' : ''}${u.locked ? ' <span class="chip bad">Locked</span>' : ''}</td></tr>
        ${cohorts.length ? `<tr><th>Cohorts</th><td>${cohorts.map(c => `${esc(c.name)}${c.leads.includes(u.id) ? ' (team lead)' : c.trainers.includes(u.id) ? ' (trainer)' : ''}`).join('<br>')}</td></tr>` : ''}
        ${u.auth && u.auth !== 'manual' ? `<tr><th>Sign-in method</th><td>${u.auth === 'sso' ? 'Single sign-on' : 'LDAP directory'}</td></tr>` : ''}
        ${u.lastLogin !== undefined ? `<tr><th>Last login</th><td>${u.lastLogin ? fmtDate(u.lastLogin) : 'Never'}</td></tr>` : ''}<tr><th>Account created</th><td>${fmtDate(u.created)}</td></tr></tbody></table></div></section>
      <section class="block"><header><h2>Courses</h2></header><div class="bb stack" style="gap:8px">${en.map(({e, c}) => `<div class="spread"><button class="link" data-go="course" data-id="${c.id}">${esc(c.fullname)}</button><span class="row" style="gap:6px">${h.role(e.role)?.caps?.['mod:submit'] && h.status(c.id, u.id) ? statusChip(h.status(c.id, u.id)) : `<span class="chip brand">${esc(roleName(e.role))}</span>`}</span></div>`).join('') || '<p class="muted small">Not enrolled in any courses.</p>'}</div></section>
      <section class="block"><header><h2>Badges</h2></header><div class="bb">${earned.length ? `<div class="bstrip">${earned.map(b => `<div class="bmini">${medal(b)}<span>${esc(b.name)}</span></div>`).join('')}</div>` : '<p class="muted small">No badges yet.</p>'}</div></section></div>
    <div class="stack">
    ${admin && (!u.admin || h.isAdmin()) ? `<form data-form="personas" class="card stack"><input type="hidden" name="userId" value="${u.id}"><h2>Personas</h2>${personaFields(u)}<p class="err" id="perr" hidden></p><div><button class="btn primary" type="submit">Save personas</button></div></form>` : ''}
    ${admin && !self ? `<form data-form="profile" class="card stack"><input type="hidden" name="id" value="${u.id}"><h2>Edit user</h2>
      <div class="fgrid"><div class="field"><label for="pf1">First name</label><input id="pf1" name="firstname" type="text" value="${esc(u.firstname)}" required></div>
      <div class="field"><label for="pf2">Last name</label><input id="pf2" name="lastname" type="text" value="${esc(u.lastname)}" required></div>
      <div class="field full"><label for="pf3">Email address</label><input id="pf3" name="email" type="email" value="${esc(u.email)}" required></div>
      <div class="field"><label for="pf6">Team</label>${teamSelect('pf6', u.department || '')}</div></div>
      <button class="btn primary" type="submit">Save changes</button></form>
      <section class="card stack"><h2>Account actions</h2>
        <div class="row"><button class="btn" data-act="resetPw" data-u="${u.id}">Reset password</button>${u.locked ? `<button class="btn" data-act="unlockUser" data-u="${u.id}">Unlock account</button>` : ''}<button class="btn" data-act="resendWelcome" data-u="${u.id}">Resend welcome email</button>${u.mfaEnabled ? `<button class="btn" data-act="mfaOff" data-u="${u.id}">Turn off two-step sign-in</button>` : ''}</div>
        ${h.has('user:loginas') && !u.admin ? `<div><button class="btn ghost" data-act="loginAs" data-u="${u.id}">Log in as ${esc(u.firstname)}</button></div>` : ''}</section>` : ''}
    ${self ? `<form data-form="changePassword" class="card stack"><h2>Change password</h2>${u.auth && u.auth !== 'manual' ? `<p class="muted">Your password is managed by your organisation's ${u.auth === 'sso' ? 'single sign-on' : 'directory'}.</p>` : `
      <div class="field"><label for="cp0">Current password</label><input id="cp0" name="current" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="cp1">New password</label><input id="cp1" name="password" type="password" autocomplete="new-password" required><span class="hint">${esc(pwRuleText())}</span></div>
      <div class="field"><label for="cp2">Repeat the new password</label><input id="cp2" name="password2" type="password" autocomplete="new-password" required></div><p class="err" id="cperr" hidden></p>
      <button class="btn primary" type="submit">Change password</button>`}</form>
      <section class="card stack"><h2>Two-step sign-in</h2>${u.mfaEnabled ? `<p><span class="chip ok">On</span> You enter a code from your authenticator app when you sign in.</p>${C.mfaRequired(S, u) ? '<p class="muted small">Required for your account by the security policy.</p>' : `<form data-form="mfaDisable" class="row"><input name="code" inputmode="numeric" maxlength="7" placeholder="Current code" aria-label="Current code" style="max-width:160px" required><button class="btn" type="submit">Turn off</button></form>`}` : `<p class="muted">Add a code from an authenticator app to protect your account.</p>${mfaSetupHTML()}`}</section>
      <section class="card stack"><h2>Accessibility</h2><p class="muted small">Contrast, text size, captions and motion.</p><div><button class="btn" data-go="prefs">Change preferences</button></div></section>` : ''}</div></div>`;
};

/* ---------- Learning record (own progress, scores, certificates) ---------- */
VIEWS.record = (p) => {
  const uid = p.id && (h.isAdmin() || h.teamMembers().includes(p.id) || h.trainerScope().has(p.id)) ? p.id : S.me; const u = h.user(uid);
  const rows = C.learnerRows(S, h, {users:new Set([uid])}); const sm = C.summarize(rows);
  const certs = S.certIssued.filter(c => c.userId === uid).sort((a, b) => b.time - a.time);
  return `${phead([['Dashboard', 'dashboard'], ['Learning record']], uid === S.me ? 'My learning record' : `Learning record: ${fullname(u)}`)}
    <div class="stats" style="margin-bottom:20px"><div class="stat"><b>${sm.completed}/${sm.total}</b><span class="muted small">Courses completed</span></div><div class="stat"><b>${fmtPct(sm.completionRate)}</b><span class="muted small">Completion rate</span></div><div class="stat"><b>${fmtH(sm.hours)}</b><span class="muted small">Time spent learning</span></div><div class="stat"><b>${sm.creditHours.toFixed(1)} h</b><span class="muted small">Training hours credited</span></div><div class="stat"><b>${certs.filter(c => !c.archived || (c.expires && c.expires > now())).length}</b><span class="muted small">Certificates</span></div></div>
    <h2 style="margin-bottom:10px">Courses</h2><div class="tw" style="margin-bottom:22px"><table><thead><tr><th>Course</th><th>Status</th><th>Due</th><th>Progress</th><th class="n">Grade</th><th class="n">Time spent</th><th>Completed</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><button class="link" data-go="course" data-id="${r.c.id}">${esc(r.c.fullname)}</button>${r.e.mandatory ? ' <span class="chip warn">Mandatory</span>' : ''}</td><td>${statusChip(r.status)}</td><td class="small">${r.due ? fmtDate(r.due) : '–'}</td><td style="min-width:140px">${progressBar(r.progress)}</td><td class="n">${fmtPct(r.total)}</td><td class="n">${fmtH(r.hours)}</td><td class="small">${r.completedAt ? fmtDateOnly(r.completedAt) : '–'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No courses yet.</td></tr>'}</tbody></table></div>
    <h2 style="margin-bottom:10px">Assessment scores</h2><div class="tw" style="margin-bottom:22px"><table><thead><tr><th>Assessment</th><th>Course</th><th class="n">Best score</th><th class="n">Pass mark</th><th>Result</th></tr></thead><tbody>
    ${rows.flatMap(r => h.courseMods(r.c.id).filter(m => m.type === 'quiz').map(m => ({m, c:r.c, p:h.quizPercent(m, uid)})).filter(x => x.p != null)).map(x => `<tr><td>${esc(x.m.name)}${x.m.pretest ? ' <span class="chip">Pre-test</span>' : ''}</td><td class="small">${esc(x.c.shortname)}</td><td class="n">${fmtPct(x.p)}</td><td class="n">${x.m.gradepass ? x.m.gradepass + '%' : '–'}</td><td>${x.m.pretest ? '<span class="muted small">Baseline</span>' : !x.m.gradepass ? '<span class="muted small">No pass mark</span>' : x.p >= x.m.gradepass ? '<span class="chip ok">Passed</span>' : '<span class="chip bad">Not passed</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No assessment attempts yet.</td></tr>'}</tbody></table></div>
    <h2 style="margin-bottom:10px">Certificates</h2><div class="tw"><table><thead><tr><th>Course</th><th>Issued</th><th>Valid until</th><th>Code</th><th></th></tr></thead><tbody>
    ${certs.map(c => { const m = S.mods[c.cmid], cc = m && h.course(m.courseId); const expired = c.expires && c.expires < now(); return `<tr><td>${esc(cc?.fullname || 'Course')}</td><td class="small">${fmtDateOnly(c.time)}</td><td class="small">${c.expires ? `${fmtDateOnly(c.expires)} ${expired ? '<span class="chip bad">Expired</span>' : c.archived ? '<span class="chip warn">Renewal in progress</span>' : ''}` : 'No expiry'}</td><td class="mono">${esc(c.code)}</td><td>${B.server ? `<a href="${B.certPdfUrl(c.code)}" target="_blank" rel="noopener">PDF</a>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No certificates yet.</td></tr>'}</tbody></table></div>`;
};

VIEWS.mybadges = () => {
  const mine = S.badgeIssued.filter(i => i.userId === S.me);
  return `${phead([['Dashboard', 'dashboard'], ['Badges']], 'My badges')}
    ${mine.length ? `<div class="badges">${mine.map(i => { const b = S.badges.find(x => x.id === i.badgeId); if (!b) return ''; return `<div class="bcard">${medal(b)}<h3>${esc(b.name)}</h3><p class="muted small">${esc(b.description)}</p><p class="small">${esc(h.course(b.courseId)?.fullname || '')}</p><span class="chip ok">Earned ${fmtDateOnly(i.time)}</span></div>`; }).join('')}</div>` : '<div class="card empty">You have not earned any badges yet. Badges appear here when you meet their criteria in a course.</div>'}`;
};
VIEWS.notifications = () => {
  const ns = S.notifications.slice().sort((a, b) => b.time - a.time);
  return `${phead([['Dashboard', 'dashboard'], ['Notifications']], 'Notifications')}
    <div class="spread" style="margin-bottom:12px"><span class="muted small">${ns.length} notifications · ${h.unreadNotifications()} unread</span>${h.unreadNotifications() ? '<button class="btn sm" data-act="readAllNotes">Mark all as read</button>' : ''}</div>
    <div class="block" style="overflow:hidden">${ns.map(noteItem).join('') || '<div class="empty">You have no notifications.</div>'}</div>`;
};

/* ---------- Messages ---------- */
function contacts() {
  const ids = new Set();
  for (const e of S.enrol) if (e.userId !== S.me && S.enrol.some(f => f.userId === S.me && f.courseId === e.courseId)) ids.add(e.userId);
  for (const c of S.cohorts) if ([...c.members, ...c.leads, ...c.trainers].includes(S.me)) [...c.members, ...c.leads, ...c.trainers].forEach(x => ids.add(x));
  if (h.isAdmin() || h.has('user:manage')) S.users.forEach(u => ids.add(u.id));
  S.users.filter(u => u.admin).forEach(u => ids.add(u.id));
  S.messages.forEach(m => ids.add(m.from === S.me ? m.to : m.from));
  ids.delete(S.me);
  return [...ids].map(id => h.user(id)).filter(Boolean).sort((a, b) => a.firstname.localeCompare(b.firstname));
}
VIEWS.messages = (p) => {
  if (p.with && ui.msgWith !== p.with) ui.msgWith = p.with;
  if (String(p.id || '').startsWith('chat:') && ui.msgChatFrom !== p.id) { ui.msgChatFrom = p.id; ui.msgWith = p.id; }
  const convs = {};
  for (const m of S.messages) { const other = m.from === S.me ? m.to : m.from; (convs[other] ||= []).push(m); }
  const people = Object.entries(convs).map(([uid, ms]) => ({key:uid, u:h.user(uid), last:ms.reduce((a, b) => a.time > b.time ? a : b), unread:ms.filter(m => m.to === S.me && !m.read).length})).filter(x => x.u);
  const chatMsgs = id => (S.chatMessages || []).filter(m => m.chatId === id).sort((a, b) => a.time - b.time);
  const groups = (S.chats || []).map(c => { const ms = chatMsgs(c.id); return {key:'chat:' + c.id, chat:c, last:ms[ms.length - 1] || {time:c.created, text:'Group chat created', from:c.createdBy}, unread:h.inChat(c) ? h.chatUnread(c) : 0}; });
  const list = [...people, ...groups].sort((a, b) => b.last.time - a.last.time);
  const sel = ui.msgWith || '', chat = sel.startsWith('chat:') ? (S.chats || []).find(c => c.id === sel.slice(5)) : null;
  const w = !chat && sel && h.user(sel);
  const others = contacts().filter(u => !convs[u.id]);
  if (chat && h.chatUnread(chat)) setTimeout(() => act('readChat', {id:chat.id}, null, {silent:true}), 0);
  const item = x => x.chat
    ? `<button class="ci ${chat && chat.id === x.chat.id ? 'on' : ''}" data-act="openConv" data-u="${x.key}"><span class="gav" aria-hidden="true">${icon('forum', 'sm')}</span><span class="t"><b>${esc(x.chat.name)}</b><span class="muted small">${x.last.from === S.me ? 'You: ' : x.last.from && h.user(x.last.from) ? esc(h.user(x.last.from).firstname) + ': ' : ''}${esc(x.last.text)}</span></span>${x.unread ? `<span class="chip brand">${x.unread}</span>` : `<span class="muted small">${ago(x.last.time)}</span>`}</button>`
    : `<button class="ci ${w && w.id === x.u.id ? 'on' : ''}" data-act="openConv" data-u="${x.u.id}">${avatar(x.u, 36)}<span class="t"><b>${esc(fullname(x.u))}</b><span class="muted small">${x.last.from === S.me ? 'You: ' : ''}${esc(x.last.text)}</span></span>${x.unread ? `<span class="chip brand">${x.unread}</span>` : `<span class="muted small">${ago(x.last.time)}</span>`}</button>`;
  let thread = '<div class="empty" style="margin:auto">Choose a conversation or start a new one.</div>';
  if (chat) {
    const course = h.course(chat.courseId), members = chat.memberIds || h.chatMembers(chat), member = members.includes(S.me), ms = chatMsgs(chat.id);
    const readOnly = course?.status === 'archived';
    thread = `<header><button class="btn sm ghost" data-act="closeConv" aria-label="Back to conversations">←</button><span class="gav" aria-hidden="true">${icon('forum', 'sm')}</span><div style="flex:1;min-width:0"><b>${esc(chat.name)}</b><div class="muted small">${esc(course?.shortname || '')} · ${members.length} member${members.length === 1 ? '' : 's'}${chat.mode === 'course' ? ' · everyone in the course' : ''}</div></div>${h.canManageChats(chat.courseId) ? `<button class="btn sm" data-act="editChat" data-id="${chat.id}">Manage</button>` : ''}</header>
      <div class="tbody">${ms.map(m => { const mine = m.from === S.me, u = h.user(m.from); return `<div class="bubble ${mine ? 'mine' : ''}">${mine ? '' : `<span class="who">${esc(u ? fullname(u) : 'Former user')}</span>`}${esc(m.text)}<small>${fmtDate(m.time)}</small></div>`; }).join('') || '<p class="muted small" style="text-align:center">No messages yet. Start the conversation.</p>'}</div>
      ${readOnly ? '<p class="muted small" style="padding:12px 16px;border-top:1px solid var(--line)">This course is archived, so its chats are read-only.</p>' : member ? `<form data-form="sendChatMessage" class="tform"><input type="hidden" name="id" value="${chat.id}"><textarea name="text" id="msgtext" placeholder="Write to the group…" aria-label="Message" required></textarea><button class="btn primary" type="submit">Send</button></form>` : '<p class="muted small" style="padding:12px 16px;border-top:1px solid var(--line)">You can read this chat because you manage the course. Add yourself as a member to post.</p>'}`;
  } else if (w) {
    const t = (convs[w.id] || []).sort((a, b) => a.time - b.time);
    thread = `<header><button class="btn sm ghost" data-act="closeConv" aria-label="Back to conversations">←</button>${avatar(w, 34)}<div><b>${esc(fullname(w))}</b><div class="muted small">${esc(w.email)}</div></div></header>
      <div class="tbody">${t.map(m => `<div class="bubble ${m.from === S.me ? 'mine' : ''}">${esc(m.text)}<small>${fmtDate(m.time)}</small></div>`).join('') || '<p class="muted small" style="text-align:center">No messages yet. Say hello.</p>'}</div>
      <form data-form="sendMessage" class="tform"><input type="hidden" name="to" value="${w.id}"><textarea name="text" id="msgtext" placeholder="Write a message…" aria-label="Message" required></textarea><button class="btn primary" type="submit">Send</button></form>`;
  }
  return `${phead([['Dashboard', 'dashboard'], ['Messages']], 'Messages')}
    <div class="msgs ${chat || w ? 'open' : ''}"><div class="clist">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line)"><label class="lbl small" for="newmsg">Start a conversation</label><select id="newmsg" style="margin-top:6px"><option value="">Choose a person…</option>${others.map(u => `<option value="${u.id}">${esc(fullname(u))}</option>`).join('')}</select></div>
      ${list.map(item).join('') || '<div class="empty small">No conversations yet.</div>'}
    </div>
    <div class="thread">${thread}</div></div>`;
};

VIEWS.gradesoverview = () => {
  const cs = h.myCourseIds().map(id => h.course(id)).filter(c => c && h.canView(c.id) && h.enrolOf(c.id));
  return `${phead([['Dashboard', 'dashboard'], ['Grades']], 'Grades overview')}
    <div class="tw"><table><thead><tr><th>Course</th><th>Your role</th><th class="n">Grade</th></tr></thead><tbody>
    ${cs.map(c => { const st = h.isLearner(c.id); const t = st ? h.courseTotal(c.id, S.me) : null; const e = h.enrolOf(c.id);
      return `<tr><td><button class="link" data-go="grades" data-id="${c.id}">${esc(c.fullname)}</button></td><td class="small">${e ? esc(roleName(e.role)) : 'Site access'}</td><td class="n">${st ? (t == null ? '–' : t.toFixed(1) + ' %') : '<span class="muted small">Open grader report</span>'}</td></tr>`; }).join('') || '<tr><td colspan="3" class="empty">No courses.</td></tr>'}
    </tbody></table></div>`;
};
