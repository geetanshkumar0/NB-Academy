/* NB Academy front end · modals, actions, forms, events, start-up */
'use strict';

/* ---------- Modal forms ---------- */
function modForm(type, cid, sid, m) {
  const c = h.course(cid), v = m || {}, f = [];
  const num = (id, name, label, val, extra = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="number" value="${val ?? ''}" ${extra}></div>`;
  const chk = (name, label, on) => `<label class="check full"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  const dt = (id, name, label, val) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="datetime-local" value="${toInput(val)}"></div>`;
  if (type !== 'label') f.push(`<div class="field full"><label for="mf-name">Name</label><input id="mf-name" name="name" type="text" value="${esc(v.name || '')}" required></div>`);
  f.push(`<div class="field full"><label for="mf-intro">${type === 'label' ? 'Text' : 'Description'}</label><textarea id="mf-intro" name="intro" rows="${type === 'label' ? 5 : 3}" ${type === 'label' ? 'required' : ''}>${esc(v.intro || '')}</textarea><span class="hint">Formatting: **bold**, *italic*, - bullet, ## heading, [link](https://…)</span></div>`);
  if (type === 'page') f.push(`<div class="field full"><label for="mf-content">Page content</label><textarea id="mf-content" name="content" rows="10" required>${esc(v.content || '')}</textarea></div>`);
  if (type === 'url') f.push(`<div class="field full"><label for="mf-url">External URL</label><input id="mf-url" name="url" type="url" placeholder="https://" value="${esc(v.url || '')}" required></div>`);
  if (type === 'file') { const cur = v.fileId && fileOf(v.fileId); f.push(`<div class="field full"><label for="mf-file">File</label><input type="hidden" name="fileId" id="mf-fileid" value="${esc(v.fileId || '')}"><input id="mf-file" type="file" data-upload="mod"><span class="hint" id="mf-filename">${cur ? `Current file: ${esc(cur.name)} (${fmtSize(cur.size)})` : `Up to ${B.server ? '1 GB' : '3 MB'}`}</span></div>`); }
  if (type === 'assign') { const rub = (v.rubric?.criteria || []).map(c2 => [c2.text, ...c2.levels.map(l => `${l.text}:${l.points}`)].join(' | ')).join('\n');
    f.push(dt('mf-due', 'due', 'Due date', v.due ?? now() + 7 * D), num('mf-max', 'maxgrade', 'Maximum grade', v.maxgrade ?? 100, 'min="1" required'), chk('allowFiles', 'Allow file submissions', v.allowFiles ?? true),
      `<div class="field full"><label for="mf-rub">Rubric (optional)</label><textarea id="mf-rub" name="rubric" rows="4" class="mono" style="font-size:.84rem" placeholder="Criterion | Level description:points | Level description:points">${esc(rub)}</textarea><span class="hint">One criterion per line, then its levels separated by |, each ending with :points. Example: Explanation | Unclear:0 | Clear:5 | Clear with examples:10</span></div>`); }
  if (type === 'quiz') f.push(dt('mf-close', 'close', 'Close the quiz', v.close ?? now() + 7 * D), num('mf-tl', 'timelimit', 'Time limit (minutes, 0 = none)', v.timelimit ?? 0, 'min="0"'), num('mf-at', 'attempts', 'Attempts allowed (0 = unlimited)', v.attempts ?? 1, 'min="0"'), num('mf-max', 'maxgrade', 'Maximum grade', v.maxgrade ?? 10, 'min="1" required'),
    num('mf-gp', 'gradepass', 'Pass mark % (0 = none; completion then needs a pass)', v.gradepass ?? 0, 'min="0" max="100"'), chk('pretest', 'Pre-test: baseline only, not graded and not required for completion', v.pretest));
  if (type === 'video') { const cur = v.fileId && fileOf(v.fileId), cap = v.captionsId && fileOf(v.captionsId);
    f.push(`<div class="field full"><label for="mf-file">Video file (MP4 or WebM)</label><input type="hidden" name="fileId" id="mf-fileid" value="${esc(v.fileId || '')}"><input id="mf-file" type="file" accept="video/*" data-upload="mod"><span class="hint" id="mf-filename">${cur ? `Current: ${esc(cur.name)} (${fmtSize(cur.size)})` : `Up to ${B.server ? '1 GB' : '3 MB'}`}</span></div>`,
      `<div class="field"><label for="mf-cap">Captions (WebVTT .vtt)</label><input type="hidden" name="captionsId" id="mf-capid" value="${esc(v.captionsId || '')}"><input id="mf-cap" type="file" accept=".vtt,text/vtt" data-upload="captions"><span class="hint" id="mf-capname">${cap ? `Current: ${esc(cap.name)}` : 'Optional, but needed for accessibility'}</span></div>`,
      num('mf-cp', 'completePct', 'Complete when this % has been watched', v.completePct ?? 90, 'min="10" max="100"')); }
  if (type === 'scorm') { const cur = v.packageId && fileOf(v.packageId);
    f.push(`<div class="field full"><label for="mf-pkg">SCORM package, 1.2 or 2004 (.zip with imsmanifest.xml)</label><input type="hidden" name="packageId" id="mf-pkgid" value="${esc(v.packageId || '')}"><input type="hidden" name="launchFileId" id="mf-launch" value="${esc(v.launchFileId || '')}"><input id="mf-pkg" type="file" accept=".zip,application/zip" data-upload="scorm"><span class="hint" id="mf-pkgname">${cur ? `Current: ${esc(cur.name)}` : 'The package is unpacked and checked on the server when you save.'}</span></div>`,
      num('mf-max', 'maxgrade', 'Maximum grade (from the package score)', v.maxgrade ?? 100, 'min="0" required')); }
  if (type === 'live') { const md = v.mode || 'room', ready = S.site.meetings?.ready;
    f.push(`<div class="field"><label for="mf-mode">Where</label><select id="mf-mode" name="mode"><option value="room" ${md === 'room' ? 'selected' : ''}>Online in NB Academy (video room)</option><option value="vilt" ${md === 'vilt' ? 'selected' : ''}>Online, with an outside meeting link</option><option value="ilt" ${md === 'ilt' ? 'selected' : ''}>In person (ILT)</option></select>${ready ? '' : `<span class="hint">${h.has('site:config') ? 'Video rooms need the meeting server: Site administration › Email, sign-in and meetings.' : 'Video rooms are not set up yet: ask an administrator.'} You can still schedule the session and send invitations now.</span>`}</div>`,
    dt('mf-start', 'start', 'Date and time', v.start ?? now() + 3 * D), num('mf-dur', 'duration', 'Duration (minutes)', v.duration ?? 60, 'min="5"'), num('mf-capy', 'capacity', 'Places (0 = unlimited)', v.capacity ?? 0, 'min="0"'),
    `<div class="field"><label for="mf-loc">Location (in person)</label><input id="mf-loc" name="location" type="text" value="${esc(v.location || '')}"></div>`, `<div class="field"><label for="mf-link">Outside meeting link</label><input id="mf-link" name="link" type="url" placeholder="https://" value="${esc(v.link || '')}"></div>`,
    `<div class="field full"><label for="mf-inv">Invite by email</label><textarea id="mf-inv" name="invites" rows="3" placeholder="name@nobroker.in, another@nobroker.in">${esc((v.inviteEmails || []).join('\n'))}</textarea><span class="hint">One per line, or separated by commas. Each must be an NB Academy account; anyone not yet in this course is enrolled as a learner. Invitations go out from NB Academy's email address when you save, with a link that opens the session. Changes to the time or place are emailed too.</span></div>`); }
  if (type === 'feedback') { const qs = (v.questions || [{type:'rating', text:'How useful was this course?', required:true}, {type:'choice', text:'Was the length right?', options:['Too short', 'About right', 'Too long'], required:true}, {type:'text', text:'What should we improve?', required:false}]).map(q => `${q.required === false ? '?' : ''}${q.type}: ${q.text}${q.options?.length ? ' | ' + q.options.join(' | ') : ''}`).join('\n');
    f.push(`<div class="field full"><label for="mf-fq">Questions</label><textarea id="mf-fq" name="fquestions" rows="5" class="mono" style="font-size:.84rem" required>${esc(qs)}</textarea><span class="hint">One per line: <code>rating: text</code> (1–5 scale), <code>choice: text | option | option</code>, or <code>text: text</code>. Start a line with ? to make it optional.</span></div>`, chk('anonymous', 'Anonymous: trainers do not see who answered', v.anonymous)); }
  if (type === 'forum') f.push(chk('news', 'Announcements forum (only teachers can post)', v.news));
  if (type === 'glossary') f.push(chk('approval', 'Entries from students need approval', v.approval ?? true));
  if (type === 'choice') f.push(`<div class="field full"><label for="mf-opts">Options</label><textarea id="mf-opts" name="options" rows="4" required placeholder="One option per line">${esc((v.options || []).join('\n'))}</textarea></div>`, chk('allowUpdate', 'Allow learners to change their choice', v.allowUpdate ?? true),
    `<div class="field"><label for="mf-sr">Publish results</label><select id="mf-sr" name="showResults">${[['after', 'After the learner answers'], ['always', 'Always'], ['never', 'Never (teachers only)']].map(([k, l]) => `<option value="${k}" ${v.showResults === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`);
  if (type === 'lesson') f.push(num('mf-max', 'maxgrade', 'Maximum grade', v.maxgrade ?? 10, 'min="1" required'), dt('mf-close', 'close', 'Close the lesson (optional)', v.close));
  if (type === 'workshop') f.push(`<div class="field full"><label for="mf-ins">Assessment guidance for reviewers</label><textarea id="mf-ins" name="instructions" rows="3">${esc(v.instructions || '')}</textarea></div>`, dt('mf-se', 'subEnd', 'Submissions close', v.subEnd ?? now() + 7 * D),
    num('mf-max', 'maxgrade', 'Grade for submission', v.maxgrade ?? 80, 'min="0" required'), num('mf-gg', 'gradinggrade', 'Grade for assessment', v.gradinggrade ?? 20, 'min="0" required'), num('mf-peers', 'peers', 'Reviews per submission', v.peers ?? 2, 'min="1" max="5" required'));
  if (type === 'certificate') f.push(chk('requireCompletion', 'Learner must complete every required activity', v.requireCompletion ?? true), chk('requireFeedback', 'Learner must complete the course feedback survey first', v.requireFeedback ?? true), chk('autoIssue', 'Issue automatically when the requirements are met', v.autoIssue !== false),
    num('mf-mg', 'minGrade', 'Minimum course grade % (0 = none)', v.minGrade ?? 0, 'min="0" max="100"'), num('mf-vd', 'validityDays', 'Valid for days (0 = never expires)', v.validityDays ?? 0, 'min="0"'));
  const others = c.sections.flatMap(s2 => s2.mods).map(id => S.mods[id]).filter(x => x && x.id !== v.id && x.type !== 'label');
  if (others.length && type !== 'label') f.push(`<div class="field full"><span class="lbl">Only available after completing (optional)</span>${picker('requires', others.map(x => [x.id, x.name, C.TYPES[x.type].label]), v.requires || [], {placeholder:'Search activities'})}</div>`);
  f.push(`<div class="field"><label for="mf-sec">Section</label><select id="mf-sec" name="sid">${c.sections.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`);
  f.push(`<label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="visible" ${v.visible === false ? '' : 'checked'}> Visible to students</label>`);
  openModal(`${m ? 'Edit' : 'Add'} ${C.TYPES[type].label.toLowerCase()}`, `<form data-form="modSettings" class="stack"><input type="hidden" name="cid" value="${cid}"><input type="hidden" name="type" value="${type}"><input type="hidden" name="mid" value="${v.id || ''}">
    ${type === 'quiz' ? `<p class="muted small" style="margin:0">${m ? `This quiz has ${(m.questions || []).length} question${(m.questions || []).length === 1 ? '' : 's'}. Add and edit them on the quiz page.` : 'After you save, the quiz page opens so you can add its questions.'}</p>` : ''}
    <div class="fgrid">${f.join('')}</div><p class="err" id="moderr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">${!m && type === 'quiz' ? 'Save and add questions' : !m && type === 'lesson' ? 'Save and add pages' : 'Save and return'}</button></div></form>`, true);
}
function questionForm(m, q) {
  const v = q || {type:'mc', mark:1};
  const opts = v.type === 'mc' ? (v.options || []).map(o => (o.correct ? '*' : '') + o.text).join('\n') : '';
  openModal(q ? 'Edit question' : `Add a question to ${m.name}${(m.questions || []).length ? ` (question ${(m.questions || []).length + 1})` : ''}`, `<form data-form="question" class="stack"><input type="hidden" name="mid" value="${m.id}"><input type="hidden" name="qid" value="${v.id || ''}">
    <div class="fgrid"><div class="field"><label for="qtype">Question type</label><select id="qtype" name="type">${Object.entries(C.QTYPES).map(([k, l]) => `<option value="${k}" ${k === v.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="qmark">Default mark</label><input id="qmark" name="mark" type="number" min="0.5" step="0.5" value="${v.mark}" required></div>
    <div class="field full"><label for="qtext">Question text</label><textarea id="qtext" name="text" rows="3" required>${esc(v.text || '')}</textarea></div>
    <div class="field full" data-for="mc"><label for="qopts">Choices</label><textarea id="qopts" name="options" rows="5" placeholder="One choice per line. Start the correct choice with *">${esc(opts)}</textarea><span class="hint">One choice per line. Put * before the correct choice, e.g. *Paris</span></div>
    <div class="field full" data-for="tf"><span class="lbl">Correct answer</span><div class="row"><label class="check"><input type="radio" name="tf" value="true" ${v.answer !== false ? 'checked' : ''}> True</label><label class="check"><input type="radio" name="tf" value="false" ${v.answer === false ? 'checked' : ''}> False</label></div></div>
    <div class="field full" data-for="short"><label for="qshort">Accepted answers</label><input id="qshort" name="short" type="text" value="${v.type === 'short' ? esc(v.answer) : ''}"><span class="hint">Separate alternatives with | (not case-sensitive)</span></div>
    <div class="field" data-for="num"><label for="qnum">Answer</label><input id="qnum" name="num" type="number" step="any" value="${v.type === 'num' ? v.answer : ''}"></div>
    <div class="field" data-for="num"><label for="qtol">Error accepted (±)</label><input id="qtol" name="tol" type="number" step="any" min="0" value="${v.type === 'num' ? (v.tol || 0) : 0}"></div></div>
    <p class="err" id="qerr" hidden></p>
    <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button>${q ? '' : '<button class="btn" type="submit" name="next" value="1">Save and add another</button>'}<button class="btn primary" type="submit">${q ? 'Save changes' : 'Save question'}</button></div></form>`, true);
}
function toggleQFields() { const t = document.getElementById('qtype').value; document.querySelectorAll('[data-for]').forEach(el => el.hidden = el.dataset.for !== t); }
function lessonPageForm(m, pg, kind) {
  const v = pg || {kind, title:'', body:'', options:[]}; const q = v.kind === 'question';
  const opts = (v.options || []).map(o => `${o.correct ? '*' : ''}${o.text}${o.feedback ? ' | ' + o.feedback : ''}`).join('\n');
  openModal(`${pg ? 'Edit' : 'Add'} ${q ? 'question' : 'content'} page`, `<form data-form="lessonPage" class="stack"><input type="hidden" name="mid" value="${m.id}"><input type="hidden" name="pid" value="${v.id || ''}"><input type="hidden" name="kind" value="${v.kind}">
    <div class="field"><label for="lpt">Page title</label><input id="lpt" name="title" type="text" value="${esc(v.title)}" required></div>
    <div class="field"><label for="lpb">${q ? 'Question' : 'Page content'}</label><textarea id="lpb" name="body" rows="5">${esc(v.body)}</textarea></div>
    ${q ? `<div class="field"><label for="lpo">Answers</label><textarea id="lpo" name="options" rows="5" required placeholder="*Correct answer | feedback shown after answering&#10;Wrong answer | why it is wrong">${esc(opts)}</textarea><span class="hint">One answer per line. Start the correct one with *. Add feedback after a | character.</span></div>` : ''}
    <p class="err" id="lperr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save page</button></div></form>`, true);
}
const BADGE_COLORS = ['#FB3753', '#000000', '#ad2f68', '#21795f', '#7a4fb0', '#2c66ad'];
function badgeForm(cid, b) {
  const v = b || {name:'', description:'', color:BADGE_COLORS[0], criteria:{type:'activities', mods:[]}};
  const ms = h.courseMods(cid).filter(h.trackable);
  openModal(b ? 'Edit badge' : 'Add a new badge', `<form data-form="badge" class="stack"><input type="hidden" name="cid" value="${cid}"><input type="hidden" name="bid" value="${v.id || ''}">
    <div class="fgrid"><div class="field"><label for="bn">Name</label><input id="bn" name="name" type="text" value="${esc(v.name)}" required></div>
    <div class="field"><span class="lbl">Colour</span><div class="row">${BADGE_COLORS.map(col => `<label class="check"><input type="radio" name="color" value="${col}" ${v.color === col ? 'checked' : ''}><span style="width:22px;height:22px;border-radius:50%;background:${col};display:inline-block" aria-label="${col}"></span></label>`).join('')}</div></div>
    <div class="field full"><label for="bd">Description</label><textarea id="bd" name="description" rows="2">${esc(v.description)}</textarea></div>
    <div class="field full"><span class="lbl">How is it earned?</span>${[['activities', 'Complete specific activities'], ['course', 'Complete the whole course'], ['manual', 'Awarded manually by a teacher']].map(([k, l]) => `<label class="check"><input type="radio" name="ctype" value="${k}" ${v.criteria.type === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="field full"><span class="lbl">Activities (for "Complete specific activities")</span><div class="stack" style="gap:4px;max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:8px">${ms.map(m => `<label class="check"><input type="checkbox" name="mod:${m.id}" ${v.criteria.mods?.includes(m.id) ? 'checked' : ''}> ${icon(m.type, 'sm')} ${esc(m.name)}</label>`).join('')}</div></div></div>
    <p class="err" id="baderr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save badge</button></div></form>`, true);
}
function entryForm(mid, e) {
  openModal(e ? 'Edit entry' : 'Add a new entry', `<form data-form="entry" class="stack"><input type="hidden" name="mid" value="${mid}"><input type="hidden" name="id" value="${e?.id || ''}">
    <div class="field"><label for="ec">Concept</label><input id="ec" name="concept" type="text" value="${esc(e?.concept || '')}" required></div>
    <div class="field"><label for="ed">Definition</label><textarea id="ed" name="definition" rows="5" required>${esc(e?.definition || '')}</textarea></div>
    <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save entry</button></div></form>`);
}

/* ---------- Actions ---------- */
const A = {
  closeModal: () => closeModal(),
  reload: () => location.reload(),
  backdrop: (d, el, e) => { if (e.target === el) closeModal(); },
  doConfirm: () => { const f = ui.confirmFn; ui.confirmFn = null; closeModal(); if (f) f(); },
  logout: async () => { await B.logout().catch(() => {}); setState(null); ui.editing = false; ui.loginErr = ''; ui.mode = null; ui.loginView = 'login'; ui.mfaSetup = null; go('dashboard'); },
  quickLogin: async d => { try { await afterLogin(await B.login(d.u, 'demo')); } catch (e) { ui.loginErr = e.message; render(); } },
  loginAs: async d => { try { setState(await B.loginAs(d.u)); ui.editing = false; go('dashboard'); toast(`You are now logged in as ${fullname(me())}`); } catch (e) { toast(e.message, true); } },
  resetDemo: () => confirmBox('Reset demo data', 'This replaces every course, user, grade and post in this browser with the original demo data.', () => { setState(LocalBackend.reset()); ui.editing = false; ui.mode = null; go('dashboard'); toast('Demo data reset'); }, 'Reset'),
  scrollTo: d => { const el = document.getElementById(d.t); if (el) el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}); },
  openNote: async d => { const n = S.notifications.find(x => x.id === d.id); document.querySelector('.ndrop[open]')?.removeAttribute('open'); if (!n) return; if (!n.read) await act('readNotifications', {ids:[n.id]}, null, {silent:true}); if (n.go) go(n.go, {id:n.gid}); else render(); },
  readAllNotes: () => act('readNotifications', {}, 'All notifications marked as read'),
  openConv: async d => { ui.msgWith = d.u; if (S.messages.some(m => m.from === d.u && m.to === S.me && !m.read)) await act('readConversation', {with:d.u}, null, {silent:true}); render(); document.getElementById('msgtext')?.focus(); },
  closeConv: () => { ui.msgWith = null; render(); },
  toggleDone: d => act('toggleDone', {id:d.id}),
  enrolMe: async d => { if (await act('enrolMe', {cid:d.id}, 'You are enrolled in this course', {silent:true}) !== FAIL) go('course', {id:d.id}); },
  chooser: d => openModal('Add an activity or resource', `<div class="chooser">${Object.entries(C.TYPES).map(([k, t]) => `<button data-act="chooseType" data-type="${k}" data-cid="${d.cid}" data-sid="${d.sid}">${icon(k)}<b>${t.label}</b><small>${t.desc}</small></button>`).join('')}</div>`, true),
  chooseType: d => modForm(d.type, d.cid, d.sid),
  editMod: d => { const m = S.mods[d.id]; modForm(m.type, m.courseId, h.sectionOf(m)?.id, m); },
  moveMod: d => act('moveMod', {id:d.id, dir:d.dir}),
  toggleVis: async d => { const r = await act('toggleVis', {id:d.id}); if (r !== FAIL) toast(r.visible ? 'Shown to students' : 'Hidden from students'); },
  deleteMod: d => { const m = S.mods[d.id]; confirmBox('Delete activity', `Delete <b>${esc(m.name || 'this text area')}</b>? Its submissions, attempts and posts will no longer be visible.`, async () => { if (await act('deleteMod', {id:m.id}, 'Activity deleted', {silent:true}) !== FAIL) { if (ui.view.name === 'course') render(); else go('course', {id:m.courseId}); } }); },
  addSection: d => act('addSection', {cid:d.cid}, 'Section added'),
  editSection: d => { const s = h.course(d.cid).sections.find(x => x.id === d.sid);
    openModal('Edit section', `<form data-form="section" class="stack"><input type="hidden" name="cid" value="${d.cid}"><input type="hidden" name="sid" value="${d.sid}">
      <div class="field"><label for="sn">Section name</label><input id="sn" name="name" type="text" value="${esc(s.name)}" required></div>
      <div class="field"><label for="ss">Summary</label><textarea id="ss" name="summary" rows="4">${esc(s.summary)}</textarea></div>
      <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save changes</button></div></form>`); },
  deleteSection: d => { const s = h.course(d.cid).sections.find(x => x.id === d.sid); confirmBox('Delete section', `Delete <b>${esc(s.name)}</b> and its ${s.mods.length} activit${s.mods.length === 1 ? 'y' : 'ies'}?`, () => act('deleteSection', {cid:d.cid, sid:d.sid}, 'Section deleted')); },
  removeSub: d => confirmBox('Remove submission', 'Remove your submission? You can add a new one before the due date.', () => act('removeSub', {mid:d.id}, 'Submission removed'), 'Remove'),
  unattach: d => { ui.upload.sub = ui.upload.sub.filter(x => x !== d.id); const el = document.getElementById('subfiles'); if (el) el.innerHTML = ui.upload.sub.map(id => fileChip(id, 'unattach')).join(''); },
  startAttempt: async d => { const r = await act('startQuiz', {mid:d.id}, null, {silent:true}); if (r === FAIL) return; ui.attempt = {aid:r.id, cmid:d.id, start:r.start, answers:{...r.answers}}; go('attempt'); },
  finishAttempt: () => { const Aa = ui.attempt, m = S.mods[Aa.cmid]; const un = m.questions.filter(q => !answered(Aa, q)).length;
    openModal('Summary of attempt', `<div class="tw"><table><thead><tr><th>Question</th><th>Status</th></tr></thead><tbody>${m.questions.map((q, i) => `<tr><td class="num">${i + 1}</td><td>${answered(Aa, q) ? 'Answer saved' : '<span style="color:var(--bad)">Not yet answered</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${un ? `<p class="muted">${un} question${un > 1 ? 's are' : ' is'} not answered. Unanswered questions score zero.</p>` : ''}<p>Once you submit, you will no longer be able to change your answers for this attempt.</p>
      <div class="mfoot"><button class="btn" data-act="closeModal">Return to attempt</button><button class="btn primary" data-act="submitAttempt">Submit all and finish</button></div>`); },
  submitAttempt: () => { closeModal(); submitAttempt(false); },
  editQuestion: d => { const m = S.mods[d.id]; questionForm(m, d.q ? m.questions.find(q => q.id === d.q) : null); },
  deleteQuestion: d => { const m = S.mods[d.id], q = m.questions.find(x => x.id === d.q); confirmBox('Delete question', `Delete “${esc(q.text)}”? Existing attempts keep their recorded score.`, () => act('deleteQuestion', {mid:m.id, qid:q.id}, 'Question deleted')); },
  newDiscussion: d => { const m = S.mods[d.id]; openModal(m.news ? 'Add announcement' : 'Add discussion topic', `<form data-form="discussion" class="stack"><input type="hidden" name="mid" value="${m.id}">
      <div class="field"><label for="ds">Subject</label><input id="ds" name="subject" type="text" required></div>
      <div class="field"><label for="dm">Message</label><textarea id="dm" name="message" rows="6" required></textarea></div>
      <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Post to forum</button></div></form>`); },
  reply: d => { ui.replyTo = d.id || null; render(); document.getElementById('rmsg')?.focus(); },
  deletePost: d => { const p = S.posts.find(x => x.id === d.id); confirmBox('Delete post', p.parent ? 'Delete this post and any replies to it?' : 'Delete this whole discussion?', async () => { if (await act('deletePost', {id:p.id}, 'Post deleted', {silent:true}) !== FAIL) { if (p.parent) render(); else go('mod', {id:p.cmid}); } }); },
  enrolModal: d => { const c = h.course(d.id); const avail = S.users.filter(u => !h.enrolOf(c.id, u.id) && !u.admin && !u.suspended);
    openModal('Enrol users', avail.length ? `<form data-form="enrolUser" class="stack"><input type="hidden" name="cid" value="${c.id}">
      <div class="field"><label for="eu">User</label><select id="eu" name="userId">${avail.map(u => `<option value="${u.id}">${esc(fullname(u))} · ${esc(u.email)}</option>`).join('')}</select></div>
      <div class="field"><label for="er">Assign role</label><select id="er" name="role">${S.roles.map(r => `<option value="${r.id}" ${r.id === 'student' ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Enrol user</button></div></form>` : '<p class="muted">Every user on the site is already enrolled in this course.</p>'); },
  unenrol: d => confirmBox('Unenrol', `Unenrol <b>${esc(fullname(d.u))}</b> from this course? Their grades stay stored and return if they are enrolled again.`, () => act('unenrol', {cid:d.cid, userId:d.u}, 'User unenrolled'), 'Unenrol'),
  calMove: d => { const n = Number(d.d); if (!n) { const t = new Date(); ui.cal = {y:t.getFullYear(), m:t.getMonth()}; } else { const t = new Date(ui.cal.y, ui.cal.m + n, 1); ui.cal = {y:t.getFullYear(), m:t.getMonth()}; } render(); },
  newUser: () => openModal('Add a new user', `<form data-form="newUser" class="stack"><div class="fgrid">
      <div class="field"><label for="nu1">First name</label><input id="nu1" name="firstname" type="text" required></div><div class="field"><label for="nu2">Last name</label><input id="nu2" name="lastname" type="text" required></div>
      <div class="field"><label for="nu3">Username</label><input id="nu3" name="username" type="text" required pattern="[A-Za-z0-9._\\-]+" title="Letters, numbers, dot, dash or underscore" autocapitalize="none"></div><div class="field"><label for="nu4">Email address</label><input id="nu4" name="email" type="email" required></div>
      <div class="field"><label for="nu5">Password</label><input id="nu5" name="password" type="text" value="Welcome@123" required></div>${h.isAdmin() ? '<label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="admin"> Site administrator</label>' : ''}</div>
      <p class="err" id="nuerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Create user</button></div></form>`, true),
  deleteUser: d => confirmBox('Delete user', `Delete <b>${esc(fullname(d.u))}</b>? They are removed from all courses and can no longer log in.`, () => act('deleteUser', {id:d.u}, 'User deleted')),
  suspend: d => act('suspendUser', {id:d.u, on:!!d.on}, d.on ? 'Account suspended' : 'Account reactivated'),
  newCourse: () => openModal('Create new course', `<form data-form="newCourse" class="stack"><div class="fgrid">
      <div class="field full"><label for="nc1">Course full name</label><input id="nc1" name="fullname" type="text" required></div>
      <div class="field"><label for="nc2">Course short name</label><input id="nc2" name="shortname" type="text" required placeholder="e.g. LD101"></div>
      <div class="field"><label for="nc3">Category</label><select id="nc3" name="catId">${S.categories.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('')}</select></div>
      <div class="field full"><label for="nc4">Course summary</label><textarea id="nc4" name="summary" rows="3"></textarea></div>
      <div class="field"><label for="nc5">Number of sections</label><input id="nc5" name="sections" type="number" min="0" max="20" value="4"></div>
      <div class="field"><label for="nc6">Teacher</label><select id="nc6" name="teacher"><option value="">None yet</option>${S.users.filter(u => !u.admin).map(u => `<option value="${u.id}">${esc(fullname(u))}</option>`).join('')}</select></div>
      <label class="check full"><input type="checkbox" name="groupChat" checked> <span>Create a group chat for everyone in this course <span class="muted small">(people enrolled later join automatically; you can add more chats from the course's Group chats tab)</span></span></label></div>
      <p class="err" id="ncerr" hidden></p><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save and display</button></div></form>`, true),
  deleteCourse: d => { const c = h.course(d.id); confirmBox('Delete course', `Delete <b>${esc(c.fullname)}</b> with all its activities, enrolments and grades? This cannot be undone.`, async () => { if (await act('deleteCourse', {id:c.id}, 'Course deleted', {silent:true}) !== FAIL) go('admin', {t:'courses'}); }); },
  renameGroup: d => { const g = S.groups.find(x => x.id === d.id); openModal('Rename group', `<form data-form="renameGroup" class="stack"><input type="hidden" name="gid" value="${g.id}"><input type="hidden" name="cid" value="${d.cid}"><div class="field"><label for="rg">Group name</label><input id="rg" name="name" type="text" value="${esc(g.name)}" required></div><div class="mfoot"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`); },
  deleteGroup: d => { const g = S.groups.find(x => x.id === d.id); confirmBox('Delete group', `Delete the group <b>${esc(g.name)}</b>? Members stay enrolled in the course.`, () => act('deleteGroup', {gid:g.id}, 'Group deleted')); },
  groupMember: d => act('setGroupMember', {gid:d.g, userId:d.u, on:!!d.on}),
  glossLetter: d => { ui.gloss.letter = d.l; render(); },
  editEntry: d => { const e = d.id && S.glossary.find(x => x.id === d.id); entryForm(e ? e.cmid : d.mid, e); },
  approveEntry: d => act('approveEntry', {id:d.id}, 'Entry approved'),
  deleteEntry: d => confirmBox('Delete entry', 'Delete this glossary entry?', () => act('deleteEntry', {id:d.id}, 'Entry deleted')),
  removeChoice: d => act('removeChoice', {mid:d.id}, 'Your choice was removed'),
  lessonStart: async d => { const r = await act('lessonStart', {mid:d.id}, null, {silent:true}); if (r === FAIL) return; ui.lesson = {aid:r.id, cmid:d.id, idx:0, answers:{...r.answers}, fb:null, done:null}; go('lessonplay'); },
  lessonNext: () => { ui.lesson.idx++; ui.lesson.fb = null; render(); window.scrollTo(0, 0); },
  lessonFinish: async () => { const r = await act('lessonFinish', {aid:ui.lesson.aid}, null, {silent:true}); if (r === FAIL) return; ui.lesson.done = r; render(); },
  lessonPage: d => { const m = S.mods[d.id]; const pg = d.pid && m.pages.find(x => x.id === d.pid); lessonPageForm(m, pg, d.kind); },
  moveLessonPage: d => act('moveLessonPage', {mid:d.id, pid:d.pid, dir:d.dir}),
  deleteLessonPage: d => confirmBox('Delete page', 'Delete this lesson page?', () => act('deleteLessonPage', {mid:d.id, pid:d.pid}, 'Page deleted')),
  wsPhase: d => { const ph = Number(d.ph); confirmBox('Switch phase', `Switch this workshop to the <b>${C.WS_PHASES[ph]}</b> phase?${ph === 3 ? ' Submissions will be allocated to reviewers at random.' : ''} Learners are notified.`, async () => { const r = await act('wsSetPhase', {mid:d.id, phase:ph}, `Phase: ${C.WS_PHASES[ph]}`); if (r !== FAIL && ph === 3 && r.allocated) toast(`${r.allocated} reviews allocated`); }, 'Switch phase'); },
  claimCert: async d => { const r = await act('claimCertificate', {mid:d.id}); if (r !== FAIL) toast('Your certificate is ready'); },
  printCert: () => window.print(),
  badgeForm: d => badgeForm(d.cid, d.id && S.badges.find(b => b.id === d.id)),
  deleteBadge: d => { const b = S.badges.find(x => x.id === d.id); confirmBox('Delete badge', `Delete <b>${esc(b.name)}</b>? Everyone who earned it loses it.`, () => act('deleteBadge', {bid:b.id}, 'Badge deleted')); },
  badgeRecipients: d => { const b = S.badges.find(x => x.id === d.id), st = h.students(b.courseId);
    openModal(`Recipients: ${b.name}`, `<p class="muted small">Tick a learner to award the badge, untick to revoke it.</p><div class="stack" style="gap:6px">${st.map(s => { const got = S.badgeIssued.find(i => i.badgeId === b.id && i.userId === s.id); return `<label class="check"><input type="checkbox" data-award="${b.id}" data-u="${s.id}" ${got ? 'checked' : ''}> ${esc(fullname(s))} ${got ? `<span class="muted small">· ${got.by ? 'awarded' : 'earned'} ${fmtDateOnly(got.time)}</span>` : ''}</label>`; }).join('') || '<p class="muted">No learners enrolled.</p>'}</div><div class="mfoot"><button class="btn primary" data-act="closeModal">Done</button></div>`); },
  sysRole: d => act('setSysRole', {userId:d.u, roleId:d.r, on:!!d.on}, d.on ? 'Role assigned' : 'Role removed'),
  deleteRole: d => confirmBox('Delete role', 'Delete this role? This cannot be undone.', async () => { if (await act('deleteRole', {id:d.id}, 'Role deleted', {silent:true}) !== FAIL) go('admin', {t:'roles'}); }),
  csvSample: () => { const t = document.getElementById('csvtext'); if (t) t.value = SAMPLE_CSV; },
  csvClear: () => { ui.csv = null; render(); },
  backup: async d => {
    const users = document.getElementById('bkusers')?.checked;
    if (B.server) { location.href = B.backupUrl(d.id, users); toast('Backup download started'); return; }
    const r = await act('backupCourse', {cid:d.id, includeUsers:users}, null, {silent:true}); if (r === FAIL) return;
    const json = JSON.stringify(r);
    openModal('Course backup', `<p class="muted small">In the preview, downloads may be blocked, so the backup is shown here. Copy it and paste it into Site administration › Restore course. On the server edition this downloads as a file.</p><textarea id="bkjson" rows="10" class="mono" style="font-size:.78rem" readonly>${esc(json)}</textarea><p class="small muted">${fmtSize(json.length)} · ${r.mods.length} activities${r.includeUsers ? ` · ${r.users.length} users` : ''}</p><div class="mfoot"><button class="btn primary" data-act="copyBackup">Copy to clipboard</button></div>`, true);
  },
  copyBackup: async () => { const t = document.getElementById('bkjson'); try { await navigator.clipboard.writeText(t.value); toast('Backup copied'); } catch (e) { t.select(); toast('Press Ctrl+C (or Cmd+C) to copy'); } }
};

/* ---------- Forms ---------- */
const val = (f, n) => f.elements[n]?.value ?? '';
const checked = (f, n) => !!f.elements[n]?.checked;
const F = {
  login: async d => { try { await afterLogin(await B.login(d.username, d.password)); } catch (e) { ui.loginErr = e.message; render(); } },
  verifyCert: async d => { const r = await act('verifyCertificate', {code:d.code}, null, {silent:true}); const el = document.getElementById('vres'); if (!el || r === FAIL) return;
    el.innerHTML = r.valid ? `<div class="fb right"><b>Valid certificate.</b><br>${esc(r.name)} · ${esc(r.course)} · ${fmtDateOnly(r.time)}</div>` : '<div class="fb wrong">No certificate matches this code.</div>'; },
  profile: d => act('updateProfile', d, 'Profile updated'),
  siteSettings: (d, f) => act('siteSettings', {...d, demo:checked(f, 'demo')}, 'Site settings saved'),
  newCategory: d => act('newCategory', d, 'Category added'),
  newCourse: async d => { const r = await act('newCourse', d, 'Course created', {silent:true, errEl:'ncerr'}); if (r !== FAIL) { closeModal(); go('course', {id:r.id}); } },
  newUser: async (d, f) => { const r = await act('newUser', {...d, admin:checked(f, 'admin')}, 'User created', {silent:true, errEl:'nuerr'}); if (r !== FAIL) { closeModal(); render(); } },
  courseSettings: async (d, f) => { if (await act('courseSettings', {...d, visible:checked(f, 'visible'), selfenrol:checked(f, 'selfenrol')}, 'Course settings saved', {silent:true}) !== FAIL) go('course', {id:d.cid}); },
  modSettings: async (d, f) => {
    const fields = {};
    for (const [k, v] of Object.entries(d)) if (!['cid', 'type', 'mid', 'sid', 'name', 'intro', 'visible', 'requires', 'rubric', 'fquestions'].includes(k)) fields[k] = v;
    for (const k of ['due', 'close', 'subEnd', 'start']) if (k in fields) fields[k] = fromInput(fields[k]);
    for (const k of ['allowFiles', 'news', 'approval', 'allowUpdate', 'requireCompletion', 'pretest', 'requireFeedback', 'anonymous', 'autoIssue']) if (f.elements[k]) fields[k] = checked(f, k);
    fields.requires = picked(f, 'requires');
    const fail = msg => { const e = document.getElementById('moderr'); e.textContent = msg; e.hidden = false; };
    if ((d.type === 'file' || d.type === 'video') && !fields.fileId) return fail('Choose a file to upload.');
    if (d.type === 'scorm' && !fields.packageId) return fail('Choose a SCORM package to upload.');
    if (d.type === 'assign') { const lines = (d.rubric || '').split('\n').map(x => x.trim()).filter(Boolean);
      fields.rubric = lines.length ? {criteria:lines.map(l => { const [t, ...lv] = l.split('|').map(x => x.trim()); return {text:t, levels:lv.map(x => { const i = x.lastIndexOf(':'); return {text:i > 0 ? x.slice(0, i).trim() : x, points:i > 0 ? Number(x.slice(i + 1)) : 0}; })}; })} : null; }
    if (d.type === 'feedback') fields.questions = (d.fquestions || '').split('\n').map(x => x.trim()).filter(Boolean).map(l => { const opt = l.startsWith('?'); const m = l.replace(/^\?/, '').match(/^(rating|choice|text)\s*:\s*(.*)$/i); const [t, ...o] = (m ? m[2] : l).split('|').map(x => x.trim()); return {type:m ? m[1].toLowerCase() : 'text', text:t, options:o, required:!opt}; });
    const sb = f.querySelector('[type=submit]'), label = sb?.textContent; if (d.type === 'scorm' && B.server && sb) { sb.dataset.busy = '1'; sb.disabled = true; sb.textContent = 'Unpacking the package…'; }
    const r = await act('saveMod', {cid:d.cid, mid:d.mid || null, type:d.type, sid:d.sid, name:d.name, intro:d.intro, visible:checked(f, 'visible'), fields}, d.mid ? 'Changes saved' : `${C.TYPES[d.type].label} added`, {silent:true, errEl:'moderr'});
    if (sb?.isConnected) { delete sb.dataset.busy; sb.disabled = false; sb.textContent = label; }
    if (r === FAIL) return;
    if (!d.mid && r?.id && (d.type === 'quiz' || d.type === 'lesson')) {
      closeModal(); go('mod', {id:r.id});
      if (d.type === 'quiz') { A.qbAdd({mid:r.id}); toast('Quiz added. Type your first question.'); } else toast('Lesson added. Now add its pages.');
      return;
    }
    closeModal(); render();
  },
  section: async d => { if (await act('editSection', d, 'Section updated', {silent:true}) !== FAIL) { closeModal(); render(); } },
  submission: async d => { if (await act('submit', {mid:d.mid, text:d.text, files:ui.upload.sub || []}, 'Submission saved', {silent:true, errEl:'suberr'}) !== FAIL) { ui.upload = {}; go('mod', {id:d.mid}); } },
  gradeSub: async d => { if (await act('grade', d, 'Grade saved', {silent:true}) === FAIL) return; const m = S.mods[d.mid], st = h.students(m.courseId), i = st.findIndex(x => x.id === d.uid), next = st[i + 1]; if (next) go('grader', {id:m.id, u:next.id}); else go('mod', {id:m.id}); },
  question: async d => {
    const q = {id:d.qid || undefined, type:d.type, text:d.text, mark:d.mark};
    if (d.type === 'mc') q.options = d.options.split('\n').map(s => s.trim()).filter(Boolean).map(l => l.startsWith('*') ? {text:l.slice(1).trim(), correct:true} : {text:l});
    if (d.type === 'tf') q.answer = d.tf === 'true';
    if (d.type === 'short') q.answer = d.short;
    if (d.type === 'num') { q.answer = d.num; q.tol = d.tol; }
    if (await act('saveQuestion', {mid:d.mid, q}, d.qid ? 'Question updated' : 'Question added', {silent:true, errEl:'qerr'}) !== FAIL) { closeModal(); render(); }
  },
  discussion: async d => { const r = await act('addDiscussion', d, 'Your post was added', {silent:true}); if (r !== FAIL) { closeModal(); go('discussion', {id:r.id}); } },
  reply: async d => { ui.replyTo = null; await act('reply', d, 'Reply posted'); },
  enrolUser: async d => { if (await act('enrolUser', d, 'User enrolled', {silent:true}) !== FAIL) { closeModal(); render(); } },
  sendMessage: async (d, f) => { if (await act('sendMessage', d, null, {silent:true}) !== FAIL) { render(); document.getElementById('msgtext')?.focus(); } },
  addMember: d => act('setGroupMember', {gid:d.gid, userId:d.userId, on:true}, 'Member added'),
  newGroup: d => act('saveGroup', d, 'Group created'),
  renameGroup: async d => { if (await act('saveGroup', d, 'Group renamed', {silent:true}) !== FAIL) { closeModal(); render(); } },
  choice: d => act('answerChoice', {mid:d.mid, option:Number(d.option)}, 'Your choice has been saved'),
  lessonAnswer: async d => { const L = ui.lesson, pg = S.mods[L.cmid].pages[L.idx]; const r = await act('lessonAnswer', {aid:L.aid, pid:pg.id, answer:Number(d.answer)}, null, {silent:true}); if (r === FAIL) return; L.answers[pg.id] = Number(d.answer); L.fb = r; render(); },
  wsSubmit: d => act('wsSubmit', d, 'Submission saved'),
  wsAssess: d => act('wsAssess', d, 'Assessment saved'),
  entry: async d => { const r = await act('addEntry', d, null, {silent:true}); if (r === FAIL) return; closeModal(); render(); toast(d.id ? 'Entry updated' : r.approved ? 'Entry added' : 'Entry added. It appears once a teacher approves it.'); },
  badge: async (d, f) => { const mods = [...f.querySelectorAll('input[name^="mod:"]:checked')].map(x => x.name.slice(4));
    if (await act('saveBadge', {cid:d.cid, bid:d.bid || null, name:d.name, description:d.description, color:d.color, criteria:{type:d.ctype, mods}}, 'Badge saved', {silent:true, errEl:'baderr'}) !== FAIL) { closeModal(); render(); } },
  saveRole: async (d, f) => { const caps = {}; C.CAPS.forEach(([c]) => { if (checked(f, 'cap:' + c)) caps[c] = true; });
    const r = await act('saveRole', {id:d.id || null, shortname:d.shortname, name:d.name, desc:d.desc, caps}, 'Role saved', {silent:true, errEl:'roleerr'}); if (r !== FAIL) go('admin', {t:'roles'}); },
  assignSysRole: d => act('setSysRole', {userId:d.userId, roleId:d.roleId, on:true}, 'Role assigned'),
  csvPreview: d => { if (!d.csv.trim()) { toast('Paste CSV data or choose a file first.', true); return; } ui.csv = {...C.validateUserRows(S, d.csv), text:d.csv}; render(); },
  uploadUsers: async (d, f) => { const r = await act('uploadUsers', {csv:ui.csv.text, defaultPassword:d.defaultPassword, updateExisting:checked(f, 'updateExisting')}, null, {silent:true}); if (r === FAIL) return; ui.csv = null; render();
    openModal('Upload complete', `<table class="kv"><tbody><tr><th>Users created</th><td class="num">${r.created}</td></tr><tr><th>Users updated</th><td class="num">${r.updated}</td></tr><tr><th>New enrolments</th><td class="num">${r.enrolled}</td></tr><tr><th>Rows skipped</th><td class="num">${r.skipped}</td></tr></tbody></table>${r.errors.length ? `<div class="err">${r.errors.map(esc).join('<br>')}</div>` : ''}<div class="mfoot"><button class="btn primary" data-act="closeModal">Done</button></div>`); },
  restore: async (d, f) => { if (!d.backup.trim()) { const e = document.getElementById('restoreerr'); e.textContent = 'Choose a backup file or paste its contents.'; e.hidden = false; return; }
    const r = await act('restoreCourse', {backup:d.backup, catId:d.catId, shortname:d.shortname, includeUsers:checked(f, 'includeUsers')}, null, {silent:true, errEl:'restoreerr'}); if (r === FAIL) return;
    go('course', {id:r.id}); toast(`Restored as ${r.shortname}${r.enrolments ? ` with ${r.enrolments} enrolments` : ''}`); },
  lessonPage: async d => { const page = {id:d.pid || undefined, kind:d.kind, title:d.title, body:d.body};
    if (d.kind === 'question') page.options = d.options.split('\n').map(s => s.trim()).filter(Boolean).map(l => { const [t, ...fb] = l.split('|'); const tx = t.trim(); return {text:tx.replace(/^\*/, '').trim(), correct:tx.startsWith('*'), feedback:fb.join('|').trim()}; });
    if (await act('saveLessonPage', {mid:d.mid, page}, 'Page saved', {silent:true, errEl:'lperr'}) !== FAIL) { closeModal(); render(); } }
};

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-act]'); if (!el || el.disabled) return;
  if (el.dataset.go) { e.preventDefault(); const p = {...el.dataset}; delete p.go; document.querySelectorAll('details[open]').forEach(x => x.removeAttribute('open')); if (el.dataset.go === 'messages') ui.msgWith = p.with || ui.msgWith; go(el.dataset.go, p); return; }
  const fn = A[el.dataset.act]; if (fn) { if (el.dataset.act !== 'backdrop') e.preventDefault(); fn({...el.dataset}, el, e); }
});
function submitForm(f, submitter) {
  const fn = F[f.dataset.form]; if (!fn) return;
  const btn = f.querySelector('[type=submit]'); if (btn?.disabled) { if (btn.dataset.busy && ui.uploading) toast('Please wait for the upload to finish.'); return; }
  // Read the values before disabling anything: a disabled button is left out of the form's data
  let fd; try { fd = new FormData(f, submitter || undefined); } catch (x) { fd = new FormData(f); if (submitter?.name) fd.append(submitter.name, submitter.value); }
  const data = Object.fromEntries(fd);
  const btns = [...f.querySelectorAll('[type=submit]')].filter(b => !b.disabled); btns.forEach(b => b.disabled = true);
  setTimeout(() => btns.forEach(b => { if (b.isConnected && !b.dataset.busy) b.disabled = false; }), 1500);
  fn(data, f);
}
/* Forms are submitted by the app itself, not by the browser. Pages shown inside a sandboxed frame
   (such as the hosted preview) are not allowed to submit forms, so relying on the browser's submit
   event would silently do nothing there. */
const isSubmitBtn = el => el && el.tagName === 'BUTTON' && (el.getAttribute('type') || 'submit') === 'submit';
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!isSubmitBtn(b) || b.disabled || b.dataset.act || b.dataset.go) return;
  const f = b.form; if (!f || !f.dataset.form) return;
  e.preventDefault(); if (!f.reportValidity()) return; submitForm(f, b);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t.tagName !== 'INPUT' || ['checkbox', 'radio', 'file', 'button', 'submit', 'search'].includes(t.type)) return;
  const f = t.form; if (!f || !f.dataset.form) return;
  e.preventDefault(); if (!f.reportValidity()) return; submitForm(f, f.querySelector('button[type=submit]'));
});
document.addEventListener('submit', e => { const f = e.target; if (!f.dataset.form) return; e.preventDefault(); submitForm(f, e.submitter); });
async function uploadFiles(input) {
  const files = [...input.files]; if (!files.length) return;
  const kind = input.dataset.upload; input.disabled = true;
  // Progress bar under the file box; saving the form waits until the upload is done
  const form = input.form, saveBtns = form ? [...form.querySelectorAll('button[type=submit]')] : [];
  saveBtns.forEach(b => { b.disabled = true; b.dataset.busy = '1'; b.dataset.label = b.textContent; b.textContent = 'Waiting for upload…'; });
  const bar = document.createElement('div'); bar.className = 'upbar'; bar.setAttribute('role', 'status'); input.insertAdjacentElement('afterend', bar);
  const ctl = new AbortController(); ui.uploading = ctl;
  bar.addEventListener('click', e => { if (e.target.closest('[data-cancel]')) ctl.abort(); });
  const total = files.reduce((n, f) => n + f.size, 0); let doneBytes = 0; const t0 = Date.now();
  const show = (file, loaded, i) => {
    if (!input.isConnected) { ctl.abort(); return; } // the form was closed: stop uploading
    const all = doneBytes + loaded, pct = total ? Math.min(100, Math.floor(all / total * 100)) : 100, secs = (Date.now() - t0) / 1000, speed = secs > 0.5 ? all / secs : 0, left = speed ? (total - all) / speed : null;
    bar.innerHTML = `<div class="upbar-top"><span class="upbar-name">${files.length > 1 ? `File ${i + 1} of ${files.length}: ` : ''}${esc(file.name)}</span>${pct < 100 ? '<button type="button" class="link small" data-cancel>Cancel</button>' : ''}</div>
      <div class="upbar-track" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <div class="upbar-meta"><b>${pct < 100 ? pct + '%' : 'Finishing…'}</b><span>${fmtSize(all)} of ${fmtSize(total)}</span>${speed && pct < 100 ? `<span>${fmtSize(speed)}/s</span>` : ''}${left != null && pct < 100 && secs > 2 ? `<span>${left < 60 ? 'less than a minute' : 'about ' + Math.round(left / 60) + ' min'} left</span>` : ''}</div>`;
    bar.setAttribute('aria-label', `Uploading ${file.name}: ${pct}%`);
  };
  try {
    for (const [i, file] of files.entries()) {
      show(file, 0, i);
      const r = await B.upload(file, {onProgress:(loaded) => show(file, loaded, i), signal:ctl.signal}); doneBytes += file.size; setState(r.state);
      if (kind === 'sub') { ui.upload.sub = [...(ui.upload.sub || []), r.result.id].slice(0, 10); const el = document.getElementById('subfiles'); if (el) el.innerHTML = ui.upload.sub.map(id => fileChip(id, 'unattach')).join(''); }
      if (kind === 'mod') { if (!document.getElementById('mf-fileid')) continue; document.getElementById('mf-fileid').value = r.result.id; document.getElementById('mf-filename').textContent = `Uploaded: ${r.result.name} (${fmtSize(r.result.size)})`; const n = document.getElementById('mf-name'); if (n && !n.value) n.value = r.result.name.replace(/\.[^.]+$/, ''); }
      if (kind === 'captions' && document.getElementById('mf-capid')) { document.getElementById('mf-capid').value = r.result.id; document.getElementById('mf-capname').textContent = `Uploaded: ${r.result.name}`; }
      if (kind === 'scorm' && document.getElementById('mf-pkgid')) { document.getElementById('mf-pkgid').value = r.result.id; if (r.result.launchFileId) document.getElementById('mf-launch').value = r.result.launchFileId; document.getElementById('mf-pkgname').textContent = `Uploaded: ${r.result.name} (${fmtSize(r.result.size)})${!B.server && !r.result.launchFileId ? '. This package has several files, so it will only play on the server edition.' : ''}`; const n = document.getElementById('mf-name'); if (n && !n.value) n.value = r.result.name.replace(/\.[^.]+$/, ''); }
      if (kind === 'logo' && document.getElementById('blogoid')) { document.getElementById('blogoid').value = r.result.id; document.getElementById('blogoname').textContent = `Uploaded: ${r.result.name}. Save to apply.`; }
      if (kind === 'rec' && document.getElementById('recfid')) { document.getElementById('recfid').value = r.result.id; document.getElementById('recname').textContent = `Uploaded: ${r.result.name}. Save to attach it.`; }
    }
    toast(files.length > 1 ? `${files.length} files uploaded` : 'File uploaded');
    bar.innerHTML = `<div class="upbar-track done" aria-hidden="true"><i style="width:100%"></i></div><div class="upbar-meta"><b>Uploaded</b><span>${fmtSize(total)}</span></div>`;
    setTimeout(() => bar.remove(), 2500);
  } catch (e) { bar.remove(); if (!e.cancelled) toast(e.message, true); else if (input.isConnected) toast('Upload cancelled'); }
  if (ui.uploading === ctl) ui.uploading = null;
  saveBtns.forEach(b => { delete b.dataset.busy; b.disabled = false; if (b.dataset.label) { b.textContent = b.dataset.label; delete b.dataset.label; } });
  input.disabled = false; input.value = '';
}
function readText(input, targetId) { const file = input.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { const t = document.getElementById(targetId); if (t) t.value = r.result; }; r.readAsText(file); }
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'editmode') { ui.editing = t.checked; render(); toast(ui.editing ? 'Edit mode on' : 'Edit mode off'); }
  else if (t.id === 'qtype') toggleQFields();
  else if (t.id === 'grpfilter') { ui.grp = t.value; render(); }
  else if (t.id === 'newmsg' && t.value) { ui.msgWith = t.value; render(); document.getElementById('msgtext')?.focus(); }
  else if (t.dataset.q) recordAnswer(t);
  else if (t.dataset.upload) uploadFiles(t);
  else if (t.dataset.csv) readText(t, 'csvtext');
  else if (t.dataset.restore) readText(t, 'rtext');
  else if (t.dataset.award) act('awardBadge', {bid:t.dataset.award, userId:t.dataset.u, on:t.checked}, t.checked ? 'Badge awarded' : 'Badge revoked');
  else if (t.dataset.change === 'changeRole') act('changeRole', {cid:t.dataset.cid, userId:t.dataset.u, role:t.value}, 'Role changed');
  else if (t.dataset.change === 'copyRole') { const r = h.role(t.value); document.querySelectorAll('input[name^="cap:"]').forEach(cb => cb.checked = !!r?.caps[cb.name.slice(4)]); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.q && t.type !== 'radio') recordAnswer(t);
  if (t.dataset.filter) { const box = document.querySelector(t.dataset.filter); if (!box) return; const q = t.value.trim().toLowerCase();
    box.querySelectorAll('[data-s]').forEach(r => r.hidden = q && !r.dataset.s.includes(q));
    box.querySelectorAll('[data-group]').forEach(g => g.hidden = !g.querySelector('[data-s]:not([hidden])')); }
});
function recordAnswer(t) {
  if (!ui.attempt) return; ui.attempt.answers[t.dataset.q] = t.value;
  const s = document.getElementById('qs-' + t.dataset.q); if (s) s.textContent = t.value !== '' ? 'Answer saved' : 'Not yet answered';
  const g = document.getElementById('qnavgrid'); if (g) g.innerHTML = qnavButtons();
  clearTimeout(ui.saveT); const A0 = ui.attempt;
  ui.saveT = setTimeout(() => { if (ui.attempt === A0) B.op('saveQuizAnswers', {aid:A0.aid, answers:A0.answers}).catch(() => {}); }, 1200);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (modalEl.innerHTML) closeModal(); document.querySelectorAll('details[open]').forEach(x => x.removeAttribute('open')); } });
document.addEventListener('click', e => { document.querySelectorAll('.umenu[open],.ndrop[open],.pmore[open]').forEach(dm => { if (!dm.contains(e.target)) dm.removeAttribute('open'); }); }, true);

