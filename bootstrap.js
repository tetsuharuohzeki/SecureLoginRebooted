/* vim: set filetype=javascript shiftwidth=2 tabstop=2 expandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { classes: Cc, interfaces: Ci, utils: Cu } = Components;

// Bootstrap Addon Reason Constants:
var APP_STARTUP     = 1;
var APP_SHUTDOWN    = 2;
var ADDON_ENABLE    = 3;
var ADDON_DISABLE   = 4;
var ADDON_INSTALL   = 5;
var ADDON_UNINSTALL = 6;
var ADDON_UPGRADE   = 7;
var ADDON_DOWNGRADE = 8;

Cu.import("resource://gre/modules/Services.jsm");


/**
 *
 * bootstrapped addon interfaces
 *
 */
function startup(aData, aReason) {
  Cu.import("chrome://securelogin/content/SecureloginService.jsm");
  Cu.import("chrome://securelogin/content/SecureloginChrome.jsm");

  /**
   * Use the protected login.
   */
  Services.prefs.setBoolPref("extensions.securelogin.loginWithProtection", true);
  /**
   * Override the login form action & method
   * if the login form's action or method are overwritten by someone,
   * when using normal login.
   */
  Services.prefs.setBoolPref("extensions.securelogin.overrideFormAction", true);
  /**
   * Change Firefox default setting.
   * Set password to form if this pref is true.
   * However this behavior is not secure completely.
   * If a page has XSS risk,
   * it's possible that an evil person steals the password.
   */
  Services.prefs.setBoolPref("signon.autofillForms", false);


  SecureloginService.registerUIStyleSheet();

  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    DOMEventListener.init(domWindow);
  }

  Services.wm.addListener(WindowListener);
}

function shutdown(aData, aReason) {
  // if the application is shutdown time, we don't have to call these step.
  if (aReason === APP_SHUTDOWN) {
    return;
  }

  Services.wm.removeListener(WindowListener);

  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    DOMEventListener.finalize(domWindow);
  }

  SecureloginService.unregisterUIStyleSheet();

  Services.prefs.clearUserPref("extensions.securelogin.loginWithProtection");
  Services.prefs.clearUserPref("extensions.securelogin.overrideFormAction");
  Services.prefs.clearUserPref("signon.autofillForms");

  Cu.unload("chrome://securelogin/content/SecureloginService.jsm");
  Cu.unload("chrome://securelogin/content/SecureloginChrome.jsm");
  Cu.unload("chrome://securelogin/content/SecureloginContent.jsm");
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}

// nsIWindowMediatorListener
let WindowListener = {

  onOpenWindow: function (aXulWindow) {
    let domWindow = aXulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDOMWindow);

    // Wait finish loading
    domWindow.addEventListener("load", function onLoad(aEvent) {
      domWindow.removeEventListener("load", onLoad, false);

      DOMEventListener.init(domWindow, aEvent);
    }, false);
  },

  onCloseWindow: function (aXulWindow) {},

  onWindowTitleChange: function (aWindow, aNewTitle) {}
};


let DOMEventListener = {

  init: function (aDomWindow, aEvent) {
    let windowType = aDomWindow.document.
                     documentElement.getAttribute("windowtype");
    // If this isn't a browser window then abort setup.
    if (windowType !== "navigator:browser") {
      return;
    }

    let secureloginBrowser = new SecureloginChrome(aDomWindow);
    aDomWindow.SecureloginBrowser = secureloginBrowser;
  },

  finalize: function (aDomWindow) {
    if (!!aDomWindow.SecureloginBrowser) {
      aDomWindow.SecureloginBrowser.finalize();
      delete aDomWindow.SecureloginBrowser;
    }
  }
};
