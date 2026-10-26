# NB Academy

A learning management system modelled on Moodle, extended for the full corporate training lifecycle: assigned training with deadlines, automatic lockout and access approvals, Learner / Team Lead / Trainer / Administrator workspaces, live sessions, SCORM and video, recertification, single sign-on, LDAP, two-step sign-in, email notifications, analytics and a tamper-evident audit log. See **COVERAGE.md** for a requirement-by-requirement map of the lifecycle guide.

**No external dependencies.** The server uses only Node.js built-in modules (`node:http`, `node:sqlite`, `node:crypto`, `node:net`, `node:tls`, `node:zlib`). Email (SMTP), LDAP, OpenID Connect, zip extraction for SCORM and PDF certificates are implemented in this repository. The browser code is plain HTML, CSS and JavaScript, with no frameworks, CDNs or web fonts. `npm install` is not needed.

## Quick start

Requires **Node.js 22.13 or newer** (for the built-in SQLite module).

```bash
node server/server.js            # http://localhost:8080, loads demo data on first run
```

Demo accounts all use the password `demo`:

| Username | Role |
|---|---|
| `admin` | Administrator (authors content, approves access requests, analytics) |
| `rohan` | Trainer for DA101 and TE110, and a learner in BS201 (try the view switcher) |
| `priya` | Trainer for BS201, BS150 and the Sales and New-hire cohorts |
| `vikram` | Team Lead of the Analytics Team cohort |
| `asha` | Learner with an overdue (locked) course |
| `kabir` | Learner with a pending access request |
| `nisha` | New hire: first-login onboarding, auto-assigned the safety course |
| `meera` | Learner whose safety certificate is due for recertification |
| `zoya`, `arjun`, `dev` | Learners |
| `sana` | Custom site role *Course reviewer* (read-only access to every course) |

To start a real site without demo data:

```bash
node server/server.js --empty     # admin / Welcome@1, changed at first sign-in
```

Other commands:

```bash
node server/server.js --reset     # wipe the database and reload demo data
node --test test/api.test.js      # run the API test suite (40 tests, including fake SMTP, LDAP and OIDC servers)
node tools/build-preview.js       # build dist/preview.html (browser-only edition)
```

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `NB_DATA_DIR` | `./data` | Database (`nbacademy.db`) and uploaded files (`files/`) |
| `NB_ADMIN_PASSWORD` | `Welcome@1` | Password for the install `admin` account with `--empty` (the default must be changed at first sign-in) |
| `NB_DEFAULT_PASSWORD` | `Welcome@1` | Starting password for new accounts (always changed at first sign-in) |
| `NB_SECURE_COOKIES` | off | Set to `1` when served over HTTPS (also detected from `X-Forwarded-Proto`) |
| `NODE_ENV` | | Set to `production` to cache the page shell |
| `NB_PUBLIC_URL` | site setting | Public address used in emails, certificates and SSO redirects |

## Two editions, one codebase

| | Server edition | Preview edition |
|---|---|---|
| Run | `node server/server.js` | `dist/preview.html` (single file) |
| Data | SQLite on the server, shared by everyone | `localStorage` in one browser |
| Logins | Hashed passwords (scrypt), HttpOnly session cookies | Demo only |
| Files | Up to 25 MB, stored on disk, permission-checked downloads | Up to 2 MB, kept in the browser |
| Use | Real deployments | Demos and design reviews |

Both editions run the **same business logic** (`public/core.js`). In the server edition the server runs every operation and the browser never decides permissions.

## Architecture

