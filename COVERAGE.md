# Lifecycle guide coverage

How NB Academy meets each requirement in *LMS Complete User Lifecycle and Operations Guide*. "Tested" means covered by `test/api.test.js` (70 tests) and the browser click-through of both editions.

## 1. Learner

| Requirement | Where | Notes |
|---|---|---|
| Automated welcome email with login link | Welcome template, Email log | Sent on user creation, CSV upload, rule or SSO/LDAP creation. Link sets the password (valid 7 days). Tested with a fake SMTP server. |
| Company SSO / MFA | Login page, Profile › Two-step sign-in, Admin › Security, Admin › Email, sign-in and meetings | OpenID Connect (Entra ID, Google, Okta…) with PKCE and signature checks; TOTP authenticator codes; policy can require MFA for admins or everyone. Tested with a fake identity provider. |
| First login: set password, accept terms, accessibility | Onboarding screens | Forced password change (policy enforced), terms with versioning, contrast, text size, captions, reduced motion. |
| Dashboard tabs: Assigned, In progress, Completed (scores, certificates), Overdue (locked), Course library | Dashboard tiles, My learning | Completed tab lists grades and certificate PDFs. |
| Auto-move to In progress | Opening a course | Recorded on first visit. |
| Resume where you left off | Dashboard and course "Resume", video, SCORM | Video timestamp and SCORM slide/suspend data saved across sessions. Switching tabs pauses a video and offers "Resume from m:ss"; a reloaded tab reopens the same page. Tested. |
| Pre-tests and step-by-step unlocking | Quiz "Pre-test" option; course "Step-by-step" setting; "Only available after" on any activity | Final assessments unlock after earlier modules. |
| Timed quizzes, attempt limits, instant MC grading, written work to trainer | Quiz, Assignment, Essay questions | Essays and assignments go to the trainer's grading queue. |
| Mandatory feedback before certificate | Feedback survey activity; certificate "requires feedback" | |
| Auto-move to Completed after passing | Quiz pass mark; course completion | Completion needs the pass mark where one is set. |
| Verifiable PDF certificate / badge | Certificate activity, /cert/CODE, /cert/CODE.pdf | Auto-issued; badges as before. |
| Validity and re-enrolment 30 days before expiry | Certificate "valid for days"; Admin › Notifications | Days before expiry configurable. Tested. |
| Deadline warnings (T-7, T-3, T-24h) | Scheduler; Admin › Notifications | Schedule configurable. Tested. |
| Automatic hard lockout | Course lock screen | Content and actions blocked server-side. Tested. |
| Request Access with mandatory justification | Lock screen | |
| Approval with new deadline, progress intact | Approvals | Reject requires remarks. Tested. |

## 2. Team Lead

| Requirement | Where |
|---|---|
| Role toggle Learner View / Team Lead Workspace | View switcher in the top bar |
| Scoped visibility to mapped team | Cohort mapping (Admin › Cohorts and mapping). Tested. |
| Status distribution, at-risk filter, one-click nudges | Team workspace (single and bulk reminders) |
| Team analytics: completion rates, training hours | Team workspace: by course and by member |
| Boundary: no course creation, user management or assignment | Team Lead role permissions. Tested. |

## 3. Trainer

| Requirement | Where |
|---|---|
| Role toggle, scoped to tagged courses and cohorts | View switcher; Trainer workspace |
| Direct assignment of courses and learning paths to learners or cohorts | Assign training (with due date, mandatory flag). Scope enforced. Tested. |
| ILT/VILT: rosters, attendance, recordings | Live session activity: in person, outside link, or a video room inside NB Academy (self-hosted Jitsi, signed links). Email invitations from the site's address, updates and cancellations; attendance recorded on joining. Tested. |
| Subjective grading with inline rubric feedback | Assignment rubrics, essay grading |
| Reset or grant extra quiz attempts | Quiz results table. Tested. |
| Course analytics: enrolment vs completion, time to complete, drop-off | Course › Reports, Trainer workspace |
| Assessment item analysis: pass/fail, averages, distractors | Quiz page and Reports |
| Cannot create or edit courses and quizzes | Trainer role permissions. Tested. |

## 4. Administrator

