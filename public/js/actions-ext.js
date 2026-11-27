/* NB Academy front end · actions and forms for lifecycle, workspaces and governance */
'use strict';

async function afterLogin(r) {
  if (r.mfa) { ui.mfaTicket = r.ticket; ui.loginView = 'mfa'; ui.loginErr = ''; render(); setTimeout(() => document.getElementById('mcode')?.focus(), 0); return; }
  setState(r.state); ui.loginErr = ''; ui.loginView = 'login'; ui.mode = null;
  const dl = ui.deepLink; ui.deepLink = null;
  go(dl ? dl.go : homeFor(currentMode()), dl ? {id:dl.id} : {});
}
function pwPair(d, errId) { if (d.password !== d.password2) { const e = document.getElementById(errId); if (e) { e.textContent = 'The two passwords do not match.'; e.hidden = false; } else toast('The two passwords do not match.', true); return false; } return true; }
const dateEnd = s => s ? new Date(s + 'T23:59:00').getTime() : null;

Object.assign(A, {
  setMode: d => setMode(d.m),
  loginView: d => { ui.loginView = d.v; ui.loginErr = ''; render(); },
  copyText: async d => { const el = document.getElementById(d.t); const text = el?.value ?? el?.textContent ?? ''; try { await navigator.clipboard.writeText(text.replace(/\s+/g, d.t === 'mfakey' ? '' : ' ').trim() || text); toast('Copied'); } catch (e) { if (el?.select) el.select(); toast('Press Ctrl+C (or Cmd+C) to copy'); } },
  mfaSetup: async () => { const r = await act('mfaSetup', {}, null, {silent:true}); if (r !== FAIL) { ui.mfaSetup = r; render(); } },
  mfaOff: d => confirmBox('Turn off two-step sign-in', `Turn off two-step sign-in for ${esc(fullname(d.u))}? Do this only if they lost their phone.`, () => act('mfaDisable', {id:d.u}, 'Two-step sign-in turned off'), 'Turn off'),
  liveJoin: async d => {
    if (!B.server) return toast('Video rooms work on the NB Academy server. This browser-only preview cannot hold a meeting.');
    try { const r = await B.liveJoin(d.id); ui.liveRoom = {mid:d.id, url:r.url}; if (r.state) setState(r.state); go('liveroom', {id:d.id}); }
    catch (e) { toast(e.message, 'err'); }
  },
  editAccess: d => { const u = h.user(d.u); if (!u) return;
    openModal(`Edit access: ${fullname(u)}`, `<form data-form="editAccess" class="stack"><input type="hidden" name="userId" value="${u.id}">
      <p class="muted small" style="margin:0">Current access: <b>${h.personas(u.id).map(k => PERSONAS.find(x => x[0] === k)?.[1] || k).join(', ') || 'none'}</b>. Change what ${esc(u.firstname)} can do, then save.</p>
      ${personaFields(u)}<span class="err" id="eaerr" hidden></span>
      <div class="row"><button class="btn primary" type="submit">Save access</button><button class="btn ghost" type="button" data-act="closeModal">Cancel</button></div></form>`, true); },
  // Full screen for a video, a SCORM module or a document (iPhone Safari only allows it for the video itself)
  fullScreen: d => { if (d.target !== 'vplayer') return enterPlayer(d.target); const el = document.getElementById(d.target); if (!el) return;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fs) { const r = fs.call(el); if (r?.catch) r.catch(() => { if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); else toast('Full screen is not available in this browser.'); }); }
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen(); else toast('Full screen is not available in this browser.'); },
  exitPlayer: () => exitPlayer(),
  autoNextGo: () => openNext(),
  autoNextStay: () => cancelAutoNext(),
  liveLeave: d => { ui.liveRoom = null; if (d.sid) go('session', {id:d.sid}); else go('mod', {id:d.id}); },
  sessJoin: async d => {
    if (!B.server) return toast('Video rooms work on the NB Academy server. This browser-only preview cannot hold a meeting.');
    try { const r = await B.liveJoin(null, d.id); ui.liveRoom = {sid:d.id, url:r.url}; if (r.state) setState(r.state); go('liveroom', {sid:d.id}); } catch (e) { toast(e.message, true); }
  },
  sessCancel: d => { const s = S.sessions.find(x => x.id === d.id);
    openModal('Cancel this session?', `<form data-form="sessCancel" class="stack"><input type="hidden" name="id" value="${s.id}"><p><b>${esc(s.name)}</b>, ${fmtDate(s.start)}. Everyone invited gets a cancellation email.</p>
      <div class="field"><label for="scr">Reason (optional, included in the email)</label><input id="scr" name="reason" type="text" maxlength="500"></div>
      <div class="row"><button class="btn danger" type="submit">Cancel the session</button><button class="btn ghost" type="button" data-act="closeModal">Keep it</button></div></form>`); },
  sessExport: d => { const s = S.sessions.find(x => x.id === d.id);
    download(`attendance-${s.name.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`, csv([['Name', 'Email', 'Team', 'Attendance', 'Joined'], ...(s.invitees || []).map(id => h.user(id)).filter(Boolean).map(u => { const a = s.attendance?.[u.id] || {}; return [fullname(u), u.email, u.department || '', a.status || '', a.joinedAt ? new Date(a.joinedAt).toISOString() : '']; })])); },
  spAll: () => { document.querySelectorAll('#sp-list .sp-row:not([hidden]) input').forEach(x => { x.checked = true; }); spCount(); },
  spNone: () => { document.querySelectorAll('#sp-list .sp-row:not([hidden]) input').forEach(x => { x.checked = false; }); spCount(); },
  vResume: () => { const v = document.getElementById('vplayer'); if (v) v.play().catch(() => {}); },
  vRestart: () => { const v = document.getElementById('vplayer'); if (!v) return; v.currentTime = 0; v.play().catch(() => {}); },
  seek: d => { const v = document.getElementById('vplayer'); if (!v) return; const [mm, ss] = d.t.split(':').slice(-2).map(parseFloat); v.currentTime = (mm || 0) * 60 + (ss || 0); v.play().catch(() => {}); },
  assignModal: d => assignForm(d.kind, d.id),
  nudge: d => act('nudge', {cid:d.c, users:[d.u]}, 'Reminder sent'),
  nudgeSelected: async () => {
    const sel = [...document.querySelectorAll('.rsel:checked')]; if (!sel.length) { toast('Tick the learners you want to remind first.', true); return; }
    const by = {}; sel.forEach(x => (by[x.dataset.c] ||= []).push(x.dataset.u)); let n = 0;
    for (const [cid, users] of Object.entries(by)) { const r = await act('nudge', {cid, users}, null, {silent:true}); if (r !== FAIL) n += r.sent; }
    render(); if (n) toast(`${n} reminder${n > 1 ? 's' : ''} sent`);
  },
  setDue: d => { const e = h.enrolOf(d.cid, d.u);
    openModal('Change due date', `<form data-form="setDue" class="stack"><input type="hidden" name="cid" value="${d.cid}"><input type="hidden" name="userId" value="${d.u}"><p>${esc(fullname(d.u))} · ${esc(h.course(d.cid).fullname)}</p>
      <div class="field"><label for="sdd">Due date</label><input id="sdd" name="due" type="date" value="${toDateInput(e?.due || now() + 14 * D)}"></div><label class="check"><input type="checkbox" name="none"> No due date</label>
      <p class="muted small">Moving the date into the future also lifts an overdue lock. Every change is recorded in the audit log.</p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`); },
  liveRegister: d => act('liveRegister', {mid:d.id}, 'You are registered'),
  liveCancel: d => act('liveCancel', {mid:d.id}, 'Your place was cancelled'),
  grantAttempt: d => act('grantAttempts', {mid:d.id, userId:d.u, n:1}, 'Extra attempt granted'),
  resetAttempts: d => confirmBox('Reset attempts', `Reset all attempts by <b>${esc(fullname(d.u))}</b> on this quiz? The attempts are kept in the history but no longer count, so the learner can start again.`, () => act('resetAttempts', {mid:d.id, userId:d.u}, 'Attempts reset'), 'Reset'),
  bankPick: d => { const m = S.mods[d.id]; const cats = [...new Set(S.qbank.map(q => q.category))];
    openModal('Add from question bank', `<form data-form="bankAdd" class="stack"><input type="hidden" name="mid" value="${m.id}">
      ${picker('bq', S.qbank.filter(b => !(m.questions || []).some(q => q.bankId === b.id)).map(b => [b.id, b.text, `${b.category} · ${C.QTYPES[b.type]}`]), [], {placeholder:'Search the bank'})}
      <div class="row"><span class="small">Or add</span><input name="random" type="number" min="0" max="20" value="0" style="max-width:80px" aria-label="Number of random questions"><span class="small">random questions from</span><select name="category" class="sel-sm">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <p class="err" id="bqerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Add questions</button></div></form>`, true); },
  bankForm: d => { const b = d.id && S.qbank.find(x => x.id === d.id); const cats = [...new Set(S.qbank.map(q => q.category))];
    questionForm({id:'__bank'}, b || null);
    const form = modalEl.querySelector('form'); form.dataset.form = 'bank'; form.querySelector('[name=mid]').value = '';
    form.querySelector('.fgrid').insertAdjacentHTML('afterbegin', `<div class="field full"><label for="qcat">Category</label><input id="qcat" name="category" list="qcats" value="${esc(b?.category || cats[0] || '')}" required><datalist id="qcats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>`);
    form.insertAdjacentHTML('afterbegin', `<input type="hidden" name="bid" value="${esc(b?.id || '')}">`); },
  deleteBank: d => confirmBox('Delete question', 'Delete this question from the bank? Quizzes keep their copy.', () => act('deleteBankQuestion', {id:d.id}, 'Question deleted')),
  cohortForm: d => { const c = d.id ? S.cohorts.find(x => x.id === d.id) : null; const users = S.users.filter(u => !u.admin && !u.suspended);
    openModal(c ? 'Edit cohort' : 'New cohort', `<form data-form="cohort" class="stack"><input type="hidden" name="id" value="${esc(c?.id || '')}">
      <div class="fgrid"><div class="field full"><label for="chn">Name</label><input id="chn" name="name" type="text" value="${esc(c?.name || '')}" required></div><div class="field"><label for="chd">Team</label><input id="chd" name="department" type="text" value="${esc(c?.department || '')}"></div></div>
      <div class="fgrid"><div class="field"><span class="lbl">Members</span>${picker('members', users.map(u => [u.id, fullname(u), u.department || '']), c?.members || [], {placeholder:'Search people'})}</div>
        <div class="field"><span class="lbl">Courses tagged to this cohort</span>${picker('courses', S.courses.map(x => [x.id, x.fullname, x.shortname]), c?.courses || [], {placeholder:'Search courses'})}</div>
        <div class="field"><span class="lbl">Team leads (see this cohort's progress)</span>${picker('leads', users.map(u => [u.id, fullname(u), u.department]), c?.leads || [], {placeholder:'Search people'})}</div>
        <div class="field"><span class="lbl">Trainers (can assign to this cohort)</span>${picker('trainers', users.map(u => [u.id, fullname(u), u.department]), c?.trainers || [], {placeholder:'Search people'})}</div></div>
      <p class="muted small">New members are checked against assignment rules for this cohort. Team leads get the Team Lead site role automatically.</p>
      <p class="err" id="coherr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save cohort</button></div></form>`, true); },
  deleteCohort: d => confirmBox('Delete cohort', 'Delete this cohort? Its members keep their courses, but team leads and trainers lose the mapping.', () => act('deleteCohort', {id:d.id}, 'Cohort deleted')),
  pathForm: d => { const p = d.id ? S.paths.find(x => x.id === d.id) : null;
    openModal(p ? 'Edit learning path' : 'New learning path', `<form data-form="path" class="stack"><input type="hidden" name="id" value="${esc(p?.id || '')}">
      <div class="field"><label for="ptn">Name</label><input id="ptn" name="name" type="text" value="${esc(p?.name || '')}" required></div>
      <div class="field"><label for="ptd">Description</label><textarea id="ptd" name="description" rows="2">${esc(p?.description || '')}</textarea></div>
      <div class="field"><label for="ptc">Courses in order (one short name per line)</label><textarea id="ptc" name="courses" rows="5" class="mono" required>${esc((p?.courses || []).map(id => h.course(id)?.shortname).join('\n'))}</textarea><span class="hint">Available: ${S.courses.map(c => esc(c.shortname)).join(', ')}</span></div>
      <label class="check"><input type="checkbox" name="sequential" ${p?.sequential !== false ? 'checked' : ''}> Courses unlock in order</label>
      <p class="err" id="pterr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save path</button></div></form>`); },
  deletePath: d => confirmBox('Delete learning path', 'Delete this learning path? Existing course assignments stay.', () => act('deletePath', {id:d.id}, 'Learning path deleted')),
  ruleForm: d => { const r = d.id ? S.rules.find(x => x.id === d.id) : null; const depts = [...new Set([...C.teamsOf(S), ...S.users.map(u => u.department)].filter(Boolean))];
    openModal(r ? 'Edit rule' : 'New assignment rule', `<form data-form="rule" class="stack"><input type="hidden" name="id" value="${esc(r?.id || '')}">
      <div class="field"><label for="rln">Name</label><input id="rln" name="name" type="text" value="${esc(r?.name || '')}" placeholder="e.g. All new hires: Workplace Safety" required></div>
      <div class="fgrid"><div class="field"><label for="rmt">Applies to new users who</label><select id="rmt" name="matchType">${[['all', 'Are anyone'], ['department', 'Are in the team'], ['cohort', 'Join the cohort']].map(([k, l]) => `<option value="${k}" ${r?.match.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="rmv">Value</label><input id="rmv" name="matchValue" list="rmvl" value="${esc(r?.match.type === 'cohort' ? '' : r?.match.value || '')}" placeholder="Team"><datalist id="rmvl">${depts.map(x => `<option value="${esc(x)}">`).join('')}</datalist><select name="cohortValue" class="sel-sm" style="margin-top:6px" aria-label="Cohort"><option value="">Cohort (if chosen above)…</option>${S.cohorts.map(c => `<option value="${c.id}" ${r?.match.value === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="rtg">Assign</label><select id="rtg" name="target">${S.courses.filter(c => c.status === 'published').map(c => `<option value="course:${c.id}" ${r?.target.id === c.id ? 'selected' : ''}>Course · ${esc(c.fullname)}</option>`).join('')}${S.paths.map(p => `<option value="path:${p.id}" ${r?.target.id === p.id ? 'selected' : ''}>Path · ${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="rdy">Deadline (days after assignment, 0 = none)</label><input id="rdy" name="days" type="number" min="0" value="${r?.days ?? 15}"></div></div>
      <label class="check"><input type="checkbox" name="active" ${r?.active !== false ? 'checked' : ''}> Active</label>
      <p class="err" id="ruerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save rule</button></div></form>`, true); },
  deleteRule: d => confirmBox('Delete rule', 'Delete this assignment rule? Assignments it already made stay.', () => act('deleteRule', {id:d.id}, 'Rule deleted')),
  runRule: async d => { const r = await act('runRule', {id:d.id}, null); if (r !== FAIL) toast(`${r.assigned} assignment${r.assigned === 1 ? '' : 's'} made`); },
  resetPw: d => { const u = h.user(d.u);
    openModal(`Reset password: ${fullname(u)}`, `<form data-form="resetPw" class="stack"><input type="hidden" name="id" value="${u.id}">
      <label class="check"><input type="radio" name="mode" value="email" checked> Email a reset link to ${esc(u.email)}</label>
      <label class="check"><input type="radio" name="mode" value="temp"> Set a temporary password now (they must change it at next sign-in)</label>
      <div class="field"><label for="rpt">Temporary password</label><input id="rpt" name="password" type="text" value="Reset@${new Date().getFullYear()}x"></div>
      <p class="err" id="rperr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Reset password</button></div></form>`); },
  unlockUser: d => act('unlockUser', {id:d.u}, 'Account unlocked'),
  resendWelcome: d => act('resendWelcome', {id:d.u}, 'Welcome email queued'),
  archiveCourse: d => d.on ? confirmBox('Archive course', 'Archive this course? It is hidden from new enrolments, the library and assignment rules. Learners keep their history and certificates.', () => act('archiveCourse', {cid:d.id, on:true}, 'Course archived'), 'Archive') : act('archiveCourse', {cid:d.id, on:false}, 'Course unarchived'),
  restoreVersion: d => confirmBox('Roll back content', 'Replace the current course content with this version? Publish afterwards to make it the live version. Learner records are not changed.', () => act('restoreVersion', {id:d.id}, 'Content rolled back'), 'Roll back'),
  verifyAudit: async () => { const r = await act('verifyAudit', {}, null, {silent:true}); if (r === FAIL) return; document.getElementById('auditres').innerHTML = r.ok ? `<div class="fb right" style="margin-bottom:12px"><b>Integrity verified.</b> All ${r.count} entries chain correctly. No entry has been changed or removed.</div>` : `<div class="fb wrong" style="margin-bottom:12px"><b>Integrity check failed</b> at entry ${r.at}. The audit log has been altered.</div>`; },
  exportAudit: () => download(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv([['Seq', 'Time', 'User', 'Action', 'Target', 'Detail', 'Hash', 'Previous hash'], ...S.audit.map(e => [e.seq, new Date(e.t).toISOString(), e.uid ? fullname(e.uid) : 'System', e.action, e.target, e.detail, e.hash, e.prev])])),
  exportAnalytics: () => { const a = ui.ana; const rows = C.learnerRows(S, h, {department:a.department || null, courses:a.course ? new Set([a.course]) : null});
    download(`training-report-${new Date().toISOString().slice(0, 10)}.csv`, csv([['Learner', 'Email', 'Team', 'Course', 'Status', 'Progress %', 'Grade %', 'Due', 'Completed', 'Hours spent', 'Hours credited', 'Trainers'], ...rows.map(r => [fullname(r.u), r.u.email, r.u.department, r.c.fullname, STATUS[r.status][0], r.progress, r.total == null ? '' : r.total.toFixed(1), r.due ? new Date(r.due).toISOString().slice(0, 10) : '', r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '', r.hours.toFixed(2), r.credit, h.teachers(r.c.id).map(t => fullname(t)).join('; ')])])); },
  testEmail: async (d, el) => {
    // Test what is on screen: save the form first, so a password typed but not yet saved is used
    const f = el?.closest('form');
    if (f) { if (!f.reportValidity()) return; const v = Object.fromEntries(new FormData(f)); const r = await act('saveIntegration', {...v, enabled:checked(f, 'enabled'), secure:checked(f, 'secure')}, null, {silent:true}); if (r === FAIL) return; }
    toast('Sending a test email…');
    try { await B.testEmail(me().email); toast(`Test email sent to ${me().email}. Settings saved.`); } catch (e) { toast(e.message, true); } },
  testLdap: () => openModal('Test LDAP sign-in', `<form data-form="testLdap" class="stack"><div class="field"><label for="tlu">Directory username</label><input id="tlu" name="username" type="text" required autocapitalize="none"></div><div class="field"><label for="tlp">Password</label><input id="tlp" name="password" type="password" required></div><p class="muted small">Save the settings first. The password is only used for this test.</p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Test</button></div></form>`),
  resetTemplate: d => act('saveTemplate', {key:d.k, reset:true}, 'Default restored'),
  retryEmail: d => act('retryEmail', {id:d.id}, 'Queued for sending'),
  clearLogo: () => act('saveBranding', {logo:null}, 'Built-in NoBroker Academy logo restored'),
  openToken: async d => { await A.logout(); ui.token = await B.tokenInfo(d.t); ui.token.raw = d.t; ui.loginView = 'token'; render(); },
  newUser: () => openModal('Add a new user', `<form data-form="newUser" class="stack"><div class="fgrid">
      <div class="field full"><label for="nu1">Full name</label><input id="nu1" name="fullname" type="text" maxlength="200" required></div>
      <div class="field"><label for="nu3">Username</label><input id="nu3" name="username" type="text" required pattern="[A-Za-z0-9._\\-]+" title="Letters, numbers, dot, dash or underscore" autocapitalize="none"></div><div class="field"><label for="nu4">Email address</label><input id="nu4" name="email" type="email" required></div>
      <div class="field"><label for="nu8">Team</label>${teamSelect('nu8', '')}</div>
      <div class="field"><label for="nu5">Starting password (optional)</label><input id="nu5" name="password" type="text" placeholder="Leave blank to use ${esc(C.DEFAULT_PASSWORD)}"><span class="hint">${esc(pwRuleText())}</span></div>
      <div class="stack" style="gap:6px;align-self:end"><label class="check"><input type="checkbox" name="welcome" checked> Send the welcome email</label>${S.site.emailOn ? '' : '<span class="hint">Email is not set up yet, so it will only be kept in the Email log.</span>'}</div></div>
      <div class="stack" style="gap:10px"><h3>Personas</h3>${personaFields(null)}</div>
      <p class="muted small">The user signs in with the starting password (${esc(C.DEFAULT_PASSWORD)} unless you set one) or the link in the welcome email, then chooses their own password, accepts the platform terms and chooses accessibility preferences at first sign-in. Matching assignment rules run automatically.</p>
      <p class="err" id="nuerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Create user</button></div></form>`, true)
});

Object.assign(F, {
  loginMfa: async d => { try { await afterLogin(await B.loginMfa(ui.mfaTicket, d.code)); } catch (e) { ui.loginErr = e.message; if (/expired/i.test(e.message)) ui.loginView = 'login'; render(); } },
  forgot: async d => { try { await B.forgot(d.login); ui.loginView = 'sent'; ui.loginErr = ''; } catch (e) { ui.loginErr = e.message; } render(); },
  tokenPassword: async d => { if (d.password !== d.password2) { ui.loginErr = 'The two passwords do not match.'; render(); return; }
    try { const r = await B.tokenPassword(ui.token.raw, d.password); ui.token = null; ui.loginView = 'login'; ui.loginErr = ''; render(); toast('Password set. You can log in now.'); const u = document.getElementById('lu'); if (u) { u.value = r.username || ''; document.getElementById('lp')?.focus(); } try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    catch (e) { ui.loginErr = e.message; render(); } },
  setOwnPassword: async d => { if (!pwPair(d, 'pwerr')) return; if (await act('setOwnPassword', {password:d.password}, 'Password saved', {silent:true, errEl:'pwerr'}) !== FAIL) render(); },
  acceptTerms: async () => { if (await act('acceptTerms', {}, null, {silent:true}) !== FAIL) render(); },
  savePrefs: async (d, f) => { const prefs = {contrast:checked(f, 'contrast'), text:d.text, captions:checked(f, 'captions'), motion:checked(f, 'motion')}; if (await act('savePrefs', {prefs}, 'Preferences saved', {silent:true}) !== FAIL) { if (ui.view.name === 'prefs') go(homeFor(currentMode())); else render(); } },
  mfaEnable: async d => { if (await act('mfaEnable', {code:d.code}, 'Two-step sign-in is on', {silent:true, errEl:'mfaerr'}) !== FAIL) { ui.mfaSetup = null; render(); } },
  mfaDisable: d => act('mfaDisable', {code:d.code}, 'Two-step sign-in turned off'),
  changePassword: async (d, f) => { if (!pwPair(d, 'cperr')) return; if (await act('updateProfile', {id:S.me, fullname:fullname(me()), email:me().email, current:d.current, password:d.password}, 'Password changed', {silent:true, errEl:'cperr'}) !== FAIL) { f.reset(); render(); } },
  requestAccess: async d => { if (await act('requestAccess', d, 'Request sent. You will be notified of the decision.', {silent:true, errEl:'arerr'}) !== FAIL) render(); },
  decideAccess: async d => { const approve = d.decision !== 'reject'; await act('decideAccess', {id:d.id, approve, due:dateEnd(d.due), remarks:d.remarks}, approve ? 'Approved. The course is unlocked.' : 'Request rejected'); },
  assign: async (d, f) => { const r = await act('assign', {kind:d.kind, id:d.id, users:picked(f, 'users'), cohorts:picked(f, 'cohorts'), due:dateEnd(d.due), mandatory:checked(f, 'mandatory')}, null, {silent:true, errEl:'asserr'}); if (r === FAIL) return; closeModal(); render(); toast(`${r.assigned} assignment${r.assigned === 1 ? '' : 's'} made for ${r.learners} learner${r.learners === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already completed or not eligible)` : ''}`); },
  setDue: async (d, f) => { if (await act('setDue', {cid:d.cid, userId:d.userId, due:checked(f, 'none') ? null : dateEnd(d.due)}, 'Due date saved', {silent:true}) !== FAIL) { closeModal(); render(); } },
  attendance: (d, f) => { const marks = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('att:') && v) marks[k.slice(4)] = v; return act('liveAttendance', {mid:d.mid, marks}, 'Attendance saved'); },
  recording: d => act('liveRecording', {mid:d.mid, fileId:d.fileId || undefined, url:d.url}, 'Recording saved'),
  feedback: async (d) => { const answers = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('q:')) answers[k.slice(2)] = /^\d+$/.test(v) && S.mods[d.mid].questions.find(q => q.id === k.slice(2))?.type !== 'text' ? Number(v) : v; await act('submitFeedback', {mid:d.mid, answers}, 'Thank you for your feedback', {errEl:'fberr'}); },
  gradeEssay: async d => { const r = await act('gradeEssay', d, null, {silent:true}); if (r === FAIL) return;
    const a = S.attempts.find(x => x.id === d.aid), left = a ? Object.values(a.review || {}).filter(x => x.pending).length : 0;
    toast(left ? `Mark saved. ${left} more answer${left === 1 ? '' : 's'} to grade in this attempt.` : 'Mark saved. This attempt is fully graded.'); },
  publish: async (d, f) => { const r = await act('publishCourse', {cid:d.cid, notes:d.notes, mode:d.mode || 'keep'}, null); if (r !== FAIL) toast(`Published version ${r.version}${r.restarted ? `. ${r.restarted} learners restarted.` : ''}`); },
  branding: (d) => act('saveBranding', {primary:d.primary, accent:d.accent, logo:d.logo || undefined, cert:{template:d.template, signatureName:d.signatureName, signatureTitle:d.signatureTitle, body:d.body}}, 'Branding saved'),
  security: (d, f) => act('saveSecurity', {...d, upper:checked(f, 'upper'), lower:checked(f, 'lower'), digit:checked(f, 'digit'), special:checked(f, 'special')}, 'Security settings saved'),
  integration: (d, f) => act('saveIntegration', {...d, enabled:checked(f, 'enabled'), secure:checked(f, 'secure'), autoCreate:checked(f, 'autoCreate')}, 'Settings saved'),
  template: (d, f) => act('saveTemplate', {...d, email:checked(f, 'email'), inapp:checked(f, 'inapp')}, 'Template saved'),
  notifySettings: d => act('saveNotifySettings', d, 'Saved'),
  terms: (d, f) => act('saveTerms', {text:d.text, bump:checked(f, 'bump')}, 'Terms saved'),
  cohort: async (d, f) => { const r = await act('saveCohort', {id:d.id || null, name:d.name, department:d.department, members:picked(f, 'members'), leads:picked(f, 'leads'), trainers:picked(f, 'trainers'), courses:picked(f, 'courses')}, null, {silent:true, errEl:'coherr'}); if (r === FAIL) return; closeModal(); render(); toast(`Cohort saved${r.assigned ? `. ${r.assigned} assignments made by rules.` : ''}`); },
  path: async (d, f) => { const ids = d.courses.split(/[\n,]+/).map(x => x.trim().toLowerCase()).filter(Boolean).map(sn => S.courses.find(c => c.shortname.toLowerCase() === sn)?.id);
    if (ids.some(x => !x)) { const e = document.getElementById('pterr'); e.textContent = 'One of the short names does not match a course.'; e.hidden = false; return; }
    if (await act('savePath', {id:d.id || null, name:d.name, description:d.description, courses:ids, sequential:checked(f, 'sequential')}, 'Learning path saved', {silent:true, errEl:'pterr'}) !== FAIL) { closeModal(); render(); } },
  rule: async (d, f) => { const [tt, tid] = d.target.split(':'); if (await act('saveRule', {id:d.id || null, name:d.name, matchType:d.matchType, matchValue:d.matchType === 'cohort' ? d.cohortValue : d.matchValue, targetType:tt, targetId:tid, days:d.days, active:checked(f, 'active')}, 'Rule saved', {silent:true, errEl:'ruerr'}) !== FAIL) { closeModal(); render(); } },
  bank: async d => {
    const q = {type:d.type, text:d.text, mark:d.mark};
    if (d.type === 'mc' || d.type === 'mcm') q.options = d.options.split('\n').map(s => s.trim()).filter(Boolean).map(l => l.startsWith('*') ? {text:l.slice(1).trim(), correct:true} : {text:l});
    if (d.type === 'tf') q.answer = d.tf === 'true'; if (d.type === 'short') q.answer = d.short; if (d.type === 'num') { q.answer = d.num; q.tol = d.tol; } if (d.type === 'essay') q.guidance = d.guidance;
    const r = await act('saveBankQuestion', {id:d.bid || null, category:d.category, q}, null, {silent:true, errEl:'qerr'}); if (r === FAIL) return; closeModal(); render(); toast(`Question saved${r.synced ? `. Updated in ${r.synced} quiz${r.synced > 1 ? 'zes' : ''}.` : ''}`); },
  bankAdd: async (d, f) => { const ids = picked(f, 'bq'); const r = await act('addFromBank', {mid:d.mid, ids, random:ids.length ? 0 : Number(d.random) || 0, category:d.category}, null, {silent:true, errEl:'bqerr'}); if (r === FAIL) return; closeModal(); render(); toast(`${r.added} question${r.added > 1 ? 's' : ''} added`); },
  resetPw: async d => { const r = await act('adminResetPassword', d, null, {silent:true, errEl:'rperr'}); if (r === FAIL) return; closeModal(); render(); toast(r.mode === 'temp' ? 'Temporary password set' : 'Reset link emailed'); },
  testLdap: async d => { try { await B.testLdap(d.username, d.password); closeModal(); toast('The directory accepted the sign-in'); } catch (e) { toast(e.message, true); } },
  newUser: async (d, f) => { const pd = personaData(f); if (!pd.personas.length) { const e = document.getElementById('nuerr'); e.textContent = 'Choose at least one persona.'; e.hidden = false; return; }
    const emailOn = !!S.site.emailOn, welcome = checked(f, 'welcome');
    const r = await act('newUser', {...d, ...pd, admin:pd.personas.includes('admin'), welcome}, emailOn || !welcome ? 'User created' : `User created. Email is not set up, so no welcome email was sent: share the username and the password ${d.password ? 'you set' : C.DEFAULT_PASSWORD} with them.`, {silent:true, errEl:'nuerr'}); if (r !== FAIL) { closeModal(); render(); } },
  personas: async (d, f) => { const pd = personaData(f); if (!pd.personas.length) { const e = document.getElementById('perr'); e.textContent = 'Choose at least one persona.'; e.hidden = false; return; }
    const r = await act('setPersonas', {userId:d.userId, ...pd}, 'Personas saved', {silent:true, errEl:'perr'}); if (r !== FAIL) { ui.mode = null; render(); } }
});
// The question form's own handler also serves essays (guidance text)
const _qform = F.question;
F.question = async (d, f) => { if (d.type === 'essay') { const r = await act('saveQuestion', {mid:d.mid, q:{id:d.qid || undefined, type:'essay', text:d.text, mark:d.mark, guidance:d.guidance}}, d.qid ? 'Question updated' : 'Question added', {silent:true, errEl:'qerr'}); if (r !== FAIL) { closeModal(); render(); } return; } return _qform(d, f); };
const _questionForm = questionForm;
questionForm = function (m, q) { _questionForm(m, q); const g = modalEl.querySelector('.fgrid'); if (g && !g.querySelector('[data-for=essay]')) g.insertAdjacentHTML('beforeend', `<div class="field full" data-for="essay"><label for="qguide">Marking guidance for trainers</label><textarea id="qguide" name="guidance" rows="3">${esc(q?.guidance || '')}</textarea></div>`); toggleQFields(); };

/* View filters on the workspaces */
document.addEventListener('change', e => {
  const t = e.target, map = {teamcohort:['team', 'cohort'], teamfilter:['team', 'filter'], teamcourse:['team', 'course'], anagroup:['ana', 'group'], anadept:['ana', 'department'], anacourse:['ana', 'course']};
  if (map[t.id]) { const [o, k] = map[t.id]; ui[o][k] = t.value; render(); }
  if (t.id === 'aid') { const k = t.selectedOptions[0]?.dataset.k; const ak = document.getElementById('ak'); if (ak && k) ak.value = k; }
  if (t.id === 'ak') { const sel = document.getElementById('aid'); const opt = [...sel.options].find(o => o.dataset.k === t.value); if (opt) sel.value = opt.value; }
});

/* ---------- Teams ---------- */
function teamSelect(id, value) { const list = C.teamsOf(S), extra = value && !list.includes(value) ? [value] : [];
  return `<select id="${id}" name="team"><option value="">Choose a team…</option>${[...list, ...extra].map(t => `<option ${t === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${extra.length ? '<span class="hint">This person\'s current team is not on the list any more. Choose one from the list.</span>' : ''}`; }
Object.assign(A, { editTeams: () => openModal('Team list', `<form data-form="teams" class="stack"><div class="field"><label for="tml">Teams, one per line</label><textarea id="tml" name="teams" rows="16" required>${esc(C.teamsOf(S).join('\n'))}</textarea><span class="hint">These are the choices in the Team dropdown. Renaming or removing a team here does not change people already in it.</span></div><p class="err" id="tmerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save team list</button></div></form>`) });
Object.assign(F, { teams: async d => { if (await act('saveTeams', {teams:d.teams}, 'Team list saved', {silent:true, errEl:'tmerr'}) !== FAIL) { closeModal(); render(); } } });

/* ---------- Email design: colour and previews ---------- */
const SAMPLE_VARS = {name:'Asha Verma', fullname:'Asha Verma', firstname:'Asha', lastname:'', username:'asha.verma', course:'Workplace Safety Essentials', item:'Final assessment', due:'Fri, 6 Nov 2026', days:'3 days', progress:'40', sender:'Rohan Mehta', learner:'Asha Verma', reason:'I was on leave', remarks:'Please complete it this week', grade:'8 / 10', code:'SAFE4K8P2X', expires:'31 Dec 2027', when:'Thu, 29 Oct 2026, 4:00 pm', where:'Online', duepart:' It is due on Fri, 6 Nov 2026.'};
function showEmail(title, html) {
  openModal(title, `<iframe class="emailprev" sandbox="" title="${esc(title)}" style="width:100%;height:min(72vh,760px);border:1px solid var(--line);border-radius:8px;background:#f5f5f7"></iframe>`, true);
  const f = document.querySelector('#modal iframe.emailprev'); if (f) f.srcdoc = html;
}
Object.assign(A, {
  previewEmail: (d, el) => {
    const form = el?.closest('form[data-form="template"]'); const S2 = JSON.parse(JSON.stringify(S));
    if (form) { const v = Object.fromEntries(new FormData(form)); Object.assign(S2.site.templates[d.k], {subject:v.subject, body:v.body, html:v.html ?? S2.site.templates[d.k].html}); }
    const col = document.getElementById('etc')?.value; if (/^#[0-9a-f]{6}$/i.test(col || '')) S2.site.emailTheme = {color:col};
    const r = C.renderEmail(S2, d.k, {...SAMPLE_VARS, link:`${location.origin}/?go=${d.k === 'welcome' ? 'setpassword' : 'dashboard'}&id=sample`});
    showEmail(`Preview: ${r.subject}`, r.html);
  },
  previewSent: d => { const m = S.outbox.find(x => x.id === d.id); if (m) showEmail(m.subject, m.html); },
});
Object.assign(F, {
  emailTheme: d => act('saveEmailTheme', {color:d.color}, 'Email colour saved'),
});
document.addEventListener('input', e => { const t = e.target; if (t.dataset?.sync) { const o = document.querySelector(t.dataset.sync); if (o) o.value = t.value.toUpperCase(); } else if (t.id === 'etc' && /^#[0-9a-f]{6}$/i.test(t.value)) { const c = document.getElementById('etcp'); if (c) c.value = t.value; } });

/* ---------- Super administrator and group chats ---------- */
Object.assign(A, {
  removeAdmin: d => { const u = h.user(d.u); confirmBox('Remove administrator access', `Remove administrator access from <b>${esc(fullname(u))}</b>? Their account stays, and they keep any learner, trainer or team lead personas.`, () => act('removeAdmin', {id:u.id}, 'Administrator access removed'), 'Remove access'); },
  newChat: d => chatForm(d.cid),
  editChat: d => { const c = (S.chats || []).find(x => x.id === d.id); if (c) chatForm(c.courseId, c); },
  deleteChat: d => { const c = (S.chats || []).find(x => x.id === d.id); confirmBox('Delete group chat', `Delete <b>${esc(c.name)}</b> and all its messages? This cannot be undone.`, async () => { if (await act('deleteChat', {id:c.id}, 'Group chat deleted', {silent:true}) !== FAIL) { if (ui.msgWith === 'chat:' + c.id) ui.msgWith = null; closeModal(); render(); } }, 'Delete'); },
});
const _openConv = A.openConv;
A.openConv = async d => { if (!String(d.u).startsWith('chat:')) return _openConv(d); ui.msgWith = d.u; const c = (S.chats || []).find(x => 'chat:' + x.id === d.u); if (c && h.inChat(c) && h.chatUnread(c)) await act('readChat', {id:c.id}, null, {silent:true}); render(); document.getElementById('msgtext')?.focus(); };
Object.assign(F, {
  chat: async (d, f) => { const payload = {name:d.name, mode:d.mode, members:picked(f, 'members')};
    const r = d.id ? await act('updateChat', {id:d.id, ...payload}, 'Group chat saved', {silent:true, errEl:'cherr'}) : await act('createChat', {cid:d.cid, ...payload}, 'Group chat created', {silent:true, errEl:'cherr'});
    if (r === FAIL) return; closeModal(); if (!d.id && r?.id) { ui.msgWith = 'chat:' + r.id; go('messages', {}); } else render(); },
  sendChatMessage: async d => { if (await act('sendChatMessage', d, null, {silent:true}) !== FAIL) { render(); const el = document.querySelector('.thread .tbody'); if (el) el.scrollTop = el.scrollHeight; document.getElementById('msgtext')?.focus(); } },
});
document.addEventListener('change', e => { if (e.target.name !== 'mode' || !e.target.form || e.target.form.dataset.form !== 'chat') return; const el = e.target.form.querySelector('[data-chatpick]'); if (el) el.hidden = e.target.value !== 'custom'; });

/* ---------- Personas: shared by "Add a new user" and the user profile ---------- */
const PERSONAS = [['learner', 'Learner', 'Takes assigned training and courses'], ['trainer', 'Trainer', 'Delivers and grades courses and cohorts tagged to them'], ['teamlead', 'Team Lead', 'Monitors and reminds the cohorts mapped to them'], ['moderator', 'Content Moderator', 'Adds users, creates courses, uploads content and builds quizzes; Trainer and Team Lead access everywhere'], ['hrbp', 'HRBP', 'Assigns HR courses to employees and sees HR Analytics (HR courses are built by administrators and content moderators)'], ['admin', 'Administrator', 'Manages the whole site']];
function personaFields(u) {
  const on = new Set(u ? h.personas(u.id) : ['learner']);
  // Content moderators have Trainer and Team Lead access built in: tick those only when also given on their own
  if (u && h.isModerator(u.id) && !u.builtinAdmin) {
    if (!(u.personas || []).includes('trainer') && !h.cohortsTrained(u.id).length && !S.enrol.some(e => e.userId === u.id && ['trainer', 'editingteacher', 'teacher'].includes(e.role))) on.delete('trainer');
    if (!h.sysrole('teamlead', u.id) && !S.cohorts.some(c => c.leads.includes(u.id))) on.delete('teamlead');
  }
  const inC = key => u ? S.cohorts.filter(c => c[key].includes(u.id)).map(c => c.id) : [];
  const coItems = S.cohorts.map(c => [c.id, c.name, [c.department, `${c.members.length} members`].filter(Boolean).join(' · ')]);
  const tCourses = u ? S.enrol.filter(e => e.userId === u.id && e.role === 'trainer').map(e => e.courseId) : [];
  const box = ([k, l, sub]) => (['admin', 'moderator', 'hrbp'].includes(k) && !h.isAdmin()) ? '' : u?.builtinAdmin ? `<label class="check persona"><input type="checkbox" checked disabled><input type="hidden" name="personas" value="${k}"> <span><b>${l}</b><br><span class="muted small">Always on for the super administrator</span></span></label>` : (k === 'admin' && (u?.builtinAdmin || (u?.admin && !h.isSuperAdmin())) ? `<label class="check persona"><input type="checkbox" checked disabled><input type="hidden" name="personas" value="admin"> <span><b>${l}</b><br><span class="muted small">${u.builtinAdmin ? 'Super administrator: set in the server configuration' : 'Only the super administrator can remove this'}</span></span></label>` : `<label class="check persona"><input type="checkbox" name="personas" value="${k}" ${on.has(k) ? 'checked' : ''}> <span><b>${l}</b><br><span class="muted small">${sub}</span></span></label>`);
  const sec = (k, html) => `<div class="field full" data-pfor="${k}" ${on.has(k) ? '' : 'hidden'}>${html}</div>`;
  return `<div class="personagrid">${PERSONAS.map(box).join('')}</div>
    <p class="muted small" style="margin:0">People with more than one persona switch between them with the view switcher in the top bar.</p>
    ${S.cohorts.length ? `<div class="field full"><span class="lbl">Member of cohorts</span>${picker('memberOf', coItems, inC('members'), {placeholder:'Search cohorts'})}<span class="hint">Cohort membership decides which team lead sees them and which assignment rules apply.</span></div>` : ''}
    ${sec('teamlead', `<span class="lbl">Team lead of cohorts</span>${picker('leads', coItems, inC('leads'), {placeholder:'Search cohorts'})}`)}
    ${sec('trainer', `<span class="lbl">Trainer for cohorts</span>${picker('trains', coItems, inC('trainers'), {placeholder:'Search cohorts'})}`)}
    ${sec('trainer', `<span class="lbl">Trainer for courses</span>${picker('trainerCourses', S.courses.filter(c => c.status !== 'archived').map(c => [c.id, c.fullname, c.shortname]), tCourses, {placeholder:'Search courses'})}`)}`;
}
const personaData = f => ({personas:[...picked(f, 'personas'), ...[...f.querySelectorAll('input[type=hidden][name=personas]')].map(x => x.value)], memberOf:picked(f, 'memberOf'), leads:picked(f, 'leads'), trains:picked(f, 'trains'), trainerCourses:picked(f, 'trainerCourses')});
document.addEventListener('change', e => {
  if (e.target.name !== 'personas') return; const f = e.target.form; if (!f) return;
  const on = new Set(picked(f, 'personas')); f.querySelectorAll('[data-pfor]').forEach(el => { el.hidden = !on.has(el.dataset.pfor); });
});

// "Save and add another": after a question is saved, open a fresh question form for the same quiz
{ const _saveQ = F.question;
  F.question = async (d, f) => { const m0 = S.mods[d.mid], before = (m0?.questions || []).length; await _saveQ(d, f);
    const m = S.mods[d.mid]; if (d.next && m && (m.questions || []).length > before) { questionForm(m, null); const t = document.getElementById('qtext'); t?.focus(); } };
}

/* ---------- Quiz question editor (cards that save themselves) ---------- */
const qbTimers = new Map();
function qbRead(card) {
  const key = card.dataset.qcard, mid = card.dataset.mid, type = card.dataset.qtype || card.querySelector('.qb-type').value, old = (S.mods[mid]?.questions || []).find(x => x.id === key);
  const q = {type, text:card.querySelector('.qb-text').value.trim(), mark:card.querySelector('.qb-mark').value, bankId:old?.bankId};
  if (type === 'mc' || type === 'mcm') q.options = [...card.querySelectorAll('.qb-opt')].filter(r => r.querySelector('.qb-opt-text')).map(r => ({text:r.querySelector('.qb-opt-text').value, correct:r.querySelector('.qb-pick').classList.contains('on')}));
  if (type === 'tf') q.answer = card.querySelector('.qb-pick.on')?.dataset.v !== 'false';
  if (type === 'short') q.answer = [...card.querySelectorAll('.qb-alt')].map(x => x.value.trim()).filter(Boolean).join('|');
  if (type === 'num') { q.answer = card.querySelector('.qb-num').value; q.tol = card.querySelector('.qb-tol').value; }
  if (type === 'essay') q.guidance = card.querySelector('.qb-guide')?.value || '';
  return q;
}
function qbProblem(q) {
  if (!q.text) return 'Type the question to save it.';
  if (q.type === 'mcm') { const opts = (q.options || []).filter(o => o.text.trim()); if (opts.length < 2) return 'Add at least two options.'; if (!opts.some(o => o.correct)) return 'Tick every correct answer.'; }
  if (q.type === 'mc') { const opts = (q.options || []).filter(o => o.text.trim()); if (opts.length < 2) return 'Add at least two options.'; if (!opts.some(o => o.correct)) return 'Click the circle next to the correct answer.'; }
  if (q.type === 'short' && !q.answer) return 'Enter the correct answer.';
  if (q.type === 'num' && (q.answer === '' || isNaN(Number(q.answer)))) return 'Enter the correct number.';
  return '';
}
function qbStatus(card, text, kind) { const el = card.querySelector('.qb-status'); if (el) { el.textContent = text; el.className = 'qb-status' + (kind ? ' ' + kind : ''); } }
function qbRerender(card, q) {
  const key = card.dataset.qcard, mid = card.dataset.mid, m = S.mods[mid], cards = [...document.querySelectorAll('.qb-card')], i = cards.indexOf(card);
  const tmp = document.createElement('div'); tmp.innerHTML = qbCard(m, q, key, i, cards.length, card.dataset.draft === '1'); tmp.firstElementChild._chain = card._chain; const fresh = tmp.firstElementChild; card.replaceWith(fresh); fresh.classList.add('active'); qbAutosize(fresh); return fresh;
}
function qbAutosize(card) { card.querySelectorAll('textarea.qb-text').forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }); }
/* Saves of one card run one after another, and every card already has its final id, so a question is never created twice */
function qbSaveNow(card) {
  qbTimers.delete(card);
  card._chain = (card._chain || Promise.resolve()).then(async () => {
    const live = document.querySelector(`.qb-card[data-qcard="${card.dataset.qcard}"]`) || card; // the card may have been redrawn
    const key = live.dataset.qcard, mid = live.dataset.mid, q = qbRead(live), draft = live.dataset.draft === '1';
    if (draft && ui.qbDraft?.id === key) ui.qbDraft.q = q;
    const problem = qbProblem(q); if (problem) { qbStatus(live, 'Not saved: ' + problem, 'warn'); return; }
    qbStatus(live, 'Saving…');
    try {
      const out = await B.op('saveQuestion', {mid, q:{...q, id:key, options:q.options?.filter(o => o.text.trim())}});
      setState(out.state); // no page redraw, so typing is not interrupted
      const now = document.querySelector(`.qb-card[data-qcard="${key}"]`) || live;
      if (draft) { delete now.dataset.draft; if (ui.qbDraft?.id === key) ui.qbDraft = null; now.querySelectorAll('.qb-icon[data-act=qbDup], .qb-icon[data-act=qbMove]').forEach(b => { b.disabled = false; }); }
      if (!qbTimers.has(now)) qbStatus(now, 'Saved', 'ok');
    } catch (e) { qbStatus(live, e.message, 'bad'); }
  });
  return card._chain;
}
function qbSchedule(card, delay = 700) { clearTimeout(qbTimers.get(card)); qbStatus(card, 'Editing…'); qbTimers.set(card, setTimeout(() => qbSaveNow(card), delay)); }
// Before anything that redraws the page, finish pending saves
async function qbFlush() { const cards = [...qbTimers.keys()]; cards.forEach(c => clearTimeout(qbTimers.get(c))); await Promise.all(cards.map(c => qbSaveNow(c))); await Promise.all([...document.querySelectorAll('.qb-card')].map(c => c._chain).filter(Boolean)); }
const qbCardOf = el => el?.closest('.qb-card');
Object.assign(A, {
  qbAdd: async d => { await qbFlush(); const open = ui.qbDraft?.mid === d.mid && document.querySelector(`.qb-card[data-qcard="${ui.qbDraft.id}"][data-draft]`);
    if (open) { open.querySelector('.qb-text')?.focus(); open.scrollIntoView({block:'center'}); toast('Finish this question first: it saves once it has a question, options and a correct answer.'); return; }
    ui.qbDraft = {mid:d.mid, id:'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), q:qbBlank('mc')}; render(); const c = document.querySelector(`.qb-card[data-qcard="${ui.qbDraft.id}"]`); if (c) { c.classList.add('active'); c.scrollIntoView({block:'center', behavior:'smooth'}); c.querySelector('.qb-text').focus(); } },
  qbCorrect: (d, el) => { const card = qbCardOf(el), q = qbRead(card); if (q.type === 'mcm') q.options[Number(d.k)].correct = !q.options[Number(d.k)].correct; else q.options.forEach((o, k) => { o.correct = k === Number(d.k); }); qbSchedule(qbRerender(card, q), 0); },
  qbTF: (d, el) => { const card = qbCardOf(el), q = qbRead(card); q.answer = d.v === 'true'; qbSchedule(qbRerender(card, q), 0); },
  qbAddOpt: (d, el) => { const card = qbCardOf(el), q = qbRead(card); q.options.push({text:'', correct:false}); const c = qbRerender(card, q); const ins = c.querySelectorAll('.qb-opt-text'); ins[ins.length - 1]?.focus(); },
  qbRemoveOpt: (d, el) => { const card = qbCardOf(el), q = qbRead(card); q.options.splice(Number(d.k), 1); qbSchedule(qbRerender(card, q), 0); },
  qbAddAlt: (d, el) => { const card = qbCardOf(el), q = qbRead(card); q.answer = (q.answer ? q.answer + '|' : '') + ' '; const c = qbRerender(card, q); const ins = c.querySelectorAll('.qb-alt'); const last = ins[ins.length - 1]; if (last) { last.value = ''; last.focus(); } },
  qbRemoveAlt: (d, el) => { const card = qbCardOf(el), q = qbRead(card), alts = [...card.querySelectorAll('.qb-alt')].map(x => x.value.trim()); alts.splice(Number(d.k), 1); q.answer = alts.filter(Boolean).join('|'); qbSchedule(qbRerender(card, q), 0); },
  qbDup: async (d, el) => { await qbFlush(); const card = document.querySelector(`.qb-card[data-qcard="${qbCardOf(el).dataset.qcard}"]`), q = qbRead(card), key = card.dataset.qcard; if (qbProblem(q)) return toast('Finish this question before duplicating it.', true);
    const r = await act('saveQuestion', {mid:card.dataset.mid, q:{...q, id:undefined, bankId:undefined}, after:key}, 'Question duplicated', {silent:true}); if (r === FAIL) return; render();
    document.querySelector(`.qb-card[data-qcard="${r.id}"]`)?.classList.add('active'); document.querySelector(`.qb-card[data-qcard="${r.id}"] .qb-text`)?.focus(); },
  qbDel: (d, el) => { const card = qbCardOf(el), key = card.dataset.qcard, mid = card.dataset.mid;
    if (card.dataset.draft === '1') { ui.qbDraft = null; render(); return; }
    confirmBox('Delete question', 'Delete this question? Answers already given to it stay in past attempts.', () => act('deleteQuestion', {mid, qid:key}, 'Question deleted'), 'Delete'); },
  qbMove: async (d, el) => { const key = qbCardOf(el).dataset.qcard, mid = qbCardOf(el).dataset.mid; await qbFlush(); const card = document.querySelector(`.qb-card[data-qcard="${key}"]`); if (await act('moveQuestion', {mid, qid:key, dir:Number(d.dir)}, null, {silent:true}) === FAIL) return; render();
    const c = document.querySelector(`.qb-card[data-qcard="${key}"]`); if (c) { c.classList.add('active'); c.scrollIntoView({block:'center'}); } },
});
document.addEventListener('input', e => { const card = qbCardOf(e.target); if (!card) return; if (e.target.classList.contains('qb-text')) qbAutosize(card); if (!e.target.classList.contains('qb-type')) qbSchedule(card); });
document.addEventListener('change', e => { if (!e.target.classList.contains('qb-type')) return; const card = qbCardOf(e.target), old = qbRead(card), nq = {...qbBlank(e.target.value), text:old.text, mark:old.mark};
  if (e.target.value === 'mc' && old.type === 'short' && old.answer) nq.options = [{text:old.answer.split('|')[0], correct:true}, {text:'', correct:false}];
  if (['mc', 'mcm'].includes(e.target.value) && ['mc', 'mcm'].includes(old.type) && (old.options || []).length) { let first = true; nq.options = old.options.map(o => ({text:o.text, correct:e.target.value === 'mc' ? (o.correct && first ? !(first = false) : false) : !!o.correct})); }
  const c = qbRerender(card, nq); c.querySelector('.qb-type').focus(); qbSchedule(c, 0); });
document.addEventListener('keydown', e => { if (e.key !== 'Enter' || !e.target.classList?.contains('qb-opt-text') || e.isComposing) return; e.preventDefault(); const card = qbCardOf(e.target), q = qbRead(card), k = [...card.querySelectorAll('.qb-opt-text')].indexOf(e.target);
  q.options.splice(k + 1, 0, {text:'', correct:false}); const c = qbRerender(card, q); c.querySelectorAll('.qb-opt-text')[k + 1]?.focus(); });
document.addEventListener('focusin', e => { const card = qbCardOf(e.target); document.querySelectorAll('.qb-card.active').forEach(c => { if (c !== card) c.classList.remove('active'); }); card?.classList.add('active'); });
document.addEventListener('focusout', e => { const card = qbCardOf(e.target); if (!card || card.contains(e.relatedTarget)) return; if (qbTimers.has(card)) { clearTimeout(qbTimers.get(card)); qbSaveNow(card); } });

/* ---------- Excel (.xlsx) template for Upload users, and reading filled-in .xlsx files ----------
   Written and read here without any library: an .xlsx file is a zip of XML files. */
const XL = (() => {
  let T; const crc32 = b => { if (!T) { T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder(), x = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  function zip(files) { // stored (uncompressed) entries: every spreadsheet app reads these
    const parts = [], central = []; let off = 0;
    for (const [name, text] of files) {
      const data = enc.encode(text), nm = enc.encode(name), crc = crc32(data), lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), nm, data); central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + data.length;
    }
    const cdLen = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of all) { out.set(p, o); o += p.length; } return out;
  }
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cell = (r, c, v, style) => `<c r="${col(c)}${r}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const sheet = (rows, {widths = [], freeze = false, validations = '', textCols = []} = {}) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'}
<sheetFormatPr defaultRowHeight="15"/>${widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${textCols.includes(i) ? ' style="3"' : ''}/>`).join('')}</cols>` : ''}
<sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v == null || v === '' ? '' : cell(ri + 1, ci, typeof v === 'object' ? v.v : v, typeof v === 'object' ? v.s : 0)).join('')}</row>`).join('')}</sheetData>
${validations}</worksheet>`;
  // A workbook from sheets: [[name, sheet xml, hidden?], …]
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFB3753"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  function book(sheets) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', WS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip([
      ['[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${WS}"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map(([n, , hid], i) => `<sheet name="${x(n)}" sheetId="${i + 1}"${hid ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', STYLES], ...sheets.map(([, xml], i) => [`xl/worksheets/sheet${i + 1}.xml`, xml])]);
  }
  // Quiz questions template, in the agreed format: Sno | Question Text | A–F | Correct Answer
  function quizTemplate() {
    const COLS = [['Sno', 6], ['Question Text', 60], ['A', 26], ['B', 26], ['C', 26], ['D', 26], ['E', 20], ['F', 20], ['Correct Answer', 16]], n = 2001;
    const validations = `<dataValidations count="1"><dataValidation type="none" allowBlank="1" showInputMessage="1" promptTitle="Correct Answer" prompt="Letter of the correct option, e.g. B. More than one correct answer: letters separated by commas, e.g. A,C" sqref="I2:I${n}"/></dataValidations>`;
    const qs = sheet([COLS.map(c => ({v:c[0], s:1}))], {widths:COLS.map(c => c[1]), freeze:true, validations, textCols:[2, 3, 4, 5, 6, 7]});
    const instr = sheet([[{v:'How to fill in the questions sheet', s:2}], [''], [{v:'Column', s:1}, {v:'What to enter', s:1}, {v:'Example', s:1}],
      ['Sno', 'Optional. A running number, for your own reference.', '1'],
      ['Question Text', 'The question (required).', 'What does legal on property mean?'],
      ['A, B, C, D', 'The options. At least two; A and B are required.', 'Physical inspection / Verification of property documents / …'],
      ['E, F', 'Optional extra options. Leave empty if not needed.', ''],
      ['Correct Answer', 'The letter of the correct option (A to F).', 'B'],
      ['', 'More than one correct answer: the letters separated by commas. Learners tick every correct option and get the mark only when they select exactly those.', 'A,C'], [''],
      ['Notes', 'One question per row. Keep the header row as it is.', ''],
      ['', 'Every question is multiple choice worth 1 mark: one letter = one correct answer, several letters = more than one.', ''],
      ['', 'On the quiz page, choose Upload questions and pick this file. You see a preview before anything is saved.', '']], {widths:[18, 80, 44]});
    return book([['Quiz-Activity-Questions', qs], ['Instructions', instr]]);
  }
  // The template: a Users sheet to fill in, Instructions, and a hidden Lists sheet behind the dropdowns
  function userTemplate() {
    const teams = C.teamsOf(S), courses = S.courses.filter(c => c.status !== 'archived').map(c => c.shortname), roles = ['Learner', 'Trainer', 'Course author', 'Non-editing teacher'];
    const COLS = [['username', 'Login name: letters, numbers, dot, dash, underscore', 22], ['fullname', 'Full name, e.g. Ravi Kumar', 28], ['email', 'Work email address', 30], ['team', 'Pick from the list', 30], ['password', `Optional. Leave empty to use ${C.DEFAULT_PASSWORD}`, 20],
      ['course1', 'Optional. Course short name (pick from the list)', 16], ['role1', 'Optional. Default Learner', 16], ['group1', 'Optional. Group in that course (created if missing)', 18],
      ['course2', 'Optional', 14], ['role2', 'Optional', 14], ['group2', 'Optional', 14], ['course3', 'Optional', 14], ['role3', 'Optional', 14], ['group3', 'Optional', 14], ['doj', 'Optional. Date of joining, day first (27/11/2026): learners join the batches of that month and day in their courses', 14]];
    const n = 2000, lastList = l => Math.max(2, l.length + 1);
    const dv = (sq, ref, title, msg) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="${x(title)}" error="${x(msg)}" sqref="${sq}"><formula1>${ref}</formula1></dataValidation>`;
    const validations = `<dataValidations count="7">${dv(`D2:D${n}`, `Lists!$A$2:$A$${lastList(teams)}`, 'Team', 'Choose a team from the list.')}${[['E', 'H', 'K'], ['F', 'I', 'L']].map((cs, k) => cs.map(c => k === 0 ? dv(`${c}2:${c}${n}`, `Lists!$B$2:$B$${lastList(courses)}`, 'Course', 'Choose a course short name from the list.') : dv(`${c}2:${c}${n}`, `Lists!$C$2:$C$${lastList(roles)}`, 'Role', 'Choose a role from the list.')).join('')).join('')}</dataValidations>`;
    const users = sheet([COLS.map(c => ({v:c[0], s:1}))], {widths:COLS.map(c => c[2]), freeze:true, validations, textCols:[0, 4, 14]});
    const instr = sheet([[{v:'How to fill in the Users sheet', s:2}], [''], [{v:'Column', s:1}, {v:'What to enter', s:1}, {v:'Example', s:1}],
      ...COLS.slice(0, 9).map(([k, d], i) => [k, d + (i < 4 ? ' (required)' : ''), ['asha.verma', 'Asha', 'Verma', 'asha.verma@nobroker.in', teams[0] || '', '', courses[0] || '', 'Learner', 'Batch A'][i]]),
      ['course2 … group3', 'Up to three courses per person, in the same way', ''], ['doj', 'Optional. Date of joining, day first. As a learner in each course the person joins two batches: the month (Nov 2026 joiners) and the day (27 Nov 2026 joiners).', '27/11/2026'], [''],
      ['Notes', 'One person per row on the Users sheet. Keep the header row as it is.', ''],
      ['', 'Team, course and role cells have dropdowns. Values not on the list are refused.', ''],
      ['', 'New people must change the starting password at first sign-in.', ''],
      ['', 'Save the file and choose it in Site administration › Upload users. Excel (.xlsx) and CSV both work.', '']], {widths:[18, 80, 26]});
    const maxL = Math.max(teams.length, courses.length, roles.length);
    const lists = sheet([[{v:'Teams', s:1}, {v:'Courses', s:1}, {v:'Roles', s:1}], ...Array.from({length:maxL}, (_, i) => [teams[i] || '', courses[i] || '', roles[i] || ''])], {widths:[34, 16, 20]});
    return book([['Users', users], ['Instructions', instr], ['Lists', lists, true]]);
  }
  // Reading a filled-in .xlsx: the Users sheet (or the first sheet) becomes CSV text for the usual preview
  async function readXlsx(buf) { const grid = await readXlsxGrid(buf, /^users$/i); const q = v => { v = String(v ?? '').trim(); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    return grid.filter(r => r && r.some(v => String(v ?? '').trim() !== '')).map(r => Array.from({length:r.length}, (_, i) => q(r[i])).join(',')).join('\n'); }
  // The rows of one sheet (the first whose name matches, else the first sheet) as arrays of cell text
  async function readXlsxGrid(buf, prefer) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), files = {};
    let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
    let p = dv.getUint32(eocd + 16, true); const count = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
      const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true), raw = b.subarray(start, start + csize);
      files[name] = method === 0 ? dec.decode(raw) : await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    const P = t => new DOMParser().parseFromString(t || '<x/>', 'application/xml'), all = (doc, tag) => [...doc.getElementsByTagNameNS('*', tag)];
    const wb = P(files['xl/workbook.xml']), rels = P(files['xl/_rels/workbook.xml.rels']);
    const sheets = all(wb, 'sheet').map(s => ({name:s.getAttribute('name'), rid:s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')}));
    const pick = sheets.find(s => prefer && prefer.test(s.name)) || sheets[0]; if (!pick) throw new Error('The workbook has no sheets.');
    const target = all(rels, 'Relationship').find(r => r.getAttribute('Id') === pick.rid)?.getAttribute('Target') || 'worksheets/sheet1.xml';
    const ws = P(files['xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '')]);
    const shared = all(P(files['xl/sharedStrings.xml']), 'si').map(si => all(si, 't').map(t => t.textContent).join(''));
    const grid = [];
    for (const row of all(ws, 'row')) { const out = []; let ci = 0;
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r'); if (ref) { const L = ref.replace(/\d+/g, ''); ci = [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; }
        const t = c.getAttribute('t'), v = all(c, 'v')[0]?.textContent ?? '';
        out[ci] = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? all(c, 't').map(n => n.textContent).join('') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v; ci++;
      }
      grid[Number(row.getAttribute('r') || grid.length + 1) - 1] = out;
    }
    return Array.from(grid, r => Array.from({length:(r || []).length}, (_, i) => (r || [])[i] ?? ''));
  }
  // HR course assignment: People sheet (Full name | Email | Team, team from a dropdown) and Instructions
  function hrTemplate() {
    const courses = S.courses.filter(c => c.hr && c.status === 'published').map(c => c.fullname), n = 2000;
    const validations = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Course Name" error="Choose an HR course from the list." sqref="E2:E${n}"><formula1>Lists!$A$2:$A$${Math.max(2, courses.length + 1)}</formula1></dataValidation></dataValidations>`;
    const people = sheet([[{v:'Emp ID', s:1}, {v:'Emp Email', s:1}, {v:'Full Name', s:1}, {v:'Date Of Joining', s:1}, {v:'Course Name', s:1}]], {widths:[14, 36, 30, 18, 36], freeze:true, validations, textCols:[0, 3]});
    const instr = sheet([[{v:'How to fill in the People sheet', s:2}], [''], [{v:'Column', s:1}, {v:'What to enter', s:1}, {v:'Example', s:1}],
      ['Emp ID', 'Optional. Kept on the account.', 'E1024'], ['Emp Email', 'Work email address (required).', 'kavya.nair@nobroker.in'], ['Full Name', 'Required for people new to the site.', 'Kavya Nair'],
      ['Date Of Joining', 'Optional. Day first, e.g. 27/11/2026. Puts the person in the joining batches (Nov 2026 joiners, 27 Nov 2026 joiners).', '27/11/2026'],
      ['Course Name', 'The HR course (pick from the list). Empty: the course chosen on the upload screen.', courses[0] || ''], [''],
      ['Notes', 'One person and course per row. Keep the header row as it is. The same columns as the HR Google Sheet.', ''],
      ['', 'People not on the site yet get a temporary account and an email to set their password; it is switched off after the due date.', ''],
      ['', 'Every course is due 7 days after it is assigned. You see every row before anything is assigned.', '']], {widths:[16, 80, 28]});
    const lists = sheet([[{v:'HR courses', s:1}], ...courses.map(c => [c])], {widths:[40]});
    return book([['People', people], ['Instructions', instr], ['Lists', lists, true]]);
  }
  return {userTemplate, quizTemplate, hrTemplate, readXlsx, readXlsxGrid};
})();
Object.assign(A, {
  xlsxTemplate: () => download('nb-academy-users-template.xlsx', XL.userTemplate(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  csvTemplate: () => download('nb-academy-users-template.csv', 'username,fullname,email,team,password,course1,role1,group1\n'),
});
/* ---------- Bulk upload of quiz questions: choose a file, check the preview, then add or replace ---------- */
function qImportPreview() {
  const st = ui.qImport, m = st && S.mods[st.mid]; if (!m || !st.res) return '';
  const {questions, errors} = st.res, have = (m.questions || []).length, L = 'ABCDEF';
  return `${errors.length ? `<div class="card stack" style="background:var(--bad-soft, #fdecec);border-color:transparent"><b>${errors.length} row${errors.length === 1 ? ' needs' : 's need'} fixing. Nothing is added until every row is right.</b>
      <ul class="small" style="margin:0;padding-left:18px">${errors.slice(0, 40).map(e => `<li><b>Row ${e.row}</b>${e.text ? ` (${esc(e.text.slice(0, 60))})` : ''}: ${esc(e.error)}</li>`).join('')}${errors.length > 40 ? `<li>…and ${errors.length - 40} more</li>` : ''}</ul></div>` : ''}
    ${questions.length ? `<p><b>${questions.length} question${questions.length === 1 ? '' : 's'}</b> read from ${esc(st.name)}${errors.length ? ' (the rows above are not counted)' : ''}. The correct option is marked ✓.</p>
    <div class="tw" style="max-height:44vh;overflow:auto"><table><thead><tr><th class="n">Row</th><th>Question</th><th>Options</th></tr></thead><tbody>
      ${questions.map(q => `<tr><td class="n">${q.row}</td><td>${esc(q.text)}${q.type === 'mcm' ? ' <span class="chip brand">More than one answer</span>' : ''}</td><td class="small">${q.options.map((o, i) => o.correct ? `<b style="color:var(--ok)">✓ ${esc(o.text)}</b>` : esc(o.text)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${!errors.length && questions.length ? `${have ? `<fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="small"><b>This quiz already has ${have} question${have === 1 ? '' : 's'}.</b></legend>
        <label class="check"><input type="radio" name="qimode" value="add" checked> Add these after the existing questions</label><label class="check"><input type="radio" name="qimode" value="replace"> Replace the existing questions</label></fieldset>` : ''}
      <span class="err small" id="qierr" hidden></span><div class="row"><button class="btn primary" data-act="qImportGo">Add ${questions.length} question${questions.length === 1 ? '' : 's'}</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>` : ''}`;
}
Object.assign(A, {
  quizTemplate: () => download('quiz-questions-template.xlsx', XL.quizTemplate(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  qImport: d => { ui.qImport = {mid:d.id};
    openModal('Upload questions', `<div class="stack"><p class="muted small" style="margin:0">An Excel (.xlsx) or CSV file with the columns <b>Question Text</b>, options <b>A</b> to <b>F</b> (at least A and B) and <b>Correct Answer</b>: the letter of the right option (<b>B</b>), or several letters when more than one answer is correct (<b>A,C</b>). A <b>Sno</b> column is fine. Each row becomes a multiple-choice question worth 1 mark; with several letters, learners tick every correct option and get the mark only when they select exactly those. <button class="link" data-act="quizTemplate">Download the template</button></p>
      <div class="field"><label for="qifile">Questions file</label><input id="qifile" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-qimport="1"></div><div id="qiprev" class="stack"></div></div>`, true); },
  qImportGo: async () => {
    const st = ui.qImport; if (!st?.rows) return; const replace = document.querySelector('input[name=qimode]:checked')?.value === 'replace';
    if (replace && !confirmReplace()) return;
    const r = await act('importQuestions', {mid:st.mid, rows:st.rows, replace}, null, {silent:true, errEl:'qierr'}); if (r === FAIL) return;
    ui.qImport = null; closeModal(); render(); toast(`${r.added} question${r.added === 1 ? '' : 's'} added${r.replaced ? `, ${r.replaced} replaced` : ''}. The quiz now has ${r.total}.`);
  },
});
const confirmReplace = () => { const b = document.querySelector('[data-act=qImportGo]'); if (b?.dataset.sure) return true; if (b) { b.dataset.sure = '1'; b.textContent = 'Yes, replace the existing questions'; b.classList.add('danger'); } return false; };
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset?.qimport || !t.files?.[0]) return; e.stopImmediatePropagation();
  const f = t.files[0], box = document.getElementById('qiprev');
  try {
    const rows = /\.csv$/i.test(f.name) || f.type === 'text/csv' ? C.csvGrid(await f.text()) : await XL.readXlsxGrid(await f.arrayBuffer(), /question/i);
    const used = rows.filter(r => r && r.some(v => String(v ?? '').trim() !== '')).map(r => r.map(v => String(v ?? '')));
    ui.qImport = {...ui.qImport, name:f.name, rows:used, res:C.parseQuestionRows(used)};
    if (box) box.innerHTML = qImportPreview();
  } catch (er) { if (box) box.innerHTML = `<p class="err">This file could not be read: ${esc(er.message)}. Save it as Excel (.xlsx) or CSV and try again.</p>`; }
}, true);
document.addEventListener('change', e => { if (e.target.name === 'qimode') { const b = document.querySelector('[data-act=qImportGo]'); if (b) { delete b.dataset.sure; b.classList.remove('danger'); b.textContent = b.textContent.replace(/^Yes, replace the existing questions$/, `Add ${ui.qImport?.res?.questions.length || ''} questions`); } } });
// Choosing an .xlsx in Upload users: read it here and show the preview straight away
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset?.csv || !t.files?.[0] || !/\.xlsx$/i.test(t.files[0].name)) return;
  e.stopImmediatePropagation();
  try { const text = await XL.readXlsx(await t.files[0].arrayBuffer()); const ta = document.getElementById('csvtext'); if (ta) ta.value = text; ui.csv = {...C.validateUserRows(S, text), text}; render(); toast('Excel file read. Check the preview below.'); }
  catch (er) { toast(`This Excel file could not be read: ${er.message}`, true); }
}, true);

/* Live sessions tab: forms, and the people picker's filters (course, team, search, selected only) */
Object.assign(F, {
  session: async (d, f) => {
    const r = await act('saveSession', {id:d.id || null, name:d.name, description:d.description, start:fromInput(d.start), duration:d.duration, mode:d.mode, link:d.link, location:d.location, invitees:picked(f, 'invitee')}, null, {silent:true, errEl:'sesserr'});
    if (r === FAIL) return; go('session', {id:r.id}); toast(d.id ? 'Session saved. Changes were emailed to the people invited.' : `Session scheduled. Invitations sent to ${r.invited} ${r.invited === 1 ? 'person' : 'people'}.`);
  },
  sessAttendance: async (d, f) => { const marks = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('att:')) marks[k.slice(4)] = v; await act('sessionAttendance', {id:d.id, marks}, 'Attendance saved'); },
  sessCancel: async d => { if (await act('cancelSession', {id:d.id, reason:d.reason}, null, {silent:true}) === FAIL) return; closeModal(); render(); toast('Session cancelled. Everyone invited has been told.'); },
});
function spCount() { const n = document.querySelectorAll('#sp-list input[name=invitee]:checked').length, el = document.getElementById('sp-count'); if (el) el.textContent = `${n} selected`; }
function spFilter() {
  const list = document.getElementById('sp-list'); if (!list) return;
  const q = (document.getElementById('sp-q')?.value || '').trim().toLowerCase(), c = document.getElementById('sp-course')?.value || '', t = document.getElementById('sp-team')?.value || '', only = document.getElementById('sp-only')?.checked;
  let shown = 0; for (const r of list.querySelectorAll('.sp-row')) { const ok = (!q || r.dataset.s.includes(q)) && (!c || r.dataset.c.includes(` ${c} `)) && (!t || r.dataset.t === t) && (!only || r.querySelector('input').checked); r.hidden = !ok; if (ok) shown++; }
  const n = document.getElementById('sp-shown'); if (n) n.textContent = shown; const none = document.getElementById('sp-none'); if (none) none.hidden = shown > 0;
}
document.addEventListener('input', e => { if (e.target.id === 'sp-q') spFilter(); });
document.addEventListener('change', e => {
  const t = e.target; if (['sp-course', 'sp-team', 'sp-only'].includes(t.id)) spFilter();
  if (t.name === 'invitee') { spCount(); if (document.getElementById('sp-only')?.checked) spFilter(); }
  if (t.id === 'ss-mode') document.querySelectorAll('[data-smode]').forEach(x => { x.hidden = x.dataset.smode !== t.value; });
});

F.editAccess = async (d, f) => {
  const r = await act('setPersonas', {userId:d.userId, ...personaData(f)}, null, {silent:true, errEl:'eaerr'}); if (r === FAIL) return;
  closeModal(); render(); const u = h.user(d.userId); toast(`Access updated: ${fullname(u)} is now ${h.personas(u.id).map(k => PERSONAS.find(x => x[0] === k)?.[1] || k).join(', ')}.`);
};
/* Site administration › General: free disk space on the server, and leftover unfinished uploads */
{ const show = r => { const mb = b => b == null ? 'unknown' : b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB', low = r.free != null && r.free < 1073741824;
    const el = document.getElementById('storageres'); if (!el) return;
    el.classList.remove('muted'); el.innerHTML = `<div class="stats"><div class="stat"><b style="${low ? 'color:var(--bad)' : ''}">${mb(r.free)}</b><span class="muted small">Free disk space${r.total ? ` of ${mb(r.total)}` : ''}</span></div><div class="stat"><b>${r.pendingUploads}</b><span class="muted small">Unfinished uploads (${mb(r.pendingBytes)})</span></div></div>
      ${low ? '<p style="color:var(--bad)"><b>The server is running out of disk space.</b> Uploads fail when it is full. Ask whoever runs the server to free up space.</p>' : '<p class="muted">Enough free space for uploads. If uploads still fail with an error from the web server, ask whoever runs it to check that its temporary upload folder (nginx: client_body_temp) is writable and on a disk with free space.</p>'}
      ${r.pendingUploads ? '<button class="btn sm" data-act="cleanUploads">Remove unfinished uploads</button>' : ''}`; };
  Object.assign(A, {
    checkStorage: async () => { try { show(await B.req('POST', '/api/admin/storage', {})); } catch (e) { toast(e.message, true); } },
    cleanUploads: async () => { try { show(await B.req('POST', '/api/admin/storage/clean', {})); toast('Unfinished uploads older than 15 minutes removed'); } catch (e) { toast(e.message, true); } },
  });
}

/* ---------- HR Courses: Assign (Google Sheet, one person, bulk upload), analytics filters and export ---------- */
const hrPublished = () => S.courses.filter(c => c.hr && c.status === 'published').sort((a, b) => a.fullname.localeCompare(b.fullname));
const hrCourseSelect = (id, cid, label = 'HR course') => `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="cid">${hrPublished().map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.fullname)}</option>`).join('')}</select></div>`;
const hrDueNote = () => `<div class="card" style="padding:10px 14px"><b>Due ${fmtDateOnly(new Date(Date.now() + 7 * D))}</b> <span class="muted small">(7 days from now, fixed). Reminders go out 2 days and 1 day before. People new to ${esc(S.site.name)} get a temporary account, switched off after the due date.</span></div>`;
// After assigning: one summary for one or more courses
function hrDoneModal(results, extra = []) {
  const n = results.reduce((t, x) => t + x.r.assigned + x.r.renewed, 0), created = results.reduce((t, x) => t + x.r.created, 0), skipped = [...results.flatMap(x => x.r.skipped.map(s => ({...s, course:x.c.fullname}))), ...extra];
  openModal('HR course assigned', `<div class="stack"><p><b>${n}</b> assignment${n === 1 ? '' : 's'}: ${results.filter(x => x.r.assigned + x.r.renewed).map(x => `<b>${esc(x.c.fullname)}</b> (${x.r.assigned + x.r.renewed})`).join(', ') || 'none'}, due <b>${fmtDateOnly(results[0]?.r.due || Date.now() + 7 * D)}</b>.${created ? ` ${created} temporary account${created === 1 ? ' was' : 's were'} created.` : ''} ${S.site.emailOn ? 'Emails are on their way.' : '<span class="err" style="display:inline">Email is not set up, so nobody was emailed.</span>'}</p>
    ${skipped.length ? `<div><b>Not assigned (${skipped.length})</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${skipped.map(s => `<li>${esc(s.who)}${s.course ? ` · ${esc(s.course)}` : ''}: ${esc(s.why)}</li>`).join('')}</ul></div>` : ''}
    <div class="mfoot">${results.length === 1 ? `<button class="btn" data-go="participants" data-id="${results[0].c.id}">See learners</button>` : '<button class="btn" data-go="hranalytics">See HR Analytics</button>'}<button class="btn primary" data-act="closeModal">Done</button></div></div>`);
}
// Bulk upload: the rows of the file, checked, then assigned course by course
function hrBulkPreview() {
  const st = ui.hrBulk, box = document.getElementById('hrbprev'); if (!box || !st) return;
  const back = document.getElementById('hrbback'); if (back) back.style.display = st.grid ? 'none' : '';
  if (!st.grid) { box.innerHTML = ''; return; }
  const v = st.res = C.hrUploadRows(S, st.grid, {cid:document.getElementById('hrbc')?.value || st.cid});
  if (v.errors.length) { box.innerHTML = `<p class="err" style="display:block">${v.errors.map(esc).join('<br>')}</p>`; return; }
  const ok = v.rows.filter(r => !r.errors.length).length;
  box.innerHTML = `<h3 style="margin:6px 0 4px">Preview${st.name ? ` of ${esc(st.name)}` : ''}</h3><p class="muted small" style="margin:0 0 8px">${v.rows.length} rows · ${ok} ready · ${v.rows.length - ok} with problems (rows with problems are skipped)</p>
    <div class="tw" style="max-height:320px;overflow:auto"><table><thead><tr><th>Line</th><th>Person</th><th>Course</th><th>Joining</th><th style="min-width:170px">Status</th></tr></thead><tbody>
    ${v.rows.map(r => `<tr><td class="num">${r.line}</td><td>${esc(r.name || '–')}${r.empId ? ` <span class="muted small">· ${esc(r.empId)}</span>` : ''}<br><span class="muted small">${esc(r.email)}</span> <span class="chip ${r.existing ? '' : 'brand'}">${r.existing ? 'On the site' : 'New, temporary'}</span></td><td class="small">${esc(r.course || '–')}</td><td class="small">${esc(r.doj || '–')}</td><td class="small">${r.errors.length ? `<span style="color:var(--bad)">${r.errors.map(esc).join('; ')}</span>` : '<span class="chip ok">Ready</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="hrbagain"> <span>Also assign again to people who already completed the course</span></label>
    <div class="mfoot"><button class="btn" type="button" data-act="hrAssign" data-id="${esc(st.cid || '')}">Back</button><button class="btn" type="button" data-act="hrBulkClear">Start again</button><button class="btn primary" data-act="hrBulkGo" ${ok ? '' : 'disabled'}>Assign ${ok} row${ok === 1 ? '' : 's'} and send emails</button></div>`;
}
const hrGrid = text => /\t/.test(text) ? String(text).split(/\r?\n/).map(l => l.split('\t')) : C.csvGrid(text);
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'hrbc') return hrBulkPreview();
  if (!t.dataset?.hrbulk || !t.files?.[0]) return; e.stopImmediatePropagation();
  const f = t.files[0];
  try { ui.hrBulk = {...ui.hrBulk, name:f.name, grid:/\.csv$/i.test(f.name) || f.type === 'text/csv' ? C.csvGrid(await f.text()) : await XL.readXlsxGrid(await f.arrayBuffer(), /people|assign|sheet1/i)}; hrBulkPreview(); }
  catch (er) { const box = document.getElementById('hrbprev'); if (box) box.innerHTML = `<p class="err" style="display:block">This file could not be read: ${esc(er.message)}. Save it as Excel (.xlsx) or CSV.</p>`; }
  t.value = '';
}, true);
Object.assign(A, {
  // Assign: three ways
  hrAssign: d => {
    if (!hrPublished().length) return toast('Publish an HR course first.');
    const cfg = S.site.hrSheet || {}, L = cfg.last, cid = d?.id || '';
    const sheetState = !cfg.sheetId ? 'Not set up yet.' : !cfg.on ? 'Switched off.' : L?.error ? `<span class="err" style="display:inline">Last read failed: ${esc(L.error)}</span>` : L ? `Read every 5 minutes; last read ${hrWhen(L.time)}.` : 'Read every 5 minutes.';
    openModal('Assign HR course', `<div class="stack"><p class="muted small" style="margin:0">Everyone gets an email and <b>7 days</b> to complete the course (fixed), reminders 2 days and 1 day before, and a certificate when they finish.</p>
      <div class="choices">
        <button class="choice" data-act="hrFetch"><b>Fetch from Google Sheet</b><span>Reads the HR sheet now and assigns each new row's course (every course in the sheet, not only this one). ${sheetState}</span></button>
        <button class="choice" data-act="hrOne" data-id="${cid}"><b>Add individually</b><span>One person: full name, email, Emp ID, team and date of joining.</span></button>
        <button class="choice" data-act="hrBulk" data-id="${cid}"><b>Bulk upload</b><span>An Excel or CSV file in the same columns as the sheet. You see every row before anything is assigned.</span></button>
      </div></div>`);
  },
  hrFetch: () => {
    const cfg = S.site.hrSheet || {};
    if (!cfg.sheetId || !cfg.on) { closeModal(); toast(cfg.sheetId ? 'The Google Sheet sync is switched off. Switch it on here.' : 'Set up the Google Sheet first.'); return go('hrsheet'); }
    if (!B.server) return toast('The Google Sheet is read by the server; the preview cannot read it.', true);
    closeModal(); A.hrSheetRun();
  },
  hrOne: d => openModal('Add individually', `<form data-form="hrOne" class="stack">${hrCourseSelect('ho1', d?.id)}<div class="fgrid">
      <div class="field full"><label for="ho2">Full name</label><input id="ho2" name="fullname" type="text" maxlength="200" placeholder="Not needed if the person already has an account"></div>
      <div class="field"><label for="ho3">Email address</label><input id="ho3" name="email" type="email" required autocapitalize="none"></div>
      <div class="field"><label for="ho4">Emp ID (optional)</label><input id="ho4" name="empId" type="text" maxlength="40"></div>
      <div class="field"><label for="ho5">Team (optional)</label>${teamSelect('ho5', '')}</div>
      <div class="field"><label for="ho6">Date of joining (optional)</label><input id="ho6" name="doj" type="date"><span class="hint">Puts the person in the joining batches.</span></div></div>
      <label class="check"><input type="checkbox" name="again"> <span>Assign again if they already completed it</span></label>
      ${hrDueNote()}<p class="err" id="hoerr" role="alert" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="hrAssign" data-id="${d?.id || ''}">Back</button><button class="btn primary" type="submit">Assign and send email</button></div></form>`),
  hrBulk: d => { ui.hrBulk = {cid:d?.id || ''};
    openModal('Bulk upload', `<div class="stack"><div class="card spread" style="gap:12px;flex-wrap:wrap;padding:12px 14px"><div><b>Start from the template</b><p class="muted small" style="margin:2px 0 0">Columns <b>Emp ID</b>, <b>Emp Email</b>, <b>Full Name</b>, <b>Date Of Joining</b>, <b>Course Name</b>, the same as the HR Google Sheet.</p></div><div class="row"><button class="btn sm primary" data-act="hrTemplate">Excel template</button><button class="btn sm" data-act="hrCsvTemplate">CSV template</button></div></div>
      ${hrCourseSelect('hrbc', d?.id, 'Course for rows with an empty Course Name')}
      <div class="field"><label for="hrbfile">Excel (.xlsx) or CSV file</label><input id="hrbfile" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-hrbulk="1"></div>
      <details><summary class="small">Or paste from a spreadsheet</summary><textarea id="hrbtext" rows="5" class="mono" style="font-size:.84rem;margin-top:6px" placeholder="Emp ID&#9;Emp Email&#9;Full Name&#9;Date Of Joining&#9;Course Name"></textarea><button class="btn sm" style="margin-top:6px" data-act="hrBulkPaste">Preview</button></details>
      <div id="hrbprev"></div><div class="mfoot" id="hrbback"><button class="btn" type="button" data-act="hrAssign" data-id="${d?.id || ''}">Back</button></div></div>`, true); },
  hrBulkPaste: () => { const t = document.getElementById('hrbtext')?.value || ''; if (!t.trim()) return toast('Paste the rows first, with the header row.', true); ui.hrBulk = {...ui.hrBulk, name:'', grid:hrGrid(t)}; hrBulkPreview(); },
  hrBulkClear: () => { ui.hrBulk = {cid:ui.hrBulk?.cid}; hrBulkPreview(); },
  hrBulkGo: async () => {
    const v = ui.hrBulk?.res; if (!v) return; const ready = v.rows.filter(r => !r.errors.length), again = !!document.getElementById('hrbagain')?.checked, by = new Map();
    for (const r of ready) { if (!by.has(r.cid)) by.set(r.cid, []); by.get(r.cid).push({fullname:r.name, email:r.email, empId:r.empId, team:r.team, doj:r.doj}); }
    const results = [];
    for (const [cid, people] of by) { const r = await act('hrAssign', {cid, people, again}, null, {silent:true}); if (r === FAIL) return; results.push({c:h.course(cid), r}); }
    ui.hrBulk = null; render(); hrDoneModal(results, v.rows.filter(r => r.errors.length).map(r => ({who:`Line ${r.line}${r.email ? ` (${r.email})` : ''}`, why:r.errors.join('; ')})));
  },
  hrCsvTemplate: () => download('hr-course-assign-template.csv', 'Emp ID,Emp Email,Full Name,Date Of Joining,Course Name\n'),
  hrTemplate: () => download('hr-course-assign-template.xlsx', XL.hrTemplate(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  hrSheetCheck: async () => {
    try { const r = await B.req('POST', '/api/hr-sheet/sync', {preview:true}); openModal('Check of the Google Sheet', `${hrSheetResult(r.result)}<p class="muted small">Nothing was changed. ${S.site.hrSheet?.on ? 'The next read (within 5 minutes, or Read now) does this.' : 'Switch the sync on to do this.'}</p><div class="mfoot"><button class="btn primary" data-act="closeModal">Close</button></div>`); }
    catch (e) { toast(e.message, true); try { setState(await B.init()); render(); } catch (er) {} }
  },
  hrSheetRun: async () => {
    try { const r = await B.req('POST', '/api/hr-sheet/sync', {}); setState(r.state); render(); openModal('Google Sheet read', `${hrSheetResult(r.result)}<div class="mfoot"><button class="btn primary" data-act="closeModal">Done</button></div>`); }
    catch (e) { toast(e.message, true); try { setState(await B.init()); render(); } catch (er) {} }
  },
  hrSheetOn: async d => { if (await act('hrSheetSettings', {on:!!d.on}, d.on ? 'Google Sheet sync switched on' : 'Google Sheet sync switched off') !== FAIL) render(); },
  gkeyRemove: () => confirmBox('Remove the Google key', 'Remove the service account key? The sheet can no longer be read until an administrator adds a key again.', async () => { try { setState((await B.req('POST', '/api/hr-sheet/key', {remove:true})).state); render(); toast('Key removed'); } catch (e) { toast(e.message, true); } }, 'Remove'),
  hraFilter: () => {},
  hraClear: () => { ui.hra = {}; render(); },
  hraCourse: d => { ui.hra = {course:d.id}; go('hranalytics'); },
  // Download: choose the filters (the page's filters filled in), then the CSV
  exportHR: () => {
    const f = ui.hra || {}, all = C.learnerRows(S, h, {hr:true}), o = hraFilterOptions(all);
    const sel = (k, label, opts) => `<div class="field"><label for="hx-${k}">${label}</label><select id="hx-${k}" name="${k}"><option value="">All</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${f[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    openModal('Download HR report', `<form data-form="hrExport" class="stack"><div class="fgrid">${sel('course', 'Course', o.courses)}${sel('status', 'Status', o.statuses)}
        <div class="field"><label for="hx-from">Date of joining from</label><input id="hx-from" name="dojFrom" type="date" value="${esc(f.dojFrom || '')}"></div><div class="field"><label for="hx-to">Date of joining to</label><input id="hx-to" name="dojTo" type="date" value="${esc(f.dojTo || '')}"></div>
        ${sel('by', 'Assigned by', o.bys)}${sel('team', 'Team', o.teams)}${sel('kind', 'Account', [['temp', 'Temporary accounts'], ['perm', 'Permanent accounts']])}</div>
      <p class="muted small" id="hxcount" style="margin:0">${hxCount(hraRows(all, f).length)}</p>
      <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Download CSV</button></div></form>`);
  },

});
document.addEventListener('change', async e => {
  const t = e.target; if (!t.dataset?.gkey || !t.files?.[0]) return; e.stopImmediatePropagation();
  try { const r = await B.req('POST', '/api/hr-sheet/key', {key:await t.files[0].text()}); setState(r.state); render(); toast(`Key added. Share the sheet with ${r.email}`); }
  catch (er) { toast(er.message, true); t.value = ''; }
}, true);
// The row count in the download window follows the filters
document.addEventListener('change', e => { const fm = e.target.closest?.('form[data-form=hrExport]'); if (!fm) return; const el = document.getElementById('hxcount'); if (el) el.textContent = hxCount(hraRows(C.learnerRows(S, h, {hr:true}), Object.fromEntries(new FormData(fm))).length); });
const hxCount = n => `${n} row${n === 1 ? '' : 's'} with these filters.`;
Object.assign(F, {
  hrExport: d => {
    const rows = hraRows(C.learnerRows(S, h, {hr:true}), d), day = t => t ? new Date(t).toISOString().slice(0, 10) : '';
    if (!rows.length) return toast('No rows with these filters.', true);
    const batch = r => h.groupsOf(r.c.id, r.u.id).filter(g => g.batch || / joiners$/.test(g.name)).map(g => g.name.replace(/ joiners$/, '')).join(' / ');
    download(`hr-courses-${new Date().toISOString().slice(0, 10)}.csv`, csv([['Emp ID', 'Name', 'Email', 'Team', 'Date of joining', 'Batch', 'Course', 'Course short name', 'Status', 'Progress %', 'Score %', 'Assigned on', 'Assigned by', 'Due', 'Completed on', 'Certificate code', 'Account'],
      ...rows.map(r => { const ci = hrCert(r); return [r.u.empId || '', fullname(r.u), r.u.email, r.u.department || '', r.u.doj ? (() => { const n = C.sheetDay(r.u.doj); return n ? `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6)}` : r.u.doj; })() : '', batch(r), r.c.fullname, r.c.shortname, HR_STATUS[r.status][0], r.progress, r.total == null ? '' : r.total.toFixed(1), day(r.e.assignedAt), r.e.assignedBy ? fullname(h.user(r.e.assignedBy)) : '', day(r.due), day(r.completedAt), ci ? ci.code : '', r.u.hrTemp ? (r.u.suspended ? 'Temporary, access ended' : 'Temporary') : 'Permanent']; })]));
    closeModal(); toast(`${rows.length} rows downloaded`);
  },
  hrSheet: async (d, f) => {
    const r = await act('hrSheetSettings', {sheet:d.sheet, tab:d.tab, existing:checked(f, 'existing'), on:true}, null, {silent:true, errEl:'hserr'}); if (r === FAIL) return;
    render(); toast('Saved. The sheet is read every 5 minutes.');
  },
  hrOne: async (d, f) => {
    const r = await act('hrAssign', {cid:d.cid, people:[{fullname:d.fullname, email:d.email, empId:d.empId, team:d.team, doj:d.doj}], again:checked(f, 'again')}, null, {silent:true, errEl:'hoerr'}); if (r === FAIL) return;
    if (!r.assigned && !r.renewed && r.skipped.length) { const e = document.getElementById('hoerr'); e.hidden = false; e.textContent = r.skipped.map(s => s.why).join('; '); return; }
    render(); hrDoneModal([{c:h.course(d.cid), r}]);
  },

});
