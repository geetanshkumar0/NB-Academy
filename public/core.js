/*
 * NB Academy core
 * Shared domain logic used by the browser (preview mode) and the Node server.
 * - Data model and demo seed
 * - Roles and capabilities
 * - Operations (every change to data goes through an op, with permission checks)
 * - Per-user view filter (what each user is allowed to see)
 * No dependencies. Works as a browser global (NBCore) or a CommonJS module.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { const api = factory(); require('./core-ext.js')(api); module.exports = api; }
  else root.NBCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const D = 864e5;
const VERSION = 3;

/* ---------------- Activity types ---------------- */
const TYPES = {
  assign:      {label:'Assignment', p:'assess', desc:'Collect work from students, then grade it and give feedback.', graded:true},
  quiz:        {label:'Quiz', p:'assess', desc:'Auto-graded questions: multiple choice, true/false, short answer, numerical.', graded:true},
  workshop:    {label:'Workshop', p:'assess', desc:'Peer assessment: students submit work, then review each other\'s.', graded:true},
  lesson:      {label:'Lesson', p:'content', desc:'A guided sequence of content pages and questions with instant feedback.', graded:true},
  page:        {label:'Page', p:'content', desc:'A page of formatted text: reading material, instructions, notes.'},
  file:        {label:'File', p:'content', desc:'A downloadable file such as a PDF, slide deck or spreadsheet.'},
  url:         {label:'URL', p:'content', desc:'A link to a website or online resource.'},
  forum:       {label:'Forum', p:'collab', desc:'Asynchronous discussions with threaded replies.'},
  glossary:    {label:'Glossary', p:'collab', desc:'A shared list of terms and definitions that participants build together.'},
  choice:      {label:'Choice', p:'comm', desc:'A single question poll. Useful for quick votes and decisions.'},
  scorm:       {label:'SCORM package', p:'content', desc:'SCORM 1.2 e-learning package. Saves the learner\'s place and score between sessions.', graded:true},
  video:       {label:'Video', p:'content', desc:'Video with optional captions. Learners resume where they stopped.'},
  live:        {label:'Live session', p:'collab', desc:'Instructor-led (ILT) or virtual (VILT) session with registration, attendance and recordings.'},
  feedback:    {label:'Feedback survey', p:'comm', desc:'Course feedback questionnaire with ratings, choices and comments.'},
  certificate: {label:'Certificate', p:'other', desc:'Issues a verifiable certificate when the learner meets the conditions.'},
  label:       {label:'Text and media area', p:'other', desc:'Text shown directly on the course page between activities.'}
};
const MANUAL = new Set(['page', 'url', 'file', 'forum', 'glossary']);
const QTYPES = {mc:'Multiple choice', tf:'True/False', short:'Short answer', num:'Numerical', essay:'Essay (graded by trainer)'};
const WS_PHASES = {1:'Setup', 2:'Submission', 3:'Assessment', 4:'Grading evaluation', 5:'Closed'};

/* ---------------- Capabilities and roles ---------------- */
const CAPS = [
  // [capability, description, level]
  ['course:view', 'View course content', 'course'],
  ['course:viewhidden', 'See hidden courses and activities', 'course'],
  ['course:update', 'Change course settings', 'course'],
  ['course:manageactivities', 'Add, edit, move and delete activities and sections', 'course'],
  ['course:viewparticipants', 'View the participants list', 'course'],
  ['course:enrol', 'Enrol and unenrol users', 'course'],
  ['group:manage', 'Create groups and manage members', 'course'],
  ['mod:submit', 'Take part as a learner (submit, attempt, tracked in gradebook)', 'course'],
  ['grade:viewall', 'View all learners\' grades and submissions', 'course'],
  ['grade:edit', 'Grade submissions and give feedback', 'course'],
  ['report:view', 'View course reports and logs', 'course'],
  ['forum:post', 'Start discussions and reply in forums', 'course'],
  ['forum:addnews', 'Post announcements', 'course'],
  ['forum:deleteany', 'Delete any forum post', 'course'],
  ['glossary:approve', 'Approve and delete glossary entries', 'course'],
  ['badges:manage', 'Create and edit badges', 'course'],
  ['badges:award', 'Award and revoke badges', 'course'],
  ['backup:course', 'Back up a course', 'course'],
  ['course:assign', 'Assign courses to learners and cohorts with due dates', 'course'],
  ['attempts:manage', 'Reset quiz attempts and grant extra attempts', 'course'],
  ['live:manage', 'Run live sessions: attendance and recordings', 'course'],
  ['message:send', 'Send private messages', 'site'],
  ['site:config', 'Change site settings', 'site'],
  ['site:viewlogs', 'View site-wide logs', 'site'],
  ['user:manage', 'Create, edit and delete user accounts', 'site'],
  ['user:upload', 'Bulk upload users from CSV', 'site'],
  ['user:loginas', 'Log in as another user', 'site'],
  ['course:create', 'Create courses and categories', 'site'],
  ['course:delete', 'Delete courses', 'site'],
  ['role:manage', 'Define roles and assign site roles', 'site'],
  ['backup:restore', 'Restore courses from backups', 'site'],
  ['access:approve', 'Approve or reject overdue access requests', 'site'],
  ['cohort:manage', 'Manage cohorts and map trainers and team leads', 'site'],
  ['path:manage', 'Manage learning paths and automatic assignment rules', 'site'],
  ['qbank:manage', 'Manage the central question bank', 'site'],
  ['analytics:site', 'View site-wide analytics', 'site'],
  ['audit:view', 'View and verify the audit log', 'site'],
  ['team:view', 'Use the Team Lead workspace for mapped cohorts', 'site']
];
const capSet = list => Object.fromEntries(list.map(c => [c, true]));
const ALLCAPS = CAPS.map(c => c[0]);
const BUILTIN_ROLES = [
  {id:'manager', name:'Manager', builtin:true, desc:'Can do everything in every course and manage the site, except the site administrator settings.', caps:capSet(ALLCAPS.filter(c => c !== 'mod:submit'))},
  {id:'trainer', name:'Trainer', builtin:true, desc:'Delivers courses tagged to them: assigns courses, grades, runs live sessions, resets attempts, views course analytics. Cannot create or edit courses.', caps:capSet(['course:view','course:viewhidden','course:viewparticipants','grade:viewall','grade:edit','report:view','forum:post','forum:addnews','forum:deleteany','glossary:approve','badges:award','course:assign','attempts:manage','live:manage','message:send'])},
  {id:'editingteacher', name:'Course author', builtin:true, desc:'Builds and edits course content. Use when someone other than the administrator authors courses.', caps:capSet(['course:view','course:viewhidden','course:update','course:manageactivities','course:viewparticipants','course:enrol','group:manage','grade:viewall','grade:edit','report:view','forum:post','forum:addnews','forum:deleteany','glossary:approve','badges:manage','badges:award','backup:course','course:assign','attempts:manage','live:manage','message:send'])},
  {id:'teacher', name:'Non-editing teacher', builtin:true, desc:'Grades and supports learners but cannot change course content.', caps:capSet(['course:view','course:viewhidden','course:viewparticipants','grade:viewall','grade:edit','report:view','forum:post','forum:deleteany','glossary:approve','badges:award','message:send'])},
  {id:'student', name:'Learner', builtin:true, desc:'Takes part in courses. Tracked for completion, deadlines and grades.', caps:capSet(['course:view','course:viewparticipants','mod:submit','forum:post','message:send'])},
  {id:'teamlead', name:'Team Lead', builtin:true, desc:'Site role. Monitors the cohorts mapped to them: progress, deadlines, at-risk learners and reminders. Cannot create courses, manage users or assign courses.', caps:capSet(['team:view','message:send'])}
];

/* ---------------- Small utilities ---------------- */
const defaultUid = p => (p || 'x') + Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
class OpError extends Error { constructor(msg, status) { super(msg); this.status = status || 400; } }
const need = (cond, msg, status) => { if (!cond) throw new OpError(msg, status || 403); };
const str = (v, max = 2000) => String(v ?? '').slice(0, max);
const req = (v, name, max) => { const s = str(v, max).trim(); need(s, `${name} is required.`, 400); return s; };

/* ---------------- Helpers bound to a state + user ---------------- */
function H(S, meId) {
  const h = {};
  const NOW = Date.now();
  h.S = S; h.meId = meId;
  h.user = id => S.users.find(u => u.id === id);
  h.me = () => h.user(meId);
  h.fullname = u => (u = typeof u === 'string' ? h.user(u) : u) ? `${u.firstname} ${u.lastname}` : 'Former user';
  h.course = id => S.courses.find(c => c.id === id);
  h.cat = id => S.categories.find(k => k.id === id);
  h.mod = id => S.mods[id];
  h.role = id => S.roles.find(r => r.id === id);
  h.isAdmin = (uid = meId) => !!h.user(uid)?.admin;
  h.enrolOf = (cid, uid = meId) => S.enrol.find(e => e.courseId === cid && e.userId === uid);
  h.rolesOf = (cid, uid = meId) => { const r = S.sysroles.filter(x => x.userId === uid).map(x => x.roleId); if (cid) { const e = h.enrolOf(cid, uid); if (e) r.push(e.role); } return r; };
  h.has = (cap, cid, uid = meId) => {
    const u = h.user(uid); if (!u || u.suspended) return false; if (u.admin) return true;
    return h.rolesOf(cid, uid).some(r => h.role(r)?.caps?.[cap]);
  };
  h.hasAnywhere = (cap, uid = meId) => h.has(cap, null, uid) || S.enrol.some(e => e.userId === uid && h.role(e.role)?.caps?.[cap]);
  h.canView = cid => {
    const c = h.course(cid); if (!c || !h.has('course:view', cid)) return false;
    if (c.status === 'draft') return h.has('course:update', cid) || h.has('course:manageactivities', cid);
    return c.visible || h.has('course:viewhidden', cid);
  };
  h.canEdit = cid => h.has('course:manageactivities', cid);
  h.isLearner = (cid, uid = meId) => { const e = h.enrolOf(cid, uid); return !!e && !!h.role(e.role)?.caps?.['mod:submit']; };
  h.enrolled = cid => S.enrol.filter(e => e.courseId === cid).map(e => ({e, u:h.user(e.userId)})).filter(x => x.u);
  h.students = cid => h.enrolled(cid).filter(x => h.role(x.e.role)?.caps?.['mod:submit']).map(x => x.u).sort((a, b) => a.firstname.localeCompare(b.firstname));
  h.teachers = cid => h.enrolled(cid).filter(x => ['editingteacher', 'teacher', 'trainer'].includes(x.e.role)).map(x => x.u);
  h.myCourseIds = () => (h.isAdmin() || h.has('course:view', null)) ? S.courses.map(c => c.id) : S.enrol.filter(e => e.userId === meId).map(e => e.courseId).filter(id => h.course(id));
  h.courseMods = cid => { const c = h.course(cid); return c ? c.sections.flatMap(s => s.mods.map(id => S.mods[id])).filter(Boolean) : []; };
  h.visibleMods = cid => h.courseMods(cid).filter(m => m.visible || h.has('course:viewhidden', cid));
  h.sectionOf = m => h.course(m.courseId)?.sections.find(s => s.mods.includes(m.id));
  /* Records from earlier certification cycles are marked archived and ignored for progress. */
  h.subOf = (cmid, uid) => S.submissions.find(s => s.cmid === cmid && s.userId === uid && !s.archived);
  h.attemptsOf = (cmid, uid) => S.attempts.filter(a => a.cmid === cmid && a.userId === uid && a.state === 'finished' && !a.archived).sort((a, b) => a.finish - b.finish);
  h.openAttempt = (cmid, uid) => S.attempts.find(a => a.cmid === cmid && a.userId === uid && a.state === 'inprogress' && !a.archived);
  h.attemptsAllowed = (m, uid) => m.attempts ? m.attempts + (Number(S.extraAttempts?.[uid + ':' + m.id]) || 0) : 0;
  h.dueOf = m => ({assign:m.due, quiz:m.close, workshop:m.subEnd, lesson:m.close, live:m.start}[m.type] || null);
  h.groups = cid => S.groups.filter(g => g.courseId === cid);
  h.groupsOf = (cid, uid) => S.groups.filter(g => g.courseId === cid && g.members.includes(uid));
  h.sharesCourse = (a, b) => S.enrol.some(e => e.userId === a && S.enrol.some(f => f.userId === b && f.courseId === e.courseId))
    || S.cohorts.some(c => [...c.members, ...c.leads, ...c.trainers].includes(a) && [...c.members, ...c.leads, ...c.trainers].includes(b));
  h.itemMax = m => m.type === 'workshop' ? (Number(m.maxgrade) || 0) + (Number(m.gradinggrade) || 0) : Number(m.maxgrade) || 0;
  h.gradeable = cid => h.courseMods(cid).filter(m => TYPES[m.type].graded && !m.pretest);
  h.resume = (cmid, uid) => S.resume[uid + ':' + cmid] || null;
  h.wsGrades = (m, uid) => {
    if ((m.phase || 1) < 4) return null;
    const sub = S.wsSubs.find(s => s.cmid === m.id && s.userId === uid && !s.archived);
    let sg = null, gg = null;
    if (sub) { const al = S.wsAllocs.filter(a => a.subId === sub.id && a.done); if (al.length) sg = al.reduce((x, a) => x + a.grade, 0) / al.length / 100 * m.maxgrade; }
    const mine = S.wsAllocs.filter(a => a.cmid === m.id && a.reviewer === uid);
    if (mine.length) gg = mine.filter(a => a.done).length / mine.length * m.gradinggrade;
    if (sg == null && gg == null) return null;
    return {submission:sg, assessment:gg, total:(sg || 0) + (gg || 0)};
  };
  h.lessonDone = (cmid, uid) => S.lessonAttempts.filter(a => a.cmid === cmid && a.userId === uid && a.finished && !a.archived);
  h.gradeFor = (m, uid) => {
    if (m.type === 'assign') { const s = h.subOf(m.id, uid); return s && s.grade != null ? s.grade : null; }
    if (m.type === 'quiz') { const at = h.attemptsOf(m.id, uid); if (!at.length) return null; return Math.max(...at.map(a => a.max ? a.score / a.max * m.maxgrade : 0)); }
    if (m.type === 'lesson') { const at = h.lessonDone(m.id, uid); if (!at.length) return null; return Math.max(...at.map(a => a.max ? a.score / a.max * m.maxgrade : 0)); }
    if (m.type === 'workshop') { const g = h.wsGrades(m, uid); return g ? g.total : null; }
    if (m.type === 'scorm') { const r = h.resume(m.id, uid); return r && r.score != null ? Math.min(100, Number(r.score)) / 100 * m.maxgrade : null; }
    return null;
  };
  h.quizPercent = (m, uid) => { const at = h.attemptsOf(m.id, uid); if (!at.length) return null; return Math.max(...at.map(a => a.max ? a.score / a.max * 100 : 0)); };
  h.courseTotal = (cid, uid) => { let g = 0, mx = 0; for (const m of h.gradeable(cid)) { if (!m.visible) continue; const v = h.gradeFor(m, uid); if (v != null) { g += v; mx += h.itemMax(m); } } return mx ? g / mx * 100 : null; };
  h.trackable = m => m.visible && m.type !== 'label' && m.type !== 'certificate' && !m.pretest && !(m.type === 'forum' && m.news);
  h.isDone = (m, uid) => {
    switch (m.type) {
      case 'assign': return h.subOf(m.id, uid)?.status === 'submitted';
      case 'quiz': { if (!m.gradepass || m.pretest) return h.attemptsOf(m.id, uid).length > 0; const p = h.quizPercent(m, uid); return p != null && p >= m.gradepass; }
      case 'lesson': return h.lessonDone(m.id, uid).length > 0;
      case 'choice': return S.choiceAnswers.some(a => a.cmid === m.id && a.userId === uid && !a.archived);
      case 'workshop': return S.wsSubs.some(s => s.cmid === m.id && s.userId === uid && !s.archived);
      case 'certificate': return S.certIssued.some(c => c.cmid === m.id && c.userId === uid && !c.archived);
      case 'feedback': return S.feedbackResponses.some(r => r.cmid === m.id && r.userId === uid && !r.archived);
      case 'live': return S.liveSignups.some(x => x.cmid === m.id && x.userId === uid && !x.archived && (x.status === 'present' || x.status === 'late'));
      case 'video': return !!h.resume(m.id, uid)?.completed;
      case 'scorm': return !!h.resume(m.id, uid)?.completed;
      default: return !!S.completion[uid + ':' + m.id];
    }
  };
  h.progress = (cid, uid) => { const ms = h.courseMods(cid).filter(h.trackable); if (!ms.length) return 0; return Math.round(ms.filter(m => h.isDone(m, uid)).length / ms.length * 100); };
  h.needsGrading = m => m.type === 'assign' ? S.submissions.filter(s => s.cmid === m.id && s.status === 'submitted' && s.grade == null && !s.archived && h.isLearner(m.courseId, s.userId)).length
    : m.type === 'quiz' ? S.attempts.filter(a => a.cmid === m.id && a.pending && !a.archived && a.state === 'finished').length : 0;
  h.certEligible = (m, uid) => {
    const reasons = [];
    if (m.requireCompletion && h.progress(m.courseId, uid) < 100) reasons.push('Complete every required activity in the course');
    if (m.minGrade) { const t = h.courseTotal(m.courseId, uid); if (t == null || t < m.minGrade) reasons.push(`Reach a course grade of at least ${m.minGrade}%`); }
    if (m.requireFeedback) { const fb = h.courseMods(m.courseId).filter(x => x.type === 'feedback' && x.visible); if (fb.some(x => !h.isDone(x, uid))) reasons.push('Complete the course feedback survey'); }
    return reasons;
  };
  /* Step-by-step unlocking: returns why an activity is locked for this learner, or null */
  h.modLock = (m, uid = meId) => {
    if (!h.isLearner(m.courseId, uid)) return null;
    const c = h.course(m.courseId); const why = [];
    if (c.sequential && h.trackable(m)) {
      const order = h.courseMods(c.id).filter(h.trackable); const i = order.findIndex(x => x.id === m.id);
      const prev = order.slice(0, Math.max(0, i)).find(x => !h.isDone(x, uid)); if (prev) why.push(prev.name);
    }
    for (const rid of m.requires || []) { const r = S.mods[rid]; if (r && !h.isDone(r, uid) && !why.includes(r.name)) why.push(r.name); }
    return why.length ? `Complete ${why.join(', ')} first.` : null;
  };
  /* Course status for a learner: notstarted | inprogress | completed | overdue */
  h.status = (cid, uid = meId) => {
    const e = h.enrolOf(cid, uid); if (!e) return null;
    const done = !!e.completedAt || (h.courseMods(cid).some(h.trackable) && h.progress(cid, uid) === 100);
    if (done) return 'completed';
    if (e.due && NOW > e.due) return 'overdue';
    if (e.startedAt || h.progress(cid, uid) > 0) return 'inprogress';
    return 'notstarted';
  };
  h.isLocked = (cid, uid = meId) => h.isLearner(cid, uid) && h.status(cid, uid) === 'overdue';
  h.pathLock = (cid, uid = meId) => {
    const e = h.enrolOf(cid, uid); if (!e?.pathId) return null; const p = S.paths.find(x => x.id === e.pathId); if (!p || !p.sequential) return null;
    const i = p.courses.indexOf(cid); const prev = p.courses.slice(0, Math.max(0, i)).map(h.course).find(c => c && h.enrolOf(c.id, uid) && h.status(c.id, uid) !== 'completed');
    return prev ? `Complete ${prev.fullname} first. It comes earlier in the learning path ${p.name}.` : null;
  };
  h.requestOf = (cid, uid = meId) => S.accessRequests.filter(r => r.courseId === cid && r.userId === uid).sort((a, b) => b.time - a.time)[0] || null;
  /* Cohort scope */
  h.cohortsLed = (uid = meId) => h.user(uid)?.builtinAdmin ? S.cohorts : S.cohorts.filter(c => c.leads.includes(uid));
  h.cohortsTrained = (uid = meId) => S.cohorts.filter(c => c.trainers.includes(uid));
  h.teamMembers = (uid = meId) => [...new Set(h.cohortsLed(uid).flatMap(c => c.members))];
  h.trainerScope = (uid = meId) => new Set([...h.cohortsTrained(uid).flatMap(c => c.members), ...S.enrol.filter(e => h.has('course:assign', e.courseId, uid)).flatMap(e => h.students(e.courseId).map(u => u.id))]);
  h.sysrole = (roleId, uid = meId) => S.sysroles.some(r => r.userId === uid && r.roleId === roleId);
  h.isTeamLead = (uid = meId) => !!h.user(uid)?.builtinAdmin || h.has('team:view', null, uid) && (h.sysrole('teamlead', uid) || h.cohortsLed(uid).length > 0);
  h.isTrainer = (uid = meId) => !!h.user(uid)?.builtinAdmin || !!h.user(uid)?.personas?.includes('trainer') || h.cohortsTrained(uid).length > 0 || S.enrol.some(e => e.userId === uid && ['trainer', 'editingteacher', 'teacher'].includes(e.role));
  h.learnsAnything = (uid = meId) => S.enrol.some(e => e.userId === uid && h.role(e.role)?.caps?.['mod:submit']);
  h.learnerPersona = (uid = meId) => !!h.user(uid)?.builtinAdmin || !!h.user(uid)?.personas?.includes('learner') || h.learnsAnything(uid);
  /* Personas a person can switch between: learner, trainer, team lead, administrator */
  /* The super administrator (built-in admin) holds every persona */
  h.personas = (uid = meId) => { const u = h.user(uid); if (!u) return []; if (u.builtinAdmin) return ['learner', 'trainer', 'teamlead', 'admin']; const out = [];
    if (h.learnerPersona(uid) || (!u.admin && !h.sysrole('manager', uid) && !h.isTrainer(uid) && !h.isTeamLead(uid))) out.push('learner');
    if (h.isTrainer(uid)) out.push('trainer'); if (h.isTeamLead(uid)) out.push('teamlead');
    if (u.admin || h.sysrole('manager', uid)) out.push('admin'); return out; };
  h.unreadMessages = () => S.messages.filter(x => x.to === meId && !x.read).length + (S.chats || []).filter(c => h.inChat(c)).reduce((n, c) => n + h.chatUnread(c), 0);
  /* Super administrator: the built-in administrators from server/site-admins.js */
  h.isSuperAdmin = (uid = meId) => !!h.user(uid)?.builtinAdmin;
  /* Course group chats: created and managed by the course's trainers and by administrators */
  h.canManageChats = (cid, uid = meId) => !!h.course(cid) && (h.isAdmin(uid) || h.sysrole('manager', uid) || S.enrol.some(e => e.courseId === cid && e.userId === uid && ['trainer', 'editingteacher', 'teacher'].includes(e.role)));
  h.chatMembers = c => { if (c.mode !== 'course') return c.members || [];
    const ids = new Set(S.enrol.filter(e => e.courseId === c.courseId).map(e => e.userId)); if (c.createdBy) ids.add(c.createdBy); (c.members || []).forEach(id => ids.add(id));
    return [...ids].filter(id => { const u = h.user(id); return u && !u.suspended; }); };
  h.inChat = (c, uid = meId) => h.chatMembers(c).includes(uid);
  h.chatUnread = (c, uid = meId) => { const seen = c.reads?.[uid] || 0; return (S.chatMessages || []).filter(m => m.chatId === c.id && m.from !== uid && m.time > seen).length; };
  h.unreadNotifications = () => S.notifications.filter(n => n.userId === meId && !n.read).length;
  h.hours = (cid, uid) => { const e = h.enrolOf(cid, uid); return (e?.timeSpent || 0) / 3600; };
  return h;
}

