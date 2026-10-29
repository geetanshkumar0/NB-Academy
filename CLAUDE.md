# NB Academy: notes for Claude

NB Academy is a corporate learning management system modelled on Moodle. It has Learner, Trainer, Team Lead and Administrator personas. It is deployed on the company's own server. This file tells Claude how to work on it safely.

## Hard rules

- **No external dependencies.** Use Node.js built-ins only (`node:http`, `node:sqlite`, `node:crypto`, `node:net`, `node:tls`, `node:zlib`) and plain browser JavaScript. Never add npm packages, CDNs, web fonts or frameworks.
- **Node 22.13 or newer** (built-in SQLite).
- **Never commit `data/`.** It holds the live database and uploaded files.
- **Never put passwords, tokens or secrets in code.** The one deliberate exception is the starting password for new accounts, `Welcome@1` (`DEFAULT_PASSWORD` in core.js, overridable with `NB_DEFAULT_PASSWORD`). It is always paired with `mustChangePassword: true`, so it works only until the first sign-in. Keep it that way. Built-in admins are listed by email only in `server/site-admins.js`, which also lists accounts to delete at start-up (`remove`).
- **Every behaviour change needs a test** in `test/api.test.js`, and `npm test` must pass before committing.
- **Permissions are enforced in `Core.run` operations, never only in the UI.** The browser must not decide what a user may do.

## Commands

```bash
npm test                      # API tests (node --test), spins up its own server and fake SMTP/LDAP/OIDC
npm start                     # http://localhost:8080, clean site (geetansh.kumar / Welcome@1)
npm run demo                  # with demo data (password "demo"); keep --demo on every start
npm run reset:demo            # wipe local data and reload demo data (local testing only)
npm run build:preview         # dist/preview.html: browser-only edition, data in localStorage
```

## How the code is organised

- `public/core.js` holds the shared domain logic used by BOTH the server and the browser preview:
  - data model, roles and capabilities;
  - the helpers `H(S, uid)`;
  - every operation, registered with `op(name, (S, h, p, env) => …)`;
  - `Core.view(S, uid)`, the per-user privacy filter.
- `public/core-ext.js` holds the lifecycle features: onboarding, MFA, cohorts, personas, assignment, access requests, live sessions, SCORM and video progress, question bank, versions, the scheduler `tick()`, analytics and the demo seed. It can wrap core ops through `Core._.OPS`.
- `public/js/*.js` holds the UI, as classic scripts sharing global scope, loaded in this order: base, views-main, views-activities, views-course, views-workspaces, views-admin, actions, actions-ext, boot.
  - Views go in the `VIEWS.name = p => html` registry.
  - Click actions go in the `A` registry (`data-act="x"`). Navigation uses `data-go="view"`.
  - Form handlers go in the `F` registry (`<form data-form="x">`).
  - **Navigation:** `go(name, p)` renders a page and adds a browser-history entry (`pushNav`); the browser's Back/Forward replays them (`popstate` in base.js). Activity pages get a "← Back to …" link from `backLink()`. A test checks that every page linked with `go('x')` or `data-go="x"` has a `VIEWS.x`.
  - **Quiz question editor:** `qbBuilder`/`qbCard` (views-activities.js) and the `qb*` actions (actions-ext.js). Cards save themselves with `saveQuestion` and do not redraw the page; a new card gets its final id up front, and each card's saves are chained so nothing is created twice. Structural changes (`qbDup`, `qbMove`, `qbDel`) flush pending saves and redraw.
  - **Forms are submitted by app code, not by the browser** (see `submitForm` in actions.js). The preview runs in a sandboxed frame where native form submission is blocked. Keep `type="submit"` buttons inside `data-form` forms and don't rely on the browser's submit event.
- `public/app.html` holds the page shell and all CSS. Colours come from CSS variables, and dark mode is supported.
- **Tab icon (favicon):** the NB mark (`DEFAULT_LOGO` in base.js) is inlined in app.html's `<link id="favicon">` and served at `/favicon.ico` (`FAVICON_SVG` in server.js). `applyFavicon` in base.js switches it to the uploaded site logo, or recolours it with the brand colours.
- `server/server.js` holds the HTTP server:
  - sessions, CSRF header `X-NB-Request: 1`, uploads, SCORM, certificates and SSO;
  - built-in admins (`ensureSiteAdmins`);
  - the scheduler (every 5 minutes) and email delivery (every 30 seconds).
