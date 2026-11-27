/*
 * Site administrator accounts managed by the server configuration.
 *
 * ADMINS: every time the server starts, each address is made a site administrator.
 *  - If no account has this email, one is created with the starting password (Welcome@1, or
 *    NB_DEFAULT_PASSWORD if set), which must be changed at first sign-in. A "set your password"
 *    link is also emailed and printed to the server console.
 *  - If such an account exists but has never been signed in to, it is given the starting password once.
 *  - If an account already has this email, it is given administrator access and reactivated.
 *  These accounts cannot be deleted, suspended or have administrator access removed in the app.
 *  More addresses can be added without editing this file: NB_SITE_ADMINS="a@company.com,b@company.com"
 *
 * REMOVE: accounts (by username or email) that are deleted ONCE, at the next start after they are added here, if they exist
 *  (recorded in S.site.accountsRemoved). An account created again later (for example assigned an HR course) is kept.
 *  Their enrolments, roles and cohort mappings go too; their past posts and grades show as
 *  "Former user", and the deletion is recorded in the audit log. Accounts listed in ADMINS are
 *  never removed. Not applied when the server runs with --demo. Override with NB_REMOVE_ACCOUNTS="user1,user2@company.com" (empty = remove none).
 *
 * UNENROL_LEARNER: accounts (by username or email) removed from every course they are enrolled in AS A LEARNER,
 *  once: the next start-up does it and records it (S.site.learnerUnenrolled), so later enrolments are kept.
 *  Trainer, editing and other roles stay. Progress, attempts and grades are kept (as with "Remove from course").
 *  Each removal is recorded in the audit log. Not applied when the server runs with --demo.
 */
'use strict';
module.exports = {
  admins: [
    'geetansh.kumar@nobroker.in',
  ],
  remove: [
    'admin',                          // the "Admin User" account from the demo data or a first install
    'rohit.chakrabarti@nobroker.in',
    'gaurav.garg@nobroker.in',
  ],
  // Once at start-up: move learners with their progress from a course (e.g. a copy) into another, by full name or short name,
  // after a database backup in data/backups/. Same as course Settings › "Move learners from another course".
  mergeCourses: [
    {from:'CPMS Tenant Search - NHT (new)', into:'CPMS Tenant Search - NHT'},   // requested 21 Nov 2026
  ],
  unenrolLearner: [
    'geetansh.kumar@nobroker.in',     // requested 10 Nov 2026
  ],
};