/* ---------------- Seed (demo data) ---------------- */
const SEED_HOOKS = [];
function seed(env) {
  env = env || {};
  const t0 = (env.now || Date.now)(), day = n => t0 + n * D;
  const at = (n, hh, mi = 0) => { const d = new Date(day(n)); d.setHours(hh, mi, 0, 0); return d.getTime(); };
  const id = env.uid || defaultUid;
  const S = emptyState(); S.site.demo = true;
  const pw = env.hash ? env.hash('demo') : {password:'demo'};
  const U = (uid, f, l, un, admin) => S.users.push({id:uid, firstname:f, lastname:l, username:un, email:`${un}@nbacademy.example`, admin:!!admin, created:day(-120), ...pw});
  U('u1', 'Admin', 'User', 'admin', true);
  U('u2', 'Rohan', 'Mehta', 'rohan'); U('u3', 'Priya', 'Iyer', 'priya');
  U('u4', 'Asha', 'Verma', 'asha'); U('u5', 'Kabir', 'Singh', 'kabir'); U('u6', 'Meera', 'Nair', 'meera');
  U('u7', 'Arjun', 'Das', 'arjun'); U('u8', 'Zoya', 'Khan', 'zoya'); U('u9', 'Dev', 'Patel', 'dev');
  U('u10', 'Sana', 'Kapoor', 'sana');
  S.roles.push({id:'reviewer', name:'Course reviewer', builtin:false, desc:'Quality team: can see every course, its participants and reports, but cannot change anything.', caps:capSet(['course:view','course:viewhidden','course:viewparticipants','grade:viewall','report:view','message:send'])});
  S.sysroles.push({id:'sr1', userId:'u10', roleId:'reviewer'});
  S.categories = [{id:'k1', name:'Data & Analytics'}, {id:'k2', name:'Business Skills'}, {id:'k3', name:'Technology'}];
  const C = (cid, fullname, shortname, catId, summary, secs) => S.courses.push({id:cid, fullname, shortname, catId, summary, visible:true, selfenrol:true, created:day(-60), sections:secs.map((n, i) => ({id:`${cid}s${i}`, name:n, summary:'', mods:[]}))});
  let n = 0;
  const M = (cid, si, type, props) => { const mid = 'm' + (++n); S.mods[mid] = {id:mid, courseId:cid, type, visible:true, intro:'', ...props}; S.courses.find(c => c.id === cid).sections[si].mods.push(mid); return mid; };
  const E = (cid, uid, role = 'student') => S.enrol.push({id:`e${S.enrol.length + 1}`, courseId:cid, userId:uid, role, time:day(-30)});

  C('c1', 'Excel for Data Analysis', 'DA101', 'k1', 'Go from formulas to pivot tables. Build clean, reliable spreadsheets that answer real business questions.', ['General', 'Week 1 · Formulas and references', 'Week 2 · Lookups', 'Week 3 · Pivot tables', 'Wrap-up']);
  C('c2', 'Business Communication', 'BS201', 'k2', 'Write emails, status updates and client replies that are clear, short and get a response.', ['General', 'Unit 1 · Writing for busy readers', 'Unit 2 · Difficult conversations']);
  C('c3', 'Python Fundamentals', 'TE110', 'k3', 'Variables, control flow, functions and lists: the foundations for automation and data work.', ['General', 'Topic 1 · Getting started', 'Topic 2 · Functions']);
  C('c4', 'Customer Service Excellence', 'BS150', 'k2', 'Handle queries, complaints and escalations with empathy and a clear process.', ['General', 'Module 1 · Listening first']);
  C('c5', 'Power BI Essentials', 'DA210', 'k1', 'Model data, build visuals and publish dashboards. Opens next month.', ['General', 'Module 1 · Getting data in']);

  // ---- DA101 ----
  const a1 = M('c1', 0, 'forum', {name:'Announcements', intro:'General news and announcements from your teacher.', news:true});
  const f1 = M('c1', 0, 'forum', {name:'Q&A forum', intro:'Stuck on something? Ask here. Answering a classmate counts as participation.'});
  M('c1', 0, 'page', {name:'Course handbook', intro:'How this course works.', content:'## How this course works\nEach week has a short reading, a practice task and either a quiz or an assignment.\n\n## Grading\n- Quizzes: 40%\n- Assignments: 60%\n\nYou can attempt each quiz **twice**. Your highest grade counts.\n\n## Getting help\nPost in the Q&A forum first. Your teacher replies within one working day.'});
  M('c1', 1, 'label', {intro:'**This week:** relative vs absolute references, and the five functions you will use every day.'});
  M('c1', 1, 'page', {name:'Reading: Formulas that don\'t break', intro:'Short reading, about 10 minutes.', content:'## Relative and absolute references\nWhen you copy `=B2*C2` down a column, Excel shifts the references: `=B3*C3`, `=B4*C4`. That is a **relative** reference.\n\nAdd dollar signs to lock a reference: `=B2*$F$1` always points at F1. That is an **absolute** reference.\n\n## Five everyday functions\n1. `SUM`: adds numbers and ignores text\n2. `AVERAGE`: mean of numbers\n3. `COUNT` / `COUNTA`: counts numbers / non-empty cells\n4. `ROUND`: rounds to a set number of digits\n5. `IF`: returns one value or another based on a test'});
  M('c1', 1, 'url', {name:'Microsoft: Overview of formulas in Excel', intro:'Official reference for formula syntax.', url:'https://support.microsoft.com/en-us/office/overview-of-formulas-in-excel-ecfdc708-9162-49e8-b993-c311f47ca173'});
  const q1 = M('c1', 1, 'quiz', {name:'Formulas check', intro:'Five questions on references and everyday functions. Two attempts, highest grade counts.', close:at(9, 23, 59), timelimit:10, attempts:2, maxgrade:10, questions:[
    {id:'q1', type:'mc', text:'Which reference stays fixed when you copy a formula to another cell?', mark:1, options:[{text:'A1'}, {text:'$A$1', correct:true}, {text:'A$1'}, {text:'R[1]C[1]'}]},
    {id:'q2', type:'tf', text:'SUM ignores text values inside the range it adds up.', mark:1, answer:true},
    {id:'q3', type:'short', text:'Which function counts the non-empty cells in a range? (function name only)', mark:1, answer:'COUNTA|COUNTA()'},
    {id:'q4', type:'num', text:'A cell contains 1245.678. What does =ROUND(A1,1) return?', mark:1, answer:1245.7, tol:0},
    {id:'q5', type:'mc', text:'You need to find a product\'s price by its product code in another table. Which function fits best?', mark:1, options:[{text:'CONCAT'}, {text:'TRIM'}, {text:'XLOOKUP', correct:true}, {text:'NOW'}]}]});
  const g1 = M('c1', 1, 'glossary', {name:'Excel terms', intro:'Our shared glossary. Add a term you had to look up this week.', approval:true});
  const ch1 = M('c1', 0, 'choice', {name:'Live Q&A session time', intro:'Pick the slot that works best for the weekly live Q&A.', options:['Tuesday 6 PM', 'Thursday 7 PM', 'Saturday 11 AM'], allowUpdate:true, showResults:'after'});
  M('c1', 2, 'page', {name:'Reading: XLOOKUP in practice', intro:'Lookups explained with a sales example.', content:'## The pattern\n`=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])`\n\n## Example\nFind the price of product code in A2 from the Products table:\n`=XLOOKUP(A2, Products[Code], Products[Price], "Not found")`\n\n## Why not VLOOKUP?\n- XLOOKUP can look left\n- It does not break when columns are inserted\n- It has a built-in *not found* value'});
  const as1 = M('c1', 2, 'assign', {name:'Build a sales lookup sheet', intro:'Use the sample orders data from the reading. Add a Price column using XLOOKUP and a Total column. In your submission, paste the two formulas you used and explain in 2–3 sentences how you handled codes that are missing from the Products table. You can attach your workbook.', due:at(5, 23, 59), maxgrade:100, allowFiles:true});
  M('c1', 3, 'page', {name:'Reading: Pivot tables from scratch', intro:'Summarise thousands of rows in seconds.', content:'## When to use a pivot table\nUse one whenever the question starts with **"total by"**, **"average per"** or **"count of"**.\n\n## Steps\n1. Click any cell in your data\n2. Insert → PivotTable\n3. Drag a field to Rows, a numeric field to Values\n4. Change the summary (Sum, Count, Average) from Value Field Settings'});
  M('c1', 3, 'assign', {name:'Pivot table report', intro:'Build a pivot table showing total sales by region and month. Write three findings a manager would care about.', due:at(12, 17, 0), maxgrade:100, allowFiles:true});
  M('c1', 3, 'quiz', {name:'Pivot tables check', intro:'Three quick questions.', close:at(14, 23, 59), timelimit:0, attempts:0, maxgrade:10, questions:[
    {id:'q1', type:'tf', text:'A pivot table changes the source data.', mark:1, answer:false},
    {id:'q2', type:'mc', text:'Where do you drag a field to create one row per region?', mark:1, options:[{text:'Filters'}, {text:'Columns'}, {text:'Rows', correct:true}, {text:'Values'}]},
    {id:'q3', type:'short', text:'Which summary function counts how many orders are in each group? (one word)', mark:1, answer:'Count'}]});
  const cert1 = M('c1', 4, 'certificate', {name:'Certificate of completion', intro:'Complete every activity in the course to receive your certificate.', requireCompletion:true, minGrade:0});

  // ---- BS201 ----
  const a2 = M('c2', 0, 'forum', {name:'Announcements', intro:'News from your teacher.', news:true});
  M('c2', 0, 'page', {name:'Welcome and course plan', intro:'Start here.', content:'## Welcome\nThis course has two units. Each unit ends with a writing task that your teacher grades with written feedback.\n\n## What good looks like\n- The main point is in the first two lines\n- Every paragraph has one job\n- The reader knows exactly what you need from them, and by when'});
  const l1 = M('c2', 1, 'lesson', {name:'Spotting a weak email', intro:'A short interactive lesson. Read each page, answer the questions and get instant feedback.', maxgrade:10, close:null, pages:[
    {id:'p1', kind:'content', title:'Why emails get ignored', body:'Most workplace emails are skimmed on a phone. If the reader cannot tell **what you need** and **by when** within two lines, the email waits.'},
    {id:'p2', kind:'question', title:'Which subject line works?', body:'You need your manager to approve a budget change by Friday.', options:[{text:'Budget', feedback:'Too vague. The reader cannot tell what is needed.'}, {text:'Approval needed by Fri: revised Q3 budget (+4%)', correct:true, feedback:'Right. It names the action, the deadline and the topic.'}, {text:'Quick question', feedback:'This hides the request and the urgency.'}]},
    {id:'p3', kind:'content', title:'One email, one job', body:'If you need two decisions from two people, send two emails. Mixed requests get half-answered.'},
    {id:'p4', kind:'question', title:'Where does the request go?', body:'You are writing a status update that ends with a request for a decision.', options:[{text:'Keep it at the end, after the context', feedback:'Busy readers may never reach the end.'}, {text:'Move it to the first two lines', correct:true, feedback:'Correct. Lead with what you need, then add context.'}]}]});
  M('c2', 1, 'page', {name:'The inverted pyramid', intro:'Put the conclusion first.', content:'## Lead with the answer\nBusy readers decide in the first two lines whether to keep reading. Put the decision, request or result there.\n\n## Then add support\nContext, details and background come after, in order of importance.'});
  const as2 = M('c2', 1, 'assign', {name:'Write a weekly status update', intro:'Write a status update email (under 200 words) for a project you know. Include: progress, risks, and one decision you need from your manager.', due:at(2, 18, 0), maxgrade:100});
  const q2 = M('c2', 1, 'quiz', {name:'Email etiquette check', intro:'Four questions on clear workplace email.', close:at(6, 23, 59), timelimit:5, attempts:1, maxgrade:10, questions:[
    {id:'q1', type:'tf', text:'A subject line should say what you need from the reader.', mark:1, answer:true},
    {id:'q2', type:'mc', text:'Where should the main request go in a status update?', mark:1, options:[{text:'In the signature'}, {text:'In the first two lines', correct:true}, {text:'In the final paragraph'}, {text:'In an attachment'}]},
    {id:'q3', type:'mc', text:'Which line is the clearest ask?', mark:1, options:[{text:'Let me know your thoughts.'}, {text:'Any feedback is welcome.'}, {text:'Please approve the revised budget by Thursday 5 PM.', correct:true}, {text:'Hope this helps!'}]},
    {id:'q4', type:'short', text:'What three-letter abbreviation in a subject line tells the reader no reply is needed? (e.g. "Office closed Friday ___")', mark:1, answer:'FYI|NRN|EOM'}]});
  const ws1 = M('c2', 2, 'workshop', {name:'Peer review: client reply', intro:'Write a short reply to an upset client, then review two classmates\' replies.', instructions:'Score each reply out of 100. Consider: Is it calm? Does it state facts? Does it propose a specific next step?', phase:2, maxgrade:80, gradinggrade:20, peers:2, subEnd:at(4, 23, 59)});
  const as3 = M('c2', 2, 'assign', {name:'Reply to a difficult client', intro:'A client says your team missed a deadline that was never agreed. Draft a reply that stays calm, states the facts and proposes a next step.', due:at(-3, 18, 0), maxgrade:100});

  // ---- TE110 ----
  M('c3', 0, 'forum', {name:'Announcements', intro:'News from your teacher.', news:true});
  M('c3', 1, 'page', {name:'Installing Python and running your first script', intro:'Set up in 15 minutes.', content:'## Install\nDownload Python 3 from python.org and tick **Add Python to PATH** during install.\n\n## Your first script\nCreate `hello.py` containing:\n`print("Hello, NB Academy")`\n\nRun it with `python hello.py`.'});
  M('c3', 1, 'file', {name:'Python cheat sheet', intro:'One-page reference for syntax you will use every day.', fileId:'f_cheatsheet'});
  M('c3', 1, 'url', {name:'Python documentation: tutorial', intro:'The official tutorial. Read sections 3 and 4.', url:'https://docs.python.org/3/tutorial/'});
  const q3 = M('c3', 1, 'quiz', {name:'Python basics', intro:'Four questions on types and syntax.', close:at(10, 23, 59), timelimit:0, attempts:3, maxgrade:10, questions:[
    {id:'q1', type:'mc', text:'In Python 3, what type does 3 / 2 return?', mark:1, options:[{text:'int'}, {text:'float', correct:true}, {text:'str'}, {text:'Decimal'}]},
    {id:'q2', type:'num', text:'What does len("hello") return?', mark:1, answer:5, tol:0},
    {id:'q3', type:'tf', text:'Lists in Python are mutable.', mark:1, answer:true},
    {id:'q4', type:'short', text:'Which keyword starts a function definition?', mark:1, answer:'def'}]});
  M('c3', 2, 'assign', {name:'FizzBuzz and friends', intro:'Write a function fizzbuzz(n) that returns a list of strings for 1..n. Attach your .py file or paste your code and the output for n = 15.', due:at(8, 23, 59), maxgrade:50, allowFiles:true});

  // ---- BS150, DA210 ----
  M('c4', 0, 'forum', {name:'Announcements', intro:'News from your teacher.', news:true});
  M('c4', 1, 'page', {name:'The LEAP method', intro:'Listen, Empathise, Ask, Propose.', content:'## LEAP\n1. **Listen** without interrupting\n2. **Empathise**: name the feeling\n3. **Ask** clarifying questions\n4. **Propose** a specific next step'});
  M('c5', 0, 'forum', {name:'Announcements', intro:'News from your teacher.', news:true});
  S.courses.find(c => c.id === 'c5').visible = false;

  // ---- Files ----
  S.files.push({id:'f_cheatsheet', name:'python-cheat-sheet.txt', type:'text/plain', size:0, owner:'u2', time:day(-20)});
  const seedFiles = {f_cheatsheet:'PYTHON CHEAT SHEET — NB Academy TE110\n\nVariables      name = "Asha"; age = 31\nTypes          int, float, str, bool, list, dict\nIf             if x > 3:\\n    print("big")\nFor loop       for i in range(5): print(i)\nFunction       def area(w, h): return w * h\nList           xs = [1, 2, 3]; xs.append(4)\nDict           d = {"a": 1}; d["b"] = 2\nf-string       f"Hello {name}"\n'};
  S.files[0].size = seedFiles.f_cheatsheet.length;

  // ---- Enrolments & groups ----
  E('c1', 'u2', 'editingteacher'); E('c1', 'u3', 'teacher'); ['u4', 'u5', 'u6', 'u7', 'u8'].forEach(u => E('c1', u));
  E('c2', 'u3', 'editingteacher'); ['u4', 'u8', 'u7', 'u9'].forEach(u => E('c2', u));
  E('c3', 'u2', 'editingteacher'); ['u4', 'u5', 'u9', 'u6'].forEach(u => E('c3', u));
  E('c4', 'u3', 'editingteacher'); E('c4', 'u8');
  E('c5', 'u2', 'editingteacher');
  S.groups.push({id:'g1', courseId:'c1', name:'Batch A · Mumbai', members:['u4', 'u5', 'u6']}, {id:'g2', courseId:'c1', name:'Batch B · Pune', members:['u7', 'u8']});

  // ---- Activity data ----
  const SUB = (cmid, userId, text, t, grade, feedback, grader) => S.submissions.push({id:id('s'), cmid, userId, text, files:[], status:'submitted', time:t, grade:grade ?? null, feedback:feedback || '', gradedBy:grader || null, gradedAt:grade != null ? t + D : null});
  SUB(as1, 'u5', 'Price: =XLOOKUP(A2,Products[Code],Products[Price],"Missing")\nTotal: =C2*D2\n\nMissing codes show "Missing" so they are easy to filter. I added a conditional format to highlight them in red.', day(-1));
  SUB(as1, 'u6', 'Price: =XLOOKUP(A2,Products[Code],Products[Price],0)\nTotal: =ROUND(C2*D2,2)\n\nMissing codes return 0 so totals still add up, and a COUNTIF at the top counts how many are missing.', day(-2), 88, 'Clean and well explained. Returning 0 hides missing codes in totals, so your COUNTIF check is a good safeguard. Consider a visible flag too.', 'u2');
  SUB(as2, 'u4', 'Subject: Website relaunch – on track, one decision needed by Wed\n\nProgress: Design is signed off and 6 of 9 pages are built.\nRisk: Payment gateway testing may slip 2 days because the vendor sandbox is down.\nDecision needed: Can we launch without the blog section and add it a week later?', day(-1), 78, 'Strong subject line and a clear ask. Add a date to the decision request and say what happens if no decision is made.', 'u3');
  SUB(as3, 'u8', 'Hi Ramesh,\n\nThanks for flagging this. I checked our project plan and the 12 May date was listed as a target, not a commitment. I understand why it matters to you. We can deliver the first module by Friday and the rest by 24 May. Shall we confirm this on a call tomorrow?', day(-4), 92, 'Calm, factual and you proposed a concrete next step. Excellent.', 'u3');
  SUB(as3, 'u7', 'Dear client, we did not miss any deadline because there was none agreed. Please check the contract.', day(-3.5));
  const ATT = (cmid, userId, answers, score, max, t) => { const m = S.mods[cmid]; S.attempts.push({id:id('a'), cmid, userId, state:'finished', answers, score, max, start:t - 6 * 6e4, finish:t, review:reviewOf(m, answers)}); };
  ATT(q1, 'u4', {q1:'1', q2:'true', q3:'COUNTA', q4:'1245.7', q5:'0'}, 4, 5, day(-2));
  ATT(q1, 'u5', {q1:'1', q2:'false', q3:'COUNT', q4:'1245.7', q5:'2'}, 3, 5, day(-3));
  ATT(q1, 'u6', {q1:'1', q2:'true', q3:'counta', q4:'1245.7', q5:'2'}, 5, 5, day(-2.5));
  ATT(q3, 'u4', {q1:'1', q2:'5', q3:'true', q4:'function'}, 3, 4, day(-1.5));
  ATT(q2, 'u8', {q1:'true', q2:'1', q3:'2', q4:'FYI'}, 4, 4, day(-1));
  const P = (cmid, disc, parent, userId, subject, message, t) => { const pid = id('p'); S.posts.push({id:pid, cmid, discussion:disc || pid, parent, userId, subject, message, time:t}); return pid; };
  P(a1, null, null, 'u2', 'Welcome to Excel for Data Analysis', 'Hi everyone, welcome! Start with the **Course handbook**, then work through Week 1. The Formulas check closes next week. Good luck.', day(-14));
  P(a1, null, null, 'u2', 'Week 2 is open', 'The lookup assignment is now open. Please read the XLOOKUP reading first.', day(-4));
  const d1 = P(f1, null, null, 'u4', 'XLOOKUP vs VLOOKUP: when does it matter?', 'My team still uses VLOOKUP everywhere. Is it worth switching our existing sheets?', day(-3));
  const r1 = P(f1, d1, d1, 'u2', 'Re: XLOOKUP vs VLOOKUP: when does it matter?', 'For new sheets, yes. For existing ones, switch only when you touch them, or when someone inserts a column and the VLOOKUP breaks.', day(-2.8));
  P(f1, d1, r1, 'u5', 'Re: XLOOKUP vs VLOOKUP: when does it matter?', 'This happened to us last month! A new column broke 40 formulas.', day(-2.5));
  P(f1, null, null, 'u7', 'Is the quiz timed?', 'Do we get extra time if the page reloads?', day(-1));
  P(a2, null, null, 'u3', 'Welcome to Business Communication', 'Welcome! Unit 1 is open. Your first writing task is due this week.', day(-10));
  const GL = (userId, concept, definition, approved, t) => S.glossary.push({id:id('gl'), cmid:g1, userId, concept, definition, approved, time:day(t)});
  GL('u2', 'Absolute reference', 'A cell reference locked with $ signs (e.g. $A$1) so it does not change when the formula is copied.', true, -10);
  GL('u4', 'XLOOKUP', 'Looks up a value in one range and returns the matching value from another range. Can search in any direction.', true, -3);
  GL('u6', 'Pivot table', 'An interactive summary of a dataset that groups rows and calculates totals, counts or averages.', true, -2);
  GL('u5', 'COUNTA', 'Counts the cells in a range that are not empty, including text.', true, -2);
  GL('u7', 'Named range', 'A name given to a cell or range so formulas can refer to it by name instead of address.', false, -0.5);
  [['u4', 1], ['u5', 0], ['u6', 1], ['u8', 2]].forEach(([u, o], i) => S.choiceAnswers.push({id:`ca${i}`, cmid:ch1, userId:u, option:o, time:day(-2)}));
  S.wsSubs.push({id:'ws1', cmid:ws1, userId:'u8', title:'Reply to Ramesh about the delivery date', text:'Hi Ramesh, thank you for raising this. I have checked our plan: 12 May was a target, not an agreed date. I understand the pressure on your side. We can ship module one this Friday and the rest by 24 May. Can we confirm on a 15-minute call tomorrow at 11?', time:day(-1)});
  S.wsSubs.push({id:'ws2', cmid:ws1, userId:'u9', title:'Response to missed deadline complaint', text:'Dear Ramesh, I am sorry for the confusion about the date. Our records show 12 May as a target. To get you moving, we will deliver the first module on Friday. I will call you today to agree the remaining dates.', time:day(-0.6)});
  S.lessonAttempts.push({id:'la1', cmid:l1, userId:'u8', answers:{p2:1, p4:1}, score:2, max:2, finished:true, time:day(-2)});

  // completion
  const done = (u, m) => S.completion[u + ':' + m] = day(-2);
  ['m1', 'm3', 'm5', 'm6', 'm8', 'm10'].forEach(m => done('u4', m)); ['m3', 'm5'].forEach(m => done('u5', m)); ['m1', 'm2', 'm3', 'm5', 'm6', 'm8', 'm10', 'm12'].forEach(m => done('u6', m));
  ['m17', 'm19'].forEach(m => { done('u4', m); done('u8', m); });

  // badges
  S.badges.push({id:'b1', courseId:'c1', name:'Formula Fluent', description:'Read the formulas reading and passed the Formulas check.', color:'#0e6175', criteria:{type:'activities', mods:['m5', q1]}, created:day(-20)});
  S.badges.push({id:'b2', courseId:'c1', name:'Excel Analyst', description:'Completed every activity in Excel for Data Analysis.', color:'#d2831a', criteria:{type:'course'}, created:day(-20)});
  S.badges.push({id:'b3', courseId:'c2', name:'Helpful Reviewer', description:'Awarded by the teacher for especially useful peer feedback.', color:'#ad2f68', criteria:{type:'manual'}, created:day(-15)});
  S.badgeIssued.push({id:'bi1', badgeId:'b1', userId:'u4', time:day(-2), by:null}, {id:'bi2', badgeId:'b1', userId:'u6', time:day(-2.5), by:null});

  // messages & notifications
  const MSG = (from, to, text, t, read) => S.messages.push({id:id('msg'), from, to, text, time:day(t), read});
  MSG('u4', 'u2', 'Hi Rohan, can I submit the lookup sheet as a Google Sheets link instead of a file?', -1.2, true);
  MSG('u2', 'u4', 'Yes, paste the link in the online text and make sure "anyone with the link can view" is on.', -1.1, false);
  MSG('u8', 'u3', 'Thank you for the detailed feedback on my client reply!', -3, true);
  const NOTE = (userId, subject, body, go, gid, t, read) => S.notifications.push({id:id('n'), userId, subject, body, go, gid, time:day(t), read});
  NOTE('u4', 'Your submission has been graded', 'Write a weekly status update: 78 / 100', 'mod', as2, -0.9, false);
  NOTE('u4', 'You earned a badge: Formula Fluent', 'Excel for Data Analysis', 'badges', 'c1', -2, true);
  NOTE('u2', 'New submission: Build a sales lookup sheet', 'Kabir Singh submitted for grading', 'mod', as1, -1, false);
  NOTE('u3', 'New submission: Reply to a difficult client', 'Arjun Das submitted for grading', 'mod', as3, -3.5, true);

  S.logs = [
    {id:'l1', t:day(-1), uid:'u4', ev:'Submission created', cid:'c2'}, {id:'l2', t:day(-1.2), uid:'u3', ev:'Submission graded', cid:'c2'},
    {id:'l3', t:day(-2), uid:'u4', ev:'Quiz attempt submitted', cid:'c1'}, {id:'l4', t:day(-2.8), uid:'u2', ev:'Forum post created', cid:'c1'}];
  void cert1; void as1;
  const H2 = {as1, as2, as3, q1, q2, q3, l1, g1, ch1, ws1, cert1, a1, f1, a2};
  for (const f of SEED_HOOKS) f(S, env, seedFiles, H2);
  return {state:S, files:seedFiles};
}
/* Starting password for new accounts. Everyone must change it at first sign-in (mustChangePassword).
   The server can override it with NB_DEFAULT_PASSWORD (passed in as env.defaultPassword). */