- `server/store.js` handles SQLite persistence. Each record is a JSON row, and audit rows are append-only (enforced by database triggers).
- `server/mailer.js`, `ldap.js`, `oidc.js`, `unzip.js` and `pdf.js` are hand-written protocol and format code.
- **Emails:** `renderEmail(S, key, vars)` in core.js returns subject, plain text and HTML. A template's `html` (the welcome design in `WELCOME_HTML`, or an admin's own) is used if present; otherwise `emailLayout` wraps the text in the shared design. The colour is `S.site.emailTheme.color` (`emailPalette`). `server/mailer.js` sends multipart/alternative. Icons (`EI` in core.js) are rasterised to PNG without dependencies and served at `/email-assets/<name>-<RRGGBB>.png`; the browser-only preview inlines them (`setEmailIconUrl`).
- **Uploads:** files of 16 MB or less use `POST /api/upload`. Larger files use `/api/upload/start`, then `/api/upload/piece?id&index` (8 MB pieces, 4 in parallel from `ServerBackend.upload` in base.js, retried on failure), then `/finish` (or `/abort`). Pieces are written at their offset in `data/uploads/<id>.part`, and progress is kept in `<id>.json`, so uploads survive restarts. Unfinished uploads are removed after 24 hours.
- **Video resume:** `mountPlayers()` (views-activities.js) starts a video where the learner stopped (also once completed, unless they stopped at the very end) and shows the `#vresume` bar ("Resume from m:ss" / "Start over", actions `vResume`/`vRestart`). `videoAway` pauses the video when the tab is hidden, saves on `pagehide` and on in-app navigation (`go()`), using `keepalive`. Every save also updates the browser's copy in `S.resume`, so returning to the page never uses a stale position (this used to overwrite the real position). After a reload, boot reopens the same page from `history.state` (`navTarget`).
- **Quiz bulk upload:** `parseQuestionRows` (core.js) reads rows (header Question Text | A–F | Correct Answer, optional Sno/Marks) into multiple-choice questions with row-numbered errors; op `importQuestions` (add or `replace`, all or nothing). UI: `qImport`/`qImportGo` and `XL.quizTemplate`/`XL.readXlsxGrid` in actions-ext.js; CSV through `C.csvGrid`.
- **Live sessions** (`live` activity; `mode` is `room` (video room in NB Academy), `vilt` (outside link) or `ilt` (in person)): invitations by email in `setLiveInvites`/`sendLiveInvites`/`liveCancelAll` (core.js; templates `liveInvite`, `liveUpdated`, `liveCancelled`), accounts only; invitees outside the course are enrolled. Rooms run on a self-hosted Jitsi server (`S.site.meetings`, or `NB_MEET_URL`/`NB_MEET_APP_ID`/`NB_MEET_SECRET`): `POST /api/live/join` runs op `liveJoin` (core-ext.js: who, when, attendance) and returns a JWT-signed link (`jitsiToken`, server.js). The page frames it (`VIEWS.liveroom`, link only in `ui.liveRoom`); the shell's CSP allows the meeting origin. `liveJoin` is blocked on `/api/op`.
- **SCORM:** `server/unzip.js` `scormLaunch` reads the manifest (default organisation, xml:base, launch parameters; detects 1.2 or 2004). `mountPlayers()` in views-activities.js provides both `window.API` (1.2) and `window.API_1484_11` (2004) over one saved record; `scormCommit` stores it with 1.2-style keys and the score as a percentage. Activities without `scormVersion` are re-read on first open (`ensureScorm`).

A change flows like this: the browser sends `POST /api/op {op, payload}`. The server runs `Core.run(S, uid, op, payload, env)`, which checks capabilities with `need(...)`, then saves the changed rows and returns that user's filtered view. If an op throws, the server reloads the last saved state.

## Personas and roles

- **Learner:** a `student` enrolment in a course, or `user.personas` contains `learner`.
- **Trainer:** a `trainer`, `editingteacher` or `teacher` enrolment, a trainer of a cohort, or `user.personas` contains `trainer`.
- **Team Lead:** the site role `teamlead` in `S.sysroles`, plus cohort `leads`.
- **Administrator:** `user.admin`, or the site role `manager`. Built-in admins have `builtinAdmin: true`. They are the **super administrators** (`h.isSuperAdmin()`). They hold every persona (`h.personas` returns all four; Trainer and Team Lead views show every course and cohort), and only they can remove admin access (`removeAdmin`), suspend or delete other admins, and they cannot themselves be deleted, suspended or demoted in the app.
- **Course group chats** (`S.chats`, `S.chatMessages`; ops `createChat`, `updateChat`, `deleteChat`, `sendChatMessage`, `readChat` in core-ext.js): created by the course's trainers or by admins (`h.canManageChats`). `mode: 'course'` means everyone enrolled in the course is a member.

- **Teams:** a user's team is stored in `user.department` and must be one of `S.site.teams` (default `TEAMS` in core.js, editable via `saveTeams`); `normTeam` validates it. There is no Company field anywhere (forms, rules, Analytics, exports). `tidyData` in core.js runs at every start-up (server and preview): it removes old company values and renames teams in `RENAMED_TEAMS` ("Training" → "Training Team"), logging each change in the audit log.

- **Locks** (step-by-step order `modLock`, overdue lockout `isLocked`, learning-path order `pathLock`) apply only to learners who cannot edit the course: `h.editsCourse(cid)` exempts editors and admins even when they are also enrolled as learners.

`h.personas(uid)` drives the view switcher (`modes()` in base.js).

## Fixing an issue

1. Reproduce it first. Write a failing test in `test/api.test.js`, or a Playwright script against `dist/preview.html` for UI issues. Chromium and Playwright are usually pre-installed in Claude's workspace.
2. Fix it in the shared core when the issue is about behaviour, so both editions get the fix.
3. Run `npm test`. For UI changes, also rebuild the preview, click through the affected screens and check the browser console for errors.
4. Keep `README.md` and `COVERAGE.md` accurate when features or limits change.
5. Commit with a clear message and push to `main`. **Pushing to `main` deploys to production** within about 5 minutes (see Deployment), so push only finished, tested changes.

**Demo data:** a site started without `--demo` that holds demo data is cleaned automatically, after a backup (`removeDemoData` in server.js). The production server must never be started with `--demo`. The tests set `NB_DEMO=1` themselves.

## Deployment

- Production runs in **Docker**, with its own updater. Every 5 minutes it checks `main` on GitHub, pulls new commits, runs the tests and restarts. **A push to `main` is live within about 5 minutes**, with no action from the user.
- So `npm test` must pass before every push, and work in progress goes on a branch, not `main`.
- If a change needs a person to do something on the server, say so clearly when reporting back. Examples: an environment variable, a reverse-proxy setting such as nginx `client_max_body_size`, or a data migration. Otherwise, just say when it will be live.
- `tools/update-server.sh` is for servers without the Docker updater (a plain systemd install). The user does not need it.
- Claude cannot reach the server directly.
