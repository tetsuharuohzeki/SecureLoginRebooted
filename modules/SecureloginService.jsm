/* vim: set filetype=javascript shiftwidth=4 tabstop=4 noexpandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let EXPORTED_SYMBOLS = ["SecureloginService"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const PREF_NAME     = "extensions.securelogin.";
const STRING_BUNDLE = "chrome://securelogin/locale/securelogin.properties";
const CONTENT_PREF_USE_PROTECTION = PREF_NAME + "useProtect";

let messageMap = new WeakMap();


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
	 * @return  {nsIURI}
	 */
	createNsIURI: function (aURIStr, aOriginCharset, aBaseURI) {
		let URI;
		let io = Services.io;

		try {
			URI = io.newURI(aURIStr, aOriginCharset, null);
		}
		catch (e) {
			// if aURIStr has no scheme, execute this part.
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
	 * @return  {string}
	 */
	encodeString: function (aString, aCharset) {
		let string = "";
		if (aCharset.toLowerCase() === "utf-8") {
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
	 * @param {Window} aContext
	 *  The window which it's can get privacy context from.
	 *  ref: nsIContentPrefService.idl
	 *
	 * @return  {boolean}
	 */
	useProtection: function (aURI, aContext) {
		let useProtection = this.prefs.getBoolPref("loginWithProtection");
		let protectMode = this.getLoginMode(aURI, aContext);
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
	 * @param {Window} aContext
	 *  The window which it's can get privacy context from.
	 *  ref: nsIContentPrefService.idl
	 *
	 * @return  {boolean}
	 */
	getLoginMode: function (aURI, aContext) {
		let context = aContext.QueryInterface(Ci.nsIInterfaceRequestor)
		                      .getInterface(Ci.nsIWebNavigation)
		                      .QueryInterface(Ci.nsILoadContext);

		return Services.contentPrefs.getPref(aURI.prePath,
		                                     CONTENT_PREF_USE_PROTECTION,
		                                     context);
	},

	/*
	 * Set the preference whether to use the protect login.
	 *
	 * @param {nsIURI} aURI
	 *   The URI which is set the preference.
	 * @param {boolean} aUseProtection
	 *   Whether using the protected login.
	 * @param {Window} aContext
	 *  The window which it's can get privacy context from.
	 *  ref: nsIContentPrefService.idl
	 */
	setLoginMode: function (aURI, aUseProtection, aContext) {
		let context = aContext.QueryInterface(Ci.nsIInterfaceRequestor)
		                      .getInterface(Ci.nsIWebNavigation)
		                      .QueryInterface(Ci.nsILoadContext);

		if (aUseProtection) {
			Services.contentPrefs.removePref(aURI.prePath, CONTENT_PREF_USE_PROTECTION,
			                                 context);
		}
		else {
			Services.contentPrefs.setPref(aURI.prePath,
			                              CONTENT_PREF_USE_PROTECTION,
			                              false,
			                              context);
		}
	},

	/*
	 * @param {DOM object} aTarget
	 *   The target object which registering a listener.
	 *
	 * @param {string} aMessageName
	 *   The name of the message for which to add a listener.
	 *
	 * @param {object} aListener
	 *   A listener object which will be called when receiving messages.
	 */
	addMessageListener: function (aTarget, aMessageName, aListener) {
		let messageList = messageMap.get(aTarget);
		if (!messageList) {
			messageList = new Map();
		}

		let listenersList = messageList.get(aMessageName);
		if (!listenersList) {
			listenersList = new Set();
		}

		listenersList.add(aListener);
		messageList.set(aMessageName, listenersList);
		messageMap.set(aTarget, messageList);
	},

	/*
	 * @param {DOM object} aTarget
	 *   The target object which un-registering a listener.
	 *
	 * @param {string} aMessageName
	 *   The name of the message for which to remove a listener.
	 *
	 * @param {object} aListener
	 *   A listener object to stop receiving messages.
	 */
	removeMessageListener: function (aTarget, aMessageName, aListener) {
		let messageList = messageMap.get(aTarget);
		if (!messageList) {
			return;
		}

		let listenersList = messageList.get(aMessageName);
		if (!listenersList) {
			return;
		}

		if (!listenersList.has(aListener)) {
			return;
		}

		listenersList.delete(aListener);
		messageList.set(aMessageName, listenersList);
		messageMap.set(aTarget, messageList);
	},

	/*
	 * @param {DOM object} aTarget
	 *   The target object which is registered the listeners
	 *   receiving the message.
	 *
	 * @param {string} aMessageName
	 *   The name of the message to send to the listeners.
	 *
	 * @param {object} aObject
	 *   An object containing to be delivered to the listeners.
	 *   This parameter must be able to parse as JSON.
	 */
	sendMessage: function (aTarget, aMessageName, aObject) {
		let messageList = messageMap.get(aTarget);
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