const DEFAULT_PASSWORD = 'Welcome@1';
const DEFAULT_TEMPLATES = {
  welcome:{label:'Welcome email', subject:'Welcome to {site}', body:'Hi {firstname},\n\nAn account has been created for you on {site}.\nUsername: {username}\n\nSet your password and sign in here:\n{link}\n\nThis link is valid for 7 days.', email:true, inapp:false},
  assigned:{label:'Course assigned', subject:'New training assigned: {course}', body:'Hi {firstname},\n\n{course} has been assigned to you by {sender}. Please complete it by {due}.\n\nStart here: {link}', email:true, inapp:true},
  deadline:{label:'Deadline warning', subject:'Reminder: {course} is due in {days}', body:'Hi {firstname},\n\n{course} is due on {due}. You have completed {progress}% so far.\n\nIf the deadline passes, the course is locked until an administrator approves a request for access.\n\nContinue here: {link}', email:true, inapp:true},
  overdue:{label:'Overdue lock notice', subject:'{course} is overdue and locked', body:'Hi {firstname},\n\nThe deadline for {course} ({due}) has passed, so access is now locked.\n\nTo continue, open the course and select "Request access" with a short justification. Your progress is kept.\n\n{link}', email:true, inapp:true},
  accessRequest:{label:'Access request (to approvers)', subject:'Access request: {learner} · {course}', body:'{learner} asked for access to the overdue course {course}.\n\nReason: {reason}\n\nReview it in the approval queue: {link}', email:true, inapp:true},
  accessApproved:{label:'Access approved', subject:'Access restored: {course}', body:'Hi {firstname},\n\nYour request was approved. {course} is unlocked with a new due date of {due}. Your earlier progress is intact.\n\n{remarks}\n\n{link}', email:true, inapp:true},
  accessRejected:{label:'Access declined', subject:'Access request declined: {course}', body:'Hi {firstname},\n\nYour request for access to {course} was declined.\n\nRemarks: {remarks}', email:true, inapp:true},
  graded:{label:'Work graded', subject:'Your work has been graded: {item}', body:'Hi {firstname},\n\n{item} in {course} has been graded: {grade}.\n\nSee the feedback here: {link}', email:false, inapp:true},
  certificate:{label:'Certificate issued', subject:'Your certificate for {course}', body:'Congratulations {firstname}!\n\nYou have completed {course}. Your certificate verification code is {code}.{expiry}\n\nView or download it here: {link}', email:true, inapp:true},
  recert:{label:'Recertification due', subject:'Recertification due: {course}', body:'Hi {firstname},\n\nYour certificate for {course} expires on {expires}. The course has been assigned to you again. Please complete it by {due} to stay certified.\n\n{link}', email:true, inapp:true},
  nudge:{label:'Reminder from a team lead or trainer', subject:'Reminder from {sender}: {course}', body:'Hi {firstname},\n\n{sender} is reminding you to complete {course}.{duepart}\n\n{link}', email:true, inapp:true},
  liveSession:{label:'Live session reminder', subject:'Upcoming session: {item}', body:'Hi {firstname},\n\nYou are registered for {item} ({course}) on {when}.\n{where}\n\n{link}', email:true, inapp:true},
  passwordReset:{label:'Password reset', subject:'Reset your {site} password', body:'Hi {firstname},\n\nUse this link to choose a new password. It is valid for 2 hours.\n\n{link}\n\nIf you did not ask for this, ignore this email.', email:true, inapp:false}
};
const TEMPLATE_VARS = '{firstname} {lastname} {username} {site} {course} {item} {due} {days} {progress} {link} {sender} {learner} {reason} {remarks} {grade} {code} {expires} {when} {where}';
function defaultSite() {
  return {name:'NB Academy', tagline:'Courses, assessments and progress tracking for every learner.', demo:false, url:'',
    branding:{logo:null, primary:'#0e6175', accent:'#d2831a'},
    terms:{version:1, text:'## Acceptable use\n- Use this platform only for work-related learning.\n- Keep your password private and do not share your account.\n- Complete assigned training honestly and by its due date.\n\n## Your data\nWe record your course progress, scores, time spent and certificates to manage training and meet compliance requirements. Your team lead and trainers can see progress for the courses and cohorts mapped to them.'},
    security:{minLength:8, upper:true, lower:true, digit:true, special:false, lockoutAttempts:5, lockoutMinutes:30, sessionTimeout:60, mfa:'off'},
    email:{enabled:false, host:'', port:587, secure:false, user:'', pass:'', from:'NB Academy <no-reply@example.com>'},
    sso:{enabled:false, label:'Company single sign-on', issuer:'', clientId:'', clientSecret:'', autoCreate:false},
    ldap:{enabled:false, url:'', bindDn:'uid={username},ou=people,dc=example,dc=com', autoCreate:false, emailDomain:''},
    cert:{template:'classic', signatureName:'', signatureTitle:'', body:'has successfully completed'},
    templates:clone(DEFAULT_TEMPLATES), reminders:[7, 3, 1], recertDays:30};
}
function emptyState() {
  return {version:VERSION, site:defaultSite(),
    users:[], roles:clone(BUILTIN_ROLES), sysroles:[], categories:[], courses:[], mods:{}, enrol:[], groups:[], completion:{},
    submissions:[], attempts:[], posts:[], messages:[], notifications:[], badges:[], badgeIssued:[], certIssued:[],
    lessonAttempts:[], glossary:[], choiceAnswers:[], wsSubs:[], wsAllocs:[], files:[], logs:[], access:{},
    cohorts:[], paths:[], rules:[], accessRequests:[], liveSignups:[], feedbackResponses:[], qbank:[], courseVersions:[], outbox:[], audit:[], tokens:[], chats:[], chatMessages:[],
    resume:{}, extraAttempts:{}};
}
/* Collections, used by the server for persistence */
const ARRAYS = ['users', 'roles', 'sysroles', 'categories', 'courses', 'enrol', 'groups', 'submissions', 'attempts', 'posts', 'messages', 'notifications', 'badges', 'badgeIssued', 'certIssued', 'lessonAttempts', 'glossary', 'choiceAnswers', 'wsSubs', 'wsAllocs', 'files', 'logs',
  'cohorts', 'paths', 'rules', 'accessRequests', 'liveSignups', 'feedbackResponses', 'qbank', 'courseVersions', 'outbox', 'audit', 'tokens', 'chats', 'chatMessages'];
