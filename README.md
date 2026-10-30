# NB Academy

A learning management system modelled on Moodle, extended for the full corporate training lifecycle: assigned training with deadlines, automatic lockout and access approvals, Learner / Team Lead / Trainer / Administrator workspaces, live sessions, SCORM and video, recertification, single sign-on, LDAP, two-step sign-in, email notifications, analytics and a tamper-evident audit log. See **COVERAGE.md** for a requirement-by-requirement map of the lifecycle guide.

**No external dependencies.** The server uses only Node.js built-in modules (`node:http`, `node:sqlite`, `node:crypto`, `node:net`, `node:tls`, `node:zlib`). Email (SMTP), LDAP, OpenID Connect, zip extraction for SCORM and PDF certificates are implemented in this repository. The browser code is plain HTML, CSS and JavaScript, with no frameworks, CDNs or web fonts. `npm install` is not needed.

## Quick start

Requires **Node.js 22.13 or newer** (for the built-in SQLite module).

```bash
node server/server.js             # http://localhost:8080, a clean site (sign in as geetansh.kumar / Welcome@1)
node server/server.js --demo      # the same, with demo courses and people (password "demo")
```

A new site starts **empty**. The administrators listed in `server/site-admins.js` are its only accounts.

**Demo data is only for trying the system out.** Start with `--demo` (or set `NB_DEMO=1`) to load demo courses and people, and keep using `--demo` on every start. A site holding demo data that is started without `--demo` is cleaned automatically:
- a full backup of the database and files is written to `data/backups/before-demo-removal-…/`;
- the demo courses, cohorts, paths and every `@nbacademy.example` account are removed;
- your own accounts, site settings (branding, security, email, SSO) and the audit history are kept.

The demo accounts all use the password `demo`:

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

Other commands:

```bash
node server/server.js --reset --demo   # wipe the database and load fresh demo data (local testing only)
node --test test/api.test.js           # run the API test suite (69 tests, including fake SMTP, LDAP and OIDC servers)
node tools/build-preview.js            # build dist/preview.html (browser-only demo edition)
```

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `NB_DATA_DIR` | `./data` | Database (`nbacademy.db`) and uploaded files (`files/`) |
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
| Files | Up to 1 GB (`NB_MAX_UPLOAD_MB`), stored on disk, permission-checked downloads | Up to 2 MB, kept in the browser |
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
| Messaging, notifications | Private messages, course group chats, notification bell, notifications page |
| Roles and capabilities | 38+ capabilities, 6 built-in roles (Administrator, Trainer, Course author, Non-editing trainer, Learner, Team Lead), custom roles, site role assignments, comparison matrix |
| Upload users (CSV) | Preview with validation, enrolments and groups, update existing users |
| Backup and restore | Course backup with or without user data; restore as a new course |
| Logs, reports | Site logs, course logs, course report |
| Log in as, suspend users | Included |

## Deploying

**Current production setup:** NB Academy runs in Docker, with an updater that checks `main` on GitHub every 5 minutes, pulls, runs the tests and restarts. A push to `main` is live within about 5 minutes. The steps below are for a plain (non-Docker) install. `tools/update-server.sh` does the same pull, test and restart by hand.

1. Install Node.js 22.13+ on the server and copy this folder.
2. Start it with `NODE_ENV=production node server/server.js` (sign in as `geetansh.kumar` / `Welcome@1`), using a process manager with a process manager (systemd, pm2 or similar).
3. Put it behind a reverse proxy (nginx, Caddy) with HTTPS, and set `NB_SECURE_COOKIES=1`. Allow upload bodies of 1 GB (SCORM packages with video are often well over 25 MB).
4. Back up the `data/` folder (database and files). SQLite's WAL mode allows a hot copy using `sqlite3 data/nbacademy.db ".backup backup.db"`.

