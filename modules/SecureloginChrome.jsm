/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["SecureloginChrome"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://securelogin/SecureloginService.jsm");

const kDOORHANGER_NOTIFICATION_ID = "securelogin-loginFound";
const kDOORHANGER_ANCHOR_ID       = "password-notification-icon";

function SecureloginChrome (aChromeWindow) {
	this.initialize(aChromeWindow);
}
SecureloginChrome.prototype = {

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
	                                       Ci.nsIDOMEventListener,
	                                       Ci.nsISupportsWeakReference,
	                                       Ci.nsISupports]),

	window: null,

	get secureLoginInfoMap () {
		let map = new WeakMap();
		Object.defineProperty(this, "secureLoginInfoMap", {
			value       : map,
			writable    : true,
			configurable: true,
			enumerable  : true,
		});
		return map;
	},

	initialize: function (aChromeWindow) {
		this.window = aChromeWindow;

		aChromeWindow.addEventListener("load", this, false);
		SecureloginService.addObserver(this);
	},

	destroy: function () {
		SecureloginService.removeObserver(this);
		this.window = null;
	},

	onLoginFound: function (aMessage) {
		let browser = aMessage.browser;
		this.secureLoginInfoMap.set(browser, aMessage.logins);
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

		this.window.PopupNotifications.show(
			aBrowser,
			kDOORHANGER_NOTIFICATION_ID,
			GetStringFromName("doorhanger.description"),
			kDOORHANGER_ANCHOR_ID,
			mainAction,
			null,
			{
				persistence        : 0,
				timeout            : null,
				persistWhileVisible: false,
				dismissed          : true,
				eventCallback      : null,
				neverShow          : false,
			 }
		);
	},

	loginSelectedBrowser: function () {
		let browser = this.window.gBrowser.selectedBrowser;
		this.login(browser);
	},

	login: function (aBrowser) {
		let loginId = this.getLoginId(aBrowser);
		this.notifyObservers("login", { browser: aBrowser, 
		                                loginId: loginId });
	},

	getLoginId: function (aBrowser) {
		let loginId = "";
		let logins = this.secureLoginInfoMap.get(aBrowser);
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

	updateOnProgress: function (aBrowser, aContentWindow) {
		this.notifyObservers("searchLogin", { contentWindow: aContentWindow,
		                                     browser      : aBrowser });
	},

	notifyObservers: function (aData, aSubject) {
		SecureloginService.notifyObservers(this.window, aData, aSubject);
	},

	/* nsIObserver */
	observe: function (aSubject, aTopic, aData) {
		if (aTopic === SecureloginService.OBSERVER_TOPIC) {
			let message = aSubject.wrappedJSObject;
			switch (aData) {
				case "loginFound":
					if (this.window === message.chromeWindow) {
						this.onLoginFound(message);
					}
					break;
			}
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
			case "DOMContentLoaded":
				this.onDOMLoaded(aEvent);
				break;
		}
	},

	onLoad: function (aEvent) {
		let window = this.window;
		window.removeEventListener("load", this);

		window.gBrowser.addTabsProgressListener(this);

		window.addEventListener("unload", this, false);
	},

	onUnload: function (aEvent) {
		let window = this.window;
		window.removeEventListener("unload", this);

		window.gBrowser.removeTabsProgressListener(this);

		this.destroy();
	},

	onDOMLoaded: function (aEvent) {
		let browser       = aEvent.currentTarget;
		let contentWindow = browser.contentWindow;

		browser.removeEventListener("DOMContentLoaded", this, true);

		// Call only if a DOMContentLoaded fires from the root document.
		if (aEvent.target === contentWindow.document) {
			this.updateOnProgress(browser, contentWindow);
		}
	},

	/* ProgressListener */
	onStateChange: function (aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
		let isSTATE_STOP = (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP);
		// Fastback (e.g. restore the tab) doesn't fire DOMContentLoaded.
		if ((aStateFlags & Ci.nsIWebProgressListener.STATE_RESTORING)) {
			if (isSTATE_STOP) {
				this.updateOnProgress(aBrowser, aWebProgress.DOMWindow);
			}
		}
		else {
			if (!isSTATE_STOP) {
				aBrowser.addEventListener("DOMContentLoaded", this, true, true);
			}
		}
	},

};