const MAPS = ['mods', 'completion', 'access', 'resume', 'extraAttempts'];

/* ---------------- SHA-256 (pure JS, used for the audit hash chain) ---------------- */
function sha256(msg) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes = []; const s = unescape(encodeURIComponent(String(msg)));
  for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  const bitLen = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  let H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const W = new Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = (bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3];
    for (let t = 16; t < 64; t++) { const s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ (W[t - 15] >>> 3), s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ (W[t - 2] >>> 10); W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H0;
    for (let t = 0; t < 64; t++) {
      const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H0 = [H0[0] + a, H0[1] + b, H0[2] + c, H0[3] + d, H0[4] + e, H0[5] + f, H0[6] + g, H0[7] + h].map(x => x | 0);
  }
  return H0.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* ---------------- Audit trail (append-only, hash-chained) ---------------- */
function auditEntryHash(e) { return sha256([e.prev, e.seq, e.t, e.uid, e.action, e.target, e.detail].join('|')); }
function audit(S, env, uid, action, target, detail) {
  const last = S.audit[S.audit.length - 1];
  const e = {id:env.uid('au'), seq:(last?.seq || 0) + 1, t:env.now(), uid:uid || null, action, target:target || '', detail:String(detail || '').slice(0, 2000), prev:last?.hash || 'GENESIS'};
  e.hash = auditEntryHash(e); S.audit.push(e); return e;
}
function verifyAudit(list) {
  let prev = 'GENESIS', seq = 0;
  for (const e of list) { if (e.prev !== prev || e.seq !== seq + 1 || auditEntryHash(e) !== e.hash) return {ok:false, at:e.seq, count:list.length}; prev = e.hash; seq = e.seq; }
  return {ok:true, count:list.length};
}

/* ---------------- Templates, in-app notifications and the email outbox ---------------- */
function fill(tpl, vars) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? String(vars[k]) : ''); }
/* Usernames keep the capitalisation they were given, but are matched without regard to case */
const USERNAME_RE = /^[A-Za-z0-9._-]+$/, USERNAME_RULE = 'Username may only use letters, numbers, dot, dash and underscore';
const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const findUser = (S, name) => S.users.find(u => sameName(u.username, name));
function linkTo(S, go, id) { return `${S.site.url || ''}/?go=${encodeURIComponent(go || 'dashboard')}${id ? `&id=${encodeURIComponent(id)}` : ''}`; }
function fmtD(t) { return t ? new Date(t).toLocaleString('en-IN', {day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit'}) : '—'; }
function queueEmail(S, env, u, subject, body, key) {
  if (!u?.email) return;
  S.outbox.push({id:env.uid('em'), userId:u.id, to:u.email, toName:`${u.firstname} ${u.lastname}`, subject, body, key, time:env.now(), status:S.site.email?.enabled ? 'queued' : 'not sent', tries:0});
  if (S.outbox.length > 3000) S.outbox.splice(0, S.outbox.length - 3000);
}
function notifyT(S, env, key, userId, vars, go, gid) {
  const u = S.users.find(x => x.id === userId); if (!u || u.suspended) return;
  const t = S.site.templates?.[key] || DEFAULT_TEMPLATES[key]; if (!t) return;
  const v = {firstname:u.firstname, lastname:u.lastname, username:u.username, site:S.site.name, link:linkTo(S, go, gid), ...vars};
  const subject = fill(t.subject, v);
  if (t.inapp) notify(S, env, userId, subject, vars.short || '', go, gid);
  if (t.email) queueEmail(S, env, u, subject, fill(t.body, v), key);
}


/* ---------------- Grading helpers ---------------- */
function gradeQ(q, a) {
  if (a == null || a === '') return 0;
  if (q.type === 'mc') return Number(a) === q.options.findIndex(o => o.correct) ? q.mark : 0;
  if (q.type === 'tf') return (a === 'true') === q.answer ? q.mark : 0;
  if (q.type === 'short') return String(q.answer).split('|').map(s => s.trim().toLowerCase()).includes(String(a).trim().toLowerCase()) ? q.mark : 0;
  if (q.type === 'num') { const v = parseFloat(a); return !isNaN(v) && Math.abs(v - q.answer) <= (q.tol || 0) ? q.mark : 0; }
  return 0; // essays are graded by a trainer
}
const correctText = q => q.type === 'essay' ? 'Graded by a trainer' : q.type === 'mc' ? q.options.find(o => o.correct)?.text : q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.type === 'short' ? String(q.answer).split('|')[0] : `${q.answer}${q.tol ? ` ± ${q.tol}` : ''}`;
function reviewOf(m, answers) {
  const out = {};
  for (const q of m.questions || []) out[q.id] = {text:q.text, type:q.type, mark:q.mark, got:gradeQ(q, answers[q.id]), right:correctText(q), options:q.type === 'mc' ? q.options.map(o => ({text:o.text, correct:!!o.correct})) : null, answerTf:q.type === 'tf' ? q.answer : null, pending:q.type === 'essay' && answers[q.id] != null && answers[q.id] !== ''};
  return out;
}

/* ---------------- Notifications, logs, badges ---------------- */
function notify(S, env, userId, subject, body, go, gid) {
  if (!userId) return;
  S.notifications.push({id:env.uid('n'), userId, subject, body:body || '', go:go || null, gid:gid || null, time:env.now(), read:false});
  if (S.notifications.length > 3000) S.notifications.splice(0, S.notifications.length - 3000);
}
function log(S, env, uid, ev, cid) {
  S.logs.push({id:env.uid('l'), t:env.now(), uid, ev, cid:cid || null});
  if (S.logs.length > 5000) S.logs.splice(0, S.logs.length - 5000);
}
/* Called whenever a learner's progress may have changed */
function checkBadges(S, env, uid, cid) {
  const h = H(S, uid);
  const e = h.enrolOf(cid, uid);
  if (e && h.isLearner(cid, uid)) {
    if (!e.startedAt) e.startedAt = env.now();
    if (!e.completedAt && h.courseMods(cid).some(h.trackable) && h.progress(cid, uid) === 100) {
      e.completedAt = env.now(); log(S, env, uid, 'Course completed', cid);
      for (const pth of S.paths.filter(x => x.courses.includes(cid))) { const nx = pth.courses[pth.courses.indexOf(cid) + 1]; const ne = nx && h.enrolOf(nx, uid); if (ne && ne.pathId === pth.id) notify(S, env, uid, `Next in ${pth.name}: ${h.course(nx)?.fullname}`, 'The next course in your learning path is now unlocked', 'course', nx); }
    }
    for (const m of h.courseMods(cid).filter(x => x.type === 'certificate' && x.visible && x.autoIssue !== false)) if (!h.isDone(m, uid) && !h.certEligible(m, uid).length && (m.requireCompletion || m.minGrade || m.requireFeedback)) issueCert(S, env, h, m, uid);
  }
  for (const b of S.badges.filter(x => x.courseId === cid && x.criteria?.type !== 'manual')) {
    if (S.badgeIssued.some(i => i.badgeId === b.id && i.userId === uid)) continue;
    if (!h.isLearner(cid, uid)) continue;
    let ok = false;
    if (b.criteria.type === 'course') ok = h.progress(cid, uid) === 100;
    if (b.criteria.type === 'activities') ok = (b.criteria.mods || []).length > 0 && b.criteria.mods.every(mid => S.mods[mid] && h.isDone(S.mods[mid], uid));
    if (ok) { S.badgeIssued.push({id:env.uid('bi'), badgeId:b.id, userId:uid, time:env.now(), by:null}); notify(S, env, uid, `You earned a badge: ${b.name}`, h.course(cid)?.fullname, 'badges', cid); log(S, env, uid, `Badge awarded: ${b.name}`, cid); }
  }
}

function issueCert(S, env, h, m, uid) {
  const code = (env.uid('') + env.uid('')).replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase();
  const t = env.now(), expires = m.validityDays ? t + m.validityDays * D : null;
  const c = {id:env.uid('ci'), cmid:m.id, userId:uid, code, time:t, expires, grade:h.courseTotal(m.courseId, uid)}; S.certIssued.push(c);
  notifyT(S, env, 'certificate', uid, {course:h.course(m.courseId)?.fullname, code, expiry:expires ? ` It is valid until ${fmtD(expires)}.` : '', short:h.course(m.courseId)?.fullname}, 'mod', m.id);
  log(S, env, uid, `Certificate issued: ${code}`, m.courseId);
  return c;
}
/* One-time tokens (set password, reset password). Only a hash is stored. */
function makeToken(S, env, userId, kind, ttl) {
  const raw = env.token ? env.token() : (env.uid('t') + env.uid('') + env.uid('') + env.uid(''));
  S.tokens = S.tokens.filter(t => t.expires > env.now() && !(t.userId === userId && t.kind === kind));
  S.tokens.push({id:sha256(raw), userId, kind, expires:env.now() + ttl}); return raw;
}
function useToken(S, env, raw, consume) {
  const t = S.tokens.find(x => x.id === sha256(String(raw || ''))); if (!t || t.expires < env.now()) return null;
  if (consume) S.tokens = S.tokens.filter(x => x !== t); return t;
}
function welcomeUser(S, env, u) { const tok = makeToken(S, env, u.id, 'setpw', 7 * D); notifyT(S, env, 'welcome', u.id, {link:linkTo(S, 'setpassword', tok)}); }
/* Assign a course to a learner with a due date (creates or updates the enrolment) */
function assignCourse(S, env, byId, uid, cid, due, opts = {}) {
  const h = H(S, byId || uid), c = h.course(cid); if (!c || c.status === 'archived' || c.status === 'draft') return false;
  let e = h.enrolOf(cid, uid), fresh = false;
  if (!e) { e = {id:env.uid('e'), courseId:cid, userId:uid, role:'student', time:env.now()}; S.enrol.push(e); fresh = true; }
  else if (!h.role(e.role)?.caps?.['mod:submit']) return false;
  if (!fresh && e.completedAt && !opts.force) return false;
  Object.assign(e, {due:due || null, mandatory:opts.mandatory !== false, assignedBy:byId || null, assignedAt:env.now(), source:opts.source || 'assigned', remindersSent:[], lockNotified:false});
  if (opts.pathId) e.pathId = opts.pathId;
  notifyT(S, env, 'assigned', uid, {course:c.fullname, due:due ? fmtD(due) : 'no fixed date', sender:byId ? `${h.fullname(byId)}` : 'an automatic rule', short:due ? `Due ${fmtD(due)}` : c.fullname}, 'course', cid);
  return true;
}
function ruleMatches(S, r, u) {
  const m = r.match || {}; if (m.type === 'all') return true;
  if (m.type === 'department') return (u.department || '').toLowerCase() === String(m.value || '').toLowerCase();
  if (m.type === 'company') return (u.company || '').toLowerCase() === String(m.value || '').toLowerCase();
  if (m.type === 'cohort') return !!S.cohorts.find(c => c.id === m.value)?.members.includes(u.id);
  return false;
}
function applyRules(S, env, uid, onlyRule) {
  const u = S.users.find(x => x.id === uid); if (!u || u.admin) return 0; let n = 0;
  for (const r of S.rules.filter(x => x.active && (!onlyRule || x.id === onlyRule))) {
    if (!ruleMatches(S, r, u)) continue;
    const due = r.days ? env.now() + r.days * D : null;
    const cids = r.target.type === 'path' ? (S.paths.find(p => p.id === r.target.id)?.courses || []) : [r.target.id];
    for (const cid of cids) if (!S.enrol.some(e => e.courseId === cid && e.userId === uid)) { if (assignCourse(S, env, null, uid, cid, due, {source:'rule', pathId:r.target.type === 'path' ? r.target.id : null})) n++; }
  }
  return n;
}
function cleanRubric(r) {
  if (!r || !Array.isArray(r.criteria) || !r.criteria.length) return null;
  const criteria = r.criteria.map(c => ({id:c.id || 'rc' + Math.random().toString(36).slice(2, 7), text:str(c.text, 300).trim(), levels:(c.levels || []).map(l => ({text:str(l.text, 200).trim(), points:Math.max(0, Number(l.points) || 0)})).filter(l => l.text)})).filter(c => c.text && c.levels.length >= 2);
  need(criteria.length, 'Each rubric criterion needs a description and at least two levels.', 400);
  return {criteria};
}
/* Password policy from Site administration › Security */
function checkPassword(S, pw) {
  const r = S.site.security || {}; pw = String(pw || ''); const miss = [];
  if (pw.length < (r.minLength || 8)) miss.push(`at least ${r.minLength || 8} characters`);
  if (r.upper && !/[A-Z]/.test(pw)) miss.push('an uppercase letter'); if (r.lower && !/[a-z]/.test(pw)) miss.push('a lowercase letter');
  if (r.digit && !/[0-9]/.test(pw)) miss.push('a number'); if (r.special && !/[^A-Za-z0-9]/.test(pw)) miss.push('a symbol');
  need(!miss.length, `The password must contain ${miss.join(', ')}.`, 400);
}

/* ---------------- CSV ---------------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(x => x.trim() !== ''));
  if (!clean.length) return {headers:[], rows:[]};
  const headers = clean[0].map(h => h.trim().toLowerCase());
  return {headers, rows:clean.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))};
}
function validateUserRows(S, csvText) {
  const {headers, rows} = parseCSV(csvText);
  const errorsGlobal = [];
  for (const h of ['username', 'firstname', 'lastname', 'email']) if (!headers.includes(h)) errorsGlobal.push(`Missing required column "${h}".`);
  if (errorsGlobal.length) return {headers, rows:[], errors:errorsGlobal};
  const seen = new Set();
  const out = rows.map((r, i) => {
    const errors = [], un = String(r.username || '').trim();
    if (!USERNAME_RE.test(un)) errors.push(USERNAME_RULE);
    if (seen.has(un.toLowerCase())) errors.push('Duplicate username in this file'); seen.add(un.toLowerCase());
    if (!r.firstname) errors.push('First name is empty'); if (!r.lastname) errors.push('Last name is empty');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email || '')) errors.push('Email address is not valid');
    const existing = findUser(S, un);
    const enrols = [];
    for (let k = 1; k <= 5; k++) {
      const cs = r['course' + k]; if (!cs) continue;
      const c = S.courses.find(x => x.shortname.toLowerCase() === cs.toLowerCase());
      if (!c) { errors.push(`Course "${cs}" not found`); continue; }
      const role = (r['role' + k] || 'student').toLowerCase();
      const roleObj = S.roles.find(x => x.id === role || x.name.toLowerCase() === role);
      if (!roleObj) { errors.push(`Role "${role}" not found`); continue; }
      enrols.push({courseId:c.id, shortname:c.shortname, role:roleObj.id, group:r['group' + k] || ''});
    }
    if (r.password) { try { checkPassword(S, r.password); } catch (e) { errors.push(e.message.replace(/\.$/, '')); } }
    return {line:i + 2, username:un, firstname:r.firstname, lastname:r.lastname, email:r.email, company:r.company || '', department:r.department || '', password:r.password || '', due:r.due1 || r.due || '', action:existing ? 'update' : 'create', enrols, errors};
  });
  return {headers, rows:out, errors:[]};
}

/* ---------------- Backup / restore ---------------- */
function backupCourse(S, cid, includeUsers) {
  const h = H(S, null), c = h.course(cid); if (!c) throw new OpError('Course not found.', 404);
  const mods = h.courseMods(cid);
  const b = {format:'nb-academy-course-backup', version:1, created:Date.now(), site:S.site.name, includeUsers:!!includeUsers,
    course:clone(c), mods:clone(mods), badges:clone(S.badges.filter(x => x.courseId === cid)), groups:includeUsers ? clone(h.groups(cid)) : []};
  if (includeUsers) {
    const ids = new Set(S.enrol.filter(e => e.courseId === cid).map(e => e.userId));
    const mids = new Set(mods.map(m => m.id));
    b.users = S.users.filter(u => ids.has(u.id)).map(u => ({id:u.id, username:u.username, firstname:u.firstname, lastname:u.lastname, email:u.email}));
    b.enrol = clone(S.enrol.filter(e => e.courseId === cid));
    b.submissions = clone(S.submissions.filter(x => mids.has(x.cmid)));
    b.attempts = clone(S.attempts.filter(x => mids.has(x.cmid) && x.state === 'finished'));
    b.posts = clone(S.posts.filter(x => mids.has(x.cmid)));
    b.glossary = clone(S.glossary.filter(x => mids.has(x.cmid)));
    b.choiceAnswers = clone(S.choiceAnswers.filter(x => mids.has(x.cmid)));
    b.completion = Object.fromEntries(Object.entries(S.completion).filter(([k]) => mids.has(k.split(':')[1])));
  }
  return b;
}

/* ---------------- Operations ---------------- */
const OPS = {};
const op = (name, fn) => OPS[name] = fn;
function modOf(S, id) { const m = S.mods[id]; need(m, 'This activity no longer exists.', 404); return m; }
function courseOf(S, id) { const c = S.courses.find(x => x.id === id); need(c, 'This course no longer exists.', 404); return c; }
function mustView(h, cid) { need(h.canView(cid), 'You do not have access to this course.'); }
function mustSeeMod(h, m) {
  mustView(h, m.courseId); need(m.visible || h.has('course:viewhidden', m.courseId), 'This activity is hidden.');
  if (h.isLearner(m.courseId)) {
    need(!h.isLocked(m.courseId), 'This course is overdue and locked. Open the course and request access to continue.', 423);
    const pl = h.pathLock(m.courseId); need(!pl, pl, 423);
    const ml = h.modLock(m); need(!ml, ml, 423);
  }
}
function mustLearn(h, m) { mustSeeMod(h, m); need(h.isLearner(m.courseId), 'Only learners enrolled in this course can do this.'); }
function cleanFiles(S, h, ids) { return (Array.isArray(ids) ? ids : []).filter(id => { const f = S.files.find(x => x.id === id); return f && (f.owner === h.meId || h.isAdmin()); }).slice(0, 10); }

op('touch', (S, h, p, env) => {
  if (!h.canView(p.cid)) return; (S.access[h.meId] ||= {})[p.cid] = env.now();
  const e = h.enrolOf(p.cid); if (e && h.isLearner(p.cid) && !h.isLocked(p.cid)) { if (!e.startedAt) { e.startedAt = env.now(); log(S, env, h.meId, 'Course started', p.cid); } if (p.mid && S.mods[p.mid]?.courseId === p.cid) e.lastMod = p.mid; }
});
op('heartbeat', (S, h, p) => { const e = h.enrolOf(p.cid); if (e && h.isLearner(p.cid)) e.timeSpent = (e.timeSpent || 0) + Math.min(120, Math.max(0, Number(p.secs) || 0)); });
op('updateProfile', (S, h, p, env) => {
  const u = h.user(p.id); need(u, 'User not found.', 404); const manage = h.has('user:manage');
  need(u.id === h.meId || manage, 'You cannot edit this profile.');
  if (manage) { u.firstname = req(p.firstname, 'First name', 100); u.lastname = req(p.lastname, 'Last name', 100); const em = req(p.email, 'Email', 200); need(!u.builtinAdmin || em.toLowerCase() === String(u.email).toLowerCase(), 'The email of a built-in site administrator is set in the server configuration and cannot be changed here.', 400); u.email = em; u.company = str(p.company, 120); u.department = str(p.department, 120); }
  if (p.password) {
    if (u.id === h.meId && !h.isAdmin()) need(env.verify(u, String(p.current || '')), 'Your current password is not correct.', 400);
    checkPassword(S, p.password); Object.assign(u, env.hash(String(p.password))); u.pwChanged = env.now(); u.mustChangePassword = u.id !== h.meId;
    if (u.id !== h.meId) audit(S, env, h.meId, 'Password reset by administrator', u.username);
  }
});
op('siteSettings', (S, h, p) => { need(h.has('site:config'), 'You cannot change site settings.'); S.site.name = req(p.name, 'Site name', 120); S.site.tagline = str(p.tagline, 400); S.site.demo = !!p.demo; S.site.url = str(p.url, 200).trim().replace(/\/+$/, ''); });
op('newCategory', (S, h, p, env) => { need(h.has('course:create'), 'You cannot create categories.'); S.categories.push({id:env.uid('k'), name:req(p.name, 'Category name', 120)}); });
op('newCourse', (S, h, p, env) => {
  need(h.has('course:create'), 'You cannot create courses.');
  const shortname = req(p.shortname, 'Short name', 40);
  need(!S.courses.some(c => c.shortname.toLowerCase() === shortname.toLowerCase()), 'That short name is already used by another course.', 400);
  need(h.cat(p.catId), 'Choose a category.', 400);
  const cid = env.uid('c'), n = Math.max(0, Math.min(20, Number(p.sections) || 0));
  const c = {id:cid, fullname:req(p.fullname, 'Full name', 200), shortname, catId:p.catId, summary:str(p.summary), visible:true, selfenrol:!!p.selfenrol, status:'draft', version:0, hours:Math.max(0, Number(p.hours) || 0), sequential:!!p.sequential, created:env.now(), sections:[{id:env.uid('s'), name:'General', summary:'', mods:[]}]};
  for (let i = 1; i <= n; i++) c.sections.push({id:env.uid('s'), name:`Topic ${i}`, summary:'', mods:[]});
  S.courses.push(c);
  const fm = env.uid('m'); S.mods[fm] = {id:fm, courseId:cid, type:'forum', name:'Announcements', intro:'General news and announcements.', news:true, visible:true}; c.sections[0].mods.push(fm);
  if (p.teacher && h.user(p.teacher)) { S.enrol.push({id:env.uid('e'), courseId:cid, userId:p.teacher, role:'trainer', time:env.now()}); notify(S, env, p.teacher, `You are now a trainer for ${c.fullname}`, 'The course is still a draft', 'course', cid); }
  log(S, env, h.meId, `Course created: ${shortname}`, cid);
  return {id:cid};
});
op('deleteCourse', (S, h, p, env) => {
  need(h.has('course:delete'), 'You cannot delete courses.'); const c = courseOf(S, p.id);
  const mids = new Set(h.courseMods(c.id).map(m => m.id));
  const records = S.enrol.some(e => e.courseId === c.id && h.isLearner(c.id, e.userId) && (e.startedAt || e.completedAt)) || S.submissions.some(x => mids.has(x.cmid)) || S.attempts.some(x => mids.has(x.cmid)) || S.certIssued.some(x => mids.has(x.cmid));
  need(c.status === 'draft' || !records, 'This course has learner records. Archive it instead, so the history is kept for audits.', 400);
  mids.forEach(id => delete S.mods[id]);
  for (const k of ['submissions', 'attempts', 'posts', 'glossary', 'choiceAnswers', 'wsSubs', 'wsAllocs', 'lessonAttempts', 'certIssued']) S[k] = S[k].filter(x => !mids.has(x.cmid));
  const bids = new Set(S.badges.filter(b => b.courseId === c.id).map(b => b.id));
  S.badges = S.badges.filter(b => !bids.has(b.id)); S.badgeIssued = S.badgeIssued.filter(i => !bids.has(i.badgeId));
  S.enrol = S.enrol.filter(e => e.courseId !== c.id); S.groups = S.groups.filter(g => g.courseId !== c.id);
  S.courses = S.courses.filter(x => x.id !== c.id); log(S, env, h.meId, `Course deleted: ${c.shortname}`);
});
op('courseSettings', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('course:update', c.id), 'You cannot change this course\'s settings.');
  const shortname = req(p.shortname, 'Short name', 40);
  need(!S.courses.some(x => x.id !== c.id && x.shortname.toLowerCase() === shortname.toLowerCase()), 'That short name is already used by another course.', 400);
  Object.assign(c, {fullname:req(p.fullname, 'Full name', 200), shortname, catId:h.cat(p.catId) ? p.catId : c.catId, summary:str(p.summary), visible:!!p.visible, selfenrol:!!p.selfenrol, hours:Math.max(0, Number(p.hours) || 0), sequential:!!p.sequential});
  log(S, env, h.meId, 'Course settings updated', c.id);
});
op('newUser', (S, h, p, env) => {
  need(h.has('user:manage'), 'You cannot create users.');
  const un = req(p.username, 'Username', 60).trim(); need(USERNAME_RE.test(un), USERNAME_RULE + '.', 400);
  need(!findUser(S, un), 'This username already exists. Choose another.', 400);
  need(!p.admin || h.isAdmin(), 'Only site administrators can create administrators.');
  const pw = p.password ? String(p.password) : (env.defaultPassword || DEFAULT_PASSWORD);
  if (p.password) checkPassword(S, pw);
  const u = {id:env.uid('u'), firstname:req(p.firstname, 'First name', 100), lastname:req(p.lastname, 'Last name', 100), username:un, email:req(p.email, 'Email', 200), admin:!!p.admin, company:str(p.company, 120), department:str(p.department, 120), created:env.now(), mustChangePassword:p.forceChange !== false, ...env.hash(pw)};
  S.users.push(u); log(S, env, h.meId, `User created: ${un}`); audit(S, env, h.meId, 'User created', un, `${u.firstname} ${u.lastname} <${u.email}>`);
  if (p.welcome !== false) welcomeUser(S, env, u);
  applyRules(S, env, u.id);
  return {id:u.id};
});
op('deleteUser', (S, h, p, env) => {
  need(h.has('user:manage'), 'You cannot delete users.'); const u = h.user(p.id); need(u, 'User not found.', 404);
  need(u.id !== h.meId, 'You cannot delete your own account.', 400); need(!u.admin || h.isAdmin(), 'Only administrators can delete administrators.');
  need(!u.builtinAdmin, 'This is a built-in site administrator set in the server configuration. Remove it from server/site-admins.js to delete it.', 400);
  need(!u.admin || h.isSuperAdmin(), 'Only the super administrator can delete administrators.');
  S.users = S.users.filter(x => x.id !== u.id); S.enrol = S.enrol.filter(e => e.userId !== u.id); S.sysroles = S.sysroles.filter(r => r.userId !== u.id);
  S.groups.forEach(g => g.members = g.members.filter(m => m !== u.id)); S.cohorts.forEach(c => { c.members = c.members.filter(m => m !== u.id); c.leads = c.leads.filter(m => m !== u.id); c.trainers = c.trainers.filter(m => m !== u.id); });
  log(S, env, h.meId, `User deleted: ${u.username}`); audit(S, env, h.meId, 'User deleted', u.username);
});
op('suspendUser', (S, h, p, env) => { need(h.has('user:manage'), 'You cannot suspend users.'); const u = h.user(p.id); need(u && u.id !== h.meId && !u.builtinAdmin && (!u.admin || h.isSuperAdmin()), u?.admin ? 'Only the super administrator can suspend administrators.' : 'This account cannot be suspended.', u?.admin && !u.builtinAdmin ? 403 : 400); u.suspended = !!p.on; log(S, env, h.meId, `${p.on ? 'Suspended' : 'Reactivated'} ${u.username}`); audit(S, env, h.meId, p.on ? 'User suspended' : 'User reactivated', u.username); });
op('loginAsCheck', (S, h, p) => { need(h.has('user:loginas'), 'You cannot log in as other users.'); const u = h.user(p.id); need(u && !u.admin, 'You cannot log in as this user.', 400); return {id:u.id}; });
op('setSysRole', (S, h, p, env) => {
  need(h.has('role:manage'), 'You cannot assign site roles.'); need(h.user(p.userId) && h.role(p.roleId), 'User or role not found.', 404);
  const ex = S.sysroles.find(r => r.userId === p.userId && r.roleId === p.roleId);
  if (p.on && !ex) S.sysroles.push({id:env.uid('sr'), userId:p.userId, roleId:p.roleId});
  if (!p.on && ex) S.sysroles = S.sysroles.filter(r => r !== ex);
  log(S, env, h.meId, `Site role ${p.on ? 'assigned' : 'removed'}: ${p.roleId} → ${h.user(p.userId).username}`);
});
op('saveRole', (S, h, p, env) => {
  need(h.has('role:manage'), 'You cannot define roles.');
  const caps = {}; for (const [c] of CAPS) if (p.caps?.[c]) caps[c] = true;
  let r = p.id ? h.role(p.id) : null;
  if (!r) {
    const rid = req(p.shortname, 'Short name', 40).toLowerCase(); need(/^[a-z0-9_]+$/.test(rid), 'Short name may only use lowercase letters, numbers and underscore.', 400);
    need(!h.role(rid), 'A role with this short name already exists.', 400);
    r = {id:rid, builtin:false}; S.roles.push(r);
  }
  r.name = req(p.name, 'Role name', 80); r.desc = str(p.desc, 300); r.caps = caps;
  log(S, env, h.meId, `Role saved: ${r.name}`); return {id:r.id};
});
op('deleteRole', (S, h, p, env) => {
  need(h.has('role:manage'), 'You cannot delete roles.'); const r = h.role(p.id); need(r, 'Role not found.', 404);
  need(!r.builtin, 'Built-in roles cannot be deleted. You can change their permissions instead.', 400);
  need(!S.enrol.some(e => e.role === r.id) && !S.sysroles.some(x => x.roleId === r.id), 'This role is still assigned to people. Remove those assignments first.', 400);
  S.roles = S.roles.filter(x => x.id !== r.id); log(S, env, h.meId, `Role deleted: ${r.name}`);
});
op('uploadUsers', (S, h, p, env) => {
  need(h.has('user:upload'), 'You cannot upload users.');
  const v = validateUserRows(S, p.csv); need(!v.errors.length, v.errors.join(' '), 400);
  const res = {created:0, updated:0, enrolled:0, skipped:0, errors:[]};
  for (const r of v.rows) {
    if (r.errors.length) { res.skipped++; res.errors.push(`Line ${r.line}: ${r.errors.join('; ')}`); continue; }
    let u = findUser(S, r.username);
    let isNew = false;
    if (u) { if (!p.updateExisting) { res.skipped++; continue; } Object.assign(u, {firstname:r.firstname, lastname:r.lastname, email:u.builtinAdmin ? u.email : r.email, company:r.company || u.company, department:r.department || u.department}); if (r.password) Object.assign(u, env.hash(r.password)); res.updated++; }
    else { u = {id:env.uid('u'), firstname:r.firstname, lastname:r.lastname, username:r.username, email:r.email, company:r.company, department:r.department, admin:false, created:env.now(), mustChangePassword:true, ...env.hash(r.password || p.defaultPassword || env.defaultPassword || DEFAULT_PASSWORD || (env.uid('') + 'Aa1!'))}; S.users.push(u); res.created++; isNew = true; }
    for (const e of r.enrols) {
      if (!S.enrol.some(x => x.courseId === e.courseId && x.userId === u.id)) { const dd = Number(p.dueDays) || 0; S.enrol.push({id:env.uid('e'), courseId:e.courseId, userId:u.id, role:e.role, time:env.now(), ...(dd && e.role === 'student' ? {due:env.now() + dd * D, mandatory:true, assignedBy:h.meId, source:'upload'} : {})}); res.enrolled++; }
      if (e.group) { let g = S.groups.find(x => x.courseId === e.courseId && x.name.toLowerCase() === e.group.toLowerCase()); if (!g) { g = {id:env.uid('g'), courseId:e.courseId, name:e.group, members:[]}; S.groups.push(g); } if (!g.members.includes(u.id)) g.members.push(u.id); }
    }
    if (isNew) { if (p.welcome !== false) welcomeUser(S, env, u); applyRules(S, env, u.id); }
  }
  log(S, env, h.meId, `Bulk upload: ${res.created} created, ${res.updated} updated, ${res.enrolled} enrolments`);
  audit(S, env, h.meId, 'Bulk user upload', 'CSV', `${res.created} created, ${res.updated} updated, ${res.enrolled} enrolments, ${res.skipped} skipped`);
  return res;
});
op('backupCourse', (S, h, p, env) => { need(h.has('backup:course', p.cid), 'You cannot back up this course.'); const b = backupCourse(S, p.cid, !!p.includeUsers && h.has('grade:viewall', p.cid)); log(S, env, h.meId, 'Course backup created', p.cid); return b; });
op('restoreCourse', (S, h, p, env) => {
  need(h.has('backup:restore'), 'You cannot restore courses.');
  let b = p.backup; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { throw new OpError('This file is not a valid NB Academy course backup.', 400); } }
  need(b && b.format === 'nb-academy-course-backup' && b.course, 'This file is not a valid NB Academy course backup.', 400);
  need(h.cat(p.catId), 'Choose a category for the restored course.', 400);
  const map = new Map(), nid = (old, pre) => { if (!map.has(old)) map.set(old, env.uid(pre)); return map.get(old); };
  const cid = env.uid('c');
  let short = (p.shortname || b.course.shortname).trim(); let k = 1; const base = short;
  while (S.courses.some(c => c.shortname.toLowerCase() === short.toLowerCase())) short = `${base}-${++k}`;
  const course = {id:cid, fullname:str(p.fullname || b.course.fullname, 200), shortname:short, catId:p.catId, summary:str(b.course.summary), visible:true, selfenrol:b.course.selfenrol !== false, created:env.now(), sections:[]};
  for (const s of b.course.sections || []) course.sections.push({id:env.uid('s'), name:str(s.name, 200), summary:str(s.summary), mods:(s.mods || []).filter(mid => (b.mods || []).some(m => m.id === mid)).map(mid => nid(mid, 'm'))});
  for (const m of b.mods || []) { if (!TYPES[m.type]) continue; const nm = clone(m); nm.id = nid(m.id, 'm'); nm.courseId = cid; if (nm.type === 'workshop') nm.phase = 1; if (nm.fileId && !S.files.some(f => f.id === nm.fileId)) nm.fileId = null; S.mods[nm.id] = nm; }
  S.courses.push(course);
  for (const bd of b.badges || []) S.badges.push({...clone(bd), id:env.uid('b'), courseId:cid, created:env.now(), criteria:{...bd.criteria, mods:(bd.criteria?.mods || []).map(x => map.get(x)).filter(Boolean)}});
  const res = {id:cid, shortname:short, users:0, enrolments:0};
  if (b.includeUsers && p.includeUsers) {
    const umap = new Map();
    for (const u of b.users || []) {
      let ex = findUser(S, u.username);
      if (!ex) { ex = {id:env.uid('u'), username:u.username, firstname:u.firstname, lastname:u.lastname, email:u.email, admin:false, created:env.now(), ...env.hash('changeme')}; S.users.push(ex); res.users++; }
      umap.set(u.id, ex.id);
    }
    for (const e of b.enrol || []) { const uid = umap.get(e.userId); if (uid && h.role(e.role)) { S.enrol.push({id:env.uid('e'), courseId:cid, userId:uid, role:e.role, time:env.now()}); res.enrolments++; } }
    for (const g of b.groups || []) S.groups.push({id:env.uid('g'), courseId:cid, name:g.name, members:g.members.map(x => umap.get(x)).filter(Boolean)});
    const re = (arr, key, extra) => (arr || []).forEach(x => { const cm = map.get(x.cmid), uid = umap.get(x.userId); if (cm && uid) S[key].push({...clone(x), id:env.uid('r'), cmid:cm, userId:uid, ...(extra ? extra(x) : {})}); });
    re(b.submissions, 'submissions', x => ({gradedBy:umap.get(x.gradedBy) || null, files:[]}));
    re(b.attempts, 'attempts'); re(b.glossary, 'glossary'); re(b.choiceAnswers, 'choiceAnswers');
    const pmap = new Map(); (b.posts || []).forEach(x => pmap.set(x.id, env.uid('p')));
    (b.posts || []).forEach(x => { const cm = map.get(x.cmid), uid = umap.get(x.userId); if (cm && uid) S.posts.push({...clone(x), id:pmap.get(x.id), cmid:cm, userId:uid, discussion:pmap.get(x.discussion), parent:x.parent ? pmap.get(x.parent) : null}); });
    for (const [key, t] of Object.entries(b.completion || {})) { const [u, m] = key.split(':'); if (umap.get(u) && map.get(m)) S.completion[umap.get(u) + ':' + map.get(m)] = t; }
  } else if (p.enrolMe !== false && !h.isAdmin()) {
    S.enrol.push({id:env.uid('e'), courseId:cid, userId:h.meId, role:'editingteacher', time:env.now()});
  }
  log(S, env, h.meId, `Course restored from backup: ${short}`, cid);
  return res;
});