Example nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 1g;
  client_body_timeout 600s;
  proxy_read_timeout 600s;
  proxy_request_buffering off;
}
```

## Limits of this version

- **Scale:** the server keeps all data in memory and saves changed rows to SQLite. That suits a school or company with up to a few thousand users. Larger sites would move per-request reads to SQL queries and run several processes.
- **Background jobs** (deadline reminders, overdue locks, recertification, email delivery) run inside the server process every 5 minutes and every 30 seconds. Run one server process per data folder.
- **Not included from Moodle:** xAPI / cmi5, SCORM 2004 sequencing between several SCOs, LTI, H5P, plagiarism plugins, mobile app web services, multi-language packs, and the plugin system. See COVERAGE.md for the remaining limits.

## Starting password for new accounts

Every new account starts with the password **`Welcome@1`** and must choose its own password at first sign-in. This covers accounts added in Site administration › Users without a password, CSV uploads with an empty password, and the built-in administrators. Accounts created through single sign-on or LDAP are the exception: they use the company sign-in instead. To use a different starting password, set `NB_DEFAULT_PASSWORD` on the server. Anyone who knows someone's username can sign in with the starting password until that person has signed in once, so ask new users to sign in soon after their account is created.

## Email design

- Every email is sent as **HTML with a plain-text version**, in one shared design: a coloured header with the subject, the message, a button for the main link, and a footer.
- The **welcome email** uses its own designed template: an icon header with "Welcome Aboard!", a login details box with a person icon, a **Set Your Password →** button, and a 7-day notice with a clock icon.
- Other emails get the same header, with an icon that suits each one (bell, lock, award, key, book, calendar, check, mail).
- The icons are PNG images that NB Academy draws itself in the email colour, because mail apps don't show SVG. They are served publicly from `/email-assets/` and cached, and emails link to them by the site address.
- The colour (default `#FB3753`) is set once in Site administration › Notifications and terms › **Email design**, and every email follows it.
- Each template's subject, plain text and optional designed HTML can be edited and **previewed** there. Its HTML can use `{brand}`, `{brandSoft}` and `{brandLine}`. "Restore default" brings back the original.
- The Email log can show any sent email as it was sent.

## Super administrator

The accounts listed under `admins` in `server/site-admins.js` (today geetansh.kumar@nobroker.in) are **super administrators**.
- Only a super administrator can take administrator access away from other administrators, suspend them or delete them. The Users list shows them **Remove admin access** and **Delete** buttons on administrator rows.
- Removing access keeps the account, with the person's learner, trainer or team lead personas. The person is notified, and the change is recorded in the audit log.
- Other administrators can still create administrators. They cannot remove or demote one.
- A super administrator holds **every role** (Learner, Trainer, Team Lead and Administrator) and switches between them with the view switcher. As Trainer they see every active course and cohort, as Team Lead every cohort, and as Learner their own assigned training; anyone who assigns training can assign it to them. These roles cannot be taken away in the app.

## Course group chats

Trainers of a course and administrators can create group chats for it:
- when they create a course ("Create a group chat for everyone in this course", ticked by default);
- or at any time from the course's **Group chats** tab.

A chat is either **everyone in the course**, where people enrolled later join automatically, or **chosen people** from the course. Members see their chats in **Messages**, next to one-to-one conversations, with unread counts. They are told when they're added to a chat.

The course's trainers and administrators can read every chat in the course, and can rename, change members or delete it. Chats of archived courses are read-only, and a course's chats are deleted with the course.

## SCORM packages

- **SCORM 1.2 and SCORM 2004** (2nd, 3rd and 4th editions) both work. This covers exports from Articulate Storyline and Rise, iSpring, Adobe Captivate and similar tools.
- Upload the **.zip exactly as exported**. It must contain `imsmanifest.xml` somewhere inside. These all work: the manifest at the top, inside one or more folders, a zip that contains the package's .zip, and zips made on a Mac (the hidden `__MACOSX` folder is ignored). A zip holding several packages is refused with their names, so each can be uploaded as its own activity.
- The start page is found the way the standard describes: the first item of the default organisation, its launch parameters, and `xml:base`.
- Packages up to 1 GB are accepted. Audio and video inside them stream and can be skipped through.
- Files over 16 MB upload in **8 MB pieces, 4 at a time**, each on its own connection, and are joined on the server. Over a long-distance link (the server is in Helsinki, about 170 ms from Bengaluru), one connection is slow, but several together use the full internet speed. A failed piece is retried up to 3 times, and an upload in progress survives a server restart. Files of 16 MB or less use a single upload.
- While a file uploads, a progress bar shows the percentage, size, speed and time left, with a Cancel button. Saving waits until the upload has finished, and SCORM packages show "Unpacking the package…" while the server opens them.
- Trainers and admins see the detected SCORM version and start page on the activity page.
- A package with several SCOs plays its first SCO; SCORM 2004 sequencing rules between SCOs are not applied.
- If the server sits behind nginx, raise its upload limit, or big packages fail with "too large". See Deploying.

## Uploading users in bulk

Site administration › **Upload users** offers a **Download Excel template** button. The template has:
- a **Users** sheet with the column headers NB Academy expects: username, firstname, lastname, email, team, password, course1–3, role1–3, group1–3;
- dropdowns for team, course and role, filled with this site's teams, active courses and roles;
- an **Instructions** sheet with an example row.

