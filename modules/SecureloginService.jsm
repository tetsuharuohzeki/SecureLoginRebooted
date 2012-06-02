/* vim: set filetype=javascript shiftwidth=4 tabstop=4 noexpandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["SecureloginService"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Services",
                                  "resource://gre/modules/Services.jsm");

const PREF_NAME     = "extensions.securelogin.";
const STRING_BUNDLE = "chrome://securelogin/locale/securelogin.properties";
const CONTENT_PREF_USE_PROTECTION = PREF_NAME + "useProtect";

let SecureloginService = {

	get prefs () {
		delete this.prefs;
		return this.prefs = Services.prefs.getBranch(PREF_NAME);
	},

	get stringBundle () {
		delete this.stringBundle;
		return this.stringBundle = Services.strings.createBundle(STRING_BUNDLE);
	},

	/*
	 * Create a nsIURI object.
	 *
	 * @param   {string} aURIStr
	 * @param   {string} aOriginCharset
	 * @param   {string} aBaseURI
	 * @returns {nsIURI}
	 */
	createNsIURI: function (aURIStr, aOriginCharset, aBaseURI) {
		let URI;
		let io = Services.io;
		try {
			URI = io.newURI(aURIStr, aOriginCharset, null);
		}
		catch (e) {
			let resolvedStr = io.newURI(aBaseURI, aOriginCharset, null).resolve(aURIStr);
			URI             = io.newURI(resolvedStr, aOriginCharset, null);
		}
		return URI;
	},

	get textToSubURI () {
		delete this.textToSubURI;
		return this.textToSubURI = Cc['@mozilla.org/intl/texttosuburi;1']
		                           .getService(Ci.nsITextToSubURI);
	},

	/*
	 * @param   {string} aString
	 * @param   {string} aCharset
	 * @returns {string}
	 */
	encodeString: function (aString, aCharset) {
		let string = "";
		if (aCharset.toUpperCase() === "UTF-8") {
			string = encodeURIComponent(aString);
		}
		else {
			string = this.textToSubURI.ConvertAndEscape(aCharset, aString);
		}
		return string;
	},

	/*
	 * Whether to use the protected login.
	 * @param {nsIURI} aURI
	 *  The checked URI.
	 * @returns {boolean}
	 */
	useProtection: function (aURI) {
		let useProtection = this.prefs.getBoolPref("loginWithProtection");
		let protectMode = Services.contentPrefs.getPref(aURI.prePath,
		                                                CONTENT_PREF_USE_PROTECTION);
		// use "loginWithProtection" value if URL doesn't have setting
		if (protectMode === undefined) {
			protectMode = true;
		}
		return (useProtection && protectMode);
	},

	/*
	 * Get the preference whether to use the protect login.
	 *
	 * @param {nsIURI} aURI
	 *   The URI which is set the preference.
	 * @returns {boolean}
	 */
	getLoginMode: function (aURI) {
		return Services.contentPrefs.getPref(aURI.prePath,
		                                     CONTENT_PREF_USE_PROTECTION);
	},

	/*
	 * Set the preference whether to use the protect login.
	 *
	 * @param {nsIURI} aURI
	 *   The URI which is set the preference.
	 * @param {boolean} aUseProtection
	 *   Whether using the protected login.
	 */
	setLoginMode: function (aURI, aUseProtection) {
		if (aUseProtection) {
			Services.contentPrefs.removePref(aURI.prePath, CONTENT_PREF_USE_PROTECTION);
		}
		else {
			Services.contentPrefs.setPref(aURI.prePath,
			                              CONTENT_PREF_USE_PROTECTION,
			                              false);
		}
	},

	/*
	 * @param {Window} aWindow
	 * @param {string} aMessageName
	 * @param {object} aListener
	 */
	addMessageListener: function (aWindow, aMessageName, aListener) {
		let messageList = messageMap.get(aWindow);
		if (!messageList) {
			messageList = new Map();
		}

		let listenersList = messageList.get(aMessageName);
		if (!listenersList) {
			listenersList = [];
		}

		listenersList.push(aListener);
		messageList.set(aMessageName, listenersList);
		messageMap.set(aWindow, messageList);
	},

	/*
	 * @param {Window} aWindow
	 * @param {string} aMessageName
	 * @param {object} aListener
	 */
	removeMessageListener: function (aWindow, aMessageName, aListener) {
		let messageList = messageMap.get(aWindow);
		if (!messageList) {
			return;
		}

		let listenersList = messageList.get(aMessageName);
		if (!listenersList) {
			return;
		}

		let index = listenersList.indexOf(aListener);
		if (index === -1) {
			return;
		}

		listenersList.splice(index, 1);
		messageList.set(aMessageName, listenersList);
		messageMap.set(aWindow, messageList);
	},

	/*
	 * @param {Window} aWindow
	 * @param {string} aMessageName
	 * @param {object} aObject
	 */
	sendMessage: function (aWindow, aMessageName, aObject) {
		let messageList = messageMap.get(aWindow);
		if (!messageList) {
			return;
		}

		let listenersList = messageList.get(aMessageName);
		if (!listenersList) {
			return;
		}

		let message = {
			name: aMessageName,
			json: aObject,
		};
		for (let listener of listenersList) {
			listener.receiveMessage(message);
		}
	},

	initialize: function () {
	},
};
SecureloginService.initialize();

let messageMap = new WeakMap();
