/* NB Academy front end · course tabs: participants, groups, grades, badges, reports, settings */
'use strict';

VIEWS.participants = (p) => {
  const c = h.course(p.id); if (!c || !h.canView(c.id) || !h.has('course:viewparticipants', c.id)) return notFound();
  const manage = h.has('course:enrol', c.id), teach = h.has('grade:viewall', c.id), assign = h.has('course:assign', c.id);
  let rows = h.enrolled(c.id);
  const grp = ui.grp && h.groups(c.id).find(g => g.id === ui.grp); if (grp) rows = rows.filter(x => grp.members.includes(x.u.id));
  rows.sort((a, b) => (a.e.role === 'student') - (b.e.role === 'student') || a.u.firstname.localeCompare(b.u.firstname));
  const roleSel = (e) => `<select class="sel-sm" data-change="changeRole" data-cid="${c.id}" data-u="${e.userId}" aria-label="Role">${S.roles.filter(r => r.id !== 'teamlead' && r.id !== 'manager').map(r => `<option value="${r.id}" ${r.id === e.role ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
  return courseShell(c, 'participants', `<div class="spread" style="margin-bottom:14px"><p class="muted"><span class="num">${rows.length}</span> participants</p>
      <div class="row">${groupFilter(c)}<input type="search" id="psearch" data-filter="#plist" placeholder="Search participants" aria-label="Search participants" style="max-width:200px">${assign && c.status === 'published' ? `<button class="btn primary" data-act="assignModal" data-kind="course" data-id="${c.id}">Assign with due date</button>` : ''}${manage ? `<button class="btn" data-act="enrolModal" data-id="${c.id}">Enrol users</button>` : ''}</div></div>
    <div class="tw"><table><thead><tr><th>Name</th><th>Role</th><th>Groups</th>${teach ? '<th>Status</th><th>Progress</th><th>Due</th>' : ''}${manage || assign ? '<th></th>' : ''}</tr></thead><tbody id="plist">
    ${rows.map(({e, u}) => { const learner = h.isLearner(c.id, u.id); const st = learner ? h.status(c.id, u.id) : null;
      return `<tr data-s="${esc((fullname(u) + ' ' + u.email).toLowerCase())}"><td><div class="row" style="flex-wrap:nowrap">${avatar(u, 30)}<span><button class="link" data-go="profile" data-id="${u.id}">${esc(fullname(u))}</button><br><span class="muted small">${esc(u.email)}</span></span></div></td>
      <td>${manage && u.id !== S.me ? roleSel(e) : `<span class="chip ${e.role === 'student' ? '' : 'brand'}">${esc(roleName(e.role))}</span>`}</td>
      <td class="small">${h.groupsOf(c.id, u.id).map(g => esc(g.name)).join(', ') || '<span class="muted">–</span>'}</td>
      ${teach ? `<td>${st ? statusChip(st) : ''}${e.mandatory && learner ? ' <span class="chip warn">Mandatory</span>' : ''}</td><td style="min-width:140px">${learner ? progressBar(h.progress(c.id, u.id)) : ''}</td><td class="small">${learner ? (e.due ? fmtDate(e.due) : '<span class="muted">No due date</span>') : ''}</td>` : ''}
      ${manage || assign ? `<td><div class="tools">${assign && learner ? `<button class="btn sm ghost" data-act="setDue" data-cid="${c.id}" data-u="${u.id}">Due date</button>${st !== 'completed' ? `<button class="btn sm ghost" data-act="nudge" data-u="${u.id}" data-c="${c.id}">Remind</button>` : ''}` : ''}${manage && u.id !== S.me ? `<button class="btn sm ghost danger" data-act="unenrol" data-cid="${c.id}" data-u="${u.id}">Unenrol</button>` : ''}</div></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="7" class="empty">No participants match.</td></tr>'}
    </tbody></table></div>`);
};

VIEWS.groups = (p) => {
  const c = h.course(p.id); if (!c || !h.has('group:manage', c.id)) return notFound();
  const gs = h.groups(c.id), people = h.enrolled(c.id).map(x => x.u);
  const none = people.filter(u => !gs.some(g => g.members.includes(u.id)));
  return courseShell(c, 'groups', `<div class="dash"><div class="stack">${gs.map(g => { const out = people.filter(u => !g.members.includes(u.id));
      return `<section class="block"><header><h2>${esc(g.name)}</h2><div class="tools"><span class="chip">${g.members.length} members</span><button class="btn sm ghost" data-act="renameGroup" data-id="${g.id}" data-cid="${c.id}">Rename</button><button class="btn sm ghost danger" data-act="deleteGroup" data-id="${g.id}">Delete</button></div></header>
        <div class="bb stack" style="gap:12px"><div class="fchips">${g.members.map(id => h.user(id)).filter(Boolean).map(u => `<span class="fchip">${avatar(u, 22)}<span>${esc(fullname(u))}</span><button class="xbtn" style="font-size:1rem;padding:0 4px" data-act="groupMember" data-g="${g.id}" data-u="${u.id}" data-on="" aria-label="Remove ${esc(fullname(u))}">×</button></span>`).join('') || '<span class="muted small">No members yet.</span>'}</div>
        ${out.length ? `<form data-form="addMember" class="row"><input type="hidden" name="gid" value="${g.id}"><select name="userId" class="sel-sm" aria-label="Add member">${out.map(u => `<option value="${u.id}">${esc(fullname(u))}</option>`).join('')}</select><button class="btn sm" type="submit">Add to group</button></form>` : ''}</div></section>`; }).join('') || '<div class="card empty">No groups yet. Groups let you filter participants, submissions and grades by cohort or batch.</div>'}</div>
    <aside class="stack"><form data-form="newGroup" class="block"><header><h3>Create group</h3></header><div class="bb stack" style="gap:10px"><input type="hidden" name="cid" value="${c.id}"><label class="lbl" for="gname">Group name</label><input id="gname" name="name" type="text" placeholder="e.g. Batch C · Delhi" required><button class="btn primary" type="submit">Create group</button></div></form>
      <section class="block"><header><h3>Not in any group</h3><span class="chip">${none.length}</span></header><div class="bb small">${none.map(u => esc(fullname(u))).join(', ') || '<span class="muted">Everyone is in a group.</span>'}</div></section></aside></div>`);
};

VIEWS.grades = (p) => {
  const c = h.course(p.id); if (!c || !h.canView(c.id)) return notFound();
  const items = h.gradeable(c.id).filter(m => m.visible || h.has('course:viewhidden', c.id));
  if (h.has('grade:viewall', c.id)) {
    let st = h.students(c.id); const grp = ui.grp && h.groups(c.id).find(g => g.id === ui.grp); if (grp) st = st.filter(s => grp.members.includes(s.id));
    const avg = m => { const v = st.map(s => h.gradeFor(m, s.id)).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const tots = st.map(s => h.courseTotal(c.id, s.id)).filter(x => x != null);
    return courseShell(c, 'grades', `<div class="spread" style="margin-bottom:14px"><h2>Grader report</h2>${groupFilter(c)}</div>
      <div class="tw"><table><thead><tr><th>Student</th>${items.map(m => `<th class="n"><button class="link" style="text-transform:none;letter-spacing:0;font-weight:650" data-go="mod" data-id="${m.id}">${esc(m.name)}</button><br><span class="muted" style="font-weight:500">${C.TYPES[m.type].label} / ${fmtG(h.itemMax(m))}</span></th>`).join('')}<th class="n">Course total</th></tr></thead><tbody>
      ${st.map(s => `<tr><td><div class="row" style="flex-wrap:nowrap">${avatar(s, 26)}<span>${esc(fullname(s))}</span></div></td>${items.map(m => { const g = h.gradeFor(m, s.id); const ng = m.type === 'assign' && h.subOf(m.id, s.id)?.status === 'submitted' && g == null && h.has('grade:edit', c.id);
        return `<td class="n">${ng ? `<button class="link" data-go="grader" data-id="${m.id}" data-u="${s.id}">Grade</button>` : fmtG(g)}</td>`; }).join('')}<td class="n"><b>${h.courseTotal(c.id, s.id) == null ? '–' : h.courseTotal(c.id, s.id).toFixed(1) + '%'}</b></td></tr>`).join('') || `<tr><td colspan="${items.length + 2}" class="empty">No students.</td></tr>`}
      <tr class="total"><td>Overall average</td>${items.map(m => `<td class="n">${fmtG(avg(m))}</td>`).join('')}<td class="n">${tots.length ? (tots.reduce((a, b) => a + b, 0) / tots.length).toFixed(1) + '%' : '–'}</td></tr>
      </tbody></table></div><p class="muted small" style="margin-top:8px">Course total uses natural aggregation: the sum of grades received divided by the sum of maximum grades for graded items, as a percentage.</p>`);
  }
  const tot = h.courseTotal(c.id, S.me);
  return courseShell(c, 'grades', `<div class="tw"><table><thead><tr><th>Grade item</th><th class="n">Grade</th><th class="n">Range</th><th class="n">Percentage</th><th>Feedback</th></tr></thead><tbody>
    ${items.filter(m => m.visible).map(m => { const g = h.gradeFor(m, S.me), sb = m.type === 'assign' ? h.subOf(m.id, S.me) : null, mx = h.itemMax(m);
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${icon(m.type, 'sm')}<button class="link" data-go="mod" data-id="${m.id}">${esc(m.name)}</button></div></td><td class="n">${fmtG(g)}</td><td class="n">0–${mx}</td><td class="n">${g == null ? '–' : (g / mx * 100).toFixed(1) + ' %'}</td><td class="small" style="max-width:320px">${esc(sb?.feedback || '')}</td></tr>`; }).join('')}
    <tr class="total"><td>Course total</td><td class="n" colspan="3">${tot == null ? '–' : tot.toFixed(1) + ' %'}</td><td></td></tr></tbody></table></div>`);
};

VIEWS.badges = (p) => {
  const c = h.course(p.id); if (!c || !h.canView(c.id)) return notFound();
  const manage = h.has('badges:manage', c.id), award = h.has('badges:award', c.id), learner = h.isLearner(c.id);
  const bs = S.badges.filter(b => b.courseId === c.id);
  const crit = b => b.criteria.type === 'course' ? 'Complete every activity in the course' : b.criteria.type === 'manual' ? 'Awarded by a teacher' : `Complete: ${b.criteria.mods.map(id => S.mods[id]?.name).filter(Boolean).map(esc).join(', ')}`;
  return courseShell(c, 'badges', `<div class="spread" style="margin-bottom:16px"><p class="muted">${bs.length} badge${bs.length === 1 ? '' : 's'} in this course</p>${manage ? `<button class="btn primary" data-act="badgeForm" data-cid="${c.id}">Add a new badge</button>` : ''}</div>
    <div class="badges">${bs.map(b => { const got = S.badgeIssued.find(i => i.badgeId === b.id && i.userId === S.me); const n = S.badgeIssued.filter(i => i.badgeId === b.id).length;
      return `<div class="bcard ${learner && !got ? 'locked' : ''}">${medal(b)}<h3>${esc(b.name)}</h3><p class="small muted">${esc(b.description)}</p><p class="small"><b>Criteria:</b> ${crit(b)}</p>
        ${learner ? (got ? `<span class="chip ok">Earned ${fmtDateOnly(got.time)}</span>` : '<span class="chip">Not earned yet</span>') : `<span class="chip">${n} recipient${n === 1 ? '' : 's'}</span>`}
        ${award || manage ? `<div class="tools" style="justify-content:center">${award ? `<button class="btn sm" data-act="badgeRecipients" data-id="${b.id}">Recipients</button>` : ''}${manage ? `<button class="btn sm ghost" data-act="badgeForm" data-cid="${c.id}" data-id="${b.id}">Edit</button><button class="btn sm ghost danger" data-act="deleteBadge" data-id="${b.id}">Delete</button>` : ''}</div>` : ''}</div>`; }).join('') || '<div class="card empty">No badges in this course yet.</div>'}</div>`);
};

VIEWS.creports = (p) => {
  const c = h.course(p.id); if (!c || !h.has('report:view', c.id)) return notFound();
  const st = h.students(c.id), ms = h.courseMods(c.id).filter(h.trackable);
  const rows = C.learnerRows(S, h, {courses:new Set([c.id])}), sm = C.summarize(rows);
  const funnel = C.dropOff(S, h, c.id);
  const logs = S.logs.filter(l => l.cid === c.id).sort((a, b) => b.t - a.t);
  const maxDrop = funnel.reduce((best, f, i) => { const prev = i ? funnel[i - 1].done : st.length; const drop = prev - f.done; return drop > best.drop ? {drop, f} : best; }, {drop:0, f:null});
  return courseShell(c, 'creports', `<div class="stats" style="margin-bottom:16px">${[['Enrolled learners', st.length], ['Completed', sm.completed], ['Completion rate', fmtPct(sm.completionRate)], ['Overdue', sm.overdue], ['Avg days to complete', sm.avgDays == null ? '–' : sm.avgDays.toFixed(1)], ['Avg time spent', st.length ? fmtH(sm.hours / st.length) : '–']].map(([l, v]) => `<div class="stat"><b>${v}</b><span class="muted small">${l}</span></div>`).join('')}</div>
    <div class="card" style="margin-bottom:22px">${distBar(sm)}</div>
    <h2 style="margin-bottom:6px">Drop-off by activity</h2><p class="muted small" style="margin-bottom:10px">How many learners completed each activity, in course order.${maxDrop.f ? ` The biggest drop is at <b>${esc(maxDrop.f.m.name)}</b> (${maxDrop.drop} fewer learners than the step before).` : ''}</p>
    <div class="card cres" style="margin-bottom:22px;max-width:none">${funnel.map(f => `<div class="rowb" style="grid-template-columns:minmax(0,1fr) 110px"><div class="stack" style="gap:3px"><span class="small row" style="gap:6px;flex-wrap:nowrap">${icon(f.m.type, 'sm')}${esc(f.m.name)}</span><div class="barw"><i style="width:${f.of ? f.done / f.of * 100 : 0}%;background:${maxDrop.f && maxDrop.f.m.id === f.m.id ? 'var(--bad)' : 'var(--brand)'}"></i></div></div><span class="num small">${f.done} of ${f.of} · ${fmtPct(f.of ? f.done / f.of * 100 : 0)}</span></div>`).join('') || '<p class="muted">No trackable activities.</p>'}</div>
    <h2 style="margin-bottom:10px">Activity completion</h2>
    <div class="tw"><table><thead><tr><th>Learner</th><th>Status</th>${ms.map(m => `<th title="${esc(m.name)}" style="text-align:center">${icon(m.type, 'sm')}</th>`).join('')}<th class="n">Progress</th><th class="n">Time</th></tr></thead><tbody>
    ${st.map(s => `<tr><td style="white-space:nowrap"><button class="link" data-go="record" data-id="${s.id}">${esc(fullname(s))}</button></td><td>${statusChip(h.status(c.id, s.id))}</td>${ms.map(m => `<td style="text-align:center" title="${esc(m.name)}">${h.isDone(m, s.id) ? '<span class="okc" aria-label="Done">✓</span>' : '<span class="muted" aria-label="Not done">·</span>'}</td>`).join('')}<td class="n">${h.progress(c.id, s.id)}%</td><td class="n">${fmtH(h.hours(c.id, s.id))}</td></tr>`).join('') || `<tr><td colspan="${ms.length + 4}" class="empty">No learners enrolled.</td></tr>`}
    </tbody></table></div><p class="muted small" style="margin:8px 0 24px">Columns follow course order: ${ms.map(m => esc(m.name)).join(' · ')}</p>
    ${h.courseMods(c.id).filter(m => m.type === 'quiz').map(m => { const ia = C.itemAnalysis(h.S, m); return ia.attempts ? `<div class="spread card" style="margin-bottom:10px"><span>${icon('quiz', 'sm')} <b>${esc(m.name)}</b> · ${ia.attempts} attempts · average ${fmtPct(ia.average)}${ia.passRate != null ? ` · pass rate ${fmtPct(ia.passRate)}` : ''}</span><button class="btn sm" data-go="mod" data-id="${m.id}">Item analysis</button></div>` : ''; }).join('')}
    <div class="spread" style="margin:24px 0 10px"><h2>Course logs</h2><input type="search" id="clsearch" data-filter="#cllist" placeholder="Filter logs" aria-label="Filter logs" style="max-width:240px"></div>
    <div class="tw"><table><thead><tr><th>Time</th><th>User</th><th>Event</th></tr></thead><tbody id="cllist">${logs.slice(0, 200).map(l => `<tr data-s="${esc((fullname(l.uid) + ' ' + l.ev).toLowerCase())}"><td class="small num" style="white-space:nowrap">${fmtDate(l.t)}</td><td>${esc(fullname(l.uid))}</td><td>${esc(l.ev)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No events logged yet.</td></tr>'}</tbody></table></div>`);
};

VIEWS.csettings = (p) => {
  const c = h.course(p.id); if (!c) return notFound();
  const upd = h.has('course:update', c.id), bk = h.has('backup:course', c.id);
  if (!upd && !bk) return notFound();
  const versions = S.courseVersions.filter(v => v.courseId === c.id).sort((a, b) => b.version - a.version);
  const inprog = h.students(c.id).filter(u => ['inprogress', 'overdue'].includes(h.status(c.id, u.id))).length;
  return courseShell(c, 'csettings', `<div class="stack" style="max-width:820px;gap:22px">
    ${upd ? `<section class="card stack"><div class="spread"><h2>Status and versions</h2>${c.status === 'draft' ? '<span class="chip warn">Draft</span>' : c.status === 'archived' ? '<span class="chip">Archived</span>' : `<span class="chip ok">Published · version ${c.version || 1}</span>`}</div>
      ${c.status === 'archived' ? `<p>Archived courses are hidden from new enrolments, assignment rules and the library. Learners keep their history and certificates.</p><div><button class="btn" data-act="archiveCourse" data-id="${c.id}" data-on="">Unarchive</button></div>`
      : `<form data-form="publish" class="stack"><input type="hidden" name="cid" value="${c.id}"><p class="muted small">${c.status === 'draft' ? 'Publishing makes the course visible in the library and assignable.' : 'Publishing saves a snapshot of the current content as a new version, so you can roll back later.'}</p>
        <div class="field"><label for="pvn">What changed?</label><input id="pvn" name="notes" type="text" placeholder="${c.status === 'draft' ? 'First version' : 'e.g. New pivot table exercise in Week 3'}"></div>
        ${c.status !== 'draft' ? `<fieldset class="stack" style="border:0;padding:0;gap:6px"><legend class="lbl">Learners already in progress (${inprog})</legend>
          <label class="check"><input type="radio" name="mode" value="keep" checked> Keep their progress and continue on the updated content</label>
          <label class="check"><input type="radio" name="mode" value="restart"> Restart them on the new version (their earlier attempts are archived)</label></fieldset>` : ''}
        <div class="row"><button class="btn primary" type="submit">${c.status === 'draft' ? 'Publish course' : 'Publish new version'}</button>${c.status === 'published' ? `<button class="btn" type="button" data-act="archiveCourse" data-id="${c.id}" data-on="1">Archive course</button>` : ''}</div></form>`}
      ${versions.length ? `<h3 style="margin-top:8px">Version history</h3><div class="tw"><table><thead><tr><th>Version</th><th>Published</th><th>By</th><th>Notes</th><th></th></tr></thead><tbody>${versions.map(v => `<tr><td class="num">v${v.version}</td><td class="small">${fmtDate(v.time)}</td><td class="small">${esc(fullname(v.by))}</td><td class="small">${esc(v.notes || '')}${v.mode === 'restart' ? ' <span class="chip">Learners restarted</span>' : ''}</td><td>${v.mods && h.canEdit(c.id) ? `<button class="btn sm ghost" data-act="restoreVersion" data-id="${v.id}">Roll back to this</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>` : ''}
    ${upd ? `<form data-form="courseSettings" class="card stack"><input type="hidden" name="cid" value="${c.id}"><h2>Course settings</h2>
    <div class="fgrid"><div class="field full"><label for="cf1">Course full name</label><input id="cf1" name="fullname" type="text" value="${esc(c.fullname)}" required></div>
    <div class="field"><label for="cf2">Course short name</label><input id="cf2" name="shortname" type="text" value="${esc(c.shortname)}" required></div>
    <div class="field"><label for="cf3">Course category</label><select id="cf3" name="catId">${S.categories.map(k => `<option value="${k.id}" ${k.id === c.catId ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="cf5">Training hours credited on completion</label><input id="cf5" name="hours" type="number" min="0" step="0.25" value="${c.hours || 0}"></div>
    <div class="field full"><label for="cf4">Course summary</label><textarea id="cf4" name="summary" rows="4">${esc(c.summary)}</textarea></div>
    <label class="check full"><input type="checkbox" name="visible" ${c.visible ? 'checked' : ''}> Course visible to learners</label>
    <label class="check full"><input type="checkbox" name="selfenrol" ${c.selfenrol !== false ? 'checked' : ''}> Optional course: learners can enrol themselves from the library</label>
    <label class="check full"><input type="checkbox" name="sequential" ${c.sequential ? 'checked' : ''}> Step-by-step: each activity unlocks when the previous one is complete</label></div>
    <div class="row"><button class="btn primary" type="submit">Save and display</button>${h.has('course:delete') ? `<button class="btn danger" type="button" data-act="deleteCourse" data-id="${c.id}">${c.status === 'draft' ? 'Delete draft' : 'Delete course'}</button>` : ''}</div></form>` : ''}
    ${bk ? `<section class="card stack"><h2>Backup</h2><p class="muted">Save this course's structure, activities, questions and badges to a file. Include user data to also keep enrolments, groups, submissions, quiz attempts and forum posts.</p>
      <label class="check"><input type="checkbox" id="bkusers" ${h.has('grade:viewall', c.id) ? '' : 'disabled'}> Include enrolled users and their data</label>
      <div class="row"><button class="btn primary" data-act="backup" data-id="${c.id}">Create backup</button></div><p class="muted small">Restore backups from Site administration › Restore course.</p></section>` : ''}</div>`);
};
