/*
 * Built-in site administrators.
 *
 * Every time the server starts, each address below is made a site administrator:
 *  - if no account has this email, one is created with the starting password (Welcome@1, or
 *    NB_DEFAULT_PASSWORD if set), which must be changed at first sign-in. A "set your password"
 *    link is also emailed and printed to the server console;
 *  - if such an account exists but has never been signed in to, it is given the starting password once;
 *  - if an account already has this email, it is given administrator access and reactivated.
 * These accounts cannot be deleted, suspended or have administrator access removed in the app.
 * To remove someone, delete their line here and restart the server; they then become an
 * ordinary administrator that can be managed in Site administration › Users.
 *
 * More addresses can be added without editing this file:
 *   NB_SITE_ADMINS="first.person@company.com,second.person@company.com"
 */
'use strict';
module.exports = [
  'geetansh.kumar@nobroker.in',
  'rohit.chakrabarti@nobroker.in',
  'gaurav.garg@nobroker.in',
];
