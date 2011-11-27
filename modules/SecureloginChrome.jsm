/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Secure Login In-Chrome Module.
 *
 * The Initial Developer of the Original Code is
 * saneyuki_s
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   saneyuki_s <saneyuki.snyk@gmail.com> (original author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
var EXPORTED_SYMBOLS = ["SecureloginChrome"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://securelogin/SecureloginService.jsm");

function SecureloginChrome (aChromeWindow) {
	this.initialize(aChromeWindow);
}
SecureloginChrome.prototype = {

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
	                                       Ci.nsIDOMEventListener,
	                                       Ci.nsISupportsWeakReference,
	                                       Ci.nsISupports]),

	window             : null,
	_secureLoginInfoMap: null,

	get secureLoginInfoMap () {
		if (!this._secureLoginInfoMap) {
			this._secureLoginInfoMap = new WeakMap();
		}
		return this._secureLoginInfoMap;
	},

	initialize: function (aChromeWindow) {
		this.window = aChromeWindow;

		aChromeWindow.addEventListener("load", this, false);
		Services.obs.addObserver(this, SecureloginService.OBSERVER_TOPIC, true);
	},

	destroy: function () {
		Services.obs.removeObserver(this, SecureloginService.OBSERVER_TOPIC);
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
				that.login();
			},
		};

		this.window.PopupNotifications.show(
			aBrowser,
			"securelogin-loginFound",
			GetStringFromName("doorhanger.description"),
			"password-notification-icon",
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

	login: function () {
		let browser = this.window.gBrowser.selectedBrowser;
		let loginId = this.getLoginId(browser);
		this.notifyObservers("login", { browser: browser, 
		                               loginId: loginId });
	},

	getLoginId: function (aBrowser) {
		let loginId = null;
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

	updateOnProgress: function (aBrowser, aWebProgress) {
		let window = aWebProgress.DOMWindow;
		this.notifyObservers("searchLogin", { contentWindow: window,
		                                     browser      : aBrowser });
	},

	notifyObservers: function (aData, aSubject) {
		SecureloginService.notifyObservers(this.window, aData, aSubject);
	},

	/* nsIObserver */
	observe: function (aSubject, aTopic, aData) {
		if (aTopic == SecureloginService.OBSERVER_TOPIC) {
			let message = aSubject.wrappedJSObject;
			switch (aData) {
				case "loginFound":
					if (this.window == message.chromeWindow) {
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

	/* ProgressListener */
	onLocationChange: function (aBrowser, aWebProgress, aRequest, aLocation) {
		this.updateOnProgress(aBrowser, aWebProgress);
	},

	onStateChange: function (aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
		if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
			this.updateOnProgress(aBrowser, aWebProgress);
		}
	},

};