Fill it in and choose it in the same page. **Excel (.xlsx) and CSV files both work**, and pasting CSV is still possible. Header names are forgiving: "First Name", "first name" and "firstname" are all understood. A preview shows every row before anything is created. The .xlsx file is written and read by NB Academy itself, with no library.

## Building quizzes

Questions are edited directly on the quiz page, one card per question, much like Google Forms:
- type the question, pick its type (Multiple choice, True / False, Short answer, Number, Subjective), and click the circle next to the correct answer;
- press Enter in an option to add the next one, or use "Add option"; short answers can have several accepted answers;
- each card has points, move up and down, duplicate (the copy appears right below) and delete;
- **changes save automatically**, and the card says "Saved", or what is still missing (for example "Click the circle next to the correct answer");
- creating a new quiz takes you straight to an empty question card.

## Content Moderators

**Content Moderator** is an access type between Trainer and Administrator, for the team that builds training. A content moderator can add and edit users (and upload them in bulk), create courses, upload course content, build quizzes (including bulk question upload) and use the question bank, in every course. They also have all Trainer and Team Lead access, for every course and cohort. They switch between Content Moderator, Trainer and Team Lead with the view switcher.

They cannot change site settings, roles or Live sessions, delete courses or users, log in as other people, or change the account of an administrator or another content moderator. Only administrators can grant or remove Content Moderator access.

**Edit access**: in Site administration › Users, each person has an **Edit access** button showing what they can do now (Learner, Trainer, Team Lead, Content Moderator, Administrator) and letting you change it. The Access column of the list shows the same.

## Live sessions

### Live sessions tab (administrators)

Administrators have a **Live sessions** tab next to Courses. **Schedule a live session** asks for a title, date and time, duration, where it happens (video room in NB Academy, an outside meeting link, or in person) and an optional description, then the people to invite: everyone registered in NB Academy is listed, with a **course filter** (only people enrolled in that course), a team filter, a search box, "Select all shown" and "Selected only". Saving emails the invitations from NB Academy's own address, with a link to the session page. Editing emails an update, removing someone emails them a cancellation, and **Cancel session** tells everyone (with an optional reason). Everyone invited gets a reminder the day before, sees the session on their dashboard and calendar, and gets the Live sessions tab. Joining the video room records attendance; the session page has the attendance list, which administrators can correct and export as CSV.

### Live sessions inside a course

A **Live session** activity in a course is held in one of three ways: **online in NB Academy** (a video room inside NB Academy), online with an outside meeting link (Zoom, Teams, Meet…), or in person.

- **Scheduling:** the trainer sets the date, time and duration, and types the email addresses to invite. Each address must belong to an NB Academy account; anyone not yet in the course is enrolled as a learner. Invitations go out from NB Academy's own email address (Site administration › Email, sign-in and meetings › Email) with a link that opens the session in NB Academy. Changing the time or place emails an update; removing someone, or deleting the session, emails a cancellation. Invitees also get the usual reminder 24 hours before.
- **Joining:** the Join button appears 15 minutes before the start (60 minutes for trainers). The meeting opens inside NB Academy with camera, microphone, screen sharing and chat. Joining records attendance (present, or late after 10 minutes), which completes the activity; trainers can still correct the roster.
- **Who can get in:** each person receives a meeting link signed by NB Academy, so only NB Academy accounts taking part in the course can join. Trainers and administrators join as moderators (mute others, remove people, record).

### Setting up the meeting server (one time, by whoever runs the server)

The video runs on **Jitsi Meet**, free and open source, installed with Docker (https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker). One server with 4 CPUs and 8 GB of memory comfortably holds sessions of 50 or more people.

1. Give it its own address, for example `meet.nobroker.in`, with HTTPS. Open port **443/TCP** and **10000/UDP** (video).
2. In docker-jitsi-meet's `.env`, after `./gen-passwords.sh`, set:
   ```
   PUBLIC_URL=https://meet.nobroker.in
   ENABLE_AUTH=1
   AUTH_TYPE=jwt
   JWT_APP_ID=nbacademy
   JWT_APP_SECRET=<a long random secret, e.g. from: openssl rand -hex 32>
   JWT_ACCEPTED_ISSUERS=nbacademy
   JWT_ACCEPTED_AUDIENCES=jitsi
   ENABLE_GUESTS=0
   ```
   then `docker compose up -d`.
3. In NB Academy: Site administration › Email, sign-in and meetings › **Live sessions: video meetings**: enter `https://meet.nobroker.in` and the same secret. (Or set `NB_MEET_URL`, `NB_MEET_APP_ID` and `NB_MEET_SECRET` for the NB Academy container; a secret set this way is never stored in the database.)

If the meeting area shows "refused to connect", the meeting server is forbidding embedding: allow framing from NB Academy's address in its web server settings.

