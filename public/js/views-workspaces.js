/* NB Academy front end · Team Lead workspace, Trainer workspace, approvals, analytics, assignment */
'use strict';

function distBar(sm) {
  const parts = [['completed', 'Completed', 'var(--ok)'], ['inprogress', 'In progress', 'var(--brand)'], ['notstarted', 'Not started', 'var(--line)'], ['overdue', 'Overdue', 'var(--bad)']];
  const t = sm.total || 1;
  return `<div class="dist" role="img" aria-label="${parts.map(([k, l]) => `${l} ${sm[k]}`).join(', ')}">${parts.map(([k, l, col]) => sm[k] ? `<i style="width:${sm[k] / t * 100}%;background:${col}" title="${l}: ${sm[k]}"></i>` : '').join('')}</div>
    <div class="legend">${parts.map(([k, l, col]) => `<span><i style="background:${col}"></i>${l} <b class="num">${sm[k]}</b></span>`).join('')}</div>`;
}
function kpis(sm, extra = []) {
  return `<div class="stats">${[['Completion rate', fmtPct(sm.completionRate)], ['Learners', sm.learners], ['Assignments', sm.total], ['Overdue', sm.overdue], ['At risk', sm.atRisk], ['Training hours', sm.creditHours.toFixed(1)], ['Time spent', fmtH(sm.hours)], ...extra].map(([l, v]) => `<div class="stat"><b>${v}</b><span class="muted small">${l}</span></div>`).join('')}</div>`;
}
function rowTable(rows, opts = {}) {
  return `<div class="tw"><table><thead><tr>${opts.select ? '<th><span class="sr">Select</span></th>' : ''}<th>Learner</th><th>Course</th><th>Status</th><th>Progress</th><th>Due</th><th class="n">Score</th><th>Risk</th><th>Last login</th>${opts.actions ? '<th></th>' : ''}</tr></thead><tbody id="${opts.id || 'rtab'}">
    ${rows.map(r => `<tr data-s="${esc((fullname(r.u) + ' ' + r.c.shortname + ' ' + r.c.fullname + ' ' + r.status).toLowerCase())}">${opts.select ? `<td><input type="checkbox" class="rsel" data-u="${r.u.id}" data-c="${r.c.id}" aria-label="Select ${esc(fullname(r.u))}"></td>` : ''}
      <td><div class="row" style="flex-wrap:nowrap">${avatar(r.u, 26)}<span><button class="link" data-go="record" data-id="${r.u.id}">${esc(fullname(r.u))}</button><br><span class="muted small">${esc(r.u.department || '')}</span></span></div></td>
      <td class="small"><b>${esc(r.c.shortname)}</b><br><span class="muted">${esc(r.c.fullname)}</span></td><td>${statusChip(r.status)}</td><td style="min-width:120px">${progressBar(r.progress)}</td>
      <td class="small">${r.due ? fmtDate(r.due) : '–'}</td><td class="n">${fmtPct(r.total)}</td><td class="small">${r.atRisk ? `<span class="chip ${r.status === 'overdue' ? 'bad' : 'warn'}">${esc(r.riskWhy)}</span>` : ''}</td><td class="small muted">${ago(r.u.lastLogin)}</td>
      ${opts.actions ? `<td>${r.status !== 'completed' ? `<button class="btn sm" data-act="nudge" data-u="${r.u.id}" data-c="${r.c.id}">Remind</button>` : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="10" class="empty">${opts.empty || 'Nothing to show.'}</td></tr>`}
    </tbody></table></div>`;
}

/* ---------- Team Lead workspace ---------- */
VIEWS.team = () => {
  if (!h.isTeamLead()) return notFound('The Team Lead workspace is for people mapped as team leads of a cohort.');
  const cohorts = h.cohortsLed(); const t = ui.team;
  if (!cohorts.length) return `${phead([['Team workspace']], 'Team workspace')}<div class="card empty">No team is mapped to you yet. An administrator maps team leads to cohorts in Site administration › Cohorts and mapping, or on your profile under Personas.</div>`;
  if (t.cohort && !cohorts.some(c => c.id === t.cohort)) t.cohort = '';
  const members = new Set(t.cohort ? cohorts.find(c => c.id === t.cohort).members : h.teamMembers());
  let rows = C.learnerRows(S, h, {users:members});
  const sm = C.summarize(rows);
  const courses = [...new Map(rows.map(r => [r.c.id, r.c])).values()];
  if (t.course) rows = rows.filter(r => r.c.id === t.course);
  if (t.filter === 'atrisk') rows = rows.filter(r => r.atRisk); else if (t.filter !== 'all') rows = rows.filter(r => r.status === t.filter);
  rows.sort((a, b) => (b.atRisk - a.atRisk) || ((a.due || 9e15) - (b.due || 9e15)));
  const perCourse = courses.map(c => { const rr = C.learnerRows(S, h, {users:members, courses:new Set([c.id])}); return {c, s:C.summarize(rr)}; });
  const perMember = [...members].map(id => h.user(id)).filter(Boolean).map(u => { const rr = C.learnerRows(S, h, {users:new Set([u.id])}); return {u, s:C.summarize(rr)}; });
  return `${phead([['Team workspace']], 'Team workspace')}
    <div class="spread" style="margin-bottom:16px"><div class="row"><label class="row small">Cohort <select id="teamcohort" class="sel-sm">${['<option value="">All my cohorts</option>', ...cohorts.map(c => `<option value="${c.id}" ${t.cohort === c.id ? 'selected' : ''}>${esc(c.name)} (${c.members.length})</option>`)].join('')}</select></label></div>
      <span class="muted small">You see only the cohorts mapped to you. Team leads cannot create courses, manage users or assign courses.</span></div>
    ${kpis(sm)}<div class="card" style="margin:16px 0 22px">${distBar(sm)}</div>
    <div class="spread" style="margin-bottom:10px"><h2>Team progress</h2><div class="row">
      <select id="teamfilter" class="sel-sm" aria-label="Filter">${[['all', 'All'], ['atrisk', 'At risk'], ['overdue', 'Overdue'], ['inprogress', 'In progress'], ['notstarted', 'Not started'], ['completed', 'Completed']].map(([k, l]) => `<option value="${k}" ${t.filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="teamcourse" class="sel-sm" aria-label="Course"><option value="">All courses</option>${courses.map(c => `<option value="${c.id}" ${t.course === c.id ? 'selected' : ''}>${esc(c.shortname)}</option>`).join('')}</select>
      <input type="search" data-filter="#teamtab" placeholder="Search" aria-label="Search team" style="max-width:180px">
      <button class="btn sm primary" data-act="nudgeSelected">Remind selected</button></div></div>
    ${rowTable(rows, {select:true, actions:true, id:'teamtab', empty:'No one matches this filter.'})}
    <div class="dash" style="margin-top:24px"><section class="stack"><h2>By course</h2><div class="tw"><table><thead><tr><th>Course</th><th class="n">Assigned</th><th class="n">Completed</th><th class="n">Overdue</th><th class="n">Completion</th><th class="n">Avg days to complete</th></tr></thead><tbody>
      ${perCourse.map(({c, s}) => `<tr><td>${esc(c.fullname)}</td><td class="n">${s.total}</td><td class="n">${s.completed}</td><td class="n">${s.overdue}</td><td class="n">${fmtPct(s.completionRate)}</td><td class="n">${s.avgDays == null ? '–' : s.avgDays.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="stack"><h2>By team member</h2><div class="tw"><table><thead><tr><th>Member</th><th class="n">Done</th><th class="n">Hours</th></tr></thead><tbody>${perMember.map(({u, s}) => `<tr><td><button class="link" data-go="record" data-id="${u.id}">${esc(fullname(u))}</button>${s.overdue ? ` <span class="chip bad">${s.overdue} overdue</span>` : ''}</td><td class="n">${s.completed}/${s.total}</td><td class="n">${s.creditHours.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></section></div>`;
};

/* ---------- Trainer workspace ---------- */
VIEWS.trainer = () => {
  const cids = S.enrol.filter(e => e.userId === S.me && ['trainer', 'editingteacher', 'teacher'].includes(e.role)).map(e => e.courseId).filter(id => h.course(id));
  if (!h.isTrainer()) return notFound('The Trainer workspace is for people with the Trainer persona.');
  const queue = cids.flatMap(cid => h.courseMods(cid).filter(m => (m.type === 'assign' || m.type === 'quiz') && h.needsGrading(m)).map(m => ({m, n:h.needsGrading(m), c:h.course(cid)})));
  const sessions = cids.flatMap(cid => h.courseMods(cid).filter(m => m.type === 'live' && m.start && m.start + (m.duration || 60) * 6e4 > now() - 7 * D).map(m => ({m, c:h.course(cid)}))).sort((a, b) => a.m.start - b.m.start);
  const overdue = C.learnerRows(S, h, {courses:new Set(cids)}).filter(r => r.status === 'overdue');
  const myCohorts = h.cohortsTrained();
  return `${phead([['Trainer workspace']], 'Trainer workspace')}
    <div class="spread" style="margin-bottom:16px"><span class="muted small">Courses and cohorts tagged to you. Trainers deliver and assess; administrators create and edit course content.</span><button class="btn primary" data-act="assignModal">Assign training</button></div>
    <h2 style="margin-bottom:10px">My courses</h2>
    <div class="tw" style="margin-bottom:24px"><table><thead><tr><th>Course</th><th class="n">Enrolled</th><th class="n">Completed</th><th class="n">Completion</th><th class="n">Overdue</th><th class="n">Avg days to complete</th><th class="n">Avg grade</th><th></th></tr></thead><tbody>
    ${cids.length ? '' : '<tr><td colspan="8" class="muted">No courses are tagged to you as a trainer yet. An administrator can add them on your profile under Personas.</td></tr>'}${cids.map(cid => { const c = h.course(cid), rr = C.learnerRows(S, h, {courses:new Set([cid])}), s = C.summarize(rr); const tot = rr.map(r => r.total).filter(x => x != null);
      return `<tr><td><button class="link" data-go="course" data-id="${c.id}">${esc(c.fullname)}</button><br><span class="muted small mono">${esc(c.shortname)}</span></td><td class="n">${s.total}</td><td class="n">${s.completed}</td><td class="n">${fmtPct(s.completionRate)}</td><td class="n">${s.overdue ? `<span style="color:var(--bad)">${s.overdue}</span>` : 0}</td><td class="n">${s.avgDays == null ? '–' : s.avgDays.toFixed(1)}</td><td class="n">${tot.length ? fmtPct(tot.reduce((a, b) => a + b, 0) / tot.length) : '–'}</td>
        <td><div class="tools"><button class="btn sm" data-go="creports" data-id="${c.id}">Analytics</button>${h.has('course:assign', c.id) && c.status === 'published' ? `<button class="btn sm" data-act="assignModal" data-kind="course" data-id="${c.id}">Assign</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>
    <div class="dash"><div class="stack" style="gap:22px">
      <section class="block"><header><h2>Grading queue</h2><span class="chip ${queue.length ? 'warn' : 'ok'}">${queue.reduce((a, b) => a + b.n, 0)} to grade</span></header><div class="tl">${queue.map(x => `<div class="tl-item"><span class="tl-time"></span>${icon(x.m.type, 'sm')}<div class="t"><button class="link" data-go="mod" data-id="${x.m.id}">${esc(x.m.name)}</button><div class="muted small">${esc(x.c.shortname)} · ${x.n} ${x.m.type === 'quiz' ? 'essay attempt' : 'submission'}${x.n > 1 ? 's' : ''}</div></div><div class="act"><button class="btn sm primary" data-go="mod" data-id="${x.m.id}">Grade</button></div></div>`).join('') || '<div class="empty">Nothing waiting to be graded.</div>'}</div></section>
      <section class="stack"><h2>Overdue learners in my courses</h2>${rowTable(overdue, {actions:true, id:'trover', empty:'No overdue learners.'})}<p class="muted small">Overdue courses are locked. Learners request access and an administrator approves it with a new due date.</p></section>
    </div><aside class="stack" style="gap:20px">
      <section class="block"><header><h3>Live sessions</h3></header><div class="bb stack" style="gap:12px">${sessions.map(x => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start">${icon('live', 'sm')}<div><button class="link" data-go="mod" data-id="${x.m.id}">${esc(x.m.name)}</button><div class="muted small">${fmtDate(x.m.start)} · ${x.m.mode === 'ilt' ? 'In person' : 'Online'} · ${x.m.registered || 0} registered</div></div></div>`).join('') || '<p class="muted small">No upcoming sessions.</p>'}</div></section>
      <section class="block"><header><h3>My cohorts</h3></header><div class="bb stack" style="gap:10px">${myCohorts.map(c => `<div><b>${esc(c.name)}</b><div class="muted small">${c.members.length} members · ${c.members.slice(0, 4).map(id => esc(h.user(id)?.firstname || '')).join(', ')}${c.members.length > 4 ? '…' : ''}</div></div>`).join('') || '<p class="muted small">No cohorts mapped to you.</p>'}</div></section></aside></div>`;
};

/* ---------- Assign training (trainers within scope; administrators globally) ---------- */
function assignForm(kind, id) {
  const global = h.has('course:assign', null);
  const courses = S.courses.filter(c => c.status === 'published' && (global || h.has('course:assign', c.id)));
  const paths = S.paths.filter(p => global || p.courses.every(cid => h.has('course:assign', cid)));
  const scope = h.trainerScope();
  const learners = S.users.filter(u => !u.suspended && (!u.admin || u.personas?.includes('learner')) && (global || scope.has(u.id)));
  const cohorts = S.cohorts.filter(c => global || c.trainers.includes(S.me));
  const k = kind || 'course';
  openModal('Assign training', `<form data-form="assign" class="stack">
    <div class="fgrid"><div class="field"><label for="ak">What</label><select id="ak" name="kind"><option value="course" ${k === 'course' ? 'selected' : ''}>Course</option>${paths.length ? `<option value="path" ${k === 'path' ? 'selected' : ''}>Learning path</option>` : ''}</select></div>
      <div class="field"><label for="aid">Choose</label><select id="aid" name="id">${courses.map(c => `<option value="${c.id}" data-k="course" ${k === 'course' && id === c.id ? 'selected' : ''}>${esc(c.shortname)} · ${esc(c.fullname)}</option>`).join('')}${paths.map(p => `<option value="${p.id}" data-k="path" ${k === 'path' && id === p.id ? 'selected' : ''}>Path · ${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="adue">Due date</label><input id="adue" name="due" type="date" value="${toDateInput(now() + 14 * D)}" min="${toDateInput(now() + D)}"></div>
      <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="mandatory" checked> Mandatory</label></div>
    ${cohorts.length ? `<div class="field"><span class="lbl">Cohorts</span>${picker('cohorts', cohorts.map(c => [c.id, c.name, `${c.members.length} members`]), [], {placeholder:'Search cohorts'})}</div>` : ''}
    <div class="field"><span class="lbl">Learners${global ? '' : ' in your scope'}</span>${picker('users', learners.map(u => [u.id, fullname(u), [u.department, u.email].filter(Boolean).join(' · ')]), [], {placeholder:'Search learners'})}</div>
    <p class="muted small">Learners get an in-app notification and an email. Overdue courses lock automatically after the due date.</p>
    <p class="err" id="asserr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Assign</button></div></form>`, true);
}

/* ---------- Approvals: overdue access requests ---------- */
VIEWS.approvals = (p) => {
  if (!h.has('access:approve')) return notFound();
  const tab = p.tab || 'pending';
  const list = S.accessRequests.filter(r => tab === 'pending' ? r.status === 'pending' : r.status !== 'pending').sort((a, b) => b.time - a.time);
  return `${phead([['Approvals']], 'Overdue access requests')}
    <nav class="tabs"><button class="tab ${tab === 'pending' ? 'on' : ''}" data-go="approvals" data-tab="pending">Pending <span class="chip">${S.accessRequests.filter(r => r.status === 'pending').length}</span></button><button class="tab ${tab === 'done' ? 'on' : ''}" data-go="approvals" data-tab="done">Decided</button></nav>
    <div class="stack">${list.map(r => { const u = h.user(r.userId), c = h.course(r.courseId), e = c && h.enrolOf(c.id, r.userId);
      return `<article class="card stack" style="gap:10px"><div class="spread"><div class="row">${avatar(u, 36)}<div><b>${esc(fullname(u))}</b><div class="muted small">${esc(u?.department || '')} · requested ${ago(r.time)}</div></div></div>${r.status === 'pending' ? '<span class="chip warn">Pending</span>' : r.status === 'approved' ? '<span class="chip ok">Approved</span>' : '<span class="chip bad">Rejected</span>'}</div>
        <div class="fgrid"><div><span class="eyebrow">Course</span><div><b>${esc(c?.fullname || '')}</b> <span class="muted small mono">${esc(c?.shortname || '')}</span></div></div><div><span class="eyebrow">Progress kept</span><div>${c ? progressBar(h.progress(c.id, r.userId)) : ''}</div></div>
          <div><span class="eyebrow">Original due date</span><div>${fmtDate(e?.due && r.status === 'pending' ? e.due : r.newDue ? null : e?.due)}</div></div><div><span class="eyebrow">Earlier extensions</span><div>${e?.extensions || 0}</div></div></div>
        <div><span class="eyebrow">Justification</span><p style="white-space:pre-wrap">${esc(r.reason)}</p></div>
        ${r.status === 'pending' ? `<form data-form="decideAccess" class="fgrid" style="border-top:1px solid var(--line);padding-top:12px"><input type="hidden" name="id" value="${r.id}">
          <div class="field"><label for="nd${r.id}">New due date (if approved)</label><input id="nd${r.id}" name="due" type="date" value="${toDateInput(now() + 7 * D)}" min="${toDateInput(now() + D)}"></div>
          <div class="field"><label for="rm${r.id}">Remarks</label><input id="rm${r.id}" name="remarks" type="text" placeholder="Required when rejecting"></div>
          <div class="row full"><button class="btn primary" type="submit" name="decision" value="approve">Approve and unlock</button><button class="btn danger" type="submit" name="decision" value="reject">Reject</button></div></form>`
        : `<p class="small muted">${r.status === 'approved' ? `Approved by ${esc(fullname(r.decidedBy))} on ${fmtDate(r.decidedAt)}. New due date ${fmtDate(r.newDue)}.` : `Rejected by ${esc(fullname(r.decidedBy))} on ${fmtDate(r.decidedAt)}.`}${r.remarks ? ` Remarks: ${esc(r.remarks)}` : ''}</p>`}</article>`; }).join('') || `<div class="card empty">${tab === 'pending' ? 'No requests are waiting.' : 'No decided requests yet.'}</div>`}</div>`;
};

/* ---------- Global analytics with drill-down ---------- */
VIEWS.analytics = () => {
  if (!h.has('analytics:site') && !h.isAdmin()) return currentMode() === 'admin' && h.has('access:approve') ? VIEWS.approvals({}) : notFound();
  const a = ui.ana;
  let rows = C.learnerRows(S, h, {company:a.company || null, department:a.department || null, courses:a.course ? new Set([a.course]) : null});
  const all = C.summarize(rows);
  const learners = S.users.filter(u => !u.admin);
  const active = learners.filter(u => u.lastLogin && now() - u.lastLogin < 30 * D).length;
  const certs = S.certIssued.filter(c => !c.expires || c.expires > now());
  const expiring = certs.filter(c => c.expires && c.expires > now() && c.expires - now() < 60 * D).length;
  const companies = [...new Set(S.users.map(u => u.company).filter(Boolean))].sort(), depts = [...new Set(S.users.filter(u => !a.company || u.company === a.company).map(u => u.department).filter(Boolean))].sort();
  const grp = a.group;
  const keyOf = {company:r => r.u.company || '(none)', department:r => `${r.u.company || '—'} › ${r.u.department || '(none)'}`, course:r => `${r.c.shortname} · ${r.c.fullname}`, learner:r => fullname(r.u),
    trainer:r => h.teachers(r.c.id).map(t => fullname(t)).join(', ') || '(no trainer)'}[grp];
  const groups = new Map(); for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const table = [...groups.entries()].map(([k, rr]) => ({k, s:C.summarize(rr)})).sort((x, y) => y.s.total - x.s.total);
  return `${phead([['Analytics']], 'Platform analytics')}
    <div class="stats" style="margin-bottom:16px">${[['Users', learners.length], ['Active in last 30 days', active], ['Assignments', all.total], ['Completion rate', fmtPct(all.completionRate)], ['Overdue', all.overdue], ['Certificates valid', certs.length], ['Expiring in 60 days', expiring], ['Training hours', all.creditHours.toFixed(1)]].map(([l, v]) => `<div class="stat"><b>${v}</b><span class="muted small">${l}</span></div>`).join('')}</div>
    <div class="card" style="margin-bottom:20px">${distBar(all)}</div>
    <div class="spread" style="margin-bottom:12px"><div class="row">
      <label class="row small">Group by <select id="anagroup" class="sel-sm">${[['company', 'Company'], ['department', 'Department'], ['trainer', 'Trainer'], ['course', 'Course'], ['learner', 'Individual learner']].map(([k, l]) => `<option value="${k}" ${grp === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <select id="anacompany" class="sel-sm" aria-label="Company"><option value="">All companies</option>${companies.map(x => `<option ${a.company === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select id="anadept" class="sel-sm" aria-label="Department"><option value="">All departments</option>${depts.map(x => `<option ${a.department === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select id="anacourse" class="sel-sm" aria-label="Course"><option value="">All courses</option>${S.courses.map(c => `<option value="${c.id}" ${a.course === c.id ? 'selected' : ''}>${esc(c.shortname)}</option>`).join('')}</select></div>
      <button class="btn sm" data-act="exportAnalytics">Export CSV</button></div>
    <div class="tw" style="margin-bottom:24px"><table><thead><tr><th>${{company:'Company', department:'Department', trainer:'Trainer', course:'Course', learner:'Learner'}[grp]}</th><th class="n">Learners</th><th class="n">Assignments</th><th class="n">Completed</th><th class="n">In progress</th><th class="n">Not started</th><th class="n">Overdue</th><th>Completion</th><th class="n">Hours</th></tr></thead><tbody>
      ${table.map(({k, s}) => `<tr><td>${grp === 'learner' ? `<button class="link" data-go="record" data-id="${groups.get(k)[0].u.id}">${esc(k)}</button>` : esc(k)}</td><td class="n">${s.learners}</td><td class="n">${s.total}</td><td class="n">${s.completed}</td><td class="n">${s.inprogress}</td><td class="n">${s.notstarted}</td><td class="n">${s.overdue ? `<b style="color:var(--bad)">${s.overdue}</b>` : 0}</td><td style="min-width:140px"><div class="prog"><div class="bar"><i style="width:${s.completionRate}%"></i></div><span class="num">${fmtPct(s.completionRate)}</span></div></td><td class="n">${s.creditHours.toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No data for this filter.</td></tr>'}
    </tbody></table></div>
    <h2 style="margin-bottom:10px">Individual detail</h2>${rowTable(rows.sort((x, y) => (y.atRisk - x.atRisk) || x.u.firstname.localeCompare(y.u.firstname)), {id:'anarows'})}`;
};