/* Enrolment & groups */
op('enrolMe', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(c.visible && c.selfenrol !== false && (c.status || 'published') === 'published', 'Self enrolment is not available for this course.');
  need(!h.isAdmin(), 'Administrators can already see every course.', 400);
  if (!h.enrolOf(c.id)) { S.enrol.push({id:env.uid('e'), courseId:c.id, userId:h.meId, role:'student', time:env.now()}); log(S, env, h.meId, 'User self-enrolled', c.id);
    h.teachers(c.id).forEach(t => notify(S, env, t.id, `New enrolment in ${c.shortname}`, `${h.fullname(h.me())} enrolled themselves`, 'participants', c.id)); }
});
op('enrolUser', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('course:enrol', c.id), 'You cannot enrol users in this course.');
  need(h.user(p.userId) && h.role(p.role), 'User or role not found.', 404); need(!h.enrolOf(c.id, p.userId), 'This user is already enrolled.', 400);
  need(c.status !== 'archived', 'Archived courses do not accept new enrolments.', 400);
  S.enrol.push({id:env.uid('e'), courseId:c.id, userId:p.userId, role:p.role, time:env.now()});
  notify(S, env, p.userId, `You are enrolled in ${c.fullname}`, `Role: ${h.role(p.role).name}`, 'course', c.id);
  audit(S, env, h.meId, 'User enrolled', c.shortname, `${h.fullname(p.userId)} as ${h.role(p.role).name}`);
  log(S, env, h.meId, `Enrolled ${h.fullname(p.userId)} as ${h.role(p.role).name}`, c.id);
});
op('changeRole', (S, h, p, env) => { const c = courseOf(S, p.cid); need(h.has('course:enrol', c.id), 'You cannot change roles in this course.'); const e = h.enrolOf(c.id, p.userId); need(e && h.role(p.role), 'Enrolment or role not found.', 404); e.role = p.role; log(S, env, h.meId, `Role changed for ${h.fullname(p.userId)}: ${h.role(p.role).name}`, c.id); });
op('unenrol', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('course:enrol', c.id), 'You cannot unenrol users from this course.');
  S.enrol = S.enrol.filter(e => !(e.courseId === c.id && e.userId === p.userId)); S.groups.filter(g => g.courseId === c.id).forEach(g => g.members = g.members.filter(m => m !== p.userId));
  log(S, env, h.meId, `Unenrolled ${h.fullname(p.userId)}`, c.id);
});
op('saveGroup', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('group:manage', c.id), 'You cannot manage groups.');
  if (p.gid) { const g = S.groups.find(x => x.id === p.gid && x.courseId === c.id); need(g, 'Group not found.', 404); g.name = req(p.name, 'Group name', 100); return {id:g.id}; }
  const g = {id:env.uid('g'), courseId:c.id, name:req(p.name, 'Group name', 100), members:[]}; S.groups.push(g); log(S, env, h.meId, `Group created: ${g.name}`, c.id); return {id:g.id};
});
op('deleteGroup', (S, h, p) => { const g = S.groups.find(x => x.id === p.gid); need(g, 'Group not found.', 404); need(h.has('group:manage', g.courseId), 'You cannot manage groups.'); S.groups = S.groups.filter(x => x !== g); });
op('setGroupMember', (S, h, p) => {
  const g = S.groups.find(x => x.id === p.gid); need(g, 'Group not found.', 404); need(h.has('group:manage', g.courseId), 'You cannot manage groups.');
  need(h.enrolOf(g.courseId, p.userId), 'Only enrolled users can join a group.', 400);
  if (p.on && !g.members.includes(p.userId)) g.members.push(p.userId);
  if (!p.on) g.members = g.members.filter(m => m !== p.userId);
});

