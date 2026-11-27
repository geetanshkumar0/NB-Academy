/* NB Academy front end · start-up, deep links, scheduler, time tracking, refresh */
'use strict';

async function refresh() {
  if (!S || document.hidden || modalEl.innerHTML || ['attempt', 'lessonplay', 'submit'].includes(ui.view.name) || document.getElementById('vplayer') || document.getElementById('scormframe') || document.getElementById('liveframe') || document.getElementById('docview') || document.getElementById('doctimer')) return; // never reload a course, video, document or meeting someone is in
  const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  try { const st = await B.init(); if (!st) { setState(null); ui.loginErr = 'You were signed out after a period of inactivity.'; render(); return; } const y = window.scrollY; setState(st); render(); window.scrollTo(0, y); } catch (e) {}
}
/* After an update on the server, open tabs still run the old code: offer a reload (never forced, so a video or quiz is not cut off) */
async function checkVersion() {
  if (!window.__build || document.getElementById('updbar')) return;
  try { const r = await fetch('/api/version', {cache:'no-store'}); const d = await r.json(); if (!d.build || d.build === window.__build) return; } catch (e) { return; }
  const bar = document.createElement('div'); bar.id = 'updbar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>A new version of ${esc(S?.site?.name || 'NB Academy')} is available.</span><button class="btn sm primary" data-act="reloadApp">Reload</button><button class="xbtn" data-act="hideUpdate" aria-label="Later">×</button>`;
  document.body.appendChild(bar);
}
Object.assign(A, {reloadApp: () => location.reload(), hideUpdate: () => { const b = document.getElementById('updbar'); if (b) b.hidden = true; }});
window.addEventListener('beforeunload', e => { if (ui.uploading) { e.preventDefault(); e.returnValue = ''; } });
/* Time spent learning: counted while the learner is active in a course page */
['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { ui.lastActive = Date.now(); }, {passive:true}));
function heartbeat() {
  if (!S || document.hidden) return; const cid = ui.ctxCourse; const vid = document.getElementById('vplayer');
  const watching = (vid && !vid.paused) || !!document.getElementById('liveframe'); // in a video or a live session
  if (!cid || !h.isLearner(cid) || (Date.now() - ui.lastActive > 60e3 && !watching)) return;
  if (!['course', 'mod', 'attempt', 'lessonplay', 'review', 'discussion', 'submit', 'liveroom'].includes(ui.view.name)) return;
  B.op('heartbeat', {cid, secs:60}).catch(() => {});
}
(async () => {
  const q = new URLSearchParams(location.search);
  if (q.get('sso_error')) ui.loginErr = q.get('sso_error');
  if (q.get('go') === 'setpassword' && q.get('id')) { try { ui.token = await B.tokenInfo(q.get('id')); ui.token.raw = q.get('id'); } catch (e) { ui.token = {valid:false}; } ui.loginView = 'token'; }
  else if (q.get('go')) ui.deepLink = {go:q.get('go'), id:q.get('id')};
  if (q.toString()) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  if (B.server) { try { const d = await (await fetch('/api/site')).json(); window.__site = d.site; window.__build = d.build; window.__demo = d.demo; window.__demoUsers = d.demoUsers; window.__sso = d.sso; applyBranding(); } catch (e) {} }
  try { setState(await B.init()); }
  catch (e) { app.innerHTML = `<div class="page"><div class="card stack" style="max-width:560px;margin:40px auto"><h2>NB Academy could not start</h2><p class="muted">${esc(e.message)}</p><div><button class="btn" data-act="reload">Try again</button></div></div></div>`; return; }
  if (S && ui.loginView === 'token') { await B.logout().catch(() => {}); setState(null); }
  if (S && ui.deepLink) { const dl = ui.deepLink; ui.deepLink = null; ui.view = {name:dl.go, p:{id:dl.id}}; }
  else if (S) {
    // The browser reloaded this tab (for example a background tab it had put to sleep): reopen the same page
    const st = history.state; let back = null; try { back = st?.nb && st.uid === S.me && st.view?.name && VIEWS[st.view.name] ? navTarget(st) : null; } catch (e) {}
    ui.view = back || {name:homeFor(currentMode()), p:{}};
  }
  render(); replaceNav();
  setInterval(heartbeat, 60e3);
  if (B.server) { setInterval(refresh, 45e3); setInterval(checkVersion, 120e3); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); }); }
  else setInterval(async () => { if (!S) return; const st = await B.init(); if (st && JSON.stringify(st.notifications.length) !== JSON.stringify(S.notifications.length)) { setState(st); if (!document.activeElement || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) render(); } }, 60e3);
})();