## Subjective questions and grading

A quiz question of type **Subjective (graded by a trainer)** lets the learner write a free answer, with optional guidance for the grader and its own marks. When a learner submits, the course's trainers get a notification that opens the answer (if the course has no trainer, its content moderators are told, otherwise the administrators). Until it is graded, the attempt is listed under **Grading to do** at the top of the Notifications page and in the bell menu, and the quiz shows how many answers wait. The trainer enters a mark and a comment on the answer; when every subjective answer is graded, the learner is told, the score counts, and the reminders are marked done.

## Uploading quiz questions in bulk

On a quiz page (edit mode), **⇪ Upload questions** takes an Excel (.xlsx) or CSV file with the columns **Sno** (optional), **Question Text**, options **A** to **F** (at least A and B) and **Correct Answer** (the letter of the right option, or the option's exact text). "Download the template" gives an empty sheet in this format, with a dropdown for the answer. Each row becomes a multiple-choice question worth 1 mark (add a **Marks** column to change that).

You see every question, with the correct option ticked, before anything is saved. If any row has a problem (no question, fewer than two options, an answer that points to an empty option, two answers), nothing is added and each problem is listed with its row number. Questions can be added after the existing ones or replace them.

## Teams

- Each person can belong to a **Team**, chosen from a dropdown when adding or editing them. There is no Company field anywhere, including Analytics and exports; company values saved by older versions are removed at start-up, and the old team name "Training" becomes "Training Team".
- The list starts with 24 teams, from Legal Servicing to Human Resources. Standard teams added in later versions are added to an existing list automatically, unless an administrator removed them. Administrators can change it under Site administration › Users › **Team list**.
- The server only accepts teams on the list, matching without regard to capitals or spacing. CSV uploads use a `team` column; `department` is also accepted.
- Teams are stored as the user's `department`, so assignment rules ("Are in the team…"), cohorts and analytics (Group by Team) use them.

## Usernames

Usernames may use letters (capital or small), numbers, dots, dashes and underscores. They keep the capitalisation they were created with, but sign-in ignores case. `Rahul.Sharma` can sign in as `rahul.sharma`, and no two accounts can differ only in capital letters.

## Built-in site administrators and removed accounts

`server/site-admins.js` controls administrator accounts from the server side.

**`admins`** lists email addresses that are always site administrators. Today there is one: **geetansh.kumar@nobroker.in** (username `geetansh.kumar`, starting password `Welcome@1`).
- Every time the server starts, it makes sure each address has an administrator account.
- A missing account is created with a username taken from the email and the starting password. It is also sent a welcome email with a set-password link, which is printed in the server console too.
- An existing built-in account that has never been signed in to is given the starting password once.
- These accounts cannot be deleted or suspended in the app. Their administrator access and email address cannot be changed there either.
- To add more without editing the file, set `NB_SITE_ADMINS="a@company.com,b@company.com"`.

**`remove`** lists accounts, by username or email, that are deleted when the server starts.
- Today it lists the `admin` account (Admin User) from the demo data, rohit.chakrabarti@nobroker.in and gaurav.garg@nobroker.in.
- Their enrolments, roles, cohort mappings and sessions are removed, and each deletion is recorded in the audit log.
- Content they created stays, such as courses and posts. Their posts and grades show as "Former user".
- An account listed in `admins` is never removed, and neither is the last remaining administrator. The list is not applied when the server runs with `--demo`.
- `NB_REMOVE_ACCOUNTS` overrides this list. Set it to an empty value to remove nothing.

A new site has no `admin` account; the accounts in `admins` are its administrators.

## Connecting your company systems

- **Email:** Site administration › Email, sign-in and meetings › Email (SMTP). Enter your mail server, then "Send a test email" (it saves what is on screen first). App passwords can be pasted with their spaces. If the mail server refuses, the message says why and what to change. Until email is on, emails are kept in the Email log and **not sent**; turning it on sends those from the last 3 days. Google Workspace: `smtp.gmail.com`, port 587, an app password. Microsoft 365: `smtp.office365.com`, port 587. Links in emails use the site address (General › Site address, or `NB_PUBLIC_URL`). Until that is set, they use the address the site is being reached at.
- **Single sign-on:** register `https://YOUR-SITE/auth/sso/callback` as a redirect URI with your OpenID Connect provider, then enter the issuer URL, client ID and secret. Users are matched by email address.
- **LDAP / Active Directory:** enter the server URL (`ldaps://…` recommended) and a bind DN pattern containing `{username}`, then "Test a sign-in".
- **Custom domain:** set General › Site address, point DNS at the server and terminate HTTPS at the reverse proxy.