/* Course editing */
op('addSection', (S, h, p) => { const c = courseOf(S, p.cid); need(h.canEdit(c.id), 'You cannot edit this course.'); c.sections.push({id:'s' + Math.random().toString(36).slice(2, 10), name:`Section ${c.sections.length}`, summary:'', mods:[]}); });
op('editSection', (S, h, p) => { const c = courseOf(S, p.cid); need(h.canEdit(c.id), 'You cannot edit this course.'); const s = c.sections.find(x => x.id === p.sid); need(s, 'Section not found.', 404); s.name = req(p.name, 'Section name', 200); s.summary = str(p.summary); });
op('deleteSection', (S, h, p) => { const c = courseOf(S, p.cid); need(h.canEdit(c.id), 'You cannot edit this course.'); const i = c.sections.findIndex(x => x.id === p.sid); need(i > 0, 'The General section cannot be deleted.', 400); c.sections[i].mods.forEach(id => delete S.mods[id]); c.sections.splice(i, 1); });
const MOD_FIELDS = {
  page:['content'], url:['url'], file:['fileId'], assign:['due', 'maxgrade', 'allowFiles'], quiz:['close', 'timelimit', 'attempts', 'maxgrade', 'gradepass', 'pretest'],
  forum:['news'], glossary:['approval'], choice:['options', 'allowUpdate', 'showResults'], lesson:['maxgrade', 'close'],
  workshop:['instructions', 'maxgrade', 'gradinggrade', 'peers', 'subEnd'], certificate:['requireCompletion', 'minGrade', 'requireFeedback', 'validityDays', 'autoIssue'], label:[],
  video:['fileId', 'captionsId', 'completePct'], scorm:['packageId', 'maxgrade'], live:['start', 'duration', 'mode', 'location', 'link', 'capacity', 'recordingUrl'],
  feedback:['questions', 'anonymous']
};
op('saveMod', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.canEdit(c.id), 'You cannot edit this course.'); need(TYPES[p.type], 'Unknown activity type.', 400);
  const sec = c.sections.find(s => s.id === p.sid); need(sec, 'Choose a section.', 400);
  const isNew = !p.mid; const m = isNew ? {id:env.uid('m'), courseId:c.id, type:p.type} : modOf(S, p.mid);
  need(m.courseId === c.id && m.type === p.type, 'Activity mismatch.', 400);
  m.name = p.type === 'label' ? 'Text and media area' : req(p.name, 'Name', 200);
  m.intro = str(p.intro, 20000); m.visible = !!p.visible;
  const f = p.fields || {};
  for (const k of MOD_FIELDS[p.type]) {
    let v = f[k];
    if (['maxgrade', 'gradinggrade', 'timelimit', 'attempts', 'peers', 'minGrade', 'gradepass', 'validityDays', 'duration', 'capacity', 'completePct'].includes(k)) v = Math.max(0, Number(v) || 0);
    if (['due', 'close', 'subEnd', 'start'].includes(k)) v = v ? Number(v) : null;
    if (['allowFiles', 'news', 'approval', 'allowUpdate', 'requireCompletion', 'pretest', 'requireFeedback', 'anonymous'].includes(k)) v = !!v;
    if (k === 'autoIssue') v = v !== false;
    if (k === 'mode') v = v === 'ilt' ? 'ilt' : 'vilt';
    if (['location', 'link', 'recordingUrl'].includes(k)) { v = str(v, 500).trim(); if ((k === 'link' || k === 'recordingUrl') && v) need(/^https?:\/\//i.test(v), 'Links must start with http:// or https://', 400); }
    if (k === 'captionsId' && v) need(S.files.some(x => x.id === v), 'Upload the captions file first.', 400);
    if (k === 'captionsId' && !v) v = null;
    if (k === 'packageId') { need(S.files.some(x => x.id === v), 'Upload a SCORM package (.zip) first.', 400); }
    if (k === 'questions') { v = (Array.isArray(v) ? v : []).map(q => ({id:q.id || 'f' + Math.random().toString(36).slice(2, 8), type:['rating', 'text', 'choice'].includes(q.type) ? q.type : 'text', text:str(q.text, 500).trim(), options:(q.options || []).map(o => str(o, 200).trim()).filter(Boolean), required:q.required !== false})).filter(q => q.text); need(v.length, 'Add at least one question.', 400); }
    if (k === 'options') { v = (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => str(x, 200).trim()).filter(Boolean); need(v.length >= 2, 'A choice needs at least two options.', 400); }
    if (k === 'url') { v = req(v, 'URL', 2000); need(/^https?:\/\//i.test(v), 'The URL must start with http:// or https://', 400); }
    if (k === 'content' || k === 'instructions') v = str(v, 50000);
    if (k === 'fileId') { need(S.files.some(x => x.id === v), 'Upload a file first.', 400); }
    if (k === 'gradepass') v = Math.min(100, v);
    if (k === 'showResults') v = ['after', 'always', 'never'].includes(v) ? v : 'after';
    m[k] = v;
  }
  if (p.type === 'assign') m.maxgrade ||= 100;
  if (p.type === 'quiz') { m.questions ||= []; m.maxgrade ||= 10; }
  if (p.type === 'lesson') { m.pages ||= []; m.maxgrade ||= 10; }
  if (p.type === 'workshop') { m.phase ||= 1; m.peers = Math.min(5, Math.max(1, m.peers || 2)); m.maxgrade ||= 80; }
  if (p.type === 'scorm') { m.maxgrade ||= 100; if (env.scormExtract) { const r = env.scormExtract(m.packageId, m.id); if (r) { m.launch = r.launch; m.single = r.single; m.title = r.title; m.scormVersion = r.version; m.scormFiles = r.files; } } }
  if (p.type === 'video') m.completePct ||= 90;
  if (p.type === 'live') { need(m.start, 'Set the session date and time.', 400); m.duration ||= 60; }
  m.requires = (Array.isArray(f.requires) ? f.requires : []).filter(id => id !== m.id && S.mods[id]?.courseId === c.id);
  if (p.type === 'assign' && f.rubric !== undefined) m.rubric = cleanRubric(f.rubric);
  S.mods[m.id] = m;
  const cur = h.sectionOf(m); if (!cur || cur.id !== sec.id) { if (cur) cur.mods = cur.mods.filter(x => x !== m.id); sec.mods.push(m.id); }
  log(S, env, h.meId, `${TYPES[p.type].label} ${isNew ? 'created' : 'updated'}: ${m.name}`, c.id);
  audit(S, env, h.meId, isNew ? 'Activity created' : 'Activity edited', `${c.shortname} › ${m.name}`, TYPES[p.type].label);
  if (isNew && m.visible) h.students(c.id).forEach(s => { if (['assign', 'quiz', 'workshop'].includes(m.type)) notify(S, env, s.id, `New ${TYPES[m.type].label.toLowerCase()}: ${m.name}`, c.fullname, 'mod', m.id); });
  return {id:m.id};
});
op('moveMod', (S, h, p) => {
  const m = modOf(S, p.id), c = courseOf(S, m.courseId); need(h.canEdit(c.id), 'You cannot edit this course.');
  const si = c.sections.findIndex(s => s.mods.includes(m.id)), s = c.sections[si], i = s.mods.indexOf(m.id), d = Number(p.dir) < 0 ? -1 : 1, j = i + d;
  if (j >= 0 && j < s.mods.length) [s.mods[i], s.mods[j]] = [s.mods[j], s.mods[i]];
  else { const ns = c.sections[si + d]; if (!ns) return; s.mods.splice(i, 1); if (d < 0) ns.mods.push(m.id); else ns.mods.unshift(m.id); }
});
op('toggleVis', (S, h, p) => { const m = modOf(S, p.id); need(h.canEdit(m.courseId), 'You cannot edit this course.'); m.visible = !m.visible; return {visible:m.visible}; });
op('deleteMod', (S, h, p, env) => { const m = modOf(S, p.id); need(h.canEdit(m.courseId), 'You cannot edit this course.'); const s = h.sectionOf(m); if (s) s.mods = s.mods.filter(x => x !== m.id); delete S.mods[m.id]; log(S, env, h.meId, `Activity deleted: ${m.name}`, m.courseId); audit(S, env, h.meId, 'Activity deleted', `${h.course(m.courseId)?.shortname} › ${m.name}`, TYPES[m.type].label); });
op('toggleDone', (S, h, p, env) => {
  const m = modOf(S, p.id); mustLearn(h, m); need(MANUAL.has(m.type), 'This activity completes automatically.', 400);
  const k = h.meId + ':' + m.id; if (S.completion[k]) delete S.completion[k]; else { S.completion[k] = env.now(); log(S, env, h.meId, `Marked as done: ${m.name}`, m.courseId); checkBadges(S, env, h.meId, m.courseId); }
});

/* Assignment */
op('submit', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'assign', 'Not an assignment.', 400);
  let s = h.subOf(m.id, h.meId); need(!s || s.grade == null, 'Your submission has been graded and can no longer be changed.', 400);
  const files = m.allowFiles ? cleanFiles(S, h, p.files) : [];
  need(str(p.text).trim() || files.length, 'Add online text or attach a file.', 400);
  if (!s) { s = {id:env.uid('s'), cmid:m.id, userId:h.meId, grade:null, feedback:'', gradedBy:null, gradedAt:null}; S.submissions.push(s); }
  s.text = str(p.text, 50000); s.files = files; s.status = 'submitted'; s.time = env.now();
  log(S, env, h.meId, `Submission created: ${m.name}`, m.courseId);
  h.enrolled(m.courseId).filter(x => h.role(x.e.role)?.caps?.['grade:edit']).forEach(x => notify(S, env, x.u.id, `New submission: ${m.name}`, `${h.fullname(h.me())} submitted for grading`, 'mod', m.id));
  checkBadges(S, env, h.meId, m.courseId);
});
op('removeSub', (S, h, p) => { const m = modOf(S, p.mid); mustLearn(h, m); const s = h.subOf(m.id, h.meId); need(s && s.grade == null, 'Graded submissions cannot be removed.', 400); S.submissions = S.submissions.filter(x => x !== s); });
op('grade', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(h.has('grade:edit', m.courseId), 'You cannot grade this assignment.'); need(h.isLearner(m.courseId, p.uid), 'This user is not a learner in the course.', 400);
  let g = Number(p.grade), rub = null;
  if (m.rubric?.criteria?.length && p.rubric) {
    rub = {}; let pts = 0, max = 0;
    for (const cr of m.rubric.criteria) { const li = Number(p.rubric[cr.id]?.level); const lv = cr.levels[li]; need(lv, `Choose a level for "${cr.text}".`, 400); rub[cr.id] = {level:li, comment:str(p.rubric[cr.id]?.comment, 1000)}; pts += lv.points; max += Math.max(...cr.levels.map(x => x.points)); }
    g = max ? Math.round(pts / max * m.maxgrade * 100) / 100 : 0;
  }
  need(!isNaN(g) && g >= 0 && g <= m.maxgrade, `Enter a grade between 0 and ${m.maxgrade}.`, 400);
  let s = h.subOf(m.id, p.uid); if (!s) { s = {id:env.uid('s'), cmid:m.id, userId:p.uid, text:'', files:[], status:'new', time:env.now()}; S.submissions.push(s); }
  const old = s.grade;
  s.grade = g; s.feedback = str(p.feedback, 20000); s.gradedBy = h.meId; s.gradedAt = env.now(); if (rub) s.rubric = rub;
  notifyT(S, env, 'graded', p.uid, {item:m.name, course:h.course(m.courseId)?.fullname, grade:`${g} / ${m.maxgrade}`, short:`${m.name}: ${g} / ${m.maxgrade}`}, 'mod', m.id);
  log(S, env, h.meId, `Submission graded: ${m.name} (${h.fullname(p.uid)})`, m.courseId);
  audit(S, env, h.meId, old == null ? 'Grade given' : 'Grade changed', `${h.course(m.courseId)?.shortname} › ${m.name} › ${h.fullname(p.uid)}`, old == null ? `${g}` : `${old} → ${g}`);
  checkBadges(S, env, p.uid, m.courseId);
});

