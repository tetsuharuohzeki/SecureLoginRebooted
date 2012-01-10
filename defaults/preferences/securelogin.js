/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Use the protected login.
 */
pref("extensions.securelogin.loginWithProtection", true);

/**
 * Override the login form action & method
 * if the login form's action or method are overwritten by someone,
 * when using normal login.
 */
pref("extensions.securelogin.overrideFormAction", true);

/**
 * Change Firefox default setting.
 * Set password to form if this pref is true.
 * However this behavior is not secure completely.
 * If a page has XSS risk,
 * it's possible that an evil person steals the password.
 */
pref("signon.autofillForms", false);
