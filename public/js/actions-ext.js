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
      <div class="fgrid"><div class="field full"><label for="chn">Name</label><input id="chn" name="name" type="text" value="${esc(c?.name || '')}" required></div><div class="field"><label for="chc">Company</label><input id="chc" name="company" type="text" value="${esc(c?.company || '')}"></div><div class="field"><label for="chd">Team</label><input id="chd" name="department" type="text" value="${esc(c?.department || '')}"></div></div>
      <div class="fgrid"><div class="field"><span class="lbl">Members</span>${picker('members', users.map(u => [u.id, fullname(u), [u.company, u.department].filter(Boolean).join(' · ')]), c?.members || [], {placeholder:'Search people'})}</div>
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
  ruleForm: d => { const r = d.id ? S.rules.find(x => x.id === d.id) : null; const depts = [...new Set([...C.teamsOf(S), ...S.users.map(u => u.department)].filter(Boolean))], comps = [...new Set(S.users.map(u => u.company).filter(Boolean))];
    openModal(r ? 'Edit rule' : 'New assignment rule', `<form data-form="rule" class="stack"><input type="hidden" name="id" value="${esc(r?.id || '')}">
      <div class="field"><label for="rln">Name</label><input id="rln" name="name" type="text" value="${esc(r?.name || '')}" placeholder="e.g. All new hires: Workplace Safety" required></div>
      <div class="fgrid"><div class="field"><label for="rmt">Applies to new users who</label><select id="rmt" name="matchType">${[['all', 'Are anyone'], ['department', 'Are in the team'], ['company', 'Are in the company'], ['cohort', 'Join the cohort']].map(([k, l]) => `<option value="${k}" ${r?.match.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="rmv">Value</label><input id="rmv" name="matchValue" list="rmvl" value="${esc(r?.match.type === 'cohort' ? '' : r?.match.value || '')}" placeholder="Department or company"><datalist id="rmvl">${[...depts, ...comps].map(x => `<option value="${esc(x)}">`).join('')}</datalist><select name="cohortValue" class="sel-sm" style="margin-top:6px" aria-label="Cohort"><option value="">Cohort (if chosen above)…</option>${S.cohorts.map(c => `<option value="${c.id}" ${r?.match.value === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
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
  exportAnalytics: () => { const a = ui.ana; const rows = C.learnerRows(S, h, {company:a.company || null, department:a.department || null, courses:a.course ? new Set([a.course]) : null});
    download(`training-report-${new Date().toISOString().slice(0, 10)}.csv`, csv([['Learner', 'Email', 'Company', 'Team', 'Course', 'Status', 'Progress %', 'Grade %', 'Due', 'Completed', 'Hours spent', 'Hours credited', 'Trainers'], ...rows.map(r => [fullname(r.u), r.u.email, r.u.company, r.u.department, r.c.fullname, STATUS[r.status][0], r.progress, r.total == null ? '' : r.total.toFixed(1), r.due ? new Date(r.due).toISOString().slice(0, 10) : '', r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '', r.hours.toFixed(2), r.credit, h.teachers(r.c.id).map(t => fullname(t)).join('; ')])])); },
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
  cohort: async (d, f) => { const r = await act('saveCohort', {id:d.id || null, name:d.name, company:d.company, department:d.department, members:picked(f, 'members'), leads:picked(f, 'leads'), trainers:picked(f, 'trainers'), courses:picked(f, 'courses')}, null, {silent:true, errEl:'coherr'}); if (r === FAIL) return; closeModal(); render(); toast(`Cohort saved${r.assigned ? `. ${r.assigned} assignments made by rules.` : ''}`); },
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
  const t = e.target, map = {teamcohort:['team', 'cohort'], teamfilter:['team', 'filter'], teamcourse:['team', 'course'], anagroup:['ana', 'group'], anacompany:['ana', 'company'], anadept:['ana', 'department'], anacourse:['ana', 'course']};
  if (map[t.id]) { const [o, k] = map[t.id]; ui[o][k] = t.value; if (t.id === 'anacompany') ui.ana.department = ''; render(); }
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
  const coItems = S.cohorts.map(c => [c.id, c.name, [c.company, c.department, `${c.members.length} members`].filter(Boolean).join(' · ')]);
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