```
public/
  app.html               page shell + all CSS
  core.js                shared domain logic: data model, roles and capabilities, completion and
                         lockout rules, every core operation, templates, audit chain, per-user view filter
  core-ext.js            lifecycle features: onboarding, MFA, cohorts, paths, rules, assignment, nudges,
                         access requests, live sessions, video/SCORM progress, feedback, essays,
                         question bank, versions, archiving, scheduler, analytics, demo data
  demo-media.js          demo video, captions and SCORM package
  js/views-workspaces.js Team Lead and Trainer workspaces, approvals, analytics
  js/actions-ext.js      actions and forms for the lifecycle features
  js/boot.js             start-up, deep links, time tracking, refresh
  js/base.js             utilities, icons, the two backends, state, navbar
  js/views-main.js       login, dashboard, catalogue, calendar, profile, messages, notifications
  js/views-activities.js course page and all 12 activity types
  js/views-course.js     participants, groups, grades, badges, reports, course settings, backup
  js/views-admin.js      site administration
  js/actions.js          modals, actions, form handlers, events, start-up
server/
  server.js              HTTP server, sessions, uploads, downloads, backup download, certificate verification page
  store.js               SQLite persistence: changed rows only, in one transaction per operation;
                         triggers make audit rows append-only; sessions with idle timeout
  mailer.js              SMTP client (STARTTLS, implicit TLS, AUTH PLAIN/LOGIN)
  ldap.js                LDAP simple bind
  oidc.js                OpenID Connect sign-in (PKCE, RS/PS/ES signatures)
  unzip.js               zip reader for SCORM packages
  pdf.js                 certificate PDF writer
tools/build-preview.js   inlines all scripts into dist/preview.html
test/api.test.js         API tests (node --test)
```

**How a change happens:** the browser sends `POST /api/op {op, payload}` → the server runs `Core.run()` as the logged-in user → the operation checks capabilities and validates input → the changed records are saved → the server returns that user's filtered view of the data. If an operation fails part-way, the server reloads the last saved state so nothing half-done remains.

**Privacy filter (`Core.view`).** Each user receives only what they may see. For example, students never receive quiz answers or other students' submissions, workshop reviewers do not see whose work they are assessing, and password hashes are never sent.

### HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | App |
| GET | `/api/state` | Current user's view (`{state:null}` when logged out) |
| GET | `/api/site` | Public site name and login-page settings |
| POST | `/api/login`, `/api/logout` | Sessions |
| POST | `/api/op` | Run an operation |
| POST | `/api/upload?name=…` | Upload a file (raw body) |
| POST | `/api/loginas` | "Log in as" another user (needs `user:loginas`) |
| GET | `/files/:id/:name` | Download a file (permission-checked; `?dl=1` forces download) |
| GET | `/api/backup/:courseId?users=1` | Download a course backup |
| GET | `/cert/:code` | Public certificate verification page |
| GET | `/health` | Health check |
| POST | `/api/login/mfa` | Second step of sign-in (authenticator code) |
| POST | `/api/forgot`, `/api/token-password` | Password reset by emailed link |
| GET | `/auth/sso`, `/auth/sso/callback` | Single sign-on |
| GET | `/scorm/:activity/…` | SCORM package content (course members only) |
| GET | `/cert/:code.pdf` | Certificate PDF |
| GET | `/api/logo` | Site logo (public, for the login page) |

Every POST must include the header `X-NB-Request: 1`. Together with `SameSite=Lax` cookies, this blocks cross-site request forgery.

## Features, mapped to Moodle

| Moodle | NB Academy |
|---|---|
| Dashboard, timeline, calendar block | Dashboard with timeline, "needs your attention", mini calendar, recent courses, badges |
| Course categories, catalogue, self enrolment | Home catalogue with search; self enrolment per course |
| Course format (topics), edit mode, activity chooser | Sections, course index, edit mode, chooser, move/hide/delete |
| Activity completion, progress | Manual and automatic completion, progress bars, completion report |
| Assignment | Online text and file submissions, due dates, late flags, grading with feedback |
| Quiz | Multiple choice, true/false, short answer, numerical; time limits; attempt limits; review; server-side grading |
| Forum | Discussions, threaded replies, announcements forum |
| Lesson | Content and question pages, instant feedback, graded |
| Workshop | Five phases, random peer allocation, anonymous peer review, submission and assessment grades |
| Glossary | Entries, A–Z browse, search, approval workflow |
| Choice | Single-question poll, result publishing options |
| Page, File, URL, Text and media area | All included; file previews for images and text |
| Custom certificate | Certificate activity with requirements, verification code and public check page |
| Badges | Course badges: activity criteria, course completion, manual award |
| Gradebook | Grader report with group filter, user report, natural aggregation |
| Groups | Groups, membership, filters in participants, assignments and grades |
| Messaging, notifications | Private messages, notification bell, notifications page |
| Roles and capabilities | 38+ capabilities, 6 built-in roles (Administrator, Trainer, Course author, Non-editing trainer, Learner, Team Lead), custom roles, site role assignments, comparison matrix |
| Upload users (CSV) | Preview with validation, enrolments and groups, update existing users |
| Backup and restore | Course backup with or without user data; restore as a new course |
| Logs, reports | Site logs, course logs, course report |
| Log in as, suspend users | Included |

