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
  clearLogo: () => act('saveBranding', {logo:null}, 'Default mark restored'),
  openToken: async d => { await A.logout(); ui.token = await B.tokenInfo(d.t); ui.token.raw = d.t; ui.loginView = 'token'; render(); },
  newUser: () => openModal('Add a new user', `<form data-form="newUser" class="stack"><div class="fgrid">
      <div class="field"><label for="nu1">First name</label><input id="nu1" name="firstname" type="text" required></div><div class="field"><label for="nu2">Last name</label><input id="nu2" name="lastname" type="text" required></div>
      <div class="field"><label for="nu3">Username</label><input id="nu3" name="username" type="text" required pattern="[A-Za-z0-9._\\-]+" title="Letters, numbers, dot, dash or underscore" autocapitalize="none"></div><div class="field"><label for="nu4">Email address</label><input id="nu4" name="email" type="email" required></div>
      <div class="field"><label for="nu8">Team</label>${teamSelect('nu8', '')}</div>
      <div class="field"><label for="nu5">Starting password (optional)</label><input id="nu5" name="password" type="text" placeholder="Leave blank to use ${esc(C.DEFAULT_PASSWORD)}"><span class="hint">${esc(pwRuleText())}</span></div>
      <div class="stack" style="gap:6px;align-self:end"><label class="check"><input type="checkbox" name="welcome" checked> Send the welcome email</label>${S.site.email?.enabled ? '' : '<span class="hint">Email is not set up yet, so it will only be kept in the Email log.</span>'}</div></div>
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
  changePassword: async (d, f) => { if (!pwPair(d, 'cperr')) return; if (await act('updateProfile', {id:S.me, firstname:me().firstname, lastname:me().lastname, email:me().email, current:d.current, password:d.password}, 'Password changed', {silent:true, errEl:'cperr'}) !== FAIL) { f.reset(); render(); } },
  requestAccess: async d => { if (await act('requestAccess', d, 'Request sent. You will be notified of the decision.', {silent:true, errEl:'arerr'}) !== FAIL) render(); },
  decideAccess: async d => { const approve = d.decision !== 'reject'; await act('decideAccess', {id:d.id, approve, due:dateEnd(d.due), remarks:d.remarks}, approve ? 'Approved. The course is unlocked.' : 'Request rejected'); },
  assign: async (d, f) => { const r = await act('assign', {kind:d.kind, id:d.id, users:picked(f, 'users'), cohorts:picked(f, 'cohorts'), due:dateEnd(d.due), mandatory:checked(f, 'mandatory')}, null, {silent:true, errEl:'asserr'}); if (r === FAIL) return; closeModal(); render(); toast(`${r.assigned} assignment${r.assigned === 1 ? '' : 's'} made for ${r.learners} learner${r.learners === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} already completed or not eligible)` : ''}`); },
  setDue: async (d, f) => { if (await act('setDue', {cid:d.cid, userId:d.userId, due:checked(f, 'none') ? null : dateEnd(d.due)}, 'Due date saved', {silent:true}) !== FAIL) { closeModal(); render(); } },
  attendance: (d, f) => { const marks = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('att:') && v) marks[k.slice(4)] = v; return act('liveAttendance', {mid:d.mid, marks}, 'Attendance saved'); },
  recording: d => act('liveRecording', {mid:d.mid, fileId:d.fileId || undefined, url:d.url}, 'Recording saved'),
  feedback: async (d) => { const answers = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith('q:')) answers[k.slice(2)] = /^\d+$/.test(v) && S.mods[d.mid].questions.find(q => q.id === k.slice(2))?.type !== 'text' ? Number(v) : v; await act('submitFeedback', {mid:d.mid, answers}, 'Thank you for your feedback', {errEl:'fberr'}); },
  gradeEssay: d => act('gradeEssay', d, 'Mark saved'),
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
    if (d.type === 'mc') q.options = d.options.split('\n').map(s => s.trim()).filter(Boolean).map(l => l.startsWith('*') ? {text:l.slice(1).trim(), correct:true} : {text:l});
    if (d.type === 'tf') q.answer = d.tf === 'true'; if (d.type === 'short') q.answer = d.short; if (d.type === 'num') { q.answer = d.num; q.tol = d.tol; } if (d.type === 'essay') q.guidance = d.guidance;
    const r = await act('saveBankQuestion', {id:d.bid || null, category:d.category, q}, null, {silent:true, errEl:'qerr'}); if (r === FAIL) return; closeModal(); render(); toast(`Question saved${r.synced ? `. Updated in ${r.synced} quiz${r.synced > 1 ? 'zes' : ''}.` : ''}`); },
  bankAdd: async (d, f) => { const ids = picked(f, 'bq'); const r = await act('addFromBank', {mid:d.mid, ids, random:ids.length ? 0 : Number(d.random) || 0, category:d.category}, null, {silent:true, errEl:'bqerr'}); if (r === FAIL) return; closeModal(); render(); toast(`${r.added} question${r.added > 1 ? 's' : ''} added`); },
  resetPw: async d => { const r = await act('adminResetPassword', d, null, {silent:true, errEl:'rperr'}); if (r === FAIL) return; closeModal(); render(); toast(r.mode === 'temp' ? 'Temporary password set' : 'Reset link emailed'); },
  testLdap: async d => { try { await B.testLdap(d.username, d.password); closeModal(); toast('The directory accepted the sign-in'); } catch (e) { toast(e.message, true); } },
  newUser: async (d, f) => { const pd = personaData(f); if (!pd.personas.length) { const e = document.getElementById('nuerr'); e.textContent = 'Choose at least one persona.'; e.hidden = false; return; }
    const emailOn = !!S.site.email?.enabled, welcome = checked(f, 'welcome');
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
const SAMPLE_VARS = {firstname:'Asha', lastname:'Verma', username:'asha.verma', course:'Workplace Safety Essentials', item:'Final assessment', due:'Fri, 6 Nov 2026', days:'3 days', progress:'40', sender:'Rohan Mehta', learner:'Asha Verma', reason:'I was on leave', remarks:'Please complete it this week', grade:'8 / 10', code:'SAFE4K8P2X', expires:'31 Dec 2027', when:'Thu, 29 Oct 2026, 4:00 pm', where:'Online', duepart:' It is due on Fri, 6 Nov 2026.'};
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
const PERSONAS = [['learner', 'Learner', 'Takes assigned training and courses'], ['trainer', 'Trainer', 'Delivers and grades courses and cohorts tagged to them'], ['teamlead', 'Team Lead', 'Monitors and reminds the cohorts mapped to them'], ['admin', 'Administrator', 'Manages the whole site']];
function personaFields(u) {
  const on = new Set(u ? h.personas(u.id) : ['learner']);
  const inC = key => u ? S.cohorts.filter(c => c[key].includes(u.id)).map(c => c.id) : [];
  const coItems = S.cohorts.map(c => [c.id, c.name, [c.department, `${c.members.length} members`].filter(Boolean).join(' · ')]);
  const tCourses = u ? S.enrol.filter(e => e.userId === u.id && e.role === 'trainer').map(e => e.courseId) : [];
  const box = ([k, l, sub]) => (k === 'admin' && !h.isAdmin()) ? '' : u?.builtinAdmin ? `<label class="check persona"><input type="checkbox" checked disabled><input type="hidden" name="personas" value="${k}"> <span><b>${l}</b><br><span class="muted small">Always on for the super administrator</span></span></label>` : (k === 'admin' && (u?.builtinAdmin || (u?.admin && !h.isSuperAdmin())) ? `<label class="check persona"><input type="checkbox" checked disabled><input type="hidden" name="personas" value="admin"> <span><b>${l}</b><br><span class="muted small">${u.builtinAdmin ? 'Super administrator: set in the server configuration' : 'Only the super administrator can remove this'}</span></span></label>` : `<label class="check persona"><input type="checkbox" name="personas" value="${k}" ${on.has(k) ? 'checked' : ''}> <span><b>${l}</b><br><span class="muted small">${sub}</span></span></label>`);
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
  const key = card.dataset.qcard, mid = card.dataset.mid, type = card.querySelector('.qb-type').value, old = (S.mods[mid]?.questions || []).find(x => x.id === key);
  const q = {type, text:card.querySelector('.qb-text').value.trim(), mark:card.querySelector('.qb-mark').value, bankId:old?.bankId};
  if (type === 'mc') q.options = [...card.querySelectorAll('.qb-opt')].filter(r => r.querySelector('.qb-opt-text')).map(r => ({text:r.querySelector('.qb-opt-text').value, correct:r.querySelector('.qb-pick').classList.contains('on')}));
  if (type === 'tf') q.answer = card.querySelector('.qb-pick.on')?.dataset.v !== 'false';
  if (type === 'short') q.answer = [...card.querySelectorAll('.qb-alt')].map(x => x.value.trim()).filter(Boolean).join('|');
  if (type === 'num') { q.answer = card.querySelector('.qb-num').value; q.tol = card.querySelector('.qb-tol').value; }
  if (type === 'essay') q.guidance = card.querySelector('.qb-guide').value;
  return q;
}
function qbProblem(q) {
  if (!q.text) return 'Type the question to save it.';
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
  qbCorrect: (d, el) => { const card = qbCardOf(el), q = qbRead(card); q.options.forEach((o, k) => { o.correct = k === Number(d.k); }); qbSchedule(qbRerender(card, q), 0); },
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
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E6175"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
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
    const validations = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Correct Answer" error="Enter the letter of the correct option: A, B, C, D, E or F." promptTitle="Correct Answer" prompt="Letter of the correct option" sqref="I2:I${n}"><formula1>"A,B,C,D,E,F"</formula1></dataValidation></dataValidations>`;
    const qs = sheet([COLS.map(c => ({v:c[0], s:1}))], {widths:COLS.map(c => c[1]), freeze:true, validations, textCols:[2, 3, 4, 5, 6, 7]});
    const instr = sheet([[{v:'How to fill in the questions sheet', s:2}], [''], [{v:'Column', s:1}, {v:'What to enter', s:1}, {v:'Example', s:1}],
      ['Sno', 'Optional. A running number, for your own reference.', '1'],
      ['Question Text', 'The question (required).', 'What does legal on property mean?'],
      ['A, B, C, D', 'The options. At least two; A and B are required.', 'Physical inspection / Verification of property documents / …'],
      ['E, F', 'Optional extra options. Leave empty if not needed.', ''],
      ['Correct Answer', 'The letter of the one correct option (A to F).', 'B'], [''],
      ['Notes', 'One question per row. Keep the header row as it is.', ''],
      ['', 'Every question is multiple choice with one correct answer, worth 1 mark.', ''],
      ['', 'On the quiz page, choose Upload questions and pick this file. You see a preview before anything is saved.', '']], {widths:[18, 80, 44]});
    return book([['Quiz-Activity-Questions', qs], ['Instructions', instr]]);
  }
  // The template: a Users sheet to fill in, Instructions, and a hidden Lists sheet behind the dropdowns
  function userTemplate() {
    const teams = C.teamsOf(S), courses = S.courses.filter(c => c.status !== 'archived').map(c => c.shortname), roles = ['Learner', 'Trainer', 'Course author', 'Non-editing teacher'];
    const COLS = [['username', 'Login name: letters, numbers, dot, dash, underscore', 22], ['firstname', 'First name', 16], ['lastname', 'Last name', 16], ['email', 'Work email address', 30], ['team', 'Pick from the list', 30], ['password', `Optional. Leave empty to use ${C.DEFAULT_PASSWORD}`, 20],
      ['course1', 'Optional. Course short name (pick from the list)', 16], ['role1', 'Optional. Default Learner', 16], ['group1', 'Optional. Group in that course (created if missing)', 18],
      ['course2', 'Optional', 14], ['role2', 'Optional', 14], ['group2', 'Optional', 14], ['course3', 'Optional', 14], ['role3', 'Optional', 14], ['group3', 'Optional', 14]];
    const n = 2000, lastList = l => Math.max(2, l.length + 1);
    const dv = (sq, ref, title, msg) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="${x(title)}" error="${x(msg)}" sqref="${sq}"><formula1>${ref}</formula1></dataValidation>`;
    const validations = `<dataValidations count="7">${dv(`E2:E${n}`, `Lists!$A$2:$A$${lastList(teams)}`, 'Team', 'Choose a team from the list.')}${[['G', 'J', 'M'], ['H', 'K', 'N']].map((cs, k) => cs.map(c => k === 0 ? dv(`${c}2:${c}${n}`, `Lists!$B$2:$B$${lastList(courses)}`, 'Course', 'Choose a course short name from the list.') : dv(`${c}2:${c}${n}`, `Lists!$C$2:$C$${lastList(roles)}`, 'Role', 'Choose a role from the list.')).join('')).join('')}</dataValidations>`;
    const users = sheet([COLS.map(c => ({v:c[0], s:1}))], {widths:COLS.map(c => c[2]), freeze:true, validations, textCols:[0, 5]});
    const instr = sheet([[{v:'How to fill in the Users sheet', s:2}], [''], [{v:'Column', s:1}, {v:'What to enter', s:1}, {v:'Example', s:1}],
      ...COLS.slice(0, 9).map(([k, d], i) => [k, d + (i < 4 ? ' (required)' : ''), ['asha.verma', 'Asha', 'Verma', 'asha.verma@nobroker.in', teams[0] || '', '', courses[0] || '', 'Learner', 'Batch A'][i]]),
      ['course2 … group3', 'Up to three courses per person, in the same way', ''], [''],
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
  return {userTemplate, quizTemplate, readXlsx, readXlsxGrid};
})();
Object.assign(A, {
  xlsxTemplate: () => download('nb-academy-users-template.xlsx', XL.userTemplate(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  csvTemplate: () => download('nb-academy-users-template.csv', 'username,firstname,lastname,email,team,password,course1,role1,group1\n'),
});
/* ---------- Bulk upload of quiz questions: choose a file, check the preview, then add or replace ---------- */
function qImportPreview() {
  const st = ui.qImport, m = st && S.mods[st.mid]; if (!m || !st.res) return '';
  const {questions, errors} = st.res, have = (m.questions || []).length, L = 'ABCDEF';
  return `${errors.length ? `<div class="card stack" style="background:var(--bad-soft, #fdecec);border-color:transparent"><b>${errors.length} row${errors.length === 1 ? ' needs' : 's need'} fixing. Nothing is added until every row is right.</b>
      <ul class="small" style="margin:0;padding-left:18px">${errors.slice(0, 40).map(e => `<li><b>Row ${e.row}</b>${e.text ? ` (${esc(e.text.slice(0, 60))})` : ''}: ${esc(e.error)}</li>`).join('')}${errors.length > 40 ? `<li>…and ${errors.length - 40} more</li>` : ''}</ul></div>` : ''}
    ${questions.length ? `<p><b>${questions.length} question${questions.length === 1 ? '' : 's'}</b> read from ${esc(st.name)}${errors.length ? ' (the rows above are not counted)' : ''}. The correct option is marked ✓.</p>
    <div class="tw" style="max-height:44vh;overflow:auto"><table><thead><tr><th class="n">Row</th><th>Question</th><th>Options</th></tr></thead><tbody>
      ${questions.map(q => `<tr><td class="n">${q.row}</td><td>${esc(q.text)}</td><td class="small">${q.options.map((o, i) => o.correct ? `<b style="color:var(--ok)">✓ ${esc(o.text)}</b>` : esc(o.text)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${!errors.length && questions.length ? `${have ? `<fieldset class="stack" style="border:0;padding:0;margin:0"><legend class="small"><b>This quiz already has ${have} question${have === 1 ? '' : 's'}.</b></legend>
        <label class="check"><input type="radio" name="qimode" value="add" checked> Add these after the existing questions</label><label class="check"><input type="radio" name="qimode" value="replace"> Replace the existing questions</label></fieldset>` : ''}
      <span class="err small" id="qierr" hidden></span><div class="row"><button class="btn primary" data-act="qImportGo">Add ${questions.length} question${questions.length === 1 ? '' : 's'}</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>` : ''}`;
}
Object.assign(A, {
  quizTemplate: () => download('quiz-questions-template.xlsx', XL.quizTemplate(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  qImport: d => { ui.qImport = {mid:d.id};
    openModal('Upload questions', `<div class="stack"><p class="muted small" style="margin:0">An Excel (.xlsx) or CSV file with the columns <b>Question Text</b>, options <b>A</b> to <b>F</b> (at least A and B) and <b>Correct Answer</b> (the letter of the right option). A <b>Sno</b> column is fine. Each row becomes a multiple-choice question worth 1 mark. <button class="link" data-act="quizTemplate">Download the template</button></p>
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
