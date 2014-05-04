/* vim: set filetype=javascript shiftwidth=2 tabstop=2 expandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let EXPORTED_SYMBOLS = ["SecureloginChrome"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("chrome://securelogin/content/SecureloginService.jsm");
Cu.import("chrome://securelogin/content/SecureloginContent.jsm");


const DOORHANGER_NOTIFICATION_ID = "securelogin-loginFound";
const DOORHANGER_ANCHOR_ID       = "securelogin-notification-icon";

let contentHandlerMap = new WeakMap();
let secureLoginInfoMap = new WeakMap();

/**
 * @constructor
 *
 * @param {ChromeWindow} aChromeWindow
 */
function SecureloginChrome (aChromeWindow) {
  this.window = null;
  this._DOMCommand = null;
  this._DOMKeyset = null;
  this._DOMDoorhander = null;

  this.initialize(aChromeWindow);
}
SecureloginChrome.prototype = {

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMEventListener,
                                         Ci.nsISupports]),

  initialize: function (aChromeWindow) {
    this.window = aChromeWindow;

    SecureloginService.addMessageListener(aChromeWindow, "loginFound", this);
    contentHandlerMap.set(aChromeWindow, new SecureloginContent(aChromeWindow));

    let gBrowser = aChromeWindow.gBrowser;
    let secureloginContent = contentHandlerMap.get(aChromeWindow);

    this._DOMDoorhander = this.initDoorHangerDOM();
    this.initCommandSet();

    gBrowser.tabContainer.addEventListener("TabOpen", this, false);
    gBrowser.tabContainer.addEventListener("TabClose", this, false);
    gBrowser.addTabsProgressListener(secureloginContent);

    // Add event listener to xul:browser element,
    // because TabOpen event is not fired when opens browser window.
    let tabs = gBrowser.tabContainer.childNodes;
    for (let tab of tabs) {
      let browser = tab.linkedBrowser;
      browser.addEventListener("DOMContentLoaded", secureloginContent, true, true);
    }

    aChromeWindow.addEventListener("unload", this, false);
  },

  finalize: function () {
    let window = this.window;
    let gBrowser = window.gBrowser;
    let secureloginContent = contentHandlerMap.get(window);

    window.removeEventListener("unload", this);

    gBrowser.removeTabsProgressListener(secureloginContent);
    gBrowser.tabContainer.removeEventListener("TabClose", this, false);
    gBrowser.tabContainer.removeEventListener("TabOpen", this, false);

    // Remove event listener from xul:browser element,
    // because TabClose event is not fired when closes browser window.
    let tabs = gBrowser.tabContainer.childNodes;
    for (let tab of tabs) {
      let browser = tab.linkedBrowser;
      browser.removeEventListener("DOMContentLoaded", secureloginContent, true);
    }

    SecureloginService.sendMessage(this.window, "finalize", null);
    SecureloginService.removeMessageListener(this.window, "loginFound", this);

    this._DOMCommand.parentNode.removeChild(this._DOMCommand);
    this._DOMKeyset.parentNode.removeChild(this._DOMKeyset);
    this._DOMDoorhander.parentNode.removeChild(this._DOMDoorhander);

    this._DOMCommand = null;
    this._DOMKeyset = null;
    this._DOMDoorhander = null;
    this.window = null;
  },

  onLoginFound: function (aMessage) {
    let browser = aMessage.browser;
    secureLoginInfoMap.set(browser, {
      logins  : aMessage.logins,
      location: browser.currentURI,
    });
    this.showNotification(browser);
  },

  showNotification: function (aBrowser) {
    let that = this;
    let GetStringFromName = SecureloginService.stringBundle.GetStringFromName;

    let mainAction = {
      label    : GetStringFromName("doorhanger.login.label"),
      accessKey: GetStringFromName("doorhanger.login.accesskey"),
      callback : function () {
        that.loginSelectedBrowser();
      },
    };

    let switchLoginModeAction = {
      label    : GetStringFromName("doorhanger.switchLoginMode.label"),
      accessKey: GetStringFromName("doorhanger.switchLoginMode.accesskey"),
      callback : function () {
        that.switchLoginModeConfig();
      },
    };

    this.window.PopupNotifications.show(
      aBrowser,
      DOORHANGER_NOTIFICATION_ID,
      GetStringFromName("doorhanger.description"),
      DOORHANGER_ANCHOR_ID,
      mainAction,
      [switchLoginModeAction],
      {
        persistence        : 0,
        timeout            : null,
        persistWhileVisible: false,
        dismissed          : true,
        eventCallback      : null,
        neverShow          : false,
        removeOnDismissal  : false,
       }
    );
  },

  loginSelectedBrowser: function () {
    let browser = this.window.gBrowser.selectedBrowser;
    this.login(browser);
  },

  login: function (aBrowser) {
    if (!secureLoginInfoMap.has(aBrowser)) {
      return;
    }

    let loginInfo = secureLoginInfoMap.get(aBrowser);
    if (loginInfo.location.equals(aBrowser.currentURI)) {
      let loginId = this.getLoginId(loginInfo);
      SecureloginService.sendMessage(this.window, "login", { browser: aBrowser,
                                                             loginId: loginId });

      let n = this.window.PopupNotifications.getNotification(
                            DOORHANGER_NOTIFICATION_ID,
                            aBrowser);
      if (n) {
        n.remove();
      }
    }
  },

  getLoginId: function (aLoginInfo) {
    let loginId = "";
    let logins  = aLoginInfo.logins;
    if (logins) {
      if (logins.length > 1) {
        loginId = this._selectLoginId(logins);
      }
      else {
        loginId = logins[0];
      }
    }
    return loginId;
  },

  _selectLoginId: function (aLoginsArray) {
    let loginId  = null;
    let selected = {};

    let stringBundle = SecureloginService.stringBundle;
    let title = stringBundle.GetStringFromName("prompt.selectLoginId.title");
    let description = stringBundle.GetStringFromName("prompt.selectLoginId.description");

    let result   = Services.prompt.select(this.window,
                                          title,
                                          description,
                                          aLoginsArray.length,
                                          aLoginsArray,
                                          selected);
    if (result) {
      loginId = aLoginsArray[selected.value];
    }
    return loginId;
  },

  switchLoginModeConfig: function () {
    let browser = this.window.gBrowser.selectedBrowser
    let uri = browser.currentURI;

    let stringBundle = SecureloginService.stringBundle;
    let title = stringBundle.GetStringFromName("prompt.switchLoginModeConfig.title");
    let description = stringBundle.GetStringFromName("prompt.switchLoginModeConfig.description");
    let useNormal = Services.prompt.confirm(this.window, title, description);

    SecureloginService.setLoginMode(uri, !useNormal, this.window);

    // show the notification again.
    this.showNotification(browser);
  },

  receiveMessage: function (aMessage) {
    let object = aMessage.json;
    switch (aMessage.name) {
      case "loginFound":
        this.onLoginFound(object);
        break;
    }
  },

  /* EventListner */
  handleEvent: function (aEvent) {
    switch (aEvent.type) {
      case "unload":
        this.onUnload(aEvent);
        break;
      case "TabOpen":
        this.onTabOpen(aEvent);
        break;
      case "TabClose":
        this.onTabClose(aEvent);
        break;
    }
  },

  onUnload: function (aEvent) {
    this.finalize();
  },

  onTabOpen: function (aEvent) {
    let tab = aEvent.target;
    let browser = tab.linkedBrowser;
    let secureloginContent = contentHandlerMap.get(this.window);
    browser.addEventListener("DOMContentLoaded", secureloginContent, true, true);
  },

  onTabClose: function (aEvent) {
    let tab = aEvent.target;
    let browser = tab.linkedBrowser;
    let secureloginContent = contentHandlerMap.get(this.window);
    browser.removeEventListener("DOMContentLoaded", secureloginContent, true);
  },

  initDoorHangerDOM: function () {
    let box = this.window.document.getElementById("notification-popup-box");

    let img = this.window.document.createElement("image");
    img.setAttribute("id", "securelogin-notification-icon");
    img.setAttribute("class", "notification-anchor-icon");
    img.setAttribute("role", "button");

    box.appendChild(img);

    return img;
  },

  initCommandSet: function () {
    this._DOMCommand = this._createCommand();
    this._DOMKeyset = this._createKeySet();
  },

  _createKeySet: function () {
    let box = this.window.document.getElementById("mainCommandSet");
    let key = this.window.document.createElement("key");
    key.setAttribute("id", "securelogin-keyset-login");
    key.setAttribute("command", "securelogin-command-login");
    key.setAttribute("modifiers", "accel, alt");
    key.setAttribute("key", "N");

    box.appendChild(key);

    return key;
  },

  _createCommand: function () {
    let box = this.window.document.getElementById("mainCommandSet");
    let command = this.window.document.createElement("command");
    command.setAttribute("id", "securelogin-command-login");
    command.setAttribute("oncommand", "window.SecureloginBrowser.loginSelectedBrowser();");

    box.appendChild(command);

    return command;
  },

};
