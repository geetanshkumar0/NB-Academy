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
 * REMOVE: accounts (by username or email) that are deleted when the server starts, if they exist.
 *  Their enrolments, roles and cohort mappings go too; their past posts and grades show as
 *  "Former user", and the deletion is recorded in the audit log. Accounts listed in ADMINS are
 *  never removed. Override with NB_REMOVE_ACCOUNTS="user1,user2@company.com" (empty = remove none).
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
};