| Requirement | Where |
|---|---|
| Logos, brand colours, custom domain, certificate templates | Admin › Branding and certificates; General › Site address |
| Notification engine: email and in-app templates | Admin › Notifications and terms; Email log |
| Password rules, session timeouts, SSO/LDAP | Admin › Security; Admin › Email, sign-in and meetings. Tested. |
| User CRUD, bulk CSV, suspend/delete, unlock, reset passwords | Admin › Users, Upload users, user profile |
| Personas (Learner, Trainer, Team Lead, Administrator, in any combination) | Add a new user, and Personas on each user's profile, including cohorts and courses. Anyone with more than one persona, administrators included, switches views from the top bar. Tested. |
| Login As | Users and profile |
| Cohort, trainer and team lead mapping | Admin › Cohorts and mapping |
| SCORM, video, PDF, slide decks; central question bank | SCORM 1.2 and 2004, Video, File (PDF inline); Admin › Question bank (edits sync to quizzes) |
| Version control (keep progress or restart) | Course › Settings › Status and versions, with rollback |
| Delete drafts, archive completed courses | Course settings. Tested. |
| Automatic assignment rules | Admin › Learning paths and rules. Tested. |
| Overdue approval queue | Approvals |
| KPIs, active users, completion; drill-down by team, trainer, course, learner | Analytics, CSV export |
| Immutable audit logs | Admin › Audit log: hash-chained, database refuses edits, integrity check. Tested. |
| Preview / test mode | Quiz and lesson preview; "Log in as" |

## Added on request

| Requirement | Where |
|---|---|
| Super administrator can remove other administrators | Users list: Remove admin access and Delete, for super administrators only (server/site-admins.js). Tested. |
| Super administrator holds every role (Learner, Trainer, Team Lead, Admin) | View switcher; Trainer and Team Lead workspaces show everything. Tested. |
| Team dropdown instead of Company/Department when adding users | Add a new user, user profile, CSV upload; editable Team list. Tested. |
| Excel template for bulk user upload; .xlsx uploads | Upload users: Download Excel template (dropdowns for team, course, role). Tested. |
| Content Moderator access: users, courses, content, quizzes, plus Trainer and Team Lead access; Edit access button | Site administration › Users (Edit access, Access column); view switcher. Tested. |
| Live sessions tab: schedule sessions for any registered users (course and team filters), email invitations, reminders, cancellations, attendance | Live sessions tab (administrators). Tested. |
| Subjective quiz questions graded by trainers; pending grading listed in Notifications | Quiz editor (Subjective type); Notifications › Grading to do; bell menu. Tested. |
| Bulk upload of quiz questions (Excel/CSV: Sno, Question Text, A–F, Correct Answer) | Quiz page: Upload questions, template download, preview, add or replace. Tested. |
| Google Forms-style question editor for quizzes | Quiz page: question cards with autosave, reorder, duplicate. Tested. |
| Designed welcome email; one colour theme for all emails | Notifications and terms › Email design; template previews. Tested. |
| Browser tab icon matches the NB Academy logo | Every page; follows Admin › Branding (uploaded logo or brand colours). Tested. |
| Group chat when a course is created, for trainers and admins | New course form option; course Group chats tab; Messages. Tested. |

## Limits and decisions

- **Integrations need your details.** Email, SSO and LDAP were tested against simulated servers. Connecting them to your real mail server, identity provider and directory needs those settings.
- **Course versions.** When a new version is published, learners in progress either keep their progress on the updated content or restart on it. They cannot stay on the old content side by side.
- **SCORM.** SCORM 1.2 and 2004 are supported, packages up to 1 GB. xAPI, cmi5 and SCORM 2004 sequencing between several SCOs are not. In the preview edition, only single-page packages play.
- **Slide decks.** PowerPoint files are downloadable, not shown inline. Export to PDF to show slides inside a course.
- **MFA set-up.** Uses a setup key typed into the authenticator app. There is no QR code.
- **Assigning an individual assessment.** Trainers assign courses or learning paths. To assign a single assessment, put it in its own short course.
- **Custom domains.** Set the site address, point DNS at the server and add HTTPS at the reverse proxy. This is not automated.
