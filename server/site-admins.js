/*
 * Built-in site administrators.
 *
 * Every time the server starts, each address below is made a site administrator:
 *  - if no account has this email, one is created and a "set your password" link is emailed
 *    (and printed to the server console, in case email is not set up yet);
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