/* Quiz */
op('saveQuestion', (S, h, p) => {
  const m = modOf(S, p.mid); need(h.canEdit(m.courseId), 'You cannot edit this quiz.'); need(m.type === 'quiz', 'Not a quiz.', 400);
  const q = {id:p.q?.id || 'q' + Math.random().toString(36).slice(2, 8), type:p.q?.type, text:req(p.q?.text, 'Question text', 4000), mark:Math.max(0.5, Number(p.q?.mark) || 1)};
  need(QTYPES[q.type], 'Unknown question type.', 400);
  if (q.type === 'mc') { q.options = (p.q.options || []).map(o => ({text:str(o.text, 500).trim(), correct:!!o.correct})).filter(o => o.text); need(q.options.length >= 2, 'Add at least two choices, one per line.', 400); need(q.options.filter(o => o.correct).length === 1, 'Mark exactly one choice as correct by putting * in front of it.', 400); q.options.forEach(o => { if (!o.correct) delete o.correct; }); }
  if (q.type === 'tf') q.answer = !!p.q.answer;
  if (q.type === 'short') q.answer = req(p.q.answer, 'Accepted answer', 500);
  if (q.type === 'num') { need(p.q.answer !== '' && !isNaN(Number(p.q.answer)), 'Enter the correct numerical answer.', 400); q.answer = Number(p.q.answer); q.tol = Math.abs(Number(p.q.tol) || 0); }
  if (q.type === 'essay') q.guidance = str(p.q.guidance, 2000);
  if (p.q.bankId) q.bankId = p.q.bankId;
  m.questions ||= []; const i = m.questions.findIndex(x => x.id === q.id); if (i >= 0) m.questions[i] = q; else m.questions.push(q);
  return {id:q.id};
});
op('deleteQuestion', (S, h, p) => { const m = modOf(S, p.mid); need(h.canEdit(m.courseId), 'You cannot edit this quiz.'); m.questions = (m.questions || []).filter(q => q.id !== p.qid); });
op('startQuiz', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustSeeMod(h, m); need(m.type === 'quiz', 'Not a quiz.', 400);
  need((m.questions || []).length, 'This quiz has no questions yet.', 400);
  const preview = !h.isLearner(m.courseId); need(preview ? h.has('grade:viewall', m.courseId) : true, 'You cannot attempt this quiz.');
  if (!preview) { need(!m.close || m.close > env.now(), 'This quiz is closed.', 400); need(!m.attempts || h.attemptsOf(m.id, h.meId).length < h.attemptsAllowed(m, h.meId), 'No more attempts are allowed. Ask your trainer if you need another attempt.', 400); }
  let a = h.openAttempt(m.id, h.meId);
  if (!a) { a = {id:env.uid('a'), cmid:m.id, userId:h.meId, state:'inprogress', preview, answers:{}, start:env.now()}; S.attempts.push(a); log(S, env, h.meId, `Quiz attempt started: ${m.name}`, m.courseId); }
  return {id:a.id, start:a.start, answers:a.answers};
});
op('saveQuizAnswers', (S, h, p) => { const a = S.attempts.find(x => x.id === p.aid && x.userId === h.meId && x.state === 'inprogress'); need(a, 'This attempt is no longer open.', 400); a.answers = Object.fromEntries(Object.entries(p.answers || {}).map(([k, v]) => [k, str(v, 500)])); });
op('submitQuiz', (S, h, p, env) => {
  const a = S.attempts.find(x => x.id === p.aid && x.userId === h.meId && x.state === 'inprogress'); need(a, 'This attempt is no longer open.', 400);
  const m = modOf(S, a.cmid); if (p.answers) a.answers = Object.fromEntries(Object.entries(p.answers).map(([k, v]) => [k, str(v, 500)]));
  let score = 0, max = 0; for (const q of m.questions) { score += gradeQ(q, a.answers[q.id]); max += q.mark; }
  Object.assign(a, {state:'finished', score, max, finish:env.now(), review:reviewOf(m, a.answers)});
  if (Object.values(a.review).some(r => r.pending)) { a.pending = true; h.enrolled(m.courseId).filter(x => h.role(x.e.role)?.caps?.['grade:edit']).forEach(x => notify(S, env, x.u.id, `Essay to grade: ${m.name}`, `${h.fullname(h.me())} submitted an attempt`, 'mod', m.id)); }
  if (m.timelimit && a.finish - a.start > (m.timelimit * 60 + 90) * 1000) a.overdue = true;
  log(S, env, h.meId, `Quiz attempt submitted: ${m.name}`, m.courseId);
  if (!a.preview) checkBadges(S, env, h.meId, m.courseId);
  return {id:a.id};
});

/* Forum */
op('addDiscussion', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustSeeMod(h, m); need(m.type === 'forum', 'Not a forum.', 400);
  need(h.has(m.news ? 'forum:addnews' : 'forum:post', m.courseId), m.news ? 'Only teachers can post announcements.' : 'You cannot post in this forum.');
  const pid = env.uid('p'); S.posts.push({id:pid, cmid:m.id, discussion:pid, parent:null, userId:h.meId, subject:req(p.subject, 'Subject', 200), message:req(p.message, 'Message', 20000), time:env.now()});
  log(S, env, h.meId, `Discussion created: ${p.subject}`, m.courseId);
  const recips = m.news ? h.enrolled(m.courseId).map(x => x.u.id) : h.enrolled(m.courseId).filter(x => h.role(x.e.role)?.caps?.['forum:deleteany']).map(x => x.u.id);
  recips.filter(u => u !== h.meId).forEach(u => notify(S, env, u, `${m.news ? 'Announcement' : 'New discussion'}: ${p.subject}`, `${h.fullname(h.me())} in ${m.name}`, 'discussion', pid));
  return {id:pid};
});
op('reply', (S, h, p, env) => {
  const parent = S.posts.find(x => x.id === p.parent); need(parent, 'This post no longer exists.', 404);
  const m = modOf(S, parent.cmid); mustSeeMod(h, m); need(h.has(m.news ? 'forum:addnews' : 'forum:post', m.courseId), 'You cannot reply in this forum.');
  const pid = env.uid('p'); S.posts.push({id:pid, cmid:m.id, discussion:parent.discussion, parent:parent.id, userId:h.meId, subject:parent.subject.startsWith('Re: ') ? parent.subject : 'Re: ' + parent.subject, message:req(p.message, 'Message', 20000), time:env.now()});
  log(S, env, h.meId, `Forum post created in ${m.name}`, m.courseId);
  const people = new Set(S.posts.filter(x => x.discussion === parent.discussion).map(x => x.userId)); people.delete(h.meId);
  people.forEach(u => notify(S, env, u, `New reply: ${parent.subject.replace(/^Re: /, '')}`, `${h.fullname(h.me())} replied`, 'discussion', parent.discussion));
  return {id:pid};
});
op('deletePost', (S, h, p) => {
  const post = S.posts.find(x => x.id === p.id); need(post, 'Post not found.', 404); const m = modOf(S, post.cmid);
  need(post.userId === h.meId || h.has('forum:deleteany', m.courseId), 'You can only delete your own posts.');
  const kill = new Set([post.id]); let grew = true; while (grew) { grew = false; for (const x of S.posts) if (x.parent && kill.has(x.parent) && !kill.has(x.id)) { kill.add(x.id); grew = true; } }
  S.posts = S.posts.filter(x => !kill.has(x.id));
});

/* Messaging & notifications */
op('sendMessage', (S, h, p, env) => {
  need(h.has('message:send') || h.hasAnywhere('message:send'), 'You cannot send messages.');
  const to = h.user(p.to); need(to && to.id !== h.meId, 'Choose someone to message.', 400);
  need(h.isAdmin() || to.admin || h.sharesCourse(h.meId, to.id) || h.has('user:manage'), 'You can only message people who share a course with you.');
  const text = req(p.text, 'Message', 4000);
  S.messages.push({id:env.uid('msg'), from:h.meId, to:to.id, text, time:env.now(), read:false});
});
op('readConversation', (S, h, p) => { S.messages.forEach(x => { if (x.to === h.meId && x.from === p.with) x.read = true; }); });
op('readNotifications', (S, h, p) => { S.notifications.forEach(n => { if (n.userId === h.meId && (!p.ids || p.ids.includes(n.id))) n.read = true; }); });

/* Badges */
op('saveBadge', (S, h, p, env) => {
  const c = courseOf(S, p.cid); need(h.has('badges:manage', c.id), 'You cannot manage badges in this course.');
  const crit = p.criteria || {}; need(['course', 'activities', 'manual'].includes(crit.type), 'Choose how the badge is earned.', 400);
  const mods = crit.type === 'activities' ? (crit.mods || []).filter(id => S.mods[id]?.courseId === c.id) : [];
  need(crit.type !== 'activities' || mods.length, 'Pick at least one activity.', 400);
  let b = p.bid ? S.badges.find(x => x.id === p.bid && x.courseId === c.id) : null;
  if (!b) { b = {id:env.uid('b'), courseId:c.id, created:env.now()}; S.badges.push(b); }
  Object.assign(b, {name:req(p.name, 'Badge name', 80), description:str(p.description, 500), color:/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#0e6175', criteria:{type:crit.type, mods}});
  h.students(c.id).forEach(s => checkBadges(S, env, s.id, c.id));
  return {id:b.id};
});
op('deleteBadge', (S, h, p) => { const b = S.badges.find(x => x.id === p.bid); need(b, 'Badge not found.', 404); need(h.has('badges:manage', b.courseId), 'You cannot manage badges.'); S.badges = S.badges.filter(x => x !== b); S.badgeIssued = S.badgeIssued.filter(i => i.badgeId !== b.id); });
op('awardBadge', (S, h, p, env) => {
  const b = S.badges.find(x => x.id === p.bid); need(b, 'Badge not found.', 404); need(h.has('badges:award', b.courseId), 'You cannot award badges.');
  need(h.isLearner(b.courseId, p.userId), 'Badges can only be awarded to learners in the course.', 400);
  if (p.on === false) { S.badgeIssued = S.badgeIssued.filter(i => !(i.badgeId === b.id && i.userId === p.userId)); return; }
  if (!S.badgeIssued.some(i => i.badgeId === b.id && i.userId === p.userId)) { S.badgeIssued.push({id:env.uid('bi'), badgeId:b.id, userId:p.userId, time:env.now(), by:h.meId}); notify(S, env, p.userId, `You earned a badge: ${b.name}`, h.course(b.courseId)?.fullname, 'badges', b.courseId); }
});

/* Certificate */
op('claimCertificate', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'certificate', 'Not a certificate.', 400);
  const ex = S.certIssued.find(c => c.cmid === m.id && c.userId === h.meId && !c.archived); if (ex) return {id:ex.id, code:ex.code};
  const why = h.certEligible(m, h.meId); need(!why.length, `Not yet: ${why.join('; ')}.`, 400);
  const c = issueCert(S, env, h, m, h.meId); checkBadges(S, env, h.meId, m.courseId);
  return {id:c.id, code:c.code};
});
op('verifyCertificate', (S, h, p) => {
  const code = str(p.code, 40).trim().toUpperCase(); const c = S.certIssued.find(x => x.code === code);
  if (!c) return {valid:false};
  const m = S.mods[c.cmid], course = m ? h.course(m.courseId) : null;
  return {valid:true, name:h.fullname(c.userId), course:course?.fullname || 'Deleted course', certificate:m?.name || 'Certificate', time:c.time, code:c.code, expires:c.expires || null, expired:!!(c.expires && c.expires < Date.now())};
});

/* Lesson */
op('saveLessonPage', (S, h, p) => {
  const m = modOf(S, p.mid); need(h.canEdit(m.courseId), 'You cannot edit this lesson.'); need(m.type === 'lesson', 'Not a lesson.', 400);
  const pg = {id:p.page?.id || 'p' + Math.random().toString(36).slice(2, 8), kind:p.page?.kind === 'question' ? 'question' : 'content', title:req(p.page?.title, 'Page title', 200), body:str(p.page?.body, 20000)};
  if (pg.kind === 'question') { pg.options = (p.page.options || []).map(o => ({text:str(o.text, 500).trim(), correct:!!o.correct, feedback:str(o.feedback, 500)})).filter(o => o.text); need(pg.options.length >= 2, 'A question page needs at least two answers.', 400); need(pg.options.filter(o => o.correct).length === 1, 'Mark exactly one answer as correct.', 400); }
  m.pages ||= []; const i = m.pages.findIndex(x => x.id === pg.id); if (i >= 0) m.pages[i] = pg; else m.pages.push(pg);
  return {id:pg.id};
});
op('deleteLessonPage', (S, h, p) => { const m = modOf(S, p.mid); need(h.canEdit(m.courseId), 'You cannot edit this lesson.'); m.pages = (m.pages || []).filter(x => x.id !== p.pid); });
op('moveLessonPage', (S, h, p) => { const m = modOf(S, p.mid); need(h.canEdit(m.courseId), 'You cannot edit this lesson.'); const i = m.pages.findIndex(x => x.id === p.pid), j = i + (Number(p.dir) < 0 ? -1 : 1); if (i >= 0 && j >= 0 && j < m.pages.length) [m.pages[i], m.pages[j]] = [m.pages[j], m.pages[i]]; });
op('lessonStart', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustSeeMod(h, m); need(m.type === 'lesson', 'Not a lesson.', 400); need((m.pages || []).length, 'This lesson has no pages yet.', 400);
  need(!m.close || m.close > env.now() || !h.isLearner(m.courseId), 'This lesson is closed.', 400);
  let a = S.lessonAttempts.find(x => x.cmid === m.id && x.userId === h.meId && !x.finished);
  if (!a) { a = {id:env.uid('la'), cmid:m.id, userId:h.meId, answers:{}, score:0, max:0, finished:false, time:env.now(), preview:!h.isLearner(m.courseId)}; S.lessonAttempts.push(a); }
  return {id:a.id, answers:a.answers};
});
op('lessonAnswer', (S, h, p) => {
  const a = S.lessonAttempts.find(x => x.id === p.aid && x.userId === h.meId && !x.finished); need(a, 'This lesson attempt is no longer open.', 400);
  const m = modOf(S, a.cmid), pg = (m.pages || []).find(x => x.id === p.pid); need(pg && pg.kind === 'question', 'Question not found.', 404);
  need(a.answers[pg.id] == null, 'You have already answered this question.', 400);
  const i = Number(p.answer), o = pg.options[i]; need(o, 'Choose an answer.', 400);
  a.answers[pg.id] = i; return {correct:!!o.correct, feedback:o.feedback || (o.correct ? 'Correct.' : 'Not quite.'), right:pg.options.find(x => x.correct)?.text};
});
op('lessonFinish', (S, h, p, env) => {
  const a = S.lessonAttempts.find(x => x.id === p.aid && x.userId === h.meId && !x.finished); need(a, 'This lesson attempt is no longer open.', 400);
  const m = modOf(S, a.cmid), qs = (m.pages || []).filter(x => x.kind === 'question');
  a.max = qs.length; a.score = qs.filter(q => q.options[a.answers[q.id]]?.correct).length; a.finished = true; a.time = env.now();
  log(S, env, h.meId, `Lesson finished: ${m.name}`, m.courseId); if (!a.preview) checkBadges(S, env, h.meId, m.courseId);
  return {score:a.score, max:a.max, grade:a.max ? a.score / a.max * m.maxgrade : 0};
});

/* Glossary */
op('addEntry', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustSeeMod(h, m); need(m.type === 'glossary', 'Not a glossary.', 400); need(h.has('forum:post', m.courseId) || h.canEdit(m.courseId), 'You cannot add entries.');
  const approver = h.has('glossary:approve', m.courseId);
  if (p.id) { const e = S.glossary.find(x => x.id === p.id); need(e && (e.userId === h.meId || approver), 'You cannot edit this entry.'); e.concept = req(p.concept, 'Concept', 200); e.definition = req(p.definition, 'Definition', 10000); return {id:e.id}; }
  const e = {id:env.uid('gl'), cmid:m.id, userId:h.meId, concept:req(p.concept, 'Concept', 200), definition:req(p.definition, 'Definition', 10000), approved:!m.approval || approver, time:env.now()};
  S.glossary.push(e); log(S, env, h.meId, `Glossary entry added: ${e.concept}`, m.courseId);
  if (!e.approved) h.enrolled(m.courseId).filter(x => h.role(x.e.role)?.caps?.['glossary:approve']).forEach(x => notify(S, env, x.u.id, `Glossary entry waiting for approval: ${e.concept}`, m.name, 'mod', m.id));
  return {id:e.id, approved:e.approved};
});
op('approveEntry', (S, h, p) => { const e = S.glossary.find(x => x.id === p.id); need(e, 'Entry not found.', 404); need(h.has('glossary:approve', S.mods[e.cmid]?.courseId), 'You cannot approve entries.'); e.approved = p.on !== false; });
op('deleteEntry', (S, h, p) => { const e = S.glossary.find(x => x.id === p.id); need(e, 'Entry not found.', 404); need((e.userId === h.meId && !e.approved) || h.has('glossary:approve', S.mods[e.cmid]?.courseId), 'You cannot delete this entry.'); S.glossary = S.glossary.filter(x => x !== e); });

