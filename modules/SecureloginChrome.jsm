/* vim: set filetype=javascript shiftwidth=4 tabstop=4 noexpandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["SecureloginChrome"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
                                  "resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SecureloginService",
                                  "resource://securelogin/SecureloginService.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SecureloginContent",
                                  "resource://securelogin/SecureloginContent.jsm");


const DOORHANGER_NOTIFICATION_ID = "securelogin-loginFound";
const DOORHANGER_ANCHOR_ID       = "securelogin-notification-icon";

let contentHandlerMap = new WeakMap();
let secureLoginInfoMap = new WeakMap();

function SecureloginChrome (aChromeWindow) {
	this.initialize(aChromeWindow);
}
SecureloginChrome.prototype = {

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMEventListener,
	                                       Ci.nsISupports]),

	window: null,

	initialize: function (aChromeWindow) {
		this.window = aChromeWindow;

		aChromeWindow.addEventListener("load", this, false);
		SecureloginService.addMessageListener(aChromeWindow, "loginFound", this);
		contentHandlerMap.set(aChromeWindow, new SecureloginContent(aChromeWindow));
	},

	destroy: function () {
		SecureloginService.sendMessage(this.window, "finalize", null);
		SecureloginService.removeMessageListener(this.window, "loginFound", this);
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

		SecureloginService.setLoginMode(uri, !useNormal);

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
			case "load":
				this.onLoad(aEvent);
				break;
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

	onLoad: function (aEvent) {
		let window = this.window;
		let gBrowser = window.gBrowser;
		let secureloginContent = contentHandlerMap.get(window);

		window.removeEventListener("load", this);

		gBrowser.tabContainer.addEventListener("TabOpen", this, false);
		gBrowser.tabContainer.addEventListener("TabClose", this, false);
		gBrowser.addTabsProgressListener(secureloginContent);

		// Add event listener to xul:browser element,
		// because TabOpen event is not fired when opens browser window.
		let tabs = gBrowser.tabContainer.childNodes;
		for (let tab of tabs) {
			let browser = gBrowser.getBrowserForTab(tab);
			browser.addEventListener("DOMContentLoaded", secureloginContent, true, true);
		}

		window.addEventListener("unload", this, false);
	},

	onUnload: function (aEvent) {
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
			let browser = gBrowser.getBrowserForTab(tab);
			browser.removeEventListener("DOMContentLoaded", secureloginContent, true);
		}

		this.destroy();
	},

	onTabOpen: function (aEvent) {
		let browser = this.window.gBrowser.getBrowserForTab(aEvent.target);
		let secureloginContent = contentHandlerMap.get(this.window);
		browser.addEventListener("DOMContentLoaded", secureloginContent, true, true);
	},

	onTabClose: function (aEvent) {
		let browser = this.window.gBrowser.getBrowserForTab(aEvent.target);
		let secureloginContent = contentHandlerMap.get(this.window);
		browser.removeEventListener("DOMContentLoaded", secureloginContent, true);
	},

};