## Deploying

1. Install Node.js 22.13+ on the server and copy this folder.
2. Run `NB_ADMIN_PASSWORD=… NODE_ENV=production node server/server.js --empty` once, then start it normally with a process manager (systemd, pm2 or similar).
3. Put it behind a reverse proxy (nginx, Caddy) with HTTPS, and set `NB_SECURE_COOKIES=1`. Allow upload bodies of 25 MB.
4. Back up the `data/` folder (database and files). SQLite's WAL mode allows a hot copy using `sqlite3 data/nbacademy.db ".backup backup.db"`.

Example nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 25m;
}
```

## Limits of this version

- **Scale:** the server keeps all data in memory and saves changed rows to SQLite. That suits a school or company with up to a few thousand users. Larger sites would move per-request reads to SQL queries and run several processes.
- **Background jobs** (deadline reminders, overdue locks, recertification, email delivery) run inside the server process every 5 minutes and every 30 seconds. Run one server process per data folder.
- **Not included from Moodle:** SCORM 2004 / xAPI, LTI, H5P, plagiarism plugins, mobile app web services, multi-language packs, and the plugin system. See COVERAGE.md for the remaining limits.

## Starting password for new accounts

Every new account starts with the password **`Welcome@1`** and must choose its own password at first sign-in. This covers accounts added in Site administration › Users without a password, CSV uploads with an empty password, the install `admin` account and the built-in administrators. Accounts created through single sign-on or LDAP are the exception: they use the company sign-in instead. To use a different starting password, set `NB_DEFAULT_PASSWORD` on the server. Anyone who knows someone's username can sign in with the starting password until that person has signed in once, so ask new users to sign in soon after their account is created.

## Built-in site administrators

`server/site-admins.js` lists email addresses that are always site administrators:

- geetansh.kumar@nobroker.in
- rohit.chakrabarti@nobroker.in
- gaurav.garg@nobroker.in

Every time the server starts, it makes sure each address has an administrator account. A missing account is created with a username taken from the email (for example `geetansh.kumar`) and the starting password `Welcome@1`. It is also sent a welcome email with a set-password link, which is printed in the server console too, in case email is not set up yet. An existing built-in account that has never been signed in to is given the starting password once. An existing account with that email is given administrator access and reactivated. With single sign-on turned on, they can also sign in through it, because accounts are matched by email.

These accounts cannot be deleted or suspended in the app. Their administrator access and email address cannot be changed there either. To add more without editing the file, set `NB_SITE_ADMINS="a@company.com,b@company.com"`. To remove someone, delete their line and restart. They then become an ordinary administrator, managed in Site administration › Users.

## Connecting your company systems

- **Email:** Site administration › Email, SSO and LDAP › Email (SMTP). Enter your mail server, then "Send a test email". Until it is on, every email is kept in the Email log.
- **Single sign-on:** register `https://YOUR-SITE/auth/sso/callback` as a redirect URI with your OpenID Connect provider, then enter the issuer URL, client ID and secret. Users are matched by email address.
- **LDAP / Active Directory:** enter the server URL (`ldaps://…` recommended) and a bind DN pattern containing `{username}`, then "Test a sign-in".
- **Custom domain:** set General › Site address, point DNS at the server and terminate HTTPS at the reverse proxy.