/* Choice */
op('answerChoice', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'choice', 'Not a choice.', 400);
  const o = Number(p.option); need(Number.isInteger(o) && o >= 0 && o < m.options.length, 'Choose an option.', 400);
  const ex = S.choiceAnswers.find(a => a.cmid === m.id && a.userId === h.meId);
  if (ex) { need(m.allowUpdate, 'You have already answered and this choice does not allow changes.', 400); ex.option = o; ex.time = env.now(); }
  else { S.choiceAnswers.push({id:env.uid('ca'), cmid:m.id, userId:h.meId, option:o, time:env.now()}); checkBadges(S, env, h.meId, m.courseId); }
});
op('removeChoice', (S, h, p) => { const m = modOf(S, p.mid); mustLearn(h, m); need(m.allowUpdate, 'This choice does not allow changes.', 400); S.choiceAnswers = S.choiceAnswers.filter(a => !(a.cmid === m.id && a.userId === h.meId)); });

/* Workshop */
op('wsSubmit', (S, h, p, env) => {
  const m = modOf(S, p.mid); mustLearn(h, m); need(m.type === 'workshop', 'Not a workshop.', 400); need(m.phase === 2, 'Submissions are only accepted in the submission phase.', 400);
  let s = S.wsSubs.find(x => x.cmid === m.id && x.userId === h.meId);
  if (!s) { s = {id:env.uid('ws'), cmid:m.id, userId:h.meId}; S.wsSubs.push(s); }
  s.title = req(p.title, 'Title', 200); s.text = req(p.text, 'Submission text', 50000); s.time = env.now();
  log(S, env, h.meId, `Workshop submission: ${m.name}`, m.courseId); checkBadges(S, env, h.meId, m.courseId);
});
function allocate(S, m, env) {
  const subs = S.wsSubs.filter(s => s.cmid === m.id); if (subs.length < 2) return 0;
  const authors = subs.map(s => s.userId), load = Object.fromEntries(authors.map(a => [a, 0])); let n = 0;
  const k = Math.min(m.peers || 2, subs.length - 1);
  const order = subs.slice().sort(() => Math.random() - .5);
  for (const s of order) {
    const pool = authors.filter(a => a !== s.userId && !S.wsAllocs.some(x => x.subId === s.id && x.reviewer === a)).sort((a, b) => load[a] - load[b] || Math.random() - .5);
    for (const r of pool.slice(0, k)) { S.wsAllocs.push({id:env.uid('wa'), cmid:m.id, subId:s.id, reviewer:r, grade:null, comment:'', done:false, time:null}); load[r]++; n++; }
  }
  return n;
}
op('wsSetPhase', (S, h, p, env) => {
  const m = modOf(S, p.mid); need(h.has('grade:edit', m.courseId), 'You cannot manage this workshop.'); const ph = Number(p.phase); need(WS_PHASES[ph], 'Unknown phase.', 400);
  let allocated = 0;
  if (ph === 3 && !S.wsAllocs.some(a => a.cmid === m.id)) allocated = allocate(S, m, env);
  m.phase = ph; log(S, env, h.meId, `Workshop phase: ${WS_PHASES[ph]}`, m.courseId);
  h.students(m.courseId).forEach(s => notify(S, env, s.id, `${m.name}: ${WS_PHASES[ph]} phase`, ph === 3 ? 'Peer assessments are now open' : ph === 5 ? 'Grades are final' : '', 'mod', m.id));
  return {allocated};
});
op('wsAssess', (S, h, p, env) => {
  const a = S.wsAllocs.find(x => x.id === p.id && x.reviewer === h.meId); need(a, 'This assessment is not allocated to you.', 403);
  const m = modOf(S, a.cmid); need(m.phase === 3, 'Assessments are only accepted in the assessment phase.', 400);
  const g = Number(p.grade); need(!isNaN(g) && g >= 0 && g <= 100, 'Enter a score between 0 and 100.', 400);
  Object.assign(a, {grade:g, comment:str(p.comment, 5000), done:true, time:env.now()});
});

/* Files */
op('registerFile', (S, h, p, env) => {
  need(p.id && /^f_[a-z0-9]+$/i.test(p.id), 'Invalid file.', 400);
  const f = {id:p.id, name:str(p.name, 200).replace(/[\\/]/g, '_') || 'file', type:str(p.type, 100) || 'application/octet-stream', size:Number(p.size) || 0, owner:h.meId, time:env.now()};
  S.files.push(f); return f;
});

/* ---------------- Running ops ---------------- */
function run(S, meId, name, payload, env) {
  const fn = OPS[name]; if (!fn) throw new OpError(`Unknown operation: ${name}`, 404);
  const me = S.users.find(u => u.id === meId); if (!me) throw new OpError('Please log in again.', 401);
  if (me.suspended) throw new OpError('This account is suspended.', 401);
  const free = ['setOwnPassword', 'acceptTerms', 'savePrefs', 'touch', 'heartbeat', 'readNotifications', 'mfaSetup', 'mfaEnable'];
  if (me.mustChangePassword && !free.includes(name)) throw new OpError('Set a new password before continuing.', 428);
  if (mfaRequired(S, me) && !me.mfaEnabled && !free.includes(name)) throw new OpError('Set up two-step sign-in before continuing.', 428);
  return fn(S, H(S, meId), payload || {}, env) ?? null;
}
/* Returns {user} or {error}. opts.trusted skips the password check (used after LDAP or SSO). */
function login(S, username, password, env, opts = {}) {
  const u = S.users.find(x => sameName(x.username, username) || (opts.byEmail && sameName(x.email, username)));
  const sec = S.site.security || {};
  if (!u) return {error:'Invalid login, please try again.'};
  if (u.lockedUntil && u.lockedUntil > env.now()) return {error:`This account is locked after too many failed attempts. Try again after ${fmtD(u.lockedUntil)} or ask an administrator to unlock it.`, locked:true};
  if (!opts.trusted && !env.verify(u, String(password || ''))) {
    u.failedLogins = (u.failedLogins || 0) + 1;
    if (sec.lockoutAttempts && u.failedLogins >= sec.lockoutAttempts) { u.lockedUntil = env.now() + (sec.lockoutMinutes || 30) * 6e4; u.failedLogins = 0; audit(S, env, u.id, 'Account locked', u.username, `${sec.lockoutAttempts} failed login attempts`); }
    return {error:'Invalid login, please try again.'};
  }
  if (u.suspended) return {error:'This account is suspended. Contact your administrator.'};
  u.failedLogins = 0; u.lockedUntil = null; u.lastLogin = env.now();
  log(S, env, u.id, opts.via ? `User logged in (${opts.via})` : 'User logged in'); return {user:u};
}
function authenticate(S, username, password, env) { const r = login(S, username, password, env); return r.user || null; }
const mfaRequired = (S, u) => { const m = S.site.security?.mfa; return !!u && (m === 'all' || (m === 'admins' && (u.admin || S.sysroles.some(r => r.userId === u.id && r.roleId === 'manager')))); };

/* ---------------- Per-user view ---------------- */
const VIEW_HOOKS = [];
function view(S, meId) {
  const h = H(S, meId), me = h.me(); if (!me) return null;
  const site = clone(S.site);
  if (!h.has('site:config')) { delete site.email; delete site.sso; delete site.ldap; delete site.templates; }
  else { site.email.passSet = !!site.email.pass; site.email.pass = ''; site.sso.secretSet = !!site.sso.clientSecret; site.sso.clientSecret = ''; }
  const V = {version:VERSION, me:meId, site, roles:clone(S.roles), sysroles:clone(S.sysroles), categories:clone(S.categories), now:Date.now()};
  const manageUsers = h.has('user:manage');
  const team = new Set(h.teamMembers(meId)), scope = h.trainerScope(meId);
  V.users = S.users.map(u => ({id:u.id, firstname:u.firstname, lastname:u.lastname, email:u.email, admin:!!u.admin, created:u.created, suspended:!!u.suspended, company:u.company || '', department:u.department || '', personas:u.personas || [], builtinAdmin:!!u.builtinAdmin,
    ...(u.id === meId || manageUsers ? {username:u.username, lastLogin:u.lastLogin || null, locked:!!(u.lockedUntil && u.lockedUntil > Date.now()), mfaEnabled:!!u.mfaEnabled, auth:u.auth || 'manual', mustChangePassword:!!u.mustChangePassword} : {}),
    ...(u.id === meId ? {prefs:u.prefs || {}, prefsSet:!!u.prefsSet, termsAccepted:u.termsAccepted || 0} : {}),
    ...(team.has(u.id) || scope.has(u.id) ? {lastLogin:u.lastLogin || null} : {})}));
  const visibleCourse = c => h.canView(c.id) || ((c.status || 'published') === 'published' && c.visible);
  V.courses = clone(S.courses.filter(visibleCourse));
  const viewable = new Set(S.courses.filter(c => h.canView(c.id)).map(c => c.id));
  // Oversight: learners whose progress this user may see without being in the course (team leads; trainers' cohorts; site analytics)
  const siteAnalytics = h.has('analytics:site');
  const oversee = uid => siteAnalytics || team.has(uid) || scope.has(uid);
  const overseeCourses = new Set(S.enrol.filter(e => oversee(e.userId)).map(e => e.courseId));
  V.enrol = S.enrol.filter(e => e.userId === meId || (viewable.has(e.courseId) && h.has('course:viewparticipants', e.courseId)) || ['editingteacher', 'teacher', 'trainer'].includes(e.role) || oversee(e.userId)).map(clone);
  V.groups = clone(S.groups.filter(g => viewable.has(g.courseId) && (h.has('group:manage', g.courseId) || h.has('grade:viewall', g.courseId) || g.members.includes(meId))));
  V.mods = {};
  const stripAnswers = vm => {
    if (vm.questions && vm.type === 'quiz') vm.questions = vm.questions.map(q => ({id:q.id, type:q.type, text:q.text, mark:q.mark, ...(q.type === 'mc' ? {options:q.options.map(o => ({text:o.text}))} : {}), ...(q.type === 'essay' ? {guidance:q.guidance} : {})}));
    if (vm.pages) vm.pages = vm.pages.map(pg => ({id:pg.id, kind:pg.kind, title:pg.title, body:pg.body, ...(pg.options ? {options:pg.options.map(o => ({text:o.text}))} : {})}));
  };
  for (const cid of new Set([...viewable, ...overseeCourses])) for (const m of h.courseMods(cid)) {
    if (!m.visible && !h.has('course:viewhidden', cid)) continue;
    const vm = clone(m);
    if (!h.canEdit(cid)) stripAnswers(vm);
    if (!viewable.has(cid)) { delete vm.content; delete vm.questions; delete vm.pages; vm.oversightOnly = true; }
    if (m.type === 'choice') {
      const answered = S.choiceAnswers.some(a => a.cmid === m.id && a.userId === meId && !a.archived);
      if (h.has('grade:viewall', cid) || m.showResults === 'always' || (m.showResults === 'after' && answered)) vm.results = m.options.map((_, i) => S.choiceAnswers.filter(a => a.cmid === m.id && a.option === i && !a.archived).length);
    }
    if (m.type === 'live') vm.registered = S.liveSignups.filter(x => x.cmid === m.id && !x.archived).length;
    V.mods[m.id] = vm;
  }
  const modVisible = cmid => !!V.mods[cmid];
  const allIn = cmid => { const m = S.mods[cmid]; return m && modVisible(cmid) && h.has('grade:viewall', m.courseId); };
  const own = x => x.userId === meId;
  const ok = x => modVisible(x.cmid) && (own(x) || allIn(x.cmid) || oversee(x.userId));
  V.completion = Object.fromEntries(Object.entries(S.completion).filter(([k]) => { const [u, m] = k.split(':'); return u === meId || allIn(m) || (oversee(u) && modVisible(m)); }));
  V.submissions = S.submissions.filter(ok).map(x => own(x) || allIn(x.cmid) ? clone(x) : {...clone(x), text:'', files:[], feedback:''});
  V.attempts = S.attempts.filter(ok).map(x => own(x) || allIn(x.cmid) ? clone(x) : {...clone(x), answers:{}, review:null});
  V.lessonAttempts = clone(S.lessonAttempts.filter(ok));
  V.choiceAnswers = clone(S.choiceAnswers.filter(ok));
  V.posts = clone(S.posts.filter(x => modVisible(x.cmid) && viewable.has(S.mods[x.cmid]?.courseId)));
  V.glossary = clone(S.glossary.filter(x => modVisible(x.cmid) && (x.approved || own(x) || h.has('glossary:approve', S.mods[x.cmid].courseId))));
  const myAllocs = S.wsAllocs.filter(a => a.reviewer === meId && modVisible(a.cmid));
  V.wsSubs = S.wsSubs.filter(s => modVisible(s.cmid) && (own(s) || allIn(s.cmid) || oversee(s.userId) || myAllocs.some(a => a.subId === s.id))).map(s => (own(s) || allIn(s.cmid) || oversee(s.userId)) ? clone(s) : {...clone(s), userId:null});
  V.wsAllocs = S.wsAllocs.filter(a => modVisible(a.cmid) && (a.reviewer === meId || allIn(a.cmid) || (S.wsSubs.find(s => s.id === a.subId)?.userId === meId && (S.mods[a.cmid].phase || 1) >= 4)))
    .map(a => (a.reviewer === meId || allIn(a.cmid)) ? clone(a) : {...clone(a), reviewer:null});
  V.certIssued = clone(S.certIssued.filter(x => own(x) || allIn(x.cmid) || oversee(x.userId)));
  V.liveSignups = clone(S.liveSignups.filter(ok));
  V.feedbackResponses = S.feedbackResponses.filter(x => modVisible(x.cmid) && (own(x) || allIn(x.cmid))).map(x => !own(x) && S.mods[x.cmid]?.anonymous && !h.isAdmin() ? {...clone(x), userId:null} : clone(x));
  V.resume = Object.fromEntries(Object.entries(S.resume).filter(([k]) => { const [u, m] = k.split(':'); return modVisible(m) && (u === meId || allIn(m) || oversee(u)); }));
  V.extraAttempts = Object.fromEntries(Object.entries(S.extraAttempts).filter(([k]) => { const [u, m] = k.split(':'); return u === meId || (S.mods[m] && h.has('attempts:manage', S.mods[m].courseId)); }));
  V.messages = clone(S.messages.filter(x => x.from === meId || x.to === meId));
  // Group chats: members see them; the course's trainers and administrators can also see them to moderate
  V.chats = clone((S.chats || []).filter(c => h.inChat(c) || h.canManageChats(c.courseId)).map(c => ({...c, memberIds:h.chatMembers(c)})));
  const chatIds = new Set(V.chats.map(c => c.id)); V.chatMessages = clone((S.chatMessages || []).filter(m => chatIds.has(m.chatId)));
  V.notifications = clone(S.notifications.filter(n => n.userId === meId).slice(-150));
  V.badges = clone(S.badges.filter(b => viewable.has(b.courseId) || S.badgeIssued.some(i => i.badgeId === b.id)));
  V.badgeIssued = clone(S.badgeIssued);
  V.logs = h.has('site:viewlogs') ? clone(S.logs.slice(-400)) : clone(S.logs.filter(l => l.cid && viewable.has(l.cid) && h.has('report:view', l.cid)).slice(-400));
  V.access = {[meId]:clone(S.access[meId] || {})};
  V.cohorts = clone(S.cohorts.filter(c => h.has('cohort:manage') || siteAnalytics || c.leads.includes(meId) || c.trainers.includes(meId) || c.members.includes(meId)));
  V.paths = clone(S.paths);
  V.rules = h.has('path:manage') ? clone(S.rules) : [];
  V.accessRequests = clone(S.accessRequests.filter(r => r.userId === meId || h.has('access:approve') || oversee(r.userId) || h.has('grade:viewall', r.courseId)));
  V.qbank = h.has('qbank:manage') || S.enrol.some(e => e.userId === meId && h.role(e.role)?.caps?.['course:manageactivities']) ? clone(S.qbank) : [];
  V.courseVersions = clone(S.courseVersions.filter(v => h.has('course:update', v.courseId)).map(v => ({...v, snapshot:undefined, mods:v.snapshot ? Object.keys(v.snapshot.mods || {}).length : 0})));
  V.outbox = h.has('site:config') ? clone(S.outbox.slice(-300)) : [];
  V.audit = h.has('audit:view') ? clone(S.audit.slice(-500)) : [];
  V.auditCount = h.has('audit:view') ? S.audit.length : 0;
  for (const f of VIEW_HOOKS) f(S, h, V);
  // files: anything referenced by the visible data, plus own uploads and the site logo
  const text = JSON.stringify(V);
  V.files = clone(S.files.filter(f => f.owner === meId || text.includes(f.id)));
  return V;
}
function canReadFile(S, meId, fileId) {
  const f = S.files.find(x => x.id === fileId); if (!f) return false;
  if (S.site.branding?.logo === fileId) return true;
  const V = view(S, meId); return !!V && V.files.some(x => x.id === fileId);
}

return {VERSION, TYPES, MANUAL, QTYPES, WS_PHASES, CAPS, BUILTIN_ROLES, ARRAYS, MAPS, H, seed, emptyState, defaultSite, OPS, run, login, authenticate, mfaRequired, view, canReadFile,
  gradeQ, correctText, reviewOf, parseCSV, validateUserRows, backupCourse, OpError, clone, sha256, verifyAudit, DEFAULT_TEMPLATES, TEMPLATE_VARS, fill, linkTo, fmtD,
  DEFAULT_PASSWORD, USERNAME_RE, sameName, findUser, _:{OPS, op, need, req, str, D, notify, notifyT, queueEmail, log, audit, checkBadges, issueCert, checkPassword, modOf, courseOf, mustView, mustSeeMod, mustLearn, cleanFiles, makeToken, useToken, welcomeUser, assignCourse, applyRules, VIEW_HOOKS, SEED_HOOKS}};
});
