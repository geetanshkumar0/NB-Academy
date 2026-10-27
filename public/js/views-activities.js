/* NB Academy front end · course page and all activity types */
'use strict';

function courseTabs(c) {
  const t = [['course', 'Course']];
  if (h.has('course:viewparticipants', c.id)) t.push(['participants', 'Participants']);
  if (h.has('group:manage', c.id)) t.push(['groups', 'Groups']);
  t.push(['grades', 'Grades']);
  if (S.badges.some(b => b.courseId === c.id) || h.has('badges:manage', c.id)) t.push(['badges', 'Badges']);
  if ((S.chats || []).some(x => x.courseId === c.id) || h.canManageChats(c.id)) t.push(['chats', 'Group chats']);
  if (h.has('report:view', c.id)) t.push(['creports', 'Reports']);
  if (h.has('course:update', c.id) || h.has('backup:course', c.id)) t.push(['csettings', 'Settings']);
  return t;
}
function courseShell(c, tab, body, withIndex) {
  return `${phead([['My courses', 'mycourses'], [h.cat(c.catId)?.name || 'Courses', 'home'], [c.shortname]], c.fullname)}
    <nav class="tabs" aria-label="Course">${courseTabs(c).map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-go="${k}" data-id="${c.id}">${l}</button>`).join('')}</nav>
    ${withIndex ? `<div class="cgrid">${courseIndex(c)}<div style="min-width:0">${body}</div></div>` : body}`;
}
function courseIndex(c) {
  const st = h.isLearner(c.id);
  return `<details class="cindex" ${window.innerWidth > 900 ? 'open' : ''}><summary>Course index</summary><ul>${c.sections.map(s => `<li><button class="sname" data-act="scrollTo" data-t="sec-${s.id}">${esc(s.name)}</button></li>` +
    s.mods.map(id => S.mods[id]).filter(m => m && m.type !== 'label').map(m => `<li><button class="mname" data-go="mod" data-id="${m.id}">${st && h.trackable(m) ? `<span class="dot ${h.isDone(m, S.me) ? 'done' : ''}"></span>` : ''}<span>${esc(m.name)}</span></button></li>`).join('')).join('')}</ul></details>`;
}
function viewEnrolPage(c) {
  return `${phead([['Home', 'home'], [c.shortname]], c.fullname)}<div class="card stack" style="max-width:640px"><p>${esc(c.summary)}</p>
    <p class="muted small">You are not enrolled in this course.</p>${c.visible && c.selfenrol !== false ? `<div><button class="btn primary" data-act="enrolMe" data-id="${c.id}">Enrol me</button></div>` : '<p>Ask your teacher or administrator to enrol you.</p>'}</div>`;
}
function touch(cid, mid) {
  ui.ctxCourse = cid; const e = h.enrolOf(cid); const last = S.access[S.me]?.[cid] || 0;
  const needStart = e && h.isLearner(cid) && !e.startedAt && !h.isLocked(cid);
  if (needStart || (mid && e?.lastMod !== mid) || now() - last > 5 * 6e4) { (S.access[S.me] ||= {})[cid] = now(); if (e && mid) e.lastMod = mid; if (needStart) e.startedAt = now(); B.op('touch', {cid, mid}).catch(() => {}); }
}
/* Overdue lockout screen with the access request form */
function lockScreen(c) {
  const e = h.enrolOf(c.id), r = h.requestOf(c.id), pending = r?.status === 'pending';
  return `<div class="card stack lockcard" style="max-width:720px"><div class="row"><span class="ic lg p-other" aria-hidden="true"><svg viewBox="0 0 24 24">${SVG.lock}</svg></span><div><h2>This course is overdue and locked</h2><p class="muted">It was due on <b>${fmtDate(e.due)}</b>. Your progress (${h.progress(c.id, S.me)}%) is kept and will be there when access is restored.</p></div></div>
    ${pending ? `<div class="fb" style="background:var(--warn-soft);color:var(--warn)"><b>Request sent ${ago(r.time)}.</b> An administrator will review it. You will get a notification and an email with the decision.</div><div class="small"><span class="eyebrow">Your justification</span><p style="white-space:pre-wrap">${esc(r.reason)}</p></div>`
      : `${r?.status === 'rejected' ? `<div class="fb wrong"><b>Your last request was declined.</b> ${esc(r.remarks || '')}</div>` : ''}
      <form data-form="requestAccess" class="stack"><input type="hidden" name="cid" value="${c.id}"><div class="field"><label for="arr">Why do you need more time? (required)</label><textarea id="arr" name="reason" rows="4" minlength="10" required placeholder="For example: I was on approved leave from 12 to 22 October and need one more week."></textarea></div><p class="err" id="arerr" hidden></p><div><button class="btn primary" type="submit">Request access</button></div></form>`}</div>`;
}
VIEWS.course = (p) => {
  const c = h.course(p.id); if (!c) return notFound();
  if (!h.canView(c.id)) return viewEnrolPage(c);
  const st = h.isLearner(c.id), e = h.enrolOf(c.id), status = st ? h.status(c.id) : null;
  if (st && status === 'overdue') return courseShell(c, 'course', lockScreen(c), false);
  const pl = st && h.pathLock(c.id); if (pl) return courseShell(c, 'course', `<div class="card stack" style="max-width:720px"><h2>${lockIcon()} Not unlocked yet</h2><p>${esc(pl)}</p></div>`, false);
  touch(c.id);
  const ed = h.canEdit(c.id) && ui.editing;
  const resumeMod = st && resumeTarget(c.id);
  const top = st ? `<div class="card" style="margin-bottom:16px;padding:14px 18px;display:flex;flex-direction:column;gap:10px"><div class="spread"><div class="row" style="gap:6px">${statusChip(status)}${e.mandatory ? '<span class="chip warn">Mandatory</span>' : ''}${e.due ? `<span class="small muted">Due ${fmtDate(e.due)}${e.due > now() ? ` · ${dur(e.due - now())} left` : ''}</span>` : ''}${c.sequential ? '<span class="chip">Step-by-step: complete activities in order</span>' : ''}</div>
      ${resumeMod && status !== 'completed' ? `<button class="btn sm primary" data-go="mod" data-id="${resumeMod.id}">${e.startedAt ? 'Resume' : 'Start'}: ${esc(resumeMod.name)}</button>` : ''}</div>${progressBar(h.progress(c.id, S.me))}</div>` : '';
  const banner = c.status === 'draft' ? '<div class="card" style="margin-bottom:16px;background:var(--warn-soft);border-color:transparent"><b>Draft.</b> Learners cannot see this course until it is published from Settings.</div>' : c.status === 'archived' ? '<div class="card" style="margin-bottom:16px"><b>Archived.</b> Closed to new enrolments. History is kept for audits.</div>' : '';
  return courseShell(c, 'course', `${banner}${top}${c.sections.map((s, i) => sectionHTML(c, s, i, ed)).join('')}${ed ? `<button class="btn addsec" data-act="addSection" data-cid="${c.id}">+ Add section</button>` : ''}`, true);
};
function sectionHTML(c, s, i, ed) {
  const mods = s.mods.map(id => S.mods[id]).filter(Boolean);
  return `<section class="sec" id="sec-${s.id}"><header class="sec-h"><h2>${esc(s.name)}</h2>
    ${ed ? `<div class="tools"><button class="btn sm ghost" data-act="editSection" data-cid="${c.id}" data-sid="${s.id}">Edit</button>${i > 0 ? `<button class="btn sm ghost danger" data-act="deleteSection" data-cid="${c.id}" data-sid="${s.id}">Delete</button>` : ''}</div>` : ''}</header>
    ${s.summary ? `<div class="sec-sum prose">${md(s.summary)}</div>` : ''}
    <ul class="mods">${mods.map(m => modRow(m, c, ed)).join('') || `<li class="mod muted small">No activities in this section yet.</li>`}</ul>
    ${ed ? `<button class="btn add" data-act="chooser" data-cid="${c.id}" data-sid="${s.id}">+ Add an activity or resource</button>` : ''}</section>`;
}
function datesLine(m) {
  const d = h.dueOf(m); if (!d) return '';
  const learner = h.isLearner(m.courseId), late = learner && d < now() && !h.isDone(m, S.me);
  return `<div class="mod-d ${late ? 'late' : ''}"><b>${{assign:'Due', quiz:'Closes', workshop:'Submissions close', lesson:'Closes', live:'Starts'}[m.type]}:</b> ${fmtDate(d)}</div>`;
}
const AUTO = {assign:'Make a submission', quiz:'Attempt the quiz', lesson:'Finish the lesson', choice:'Make a choice', workshop:'Submit your work', video:'Watch the video', scorm:'Complete the module', live:'Attend the session', feedback:'Complete the survey'};
function completionUI(m) {
  if (!h.isLearner(m.courseId)) return '';
  if (m.pretest) return h.attemptsOf(m.id, S.me).length ? '<span class="chip ok">Pre-test done</span>' : '<span class="chip">Optional pre-test</span>';
  if (!h.trackable(m)) return '';
  const done = h.isDone(m, S.me), lock = h.modLock(m);
  if (lock && !done) return `<span class="chip" title="${esc(lock)}">${lockIcon()} Locked</span>`;
  if (m.type === 'quiz' && m.gradepass) return `<span class="chip ${done ? 'ok' : ''}">${done ? 'Done' : 'To do'}: Pass with ${m.gradepass}%</span>`;
  if (AUTO[m.type]) return `<span class="chip ${done ? 'ok' : ''}">${done ? 'Done' : 'To do'}: ${AUTO[m.type]}</span>`;
  return `<button class="cbtn ${done ? 'done' : ''}" data-act="toggleDone" data-id="${m.id}" aria-pressed="${done}">${done ? '✓ Done' : 'Mark as done'}</button>`;
}
function modTools(m) {
  return `<div class="tools"><button class="btn sm ghost" data-act="editMod" data-id="${m.id}">Edit</button>
    <button class="btn sm ghost" data-act="moveMod" data-id="${m.id}" data-dir="-1" aria-label="Move up">↑</button>
    <button class="btn sm ghost" data-act="moveMod" data-id="${m.id}" data-dir="1" aria-label="Move down">↓</button>
    <button class="btn sm ghost" data-act="toggleVis" data-id="${m.id}">${m.visible ? 'Hide' : 'Show'}</button>
    <button class="btn sm ghost danger" data-act="deleteMod" data-id="${m.id}">Delete</button></div>`;
}
function modRow(m, c, ed) {
  if (m.type === 'label') return `<li class="mod label-mod ${m.visible ? '' : 'is-hidden'}"><div class="prose">${md(m.intro)}</div>${!m.visible ? '<span class="chip">Hidden from students</span>' : ''}${ed ? `<div style="margin-top:8px">${modTools(m)}</div>` : ''}</li>`;
  let meta = '';
  if (m.type === 'forum') { const n = S.posts.filter(p => p.cmid === m.id && !p.parent).length; meta = `<div class="mod-d">${n} discussion${n === 1 ? '' : 's'}</div>`; }
  if (m.type === 'workshop') meta = `<div class="mod-d">Phase: ${C.WS_PHASES[m.phase || 1]}</div>`;
  if (m.type === 'file') { const f = fileOf(m.fileId); if (f) meta = `<div class="mod-d">${esc(f.name)} · ${fmtSize(f.size)}</div>`; }
  if (h.has('grade:edit', c.id) && m.type === 'assign') { const n = h.needsGrading(m); if (n) meta += `<div><span class="chip warn">${n} need${n === 1 ? 's' : ''} grading</span></div>`; }
  if (m.type === 'certificate' && h.isLearner(c.id) && S.certIssued.some(x => x.cmid === m.id && x.userId === S.me && !x.archived)) meta += '<div><span class="chip ok">Issued to you</span></div>';
  if (m.type === 'live') meta += `<div class="mod-d">${m.mode === 'ilt' ? `In person · ${esc(m.location || '')}` : 'Online'} · ${m.duration || 60} min${m.registered != null ? ` · ${m.registered}${m.capacity ? `/${m.capacity}` : ''} registered` : ''}</div>`;
  if (m.type === 'quiz' && (m.pretest || m.gradepass)) meta += `<div>${m.pretest ? '<span class="chip">Pre-test · not graded</span>' : `<span class="chip">Pass mark ${m.gradepass}%</span>`}</div>`;
  if (m.type === 'scorm' || m.type === 'video') { const r = h.resume(m.id, S.me); if (r && !r.completed && h.isLearner(c.id)) meta += `<div class="mod-d">Resume ${m.type === 'video' ? `at ${Math.floor((r.position || 0) / 60)}:${String(Math.floor((r.position || 0) % 60)).padStart(2, '0')}` : `from slide ${(Number(r.location) || 0) + 1}`}</div>`; }
  const lk = h.isLearner(c.id) && !h.isDone(m, S.me) && h.modLock(m);
  if (lk) meta += `<div class="mod-d">${lockIcon()} ${esc(lk)}</div>`;
  if (h.has('grade:edit', c.id) && m.type === 'quiz') { const n = h.needsGrading(m); if (n) meta += `<div><span class="chip warn">${n} essay${n === 1 ? '' : 's'} to grade</span></div>`; }
  return `<li class="mod ${m.visible ? '' : 'is-hidden'} ${lk ? 'is-locked' : ''}">${icon(m.type)}
    <div class="mod-b"><div class="mod-type">${C.TYPES[m.type].label}</div><button class="mod-name" data-go="mod" data-id="${m.id}">${esc(m.name)}</button>${datesLine(m)}${meta}${!m.visible ? '<div><span class="chip">Hidden from students</span></div>' : ''}</div>
    <div>${completionUI(m)}</div>${ed ? modTools(m) : ''}</li>`;
}

/* ----- Activity page ----- */
const BODIES = {};
VIEWS.mod = (p) => {
  const m = S.mods[p.id]; if (!m) return notFound();
  const c = h.course(m.courseId); if (!c || !h.canView(c.id) || m.oversightOnly) return c && !m.oversightOnly ? viewEnrolPage(c) : notFound();
  if (h.isLearner(c.id)) {
    if (h.isLocked(c.id)) return courseShell(c, 'course', lockScreen(c), false);
    const pl = h.pathLock(c.id); if (pl) return modShell(m, c, `<div class="card">${lockIcon()} ${esc(pl)}</div>`);
    const ml = !h.isDone(m, S.me) && h.modLock(m); if (ml) return modShell(m, c, `<div class="card stack" style="max-width:640px"><h2>${lockIcon()} Not unlocked yet</h2><p>${esc(ml)}</p><div><button class="btn" data-go="course" data-id="${c.id}">Back to the course</button></div></div>`);
  }
  touch(c.id, m.id);
  return modShell(m, c, BODIES[m.type](m, c));
};
function modShell(m, c, body, crumbExtra) {
  const d = [];
  if (m.type === 'assign' && m.due) d.push(`<span><b>Due:</b> ${fmtDate(m.due)}</span>`);
  if ((m.type === 'quiz' || m.type === 'lesson') && m.close) d.push(`<span><b>Closes:</b> ${fmtDate(m.close)}</span>`);
  if (m.type === 'workshop' && m.subEnd) d.push(`<span><b>Submissions close:</b> ${fmtDate(m.subEnd)}</span>`);
  if (m.type === 'live' && m.start) d.push(`<span><b>Starts:</b> ${fmtDate(m.start)}</span>`);
  const cr = [['My courses', 'mycourses'], [c.shortname, 'course', c.id], [h.sectionOf(m)?.name || '', 'course', c.id], [m.name, crumbExtra ? 'mod' : null, crumbExtra ? m.id : null]];
  if (crumbExtra) cr.push([crumbExtra]);
  return `${phead(cr, m.name, icon(m.type, 'lg'))}
    <div class="spread noprint" style="margin:-6px 0 18px"><div class="adates">${d.join('')}${!m.visible ? '<span class="chip">Hidden from students</span>' : ''}</div>
      <div class="row">${completionUI(m)}${h.canEdit(c.id) ? `<button class="btn sm" data-act="editMod" data-id="${m.id}">Edit settings</button>` : ''}</div></div>
    ${m.intro && m.type !== 'label' && !crumbExtra ? `<div class="prose noprint" style="margin-bottom:18px">${md(m.intro)}</div>` : ''}
    ${body}`;
}
BODIES.label = m => `<div class="card prose">${md(m.intro)}</div>`;
BODIES.page = m => `<article class="card prose" style="max-width:none">${md(m.content)}</article>`;
BODIES.url = m => {
  const ok = /^https?:\/\//i.test(m.url || ''); let host = ''; try { host = new URL(m.url).hostname; } catch (e) {}
  return `<div class="card stack" style="max-width:640px"><p>This resource opens in a new tab.</p>
    ${ok ? `<div><a class="btn primary" href="${esc(m.url)}" target="_blank" rel="noopener">Open ${esc(host)} ↗</a></div><p class="mono muted" style="word-break:break-all">${esc(m.url)}</p>` : '<p class="err">This link is not a valid web address. Ask your teacher to fix it.</p>'}</div>`;
};
BODIES.file = m => {
  const f = fileOf(m.fileId); if (!f) return '<div class="card err">The file for this resource is missing. Ask your teacher to upload it again.</div>';
  const isImg = /^image\//.test(f.type), isText = /^text\//.test(f.type) && f.size < 200000;
  if (isText) setTimeout(async () => { const el = document.getElementById('fprev'); if (el) { try { el.textContent = await B.fileText(f); } catch (e) { el.textContent = 'Preview not available.'; } } }, 0);
  return `<div class="card stack"><div class="row">${icon('file', 'lg')}<div style="flex:1;min-width:0"><b style="word-break:break-all">${esc(f.name)}</b><div class="muted small">${fmtSize(f.size)} · ${esc(f.type || 'file')} · uploaded ${fmtDateOnly(f.time)}</div></div>
      <a class="btn primary" href="${esc(B.fileUrl(f, true))}" ${B.server ? '' : `download="${esc(f.name)}"`} target="_blank" rel="noopener">Download</a></div>
    ${isImg ? `<img src="${esc(B.fileUrl(f))}" alt="${esc(f.name)}" style="max-width:100%;border-radius:6px">` : ''}
    ${B.server && f.type === 'application/pdf' ? `<iframe src="${esc(B.fileUrl(f))}" title="${esc(f.name)}" style="width:100%;height:75vh;border:1px solid var(--line);border-radius:6px"></iframe>` : ''}
    ${/presentation|powerpoint|\.pptx?$/i.test(f.type + f.name) ? '<p class="muted small">Slide decks download to open in PowerPoint or Keynote. To show slides inside the course, export the deck as PDF and upload that.</p>' : ''}
    ${isText ? '<pre class="fpreview" id="fprev">Loading preview…</pre>' : ''}
    ${!B.server ? '<p class="muted small">In this preview, downloads may be blocked by the viewer. They work normally on the server edition.</p>' : ''}</div>`;
};

/* Assignment */
BODIES.assign = (m, c) => {
  if (h.has('grade:viewall', c.id)) {
    let st = h.students(c.id); const grp = ui.grp && h.groups(c.id).find(g => g.id === ui.grp); if (grp) st = st.filter(s => grp.members.includes(s.id));
    const subs = st.map(s => h.subOf(m.id, s.id));
    return `<section class="stack"><h2>Grading summary</h2><div class="tw"><table class="kv"><tbody>
      <tr><th>Participants</th><td class="num">${st.length}</td></tr><tr><th>Submitted</th><td class="num">${subs.filter(s => s?.status === 'submitted').length}</td></tr>
      <tr><th>Needs grading</th><td class="num">${h.needsGrading(m)}</td></tr><tr><th>Time remaining</th><td>${m.due ? (m.due > now() ? dur(m.due - now()) : 'Assignment is due') : 'No due date'}</td></tr></tbody></table></div>
      <div class="spread" style="margin-top:8px"><h2>Submissions</h2>${groupFilter(c)}</div>
      <div class="tw"><table><thead><tr><th>Student</th><th>Status</th><th class="n">Grade</th><th>Last modified</th><th></th></tr></thead><tbody>
      ${st.map(s => { const sb = h.subOf(m.id, s.id); const late = sb && m.due && sb.time > m.due;
        return `<tr><td><div class="row" style="flex-wrap:nowrap">${avatar(s, 28)}<span>${esc(fullname(s))}<br><span class="muted small">${h.groupsOf(c.id, s.id).map(g => esc(g.name)).join(', ') || esc(s.email)}</span></span></div></td>
          <td>${sb && sb.status === 'submitted' ? `<span class="chip ok">Submitted for grading</span>${late ? ` <span class="chip bad">Late ${dur(sb.time - m.due)}</span>` : ''}${sb.files?.length ? ` <span class="chip">${sb.files.length} file${sb.files.length > 1 ? 's' : ''}</span>` : ''}` : '<span class="chip">No submission</span>'}${sb?.grade != null ? ' <span class="chip brand">Graded</span>' : ''}</td>
          <td class="n">${sb?.grade != null ? `${fmtG(sb.grade)} / ${fmtG(m.maxgrade)}` : '–'}</td><td class="small">${sb ? fmtDate(sb.time) : '–'}</td>
          <td>${h.has('grade:edit', c.id) ? `<button class="btn sm ${sb && sb.status === 'submitted' && sb.grade == null ? 'primary' : ''}" data-go="grader" data-id="${m.id}" data-u="${s.id}">Grade</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No students enrolled.</td></tr>'}
      </tbody></table></div></section>`;
  }
  if (!h.isLearner(c.id)) return '<div class="card muted">You are not a learner in this course.</div>';
  const sb = h.subOf(m.id, S.me), graded = sb && sb.grade != null;
  const timeRow = !m.due ? 'No due date' : sb ? (sb.time <= m.due ? `Assignment was submitted ${dur(m.due - sb.time)} early` : `Assignment was submitted ${dur(sb.time - m.due)} late`) : (m.due > now() ? dur(m.due - now()) : `Assignment is overdue by ${dur(now() - m.due)}`);
  const timeCls = sb ? (sb.time <= m.due ? 'good' : 'late') : (m.due && m.due < now() ? 'late' : '');
  return `<section class="stack"><h2>Submission status</h2><div class="tw"><table class="kv"><tbody>
    <tr><th>Submission status</th><td class="${sb ? 'good' : ''}">${sb ? 'Submitted for grading' : 'No submissions have been made yet'}</td></tr>
    <tr><th>Grading status</th><td class="${graded ? 'good' : ''}">${graded ? 'Graded' : 'Not graded'}</td></tr>
    <tr><th>Time remaining</th><td class="${timeCls}">${timeRow}</td></tr>
    <tr><th>Last modified</th><td>${sb ? fmtDate(sb.time) : '–'}</td></tr>
    <tr><th>Online text</th><td>${sb?.text ? `<div style="white-space:pre-wrap">${esc(sb.text)}</div>` : '–'}</td></tr>
    ${m.allowFiles ? `<tr><th>File submissions</th><td>${sb?.files?.length ? `<div class="fchips">${sb.files.map(id => fileChip(id)).join('')}</div>` : '–'}</td></tr>` : ''}</tbody></table></div>
    <div class="row">${!graded ? `<button class="btn primary" data-go="submit" data-id="${m.id}">${sb ? 'Edit submission' : 'Add submission'}</button>` : '<span class="muted small">Your submission has been graded and can no longer be changed.</span>'}${sb && !graded ? `<button class="btn danger" data-act="removeSub" data-id="${m.id}">Remove submission</button>` : ''}</div>
    ${graded ? `<h2 style="margin-top:8px">Feedback</h2><div class="tw"><table class="kv"><tbody>
      <tr><th>Grade</th><td class="num"><b>${fmtG(sb.grade)}</b> / ${fmtG(m.maxgrade)}</td></tr><tr><th>Graded on</th><td>${fmtDate(sb.gradedAt)}</td></tr>
      <tr><th>Graded by</th><td>${esc(fullname(sb.gradedBy))}</td></tr><tr><th>Feedback comments</th><td style="white-space:pre-wrap">${esc(sb.feedback) || '–'}</td></tr></tbody></table></div>${rubricFeedback(m, sb)}` : m.rubric?.criteria?.length ? `<details class="card"><summary><b>How this assignment is graded</b></summary><div style="margin-top:10px">${rubricFeedback(m, {rubric:{}})}</div></details>` : ''}</section>`;
};
function groupFilter(c) {
  const gs = h.groups(c.id); if (!gs.length) return '';
  return `<label class="row small">Group <select class="sel-sm" id="grpfilter">${['<option value="">All participants</option>', ...gs.map(g => `<option value="${g.id}" ${ui.grp === g.id ? 'selected' : ''}>${esc(g.name)}</option>`)].join('')}</select></label>`;
}
VIEWS.submit = (p) => {
  const m = S.mods[p.id]; if (!m) return notFound(); const c = h.course(m.courseId); if (!h.isLearner(c.id)) return notFound();
  const sb = h.subOf(m.id, S.me);
  if (ui.upload.subFor !== m.id) { ui.upload = {subFor:m.id, sub:[...(sb?.files || [])]}; }
  return modShell(m, c, `<form data-form="submission" class="card stack" style="max-width:820px"><input type="hidden" name="mid" value="${m.id}">
    <div class="prose">${md(m.intro)}</div>
    <div class="field"><label for="subtext">Online text</label><textarea id="subtext" name="text" rows="12" style="min-height:220px">${esc(sb?.text || '')}</textarea><span class="hint">Your teacher sees exactly what you type here.</span></div>
    ${m.allowFiles ? `<div class="field"><span class="lbl">File submissions</span><div class="fchips" id="subfiles">${ui.upload.sub.map(id => fileChip(id, 'unattach')).join('')}</div>
      <label class="drop" for="subfile">Choose files to attach <span class="muted small">(up to 10 files)</span><input id="subfile" type="file" multiple data-upload="sub" style="display:block;margin:10px auto 0"></label></div>` : ''}
    <p class="err" id="suberr" hidden></p>
    <div class="row"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" data-go="mod" data-id="${m.id}">Cancel</button></div></form>`, sb ? 'Edit submission' : 'Add submission');
};
VIEWS.grader = (p) => {
  const m = S.mods[p.id]; if (!m) return notFound(); const c = h.course(m.courseId); if (!h.has('grade:edit', c.id)) return notFound();
  const st = h.students(c.id), s = h.user(p.u) || st[0]; if (!s) return modShell(m, c, '<div class="card">No learners enrolled.</div>', 'Grade');
  const sb = h.subOf(m.id, s.id), i = st.findIndex(x => x.id === s.id), prev = st[i - 1], next = st[i + 1];
  const rub = m.rubric?.criteria?.length ? m.rubric : null;
  const rubricHTML = rub ? `<div class="field"><span class="lbl">Rubric</span><div class="tw"><table class="rubric"><tbody>${rub.criteria.map(cr => `<tr><th>${esc(cr.text)}</th>${cr.levels.map((lv, li) => `<td><label class="rlevel"><input type="radio" name="r_${cr.id}" value="${li}" ${sb?.rubric?.[cr.id]?.level === li ? 'checked' : ''} required><span><b class="num">${lv.points}</b> ${esc(lv.text)}</span></label></td>`).join('')}<td style="min-width:160px"><input type="text" name="rc_${cr.id}" placeholder="Comment" aria-label="Comment on ${esc(cr.text)}" value="${esc(sb?.rubric?.[cr.id]?.comment || '')}"></td></tr>`).join('')}</tbody></table></div><span class="hint">The grade is calculated from the rubric: points awarded ÷ points available × ${fmtG(m.maxgrade)}.</span></div>`
    : `<div class="field"><label for="gval">Grade out of ${fmtG(m.maxgrade)}</label><input id="gval" name="grade" type="number" min="0" max="${m.maxgrade}" step="0.01" value="${sb?.grade ?? ''}" required></div>`;
  return modShell(m, c, `<div class="spread" style="margin-bottom:14px"><div class="row">${avatar(s)}<div><b>${esc(fullname(s))}</b><div class="muted small">${esc(s.email)}</div></div></div>
      <div class="row"><button class="btn sm" ${prev ? `data-go="grader" data-id="${m.id}" data-u="${prev.id}"` : 'disabled'}>← Previous</button><span class="muted small num">${i + 1} of ${st.length}</span><button class="btn sm" ${next ? `data-go="grader" data-id="${m.id}" data-u="${next.id}"` : 'disabled'}>Next →</button></div></div>
    <div class="stack"><section class="card stack"><div class="spread"><h2>Submission</h2>${sb && sb.status === 'submitted' ? `<span class="chip ok">Submitted ${fmtDate(sb.time)}</span>` : '<span class="chip">No submission</span>'}</div>
      ${sb?.text ? `<div style="white-space:pre-wrap;font-family:var(--f-mono);font-size:.88rem;background:var(--surface-2);padding:14px;border-radius:6px;overflow-x:auto">${esc(sb.text)}</div>` : ''}
      ${sb?.files?.length ? `<div class="fchips">${sb.files.map(id => fileChip(id)).join('')}</div>` : ''}
      ${!sb || sb.status !== 'submitted' ? '<p class="muted">This learner has not submitted anything yet. You can still enter a grade.</p>' : ''}</section>
    <form data-form="gradeSub" class="card stack"><input type="hidden" name="mid" value="${m.id}"><input type="hidden" name="uid" value="${s.id}"><h2>Grade</h2>${rubricHTML}
      <div class="field"><label for="gfb">Overall feedback</label><textarea id="gfb" name="feedback" rows="5">${esc(sb?.feedback || '')}</textarea></div>
      <p class="err" id="graderr" hidden></p><div><button class="btn primary" type="submit">Save${next ? ' and show next' : ''}</button></div></form></div>`, 'Grade');
};
function rubricFeedback(m, sb) {
  if (!m.rubric?.criteria?.length || !sb?.rubric) return '';
  return `<h3 style="margin-top:6px">Rubric</h3><div class="tw"><table class="rubric"><tbody>${m.rubric.criteria.map(cr => { const r = sb.rubric[cr.id]; return `<tr><th>${esc(cr.text)}</th>${cr.levels.map((lv, li) => `<td class="${r?.level === li ? 'rsel' : ''}"><b class="num">${lv.points}</b> ${esc(lv.text)}</td>`).join('')}<td class="small">${esc(r?.comment || '')}</td></tr>`; }).join('')}</tbody></table></div>`;
}

/* Quiz */
BODIES.quiz = (m, c) => {
  const ed = h.canEdit(c.id), learner = h.isLearner(c.id), at = h.attemptsOf(m.id, S.me), qs = m.questions || [];
  const allowed = h.attemptsAllowed(m, S.me), closed = m.close && m.close < now(), left = m.attempts ? allowed - at.length : Infinity;
  const open = S.attempts.find(a => a.cmid === m.id && a.userId === S.me && a.state === 'inprogress' && !a.archived);
  const can = qs.length && (learner ? !closed && left > 0 : h.has('grade:viewall', c.id));
  const best = h.gradeFor(m, S.me), bestPct = h.quizPercent(m, S.me);
  let html = `<div class="card stack" style="gap:6px;text-align:center;align-items:center;margin-bottom:18px">
    ${m.pretest ? '<p><span class="chip brand">Pre-test</span> A baseline check. It does not count towards your grade or completion.</p>' : ''}
    <p>Attempts allowed: <b>${m.attempts ? allowed : 'Unlimited'}</b>${m.attempts && allowed > m.attempts ? ` <span class="muted small">(${allowed - m.attempts} extra granted)</span>` : ''}</p>${m.timelimit ? `<p>Time limit: <b>${m.timelimit} min</b></p>` : ''}
    <p>Questions: <b>${qs.length}</b> · Grading method: <b>Highest grade</b>${m.gradepass ? ` · Pass mark: <b>${m.gradepass}%</b>` : ''}</p>${m.close ? `<p class="muted small">This quiz ${closed ? 'closed' : 'will close'} on ${fmtDate(m.close)}</p>` : ''}</div>`;
  if (at.length) html += `<h2 style="margin-bottom:10px">Your attempts</h2><div class="tw" style="margin-bottom:14px"><table><thead><tr><th>Attempt</th><th>State</th><th class="n">Marks</th><th class="n">Grade / ${fmtG(m.maxgrade)}</th><th></th></tr></thead><tbody>
    ${at.map((a, i) => `<tr><td class="num">${i + 1}${a.preview ? ' <span class="chip">Preview</span>' : ''}</td><td>Finished${a.pending ? ' <span class="chip warn">Essay being graded</span>' : ''}<br><span class="muted small">Submitted ${fmtDate(a.finish)}</span></td><td class="n">${a.score.toFixed(2)} / ${a.max.toFixed(2)}</td><td class="n">${fmtG(a.score / a.max * m.maxgrade)}</td><td><button class="btn sm" data-go="review" data-id="${a.id}">Review</button></td></tr>`).join('')}</tbody></table></div>
    ${learner && best != null ? `<p style="margin-bottom:14px;text-align:center">Highest grade: <b class="num">${fmtG(best)} / ${fmtG(m.maxgrade)}</b>${m.gradepass && !m.pretest ? ` · ${bestPct >= m.gradepass ? '<span class="chip ok">Passed</span>' : '<span class="chip bad">Not passed yet</span>'}` : ''}</p>` : ''}`;
  html += `<div style="text-align:center;margin-bottom:22px">${can ? `<button class="btn primary" data-act="startAttempt" data-id="${m.id}">${open ? 'Continue the last attempt' : !learner ? 'Preview quiz' : at.length ? 'Re-attempt quiz' : 'Attempt quiz'}</button>` : `<p class="muted">${!qs.length ? 'No questions have been added yet.' : closed ? 'This quiz is closed.' : learner ? 'No more attempts are allowed. Ask your trainer if you need another attempt.' : ''}</p>`}</div>`;
  if (ed) html += `<section class="stack" style="margin-bottom:22px"><div class="spread"><h2>Questions</h2><div class="row">${S.qbank.length ? `<button class="btn sm" data-act="bankPick" data-id="${m.id}">Add from question bank</button>` : ''}<button class="btn sm primary" data-act="editQuestion" data-id="${m.id}">+ Add question</button></div></div>
      <div class="tw"><table><thead><tr><th>#</th><th>Question</th><th>Type</th><th>Answer</th><th class="n">Mark</th><th></th></tr></thead><tbody>
      ${qs.map((q, i) => `<tr><td class="num">${i + 1}</td><td>${esc(q.text)}${q.bankId ? ' <span class="chip">Bank</span>' : ''}</td><td class="small">${C.QTYPES[q.type]}</td><td class="small">${esc(C.correctText(q) ?? '')}</td><td class="n">${q.mark}</td><td><div class="tools"><button class="btn sm ghost" data-act="editQuestion" data-id="${m.id}" data-q="${q.id}">Edit</button><button class="btn sm ghost danger" data-act="deleteQuestion" data-id="${m.id}" data-q="${q.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No questions yet. Add the first one.</td></tr>'}
      </tbody></table></div><p class="muted small">Questions marked Bank stay in sync when the central question bank is edited.</p></section>`;
  if (h.has('grade:viewall', c.id)) { const st = h.students(c.id), manage = h.has('attempts:manage', c.id);
    html += `<section class="stack" style="margin-bottom:22px"><h2>Results</h2><div class="tw"><table><thead><tr><th>Learner</th><th class="n">Attempts</th><th>Last attempt</th><th class="n">Best</th><th>Result</th>${manage ? '<th></th>' : ''}</tr></thead><tbody>
      ${st.map(s => { const a = h.attemptsOf(m.id, s.id); const pct = h.quizPercent(m, s.id); const extra = Number(S.extraAttempts[s.id + ':' + m.id]) || 0; const pend = a.some(x => x.pending);
        return `<tr><td>${esc(fullname(s))}</td><td class="n">${a.length}${m.attempts ? ` / ${m.attempts + extra}` : ''}</td><td class="small">${a.length ? `<button class="link" data-go="review" data-id="${a[a.length - 1].id}">${fmtDate(a[a.length - 1].finish)}</button>` : '–'}</td><td class="n">${fmtPct(pct)}</td>
          <td>${pend ? '<span class="chip warn">Essay to grade</span>' : pct == null ? '' : m.gradepass && !m.pretest ? (pct >= m.gradepass ? '<span class="chip ok">Pass</span>' : '<span class="chip bad">Fail</span>') : ''}</td>
          ${manage ? `<td><div class="tools">${m.attempts ? `<button class="btn sm ghost" data-act="grantAttempt" data-id="${m.id}" data-u="${s.id}">+1 attempt</button>` : ''}${a.length ? `<button class="btn sm ghost danger" data-act="resetAttempts" data-id="${m.id}" data-u="${s.id}">Reset</button>` : ''}</div></td>` : ''}</tr>`; }).join('') || '<tr><td colspan="6" class="empty">No learners enrolled.</td></tr>'}
      </tbody></table></div></section>${itemAnalysisHTML(m)}`; }
  return html;
};
function itemAnalysisHTML(m) {
  const ia = C.itemAnalysis(h.S, m); if (!ia.attempts) return '';
  return `<section class="stack"><h2>Assessment analysis</h2><div class="stats"><div class="stat"><b>${ia.attempts}</b><span class="muted small">Attempts analysed</span></div><div class="stat"><b>${fmtPct(ia.average)}</b><span class="muted small">Average score</span></div>${ia.passRate != null ? `<div class="stat"><b>${fmtPct(ia.passRate)}</b><span class="muted small">Pass rate (≥ ${ia.pass}%)</span></div><div class="stat"><b>${fmtPct(100 - ia.passRate)}</b><span class="muted small">Fail rate</span></div>` : ''}</div>
    <div class="stack">${ia.items.map((it, i) => `<div class="card stack" style="gap:8px"><div class="spread"><b>Q${i + 1}. ${esc(it.text)}</b><span class="row" style="gap:6px"><span class="chip">${C.QTYPES[it.type]}</span>${it.facility != null ? `<span class="chip ${it.facility < 40 ? 'bad' : it.facility < 70 ? 'warn' : 'ok'}">${fmtPct(it.facility)} correct</span>` : ''}</span></div>
      ${it.options ? `<div class="cres">${it.options.map(o => { const pc = it.answered ? o.n / it.answered * 100 : 0; return `<div class="rowb"><div class="stack" style="gap:3px"><span class="small">${o.correct ? '<b class="okc">✓</b> ' : ''}${esc(o.text)}</span><div class="barw"><i style="width:${pc}%;background:${o.correct ? 'var(--ok)' : 'var(--t-assess)'}"></i></div></div><span class="num small">${o.n} · ${fmtPct(pc)}</span></div>`; }).join('')}</div>${it.options.some(o => !o.correct && o.n > it.options.find(x => x.correct)?.n) ? '<p class="small" style="color:var(--bad)">A wrong option was chosen more often than the right one. Review how this topic is taught.</p>' : ''}` : `<p class="small muted">Average mark ${fmtPct(it.avg)} · ${it.answered} of ${it.attempts} answered</p>`}</div>`).join('')}</div></section>`;
}
function qInput(q, a) {
  const name = `q_${q.id}`;
  if (q.type === 'mc' || q.type === 'tf') {
    const opts = q.type === 'mc' ? q.options.map((o, i) => [String(i), o.text]) : [['true', 'True'], ['false', 'False']];
    return opts.map(([v, t]) => `<label class="opt"><input type="radio" name="${name}" value="${v}" data-q="${q.id}" ${String(a) === v ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  }
  if (q.type === 'essay') return `<div class="field"><label for="${name}">Your answer</label><textarea id="${name}" data-q="${q.id}" rows="6">${esc(a ?? '')}</textarea><span class="hint">A trainer grades this answer.</span></div>`;
  return `<div class="field" style="max-width:340px"><label for="${name}">Answer</label><input id="${name}" type="${q.type === 'num' ? 'number' : 'text'}" step="any" data-q="${q.id}" value="${esc(a ?? '')}" autocomplete="off"></div>`;
}
const answered = (A, q) => A.answers[q.id] != null && A.answers[q.id] !== '';
VIEWS.review = (p) => {
  const a = S.attempts.find(x => x.id === p.id); if (!a || !a.review) return notFound();
  const m = S.mods[a.cmid], c = h.course(m.courseId), who = h.user(a.userId), grader = h.has('grade:edit', c.id);
  const ids = Object.keys(a.review);
  return modShell(m, c, `<div class="tw" style="margin-bottom:20px"><table class="kv"><tbody>
    ${a.userId !== S.me ? `<tr><th>Learner</th><td>${esc(fullname(who))}</td></tr>` : ''}
    <tr><th>Started on</th><td>${fmtDate(a.start)}</td></tr><tr><th>State</th><td>Finished${a.overdue ? ' <span class="chip warn">Submitted after the time limit</span>' : ''}${a.pending ? ' <span class="chip warn">Essay being graded</span>' : ''}</td></tr>
    <tr><th>Completed on</th><td>${fmtDate(a.finish)}</td></tr><tr><th>Time taken</th><td>${dur(a.finish - a.start)}</td></tr>
    <tr><th>Marks</th><td class="num">${a.score.toFixed(2)} / ${a.max.toFixed(2)}</td></tr>
    <tr><th>Grade</th><td class="num"><b>${fmtG(a.score / a.max * m.maxgrade)}</b> out of ${fmtG(m.maxgrade)} (<b>${Math.round(a.score / a.max * 100)}</b>%)${m.gradepass && !m.pretest ? ` · ${a.score / a.max * 100 >= m.gradepass ? '<span class="chip ok">Pass</span>' : '<span class="chip bad">Below the pass mark</span>'}` : ''}</td></tr></tbody></table></div>
    ${ids.map((qid, i) => { const rv = a.review[qid], ans = a.answers[qid], ok = rv.got >= rv.mark && rv.mark > 0, has = ans != null && ans !== '';
      let body, fb;
      if (rv.type === 'mc' || rv.type === 'tf') {
        const opts = rv.type === 'mc' ? rv.options.map((o, k) => [String(k), o.text, o.correct]) : [['true', 'True', rv.answerTf === true], ['false', 'False', rv.answerTf === false]];
        body = opts.map(([v, t, right]) => { const sel = String(ans) === v; return `<label class="opt ${right ? 'right' : sel ? 'wrong' : ''}"><input type="radio" disabled ${sel ? 'checked' : ''}><span>${esc(t)}</span></label>`; }).join('');
      } else if (rv.type === 'essay') body = `<div class="fpreview" style="font-family:var(--f-body)">${esc(ans || '(no answer)')}</div>`;
      else body = `<div class="field" style="max-width:340px"><span class="lbl">Answer</span><input type="text" disabled value="${esc(ans ?? '')}"></div>`;
      if (rv.type === 'essay') {
        fb = rv.pending ? '<div class="fb" style="background:var(--warn-soft);color:var(--warn)">Waiting for a trainer to grade this answer.</div>' : `<div class="fb ${ok ? 'right' : 'wrong'}">Marked ${rv.got} of ${rv.mark} by ${esc(fullname(rv.gradedBy))}.${rv.comment ? ` ${esc(rv.comment)}` : ''}</div>`;
        if (grader && has) fb += `<form data-form="gradeEssay" class="row" style="border-top:1px solid var(--line);padding-top:10px"><input type="hidden" name="aid" value="${a.id}"><input type="hidden" name="qid" value="${qid}"><label class="small" for="em${qid}">Mark (0–${rv.mark})</label><input id="em${qid}" name="mark" type="number" min="0" max="${rv.mark}" step="0.5" value="${rv.pending ? '' : rv.got}" required style="max-width:90px"><input name="comment" type="text" placeholder="Comment for the learner" aria-label="Comment" value="${esc(rv.comment || '')}" style="flex:1;min-width:160px"><button class="btn sm primary" type="submit">Save mark</button></form>`;
      } else fb = `<div class="fb ${ok ? 'right' : 'wrong'}">${ok ? 'Your answer is correct.' : `The correct answer is: <b>${esc(rv.right)}</b>`}</div>`;
      return `<div class="q"><div class="qinfo"><b>Question ${i + 1}</b><span>${rv.pending ? 'Needs grading' : has ? (ok ? 'Correct' : rv.type === 'essay' ? 'Graded' : 'Incorrect') : 'Not answered'}</span><span>Mark ${rv.got.toFixed(2)} out of ${rv.mark.toFixed(2)}</span></div>
      <div class="qbody"><div class="qtext">${esc(rv.text)}</div>${body}${fb}</div></div>`; }).join('')}
    <button class="btn" data-go="mod" data-id="${m.id}">Finish review</button>`, 'Review');
};

/* Forum */
BODIES.forum = (m, c) => {
  const disc = S.posts.filter(p => p.cmid === m.id && !p.parent).sort((a, b) => lastPost(b) - lastPost(a));
  const canPost = h.has(m.news ? 'forum:addnews' : 'forum:post', c.id);
  return `<div class="spread" style="margin-bottom:14px"><input type="search" id="fsearch" data-filter="#dlist" placeholder="Search discussions" aria-label="Search discussions" style="max-width:280px">
      ${canPost ? `<button class="btn primary" data-act="newDiscussion" data-id="${m.id}">${m.news ? 'Add announcement' : 'Add discussion topic'}</button>` : ''}</div>
    <div class="tw"><table><thead><tr><th>Discussion</th><th>Started by</th><th class="n">Replies</th><th>Last post</th></tr></thead><tbody id="dlist">
    ${disc.map(d => { const reps = S.posts.filter(p => p.discussion === d.id && p.parent); const last = reps.length ? reps.reduce((a, b) => a.time > b.time ? a : b) : d;
      return `<tr data-s="${esc((d.subject + ' ' + d.message).toLowerCase())}"><td><button class="link" style="font-weight:600" data-go="discussion" data-id="${d.id}">${esc(d.subject)}</button></td><td><div class="row" style="flex-wrap:nowrap">${avatar(h.user(d.userId), 26)}<span class="small">${esc(fullname(d.userId))}</span></div></td><td class="n">${reps.length}</td><td class="small">${esc(fullname(last.userId))}<br><span class="muted">${fmtDate(last.time)}</span></td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">There are no discussion topics yet in this forum.</td></tr>'}
    </tbody></table></div>`;
};
const lastPost = d => Math.max(d.time, ...S.posts.filter(p => p.discussion === d.id).map(p => p.time));
VIEWS.discussion = (p) => {
  const d = S.posts.find(x => x.id === p.id); if (!d) return notFound();
  const m = S.mods[d.cmid], c = h.course(m.courseId);
  const all = S.posts.filter(x => x.discussion === d.id), canReply = h.has(m.news ? 'forum:addnews' : 'forum:post', c.id);
  const renderPost = (post, depth) => {
    const kids = all.filter(x => x.parent === post.id).sort((a, b) => a.time - b.time);
    const u = h.user(post.userId), mine = post.userId === S.me || h.has('forum:deleteany', c.id);
    const er = h.enrolOf(c.id, post.userId)?.role;
    return `<div class="${depth ? 'reply' : ''} stack" style="gap:10px"><article class="post" id="p-${post.id}">${avatar(u, 40)}<div class="pb">
      <div><b>${esc(post.subject)}</b><div class="muted small">by ${esc(fullname(u))} · ${fmtDate(post.time)}${er && er !== 'student' ? ` · <span class="chip brand">${esc(roleName(er))}</span>` : ''}</div></div>
      <div class="prose">${md(post.message)}</div>
      <div class="row">${canReply ? `<button class="link small" data-act="reply" data-id="${post.id}">Reply</button>` : ''}${mine ? `<button class="link small" style="color:var(--bad)" data-act="deletePost" data-id="${post.id}">Delete</button>` : ''}</div>
      ${ui.replyTo === post.id ? `<form data-form="reply" class="stack" style="gap:8px"><input type="hidden" name="parent" value="${post.id}"><label class="lbl" for="rmsg">Your reply</label><textarea id="rmsg" name="message" rows="4" required></textarea><div class="row"><button class="btn primary sm" type="submit">Post to forum</button><button class="btn sm" type="button" data-act="reply" data-id="">Cancel</button></div></form>` : ''}
      </div></article>${kids.map(k => renderPost(k, depth + 1)).join('')}</div>`;
  };
  return modShell(m, c, `<div class="stack" style="gap:12px;max-width:900px">${renderPost(d, 0)}</div>`, d.subject);
};

/* Glossary */
BODIES.glossary = (m, c) => {
  const approver = h.has('glossary:approve', c.id);
  const all = S.glossary.filter(e => e.cmid === m.id).sort((a, b) => a.concept.localeCompare(b.concept));
  const letters = new Set(all.filter(e => e.approved).map(e => e.concept[0].toUpperCase()));
  const L = ui.gloss.letter;
  const shown = all.filter(e => (!L || e.concept[0].toUpperCase() === L));
  const pending = all.filter(e => !e.approved);
  const entry = e => `<div class="gentry" data-s="${esc((e.concept + ' ' + e.definition).toLowerCase())}"><div class="spread"><h3>${esc(e.concept)}</h3>${!e.approved ? '<span class="chip warn">Pending approval</span>' : ''}</div>
    <div class="prose">${md(e.definition)}</div><div class="spread"><span class="muted small">${esc(fullname(e.userId))} · ${fmtDateOnly(e.time)}</span>
    <div class="tools">${approver && !e.approved ? `<button class="btn sm primary" data-act="approveEntry" data-id="${e.id}">Approve</button>` : ''}${approver || (e.userId === S.me && !e.approved) ? `<button class="btn sm ghost" data-act="editEntry" data-id="${e.id}">Edit</button><button class="btn sm ghost danger" data-act="deleteEntry" data-id="${e.id}">Delete</button>` : ''}</div></div></div>`;
  return `<div class="spread" style="margin-bottom:12px"><input type="search" id="gsearch" data-filter="#glist" placeholder="Search terms and definitions" aria-label="Search glossary" style="max-width:300px">
      ${h.has('forum:post', c.id) || h.canEdit(c.id) ? `<button class="btn primary" data-act="editEntry" data-mid="${m.id}">Add a new entry</button>` : ''}</div>
    <div class="letters" role="group" aria-label="Browse by letter"><button class="${!L ? 'on' : ''}" data-act="glossLetter" data-l="">All</button>${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(x => `<button class="${L === x ? 'on' : ''}" data-act="glossLetter" data-l="${x}" ${letters.has(x) ? '' : 'disabled'}>${x}</button>`).join('')}</div>
    ${approver && pending.length ? `<div class="card" style="margin-bottom:16px;background:var(--warn-soft);border-color:transparent"><b>${pending.length} entr${pending.length > 1 ? 'ies' : 'y'} waiting for approval</b></div>` : ''}
    <div id="glist" class="card" style="padding-top:4px">${shown.map(entry).join('') || '<div class="empty">No entries yet.</div>'}</div>`;
};

/* Choice */
BODIES.choice = (m, c) => {
  const mine = S.choiceAnswers.find(a => a.cmid === m.id && a.userId === S.me), learner = h.isLearner(c.id);
  const res = m.results, total = res ? res.reduce((a, b) => a + b, 0) : 0;
  let html = '';
  if (learner) html += `<form data-form="choice" class="card stack" style="max-width:620px;margin-bottom:18px"><input type="hidden" name="mid" value="${m.id}">
    ${m.options.map((o, i) => `<label class="opt"><input type="radio" name="option" value="${i}" ${mine?.option === i ? 'checked' : ''} ${mine && !m.allowUpdate ? 'disabled' : ''} required><span>${esc(o)}</span></label>`).join('')}
    ${!mine || m.allowUpdate ? `<div class="row"><button class="btn primary" type="submit">${mine ? 'Update my choice' : 'Save my choice'}</button>${mine ? `<button class="btn" type="button" data-act="removeChoice" data-id="${m.id}">Remove my choice</button>` : ''}</div>` : '<p class="muted small">Your choice has been saved and cannot be changed.</p>'}</form>`;
  if (res) html += `<h2 style="margin-bottom:12px">Results</h2><div class="cres card">${m.options.map((o, i) => { const n = res[i] || 0, pc = total ? Math.round(n / total * 100) : 0;
    return `<div class="rowb"><div class="stack" style="gap:4px"><span>${esc(o)}${mine?.option === i ? ' <span class="chip brand">Your choice</span>' : ''}</span><div class="barw"><i style="width:${pc}%"></i></div></div><span class="num small">${n} response${n === 1 ? '' : 's'} · ${pc}%</span></div>`; }).join('')}</div>`;
  else if (learner) html += `<p class="muted">${m.showResults === 'never' ? 'Results are not published to students.' : 'Results appear after you answer.'}</p>`;
  if (h.has('grade:viewall', c.id)) {
    const st = h.students(c.id);
    html += `<h2 style="margin:22px 0 10px">Responses</h2><div class="tw"><table><thead><tr><th>Option</th><th>Students</th></tr></thead><tbody>${m.options.map((o, i) => `<tr><td>${esc(o)}</td><td class="small">${S.choiceAnswers.filter(a => a.cmid === m.id && a.option === i).map(a => esc(fullname(a.userId))).join(', ') || '–'}</td></tr>`).join('')}
      <tr><td class="muted">Not answered</td><td class="small">${st.filter(s => !S.choiceAnswers.some(a => a.cmid === m.id && a.userId === s.id)).map(s => esc(fullname(s))).join(', ') || '–'}</td></tr></tbody></table></div>`;
  }
  return html;
};

/* Lesson */
BODIES.lesson = (m, c) => {
  const pages = m.pages || [], qn = pages.filter(p => p.kind === 'question').length, learner = h.isLearner(c.id);
  const mine = S.lessonAttempts.filter(a => a.cmid === m.id && a.userId === S.me && a.finished);
  const best = h.gradeFor(m, S.me);
  let html = `<div class="card stack" style="max-width:640px;margin-bottom:18px"><div class="row"><span class="chip">${pages.length} pages</span><span class="chip">${qn} questions</span><span class="chip">Graded out of ${m.maxgrade}</span></div>
    ${mine.length && learner ? `<p>You have completed this lesson ${mine.length} time${mine.length > 1 ? 's' : ''}. Best grade: <b class="num">${fmtG(best)} / ${fmtG(m.maxgrade)}</b></p>` : ''}
    <div>${pages.length ? `<button class="btn primary" data-act="lessonStart" data-id="${m.id}">${!learner ? 'Preview lesson' : mine.length ? 'Retake lesson' : 'Start lesson'}</button>` : '<p class="muted">No pages have been added yet.</p>'}</div></div>`;
  if (h.canEdit(c.id)) html += `<section class="stack" style="margin-bottom:22px"><div class="spread"><h2>Lesson pages</h2><div class="row"><button class="btn sm" data-act="lessonPage" data-id="${m.id}" data-kind="content">+ Content page</button><button class="btn sm primary" data-act="lessonPage" data-id="${m.id}" data-kind="question">+ Question page</button></div></div>
    <div class="tw"><table><thead><tr><th>#</th><th>Page</th><th>Type</th><th></th></tr></thead><tbody>${pages.map((p, i) => `<tr><td class="num">${i + 1}</td><td>${esc(p.title)}</td><td><span class="chip ${p.kind === 'question' ? 'brand' : ''}">${p.kind === 'question' ? 'Question' : 'Content'}</span></td>
      <td><div class="tools"><button class="btn sm ghost" data-act="lessonPage" data-id="${m.id}" data-pid="${p.id}">Edit</button><button class="btn sm ghost" data-act="moveLessonPage" data-id="${m.id}" data-pid="${p.id}" data-dir="-1" aria-label="Move up">↑</button><button class="btn sm ghost" data-act="moveLessonPage" data-id="${m.id}" data-pid="${p.id}" data-dir="1" aria-label="Move down">↓</button><button class="btn sm ghost danger" data-act="deleteLessonPage" data-id="${m.id}" data-pid="${p.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No pages yet.</td></tr>'}</tbody></table></div></section>`;
  if (h.has('grade:viewall', c.id)) html += `<section class="stack"><h2>Results</h2><div class="tw"><table><thead><tr><th>Student</th><th class="n">Completed</th><th class="n">Best grade / ${fmtG(m.maxgrade)}</th></tr></thead><tbody>${h.students(c.id).map(s => `<tr><td>${esc(fullname(s))}</td><td class="n">${S.lessonAttempts.filter(a => a.cmid === m.id && a.userId === s.id && a.finished).length}</td><td class="n">${fmtG(h.gradeFor(m, s.id))}</td></tr>`).join('')}</tbody></table></div></section>`;
  return html;
};
VIEWS.lessonplay = () => {
  const L = ui.lesson; if (!L) return notFound(); const m = S.mods[L.cmid], c = h.course(m.courseId), pages = m.pages;
  if (L.done) return modShell(m, c, `<div class="card lcard"><h2>Lesson complete</h2><p>You answered <b>${L.done.score}</b> of <b>${L.done.max}</b> questions correctly.</p><p>Grade: <b class="num">${fmtG(L.done.grade)} / ${fmtG(m.maxgrade)}</b></p><div><button class="btn primary" data-go="mod" data-id="${m.id}">Return to the lesson</button></div></div>`, 'Lesson');
  const pg = pages[L.idx], last = L.idx === pages.length - 1;
  const prog = `<div class="lprog" aria-label="Page ${L.idx + 1} of ${pages.length}">${pages.map((_, i) => `<i class="${i <= L.idx ? 'd' : ''}"></i>`).join('')}</div>`;
  let body = `<h2>${esc(pg.title)}</h2><div class="prose">${md(pg.body)}</div>`;
  const next = last ? `<button class="btn primary" data-act="lessonFinish">Finish lesson</button>` : `<button class="btn primary" data-act="lessonNext">Continue</button>`;
  if (pg.kind === 'question') {
    const prev = L.answers[pg.id];
    if (L.fb) body += `<div class="fb ${L.fb.correct ? 'right' : 'wrong'}"><b>${L.fb.correct ? 'Correct.' : 'Not quite.'}</b> ${esc(L.fb.feedback)}${!L.fb.correct && L.fb.right ? `<br>The correct answer is: <b>${esc(L.fb.right)}</b>` : ''}</div><div>${next}</div>`;
    else if (prev != null) body += `<p class="muted small">You answered this question earlier: <b>${esc(pg.options[prev]?.text || '')}</b></p><div>${next}</div>`;
    else body += `<form data-form="lessonAnswer" class="stack" style="gap:6px">${pg.options.map((o, i) => `<label class="opt"><input type="radio" name="answer" value="${i}" required><span>${esc(o.text)}</span></label>`).join('')}<div><button class="btn primary" type="submit">Submit answer</button></div></form>`;
  } else body += `<div>${next}</div>`;
  return modShell(m, c, `<div class="card lcard">${prog}<span class="muted small">Page ${L.idx + 1} of ${pages.length}</span>${body}</div>`, 'Lesson');
};

/* Workshop */
BODIES.workshop = (m, c) => {
  const ph = m.phase || 1, ed = h.canEdit(c.id), learner = h.isLearner(c.id);
  const bar = `<div class="phases">${[1, 2, 3, 4, 5].map(i => `<div class="phase ${i === ph ? 'on' : i < ph ? 'past' : ''}"><b>${C.WS_PHASES[i]}</b><span>${['Teacher prepares', 'Students submit work', 'Students review peers', 'Grades are calculated', 'Workshop closed'][i - 1]}</span>${ed && i !== ph ? `<button class="link small" style="color:inherit;text-decoration:underline" data-act="wsPhase" data-id="${m.id}" data-ph="${i}">Switch to this phase</button>` : ''}</div>`).join('')}</div>`;
  let html = bar + (m.instructions ? `<div class="card prose" style="margin-bottom:18px;max-width:none"><b>Assessment guidance</b>${md(m.instructions)}</div>` : '');
  if (learner) {
    const mine = S.wsSubs.find(s => s.cmid === m.id && s.userId === S.me);
    html += `<section class="stack" style="margin-bottom:22px"><h2>Your submission</h2>`;
    if (ph === 2) html += `<form data-form="wsSubmit" class="card stack" style="max-width:820px"><input type="hidden" name="mid" value="${m.id}"><div class="field"><label for="wst">Title</label><input id="wst" name="title" type="text" value="${esc(mine?.title || '')}" required></div><div class="field"><label for="wsx">Your work</label><textarea id="wsx" name="text" rows="10" required>${esc(mine?.text || '')}</textarea></div><div><button class="btn primary" type="submit">${mine ? 'Update submission' : 'Submit'}</button></div></form>`;
    else html += mine ? `<div class="card stack"><b>${esc(mine.title)}</b><div style="white-space:pre-wrap">${esc(mine.text)}</div><span class="muted small">Submitted ${fmtDate(mine.time)}</span></div>` : `<div class="card muted">${ph < 2 ? 'The submission phase has not started yet.' : 'You did not submit work for this workshop.'}</div>`;
    html += '</section>';
    const mineA = S.wsAllocs.filter(a => a.cmid === m.id && a.reviewer === S.me);
    if (ph >= 3 && mineA.length) html += `<section class="stack" style="margin-bottom:22px"><h2>Assigned submissions to assess</h2>${mineA.map((a, i) => { const s = S.wsSubs.find(x => x.id === a.subId);
      return `<div class="card stack"><div class="spread"><b>Submission ${i + 1}: ${esc(s?.title || '')}</b>${a.done ? `<span class="chip ok">Assessed · ${a.grade}/100</span>` : '<span class="chip warn">To do</span>'}</div><div style="white-space:pre-wrap">${esc(s?.text || '')}</div>
        ${ph === 3 ? `<form data-form="wsAssess" class="fgrid" style="border-top:1px solid var(--line);padding-top:12px"><input type="hidden" name="id" value="${a.id}"><div class="field"><label for="wg${a.id}">Score (0–100)</label><input id="wg${a.id}" name="grade" type="number" min="0" max="100" value="${a.grade ?? ''}" required></div><div class="field full"><label for="wc${a.id}">Comment for the author</label><textarea id="wc${a.id}" name="comment" rows="3">${esc(a.comment)}</textarea></div><div><button class="btn primary" type="submit">${a.done ? 'Update assessment' : 'Save assessment'}</button></div></form>` : a.comment ? `<p class="small muted">Your comment: ${esc(a.comment)}</p>` : ''}</div>`; }).join('')}</section>`;
    else if (ph === 3) html += '<div class="card muted" style="margin-bottom:22px">You have no submissions to assess. Assessments are only allocated to students who submitted work.</div>';
    if (ph >= 4) { const g = h.wsGrades(m, S.me); const recv = mine ? S.wsAllocs.filter(a => a.subId === mine.id && a.done) : [];
      html += `<section class="stack"><h2>Your grades</h2><div class="tw"><table class="kv"><tbody><tr><th>Grade for submission</th><td class="num">${fmtG(g?.submission)} / ${m.maxgrade}</td></tr><tr><th>Grade for assessment</th><td class="num">${fmtG(g?.assessment)} / ${m.gradinggrade}</td></tr><tr><th>Total</th><td class="num"><b>${fmtG(g?.total)}</b> / ${h.itemMax(m)}</td></tr></tbody></table></div>
        ${recv.length ? `<h3>Feedback from your peers</h3>${recv.map((a, i) => `<div class="card stack" style="gap:4px"><b>Reviewer ${i + 1} · ${a.grade}/100</b><span>${esc(a.comment) || '<span class="muted">No comment</span>'}</span></div>`).join('')}` : ''}</section>`; }
  }
  if (h.has('grade:viewall', c.id)) {
    const subs = S.wsSubs.filter(s => s.cmid === m.id);
    html += `<section class="stack"><div class="spread"><h2>Workshop submissions report</h2>${ed && ph < 5 ? `<button class="btn primary" data-act="wsPhase" data-id="${m.id}" data-ph="${ph + 1}">Switch to ${C.WS_PHASES[ph + 1]} phase</button>` : ''}</div>
      <div class="tw"><table><thead><tr><th>Student</th><th>Submission</th><th>Received</th><th>Given</th><th class="n">Total / ${h.itemMax(m)}</th></tr></thead><tbody>
      ${h.students(c.id).map(s => { const sub = subs.find(x => x.userId === s.id); const rec = sub ? S.wsAllocs.filter(a => a.subId === sub.id) : []; const giv = S.wsAllocs.filter(a => a.cmid === m.id && a.reviewer === s.id); const g = h.wsGrades(m, s.id);
        return `<tr><td>${esc(fullname(s))}</td><td class="small">${sub ? `<b>${esc(sub.title)}</b><br><span class="muted">${fmtDate(sub.time)}</span>` : '<span class="muted">No submission</span>'}</td>
          <td class="small">${rec.map(a => `${esc(fullname(a.reviewer))}: ${a.done ? a.grade : '…'}`).join('<br>') || '–'}</td><td class="small">${giv.length ? `${giv.filter(a => a.done).length} of ${giv.length} done` : '–'}</td><td class="n">${fmtG(g?.total)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No students enrolled.</td></tr>'}
      </tbody></table></div><p class="muted small">Grade for submission = average peer score, scaled to ${m.maxgrade}. Grade for assessment = share of allocated reviews completed, scaled to ${m.gradinggrade}. Each submission is reviewed by up to ${m.peers} peers.</p></section>`;
  }
  return html;
};

/* Certificate */
function certificateHTML(m, c, iss, who) {
  const cs = S.site.cert || {}, url = B.server ? `${location.origin}/cert/${iss.code}` : '';
  return `<div class="cert tpl-${esc(cs.template || 'classic')}"><div class="row" style="justify-content:center">${LOGO}<b style="font-family:var(--f-display)">${esc(S.site.name)}</b></div>
    <h2>Certificate of Completion</h2><p class="eyebrow">This certifies that</p><div class="who">${esc(fullname(who))}</div>
    <p>${esc(cs.body || 'has successfully completed')}</p><p style="font-size:1.25rem;font-weight:650;margin-top:6px">${esc(c.fullname)}</p>${iss.grade != null ? `<p class="small" style="margin-top:6px">Final course grade: ${iss.grade.toFixed(1)}%</p>` : ''}
    <div class="meta"><span><b>Date</b>${fmtDateOnly(iss.time)}</span>${iss.expires ? `<span><b>Valid until</b>${fmtDateOnly(iss.expires)}</span>` : ''}<span><b>Verification code</b><span class="mono">${esc(iss.code)}</span></span>${cs.signatureName ? `<span class="sig"><b>${esc(cs.signatureName)}</b>${esc(cs.signatureTitle || '')}</span>` : ''}</div>
    ${url ? `<p class="small" style="margin-top:14px;opacity:.75">Verify at ${esc(url)}</p>` : ''}</div>`;
}
BODIES.certificate = (m, c) => {
  let html = '';
  if (h.isLearner(c.id)) {
    const iss = S.certIssued.filter(x => x.cmid === m.id && x.userId === S.me && !x.archived)[0];
    const prev = S.certIssued.filter(x => x.cmid === m.id && x.userId === S.me && x.archived).sort((a, b) => b.time - a.time)[0];
    if (iss) html += `${certificateHTML(m, c, iss, me())}<div class="row noprint" style="justify-content:center;margin-top:16px">${B.server ? `<a class="btn primary" href="${B.certPdfUrl(iss.code)}" target="_blank" rel="noopener">Download PDF</a>` : ''}<span class="muted small">Anyone can check it with the code on the ${esc(S.site.name)} verification page.</span></div>`;
    else { const why = h.certEligible(m, S.me), prog = h.progress(c.id, S.me), tot = h.courseTotal(c.id, S.me);
      const fb = h.courseMods(c.id).filter(x => x.type === 'feedback' && x.visible);
      html += `${prev ? `<div class="card" style="margin-bottom:14px;background:var(--warn-soft);border-color:transparent"><b>Recertification in progress.</b> Your previous certificate (${esc(prev.code)}) ${prev.expires > now() ? `is valid until ${fmtDateOnly(prev.expires)}` : `expired on ${fmtDateOnly(prev.expires)}`}. Complete the course again to renew it.</div>` : ''}
        <div class="card stack" style="max-width:640px"><h2>Requirements</h2>
        ${m.requireCompletion ? `<div class="spread"><span>Complete every required activity</span><span class="chip ${prog === 100 ? 'ok' : ''}">${prog}% done</span></div>` : ''}
        ${m.minGrade ? `<div class="spread"><span>Course grade of at least ${m.minGrade}%</span><span class="chip ${tot != null && tot >= m.minGrade ? 'ok' : ''}">${tot == null ? 'No grade yet' : tot.toFixed(1) + '%'}</span></div>` : ''}
        ${m.requireFeedback ? `<div class="spread"><span>Complete the course feedback survey</span><span class="chip ${fb.every(x => h.isDone(x, S.me)) ? 'ok' : ''}">${fb.every(x => h.isDone(x, S.me)) ? 'Done' : 'To do'}</span></div>` : ''}
        ${m.validityDays ? `<p class="muted small">The certificate is valid for ${m.validityDays} days. You will be re-enrolled ${S.site.recertDays || 30} days before it expires.</p>` : ''}
        ${m.autoIssue !== false && (m.requireCompletion || m.minGrade || m.requireFeedback) ? '<p class="muted small">It is issued automatically as soon as you meet the requirements.</p>' : ''}
        <div><button class="btn primary" data-act="claimCert" data-id="${m.id}" ${why.length ? 'disabled' : ''}>Get your certificate</button></div>${why.length ? `<p class="muted small">Still to do: ${esc(why.join('; '))}.</p>` : ''}</div>`; }
  }
  if (h.has('grade:viewall', c.id)) {
    const iss = S.certIssued.filter(x => x.cmid === m.id).sort((a, b) => b.time - a.time);
    html += `<section class="stack" style="margin-top:22px"><h2>Issued certificates</h2><div class="tw"><table><thead><tr><th>Learner</th><th>Issued</th><th>Valid until</th><th>Code</th><th class="n">Course grade</th></tr></thead><tbody>${iss.map(x => `<tr><td>${esc(fullname(x.userId))}</td><td class="small">${fmtDate(x.time)}</td><td class="small">${x.expires ? fmtDateOnly(x.expires) : 'No expiry'}${x.archived ? ' <span class="chip warn">Renewing</span>' : ''}</td><td class="mono">${B.server ? `<a href="${B.certPdfUrl(x.code)}" target="_blank" rel="noopener">${esc(x.code)}</a>` : esc(x.code)}</td><td class="n">${x.grade == null ? '–' : x.grade.toFixed(1) + '%'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No certificates issued yet.</td></tr>'}</tbody></table></div></section>`;
  }
  return html || '<div class="card muted">Certificates are issued to learners in this course.</div>';
};

/* Video with captions, transcript and resume */
BODIES.video = (m, c) => {
  const f = fileOf(m.fileId); if (!f) return '<div class="card err">The video file is missing.</div>';
  const cap = m.captionsId && fileOf(m.captionsId), r = h.resume(m.id, S.me), learner = h.isLearner(c.id);
  const capOn = (me().prefs || {}).captions !== false;
  let html = `<div class="card stack"><video id="vplayer" data-mid="${m.id}" controls preload="metadata" playsinline style="width:100%;max-height:70vh;background:#000;border-radius:6px" src="${esc(B.fileUrl(f))}">${cap ? `<track kind="captions" srclang="en" label="English" src="${esc(B.fileUrl(cap))}" ${capOn ? 'default' : ''}>` : ''}</video>
    ${learner ? `<div class="spread small"><span class="muted" id="vstatus">${r?.completed ? 'Watched' : r?.position ? `You stopped at ${Math.floor(r.position / 60)}:${String(Math.floor(r.position % 60)).padStart(2, '0')}. The video resumes from there.` : `Watch at least ${m.completePct || 90}% to complete this activity.`}</span>${r?.duration ? `<span class="num">${Math.round(Math.min(100, (r.watched || 0) / r.duration * 100))}% watched</span>` : ''}</div>` : ''}
    ${cap ? '<details><summary class="small"><b>Transcript</b></summary><div id="vtranscript" class="prose small" style="margin-top:8px">Loading…</div></details>' : ''}</div>`;
  if (h.has('grade:viewall', c.id)) html += `<section class="stack" style="margin-top:22px"><h2>Viewing</h2><div class="tw"><table><thead><tr><th>Learner</th><th class="n">Watched</th><th>Last viewed</th><th>Status</th></tr></thead><tbody>${h.students(c.id).map(s => { const x = h.resume(m.id, s.id); return `<tr><td>${esc(fullname(s))}</td><td class="n">${x?.duration ? fmtPct(Math.min(100, (x.watched || 0) / x.duration * 100)) : '–'}</td><td class="small">${x ? ago(x.updated) : '–'}</td><td>${x?.completed ? '<span class="chip ok">Completed</span>' : x ? '<span class="chip brand">Started</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  return html;
};
/* SCORM 1.2 player */
BODIES.scorm = (m, c) => {
  const r = h.resume(m.id, S.me), learner = h.isLearner(c.id);
  const src = B.server ? B.scormUrl(m) : null, local = !B.server && m.launchFileId && B.fileData?.(m.launchFileId);
  let html = learner ? `<div class="spread" style="margin-bottom:10px"><div class="row" style="gap:6px">${r?.completed ? `<span class="chip ok">Completed${r.score != null ? ` · score ${r.score}%` : ''}</span>` : r ? `<span class="chip brand">In progress</span><span class="muted small">Your place is saved. You will continue where you stopped.</span>` : '<span class="chip">Not started</span>'}</div><span class="muted small" id="scormstatus"></span></div>` : '';
  if (src || local) html += `<iframe id="scormframe" data-mid="${m.id}" title="${esc(m.name)}" ${src ? `src="${esc(src)}"` : ''} style="width:100%;height:min(70vh,620px);border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>`;
  else html += `<div class="card muted">This SCORM package can only be played on the server edition. In the preview, single-page packages play directly.</div>`;
  if (h.has('grade:viewall', c.id)) html += `<section class="stack" style="margin-top:22px"><h2>Learner progress</h2><div class="tw"><table><thead><tr><th>Learner</th><th>Status</th><th class="n">Score</th><th>Location</th><th>Last activity</th></tr></thead><tbody>${h.students(c.id).map(s => { const x = h.resume(m.id, s.id); return `<tr><td>${esc(fullname(s))}</td><td>${x ? `<span class="chip ${x.completed ? 'ok' : 'brand'}">${esc(x.status || 'incomplete')}</span>` : '<span class="chip">Not attempted</span>'}</td><td class="n">${x?.score != null ? x.score + '%' : '–'}</td><td class="small">${esc(x?.location || '–')}</td><td class="small">${x ? ago(x.updated) : '–'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  return html;
};
/* Live session (ILT / VILT) */
BODIES.live = (m, c) => {
  const learner = h.isLearner(c.id), mine = S.liveSignups.find(x => x.cmid === m.id && x.userId === S.me && !x.archived);
  const end = m.start + (m.duration || 60) * 6e4, past = now() > end, soon = now() > m.start - 15 * 6e4 && !past;
  let html = `<div class="card stack" style="max-width:760px"><div class="fgrid">
    <div><span class="eyebrow">When</span><div><b>${fmtDate(m.start)}</b><br><span class="muted small">${m.duration || 60} minutes${past ? ' · finished' : now() > m.start ? ' · happening now' : ` · starts in ${dur(m.start - now())}`}</span></div></div>
    <div><span class="eyebrow">${m.mode === 'ilt' ? 'Where (in person)' : 'Where (online)'}</span><div>${m.mode === 'ilt' ? esc(m.location || 'To be confirmed') : m.link ? (mine || !learner ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">${soon || !learner ? 'Join the session' : 'Meeting link'} ↗</a>` : 'Register to see the link') : 'Link shared before the session'}</div></div>
    <div><span class="eyebrow">Places</span><div>${m.registered || 0}${m.capacity ? ` of ${m.capacity}` : ''} registered</div></div>
    ${learner ? `<div><span class="eyebrow">You</span><div>${mine ? `<span class="chip ${mine.status === 'present' || mine.status === 'late' ? 'ok' : mine.status === 'absent' ? 'bad' : 'brand'}">${{registered:'Registered', present:'Attended', late:'Attended (late)', absent:'Absent'}[mine.status]}</span>` : '<span class="chip">Not registered</span>'}</div></div>` : ''}</div>
    ${learner && !past ? `<div class="row">${mine ? (mine.status === 'registered' ? `<button class="btn" data-act="liveCancel" data-id="${m.id}">Cancel my place</button>` : '') : `<button class="btn primary" data-act="liveRegister" data-id="${m.id}" ${m.capacity && (m.registered || 0) >= m.capacity ? 'disabled' : ''}>${m.capacity && (m.registered || 0) >= m.capacity ? 'Session full' : 'Register'}</button>`}${soon && m.link && mine ? `<a class="btn primary" href="${esc(m.link)}" target="_blank" rel="noopener">Join now ↗</a>` : ''}</div>` : ''}
    ${learner ? '<p class="muted small">Attendance is recorded by the trainer and completes this activity.</p>' : ''}</div>`;
  const rec = m.recordingFileId && fileOf(m.recordingFileId);
  if (rec || m.recordingUrl) html += `<section class="card stack" style="margin-top:16px;max-width:760px"><h2>Recording</h2>${rec ? (/^video\//.test(rec.type) ? `<video controls preload="metadata" style="width:100%;border-radius:6px;background:#000" src="${esc(B.fileUrl(rec))}"></video>` : fileChip(rec.id)) : ''}${m.recordingUrl ? `<a href="${esc(m.recordingUrl)}" target="_blank" rel="noopener">Watch the recording ↗</a>` : ''}</section>`;
  if (h.has('live:manage', c.id)) {
    const st = h.students(c.id);
    html += `<section class="stack" style="margin-top:22px"><div class="spread"><h2>Attendance roster</h2><span class="muted small">${S.liveSignups.filter(x => x.cmid === m.id && !x.archived && (x.status === 'present' || x.status === 'late')).length} attended</span></div>
      <form data-form="attendance" class="stack"><input type="hidden" name="mid" value="${m.id}"><div class="tw"><table><thead><tr><th>Learner</th><th>Registered</th><th>Attendance</th></tr></thead><tbody>
      ${st.map(s => { const x = S.liveSignups.find(y => y.cmid === m.id && y.userId === s.id && !y.archived); return `<tr><td>${esc(fullname(s))}</td><td class="small">${x ? fmtShort(x.time) : '–'}</td><td><select name="att:${s.id}" class="sel-sm" aria-label="Attendance for ${esc(fullname(s))}">${[['', '—'], ['registered', 'Registered'], ['present', 'Present'], ['late', 'Late'], ['absent', 'Absent']].map(([v, l]) => `<option value="${v}" ${(x?.status || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`; }).join('') || '<tr><td colspan="3" class="empty">No learners.</td></tr>'}
      </tbody></table></div><div><button class="btn primary" type="submit">Save attendance</button></div></form>
      <form data-form="recording" class="card stack"><input type="hidden" name="mid" value="${m.id}"><h3>Add a recording</h3><div class="fgrid"><div class="field"><label for="recf">Upload a video file</label><input type="hidden" name="fileId" id="recfid" value=""><input id="recf" type="file" accept="video/*" data-upload="rec"><span class="hint" id="recname">${rec ? `Current: ${esc(rec.name)}` : ''}</span></div>
        <div class="field"><label for="recu">Or link to it</label><input id="recu" name="url" type="url" placeholder="https://" value="${esc(m.recordingUrl || '')}"></div></div><div><button class="btn" type="submit">Save recording</button></div></form></section>`;
  }
  return html;
};
/* Feedback survey */
BODIES.feedback = (m, c) => {
  const mine = S.feedbackResponses.find(r => r.cmid === m.id && r.userId === S.me && !r.archived), learner = h.isLearner(c.id);
  let html = '';
  if (learner) {
    if (mine) html += `<div class="card stack" style="max-width:720px"><h2>Thank you</h2><p class="muted">You completed this survey on ${fmtDateOnly(mine.time)}.</p></div>`;
    else html += `<form data-form="feedback" class="card stack" style="max-width:720px"><input type="hidden" name="mid" value="${m.id}">${m.anonymous ? '<p class="muted small">Your answers are anonymous to trainers.</p>' : ''}
      ${m.questions.map((q, i) => `<fieldset class="stack" style="border:0;padding:0;margin:0;gap:6px"><legend class="lbl" style="margin-bottom:6px">${i + 1}. ${esc(q.text)}${q.required ? '' : ' <span class="muted small">(optional)</span>'}</legend>
        ${q.type === 'rating' ? `<div class="rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="q:${q.id}" value="${n}" ${q.required ? 'required' : ''}><span>${n}</span></label>`).join('')}<span class="muted small">1 = poor · 5 = excellent</span></div>`
        : q.type === 'choice' ? q.options.map((o, k) => `<label class="opt"><input type="radio" name="q:${q.id}" value="${k}" ${q.required ? 'required' : ''}><span>${esc(o)}</span></label>`).join('')
        : `<textarea name="q:${q.id}" rows="3" ${q.required ? 'required' : ''} aria-label="${esc(q.text)}"></textarea>`}</fieldset>`).join('')}
      <p class="err" id="fberr" hidden></p><div><button class="btn primary" type="submit">Submit feedback</button></div></form>`;
  }
  if (h.has('grade:viewall', c.id)) {
    const rs = S.feedbackResponses.filter(r => r.cmid === m.id && !r.archived), n = h.students(c.id).length;
    html += `<section class="stack" style="margin-top:22px"><div class="spread"><h2>Responses</h2><span class="chip">${rs.length} of ${n} learners · ${fmtPct(n ? rs.length / n * 100 : 0)}</span></div>
      ${m.questions.map(q => { const vals = rs.map(r => r.answers[q.id]).filter(v => v != null);
        if (q.type === 'rating') { const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; return `<div class="card stack" style="gap:8px"><div class="spread"><b>${esc(q.text)}</b><span class="chip brand">Average ${avg == null ? '–' : avg.toFixed(1)} / 5</span></div><div class="cres">${[5, 4, 3, 2, 1].map(k => { const c2 = vals.filter(v => v === k).length; return `<div class="rowb"><div class="row" style="flex-wrap:nowrap;gap:8px"><span class="num small" style="width:14px">${k}</span><div class="barw" style="flex:1"><i style="width:${vals.length ? c2 / vals.length * 100 : 0}%"></i></div></div><span class="num small">${c2}</span></div>`; }).join('')}</div></div>`; }
        if (q.type === 'choice') return `<div class="card stack" style="gap:8px"><b>${esc(q.text)}</b><div class="cres">${q.options.map((o, k) => { const c2 = vals.filter(v => v === k).length; return `<div class="rowb"><div class="stack" style="gap:3px"><span class="small">${esc(o)}</span><div class="barw"><i style="width:${vals.length ? c2 / vals.length * 100 : 0}%"></i></div></div><span class="num small">${c2}</span></div>`; }).join('')}</div></div>`;
        return `<div class="card stack" style="gap:8px"><b>${esc(q.text)}</b>${rs.filter(r => r.answers[q.id]).map(r => `<blockquote class="quote">${esc(r.answers[q.id])}<footer class="muted small">${r.userId ? esc(fullname(r.userId)) : 'Anonymous'} · ${fmtShort(r.time)}</footer></blockquote>`).join('') || '<p class="muted small">No answers yet.</p>'}</div>`; }).join('')}</section>`;
  }
  return html || '<div class="card muted">Feedback is collected from learners in this course.</div>';
};

/* ---------- Players: mount after render ---------- */
let scormAPI = null;
function mountPlayers() {
  const v = document.getElementById('vplayer');
  if (v && !v.dataset.mounted) {
    v.dataset.mounted = '1'; const mid = v.dataset.mid, m = S.mods[mid], learner = h.isLearner(m.courseId), r = h.resume(mid, S.me);
    let last = 0, done = !!r?.completed;
    v.addEventListener('loadedmetadata', () => { if (r?.position && r.position < v.duration - 2 && !r.completed) v.currentTime = r.position; });
    const save = async force => { if (!learner || !v.duration) return; if (!force && Math.abs(v.currentTime - last) < 8) return; last = v.currentTime;
      try { const out = await B.op('saveProgress', {mid, position:v.currentTime, duration:v.duration}); if (out.result?.completed && !done) { done = true; const st = document.getElementById('vstatus'); if (st) st.textContent = 'Watched. This activity is complete.'; toast('Video completed'); setState(await B.init()); } } catch (e) {} };
    v.addEventListener('timeupdate', () => save(false)); v.addEventListener('pause', () => save(true)); v.addEventListener('ended', () => save(true));
    const tr = document.getElementById('vtranscript'), cap = m.captionsId && fileOf(m.captionsId);
    if (tr && cap) B.fileText(cap).then(t => { const cues = t.split(/\r?\n\r?\n/).map(b => b.split(/\r?\n/)).filter(l => l.some(x => x.includes('-->'))).map(l => { const i = l.findIndex(x => x.includes('-->')); return {at:l[i].split('-->')[0].trim(), text:l.slice(i + 1).join(' ')}; });
      tr.innerHTML = cues.map(c2 => `<p><button class="link mono small" data-act="seek" data-t="${esc(c2.at)}">${esc(c2.at.replace(/\.\d+$/, ''))}</button> ${esc(c2.text)}</p>`).join('') || 'No transcript.'; }).catch(() => { tr.textContent = 'Transcript not available.'; });
  }
  const f = document.getElementById('scormframe');
  if (f && !f.dataset.mounted) {
    f.dataset.mounted = '1'; const mid = f.dataset.mid, m = S.mods[mid], learner = h.isLearner(m.courseId), r = h.resume(mid, S.me) || {}, u = me();
    const cmi = {'cmi.core.student_id':u.username || u.id, 'cmi.core.student_name':`${u.lastname}, ${u.firstname}`, 'cmi.core.lesson_location':r.location || '', 'cmi.core.lesson_status':r.status || 'not attempted', 'cmi.core.entry':r.updated ? 'resume' : 'ab-initio', 'cmi.core.credit':learner ? 'credit' : 'no-credit', 'cmi.core.lesson_mode':learner ? 'normal' : 'browse', 'cmi.core.score.raw':r.score ?? '', 'cmi.core.score.min':'0', 'cmi.core.score.max':'100', 'cmi.core.total_time':'0000:00:00', 'cmi.suspend_data':r.suspend || '', 'cmi.launch_data':'', 'cmi.core.exit':'', 'cmi.core.session_time':''};
    let err = '0', dirty = false;
    const commit = async finish => { if (!learner || !dirty) return 'true'; dirty = false; try { const out = await B.op('scormCommit', {mid, cmi:{'cmi.core.lesson_location':cmi['cmi.core.lesson_location'], 'cmi.suspend_data':cmi['cmi.suspend_data'], 'cmi.core.lesson_status':cmi['cmi.core.lesson_status'], 'cmi.core.score.raw':cmi['cmi.core.score.raw']}, finish}); const el = document.getElementById('scormstatus'); if (el) el.textContent = `Saved ${new Date().toLocaleTimeString('en-IN', {hour:'numeric', minute:'2-digit'})}`; if (out.result?.completed && !r.completed) { r.completed = true; toast('Module completed'); setTimeout(async () => setState(await B.init()), 0); } } catch (e) { err = '101'; } return 'true'; };
    scormAPI = window.API = {
      LMSInitialize:() => 'true', LMSFinish:() => { commit(true); return 'true'; },
      LMSGetValue:k => { err = '0'; if (k in cmi) return String(cmi[k]); if (k === 'cmi.core._children') return 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time'; err = '401'; return ''; },
      LMSSetValue:(k, v) => { err = '0'; if (['cmi.core.student_id', 'cmi.core.student_name', 'cmi.core.credit', 'cmi.core.entry', 'cmi.core.total_time', 'cmi.core.lesson_mode', 'cmi.launch_data'].includes(k)) { err = '403'; return 'false'; } cmi[k] = String(v); dirty = true; return 'true'; },
      LMSCommit:() => { commit(false); return 'true'; }, LMSGetLastError:() => err, LMSGetErrorString:c2 => ({'0':'No error', '101':'General exception', '401':'Not implemented', '403':'Element is read only'}[c2] || 'Error'), LMSGetDiagnostic:() => ''
    };
    if (!B.server) { const data = B.fileData?.(m.launchFileId); if (data) { try { f.srcdoc = decodeURIComponent(data.slice(data.indexOf(',') + 1)); } catch (e) {} } }
  }
}
