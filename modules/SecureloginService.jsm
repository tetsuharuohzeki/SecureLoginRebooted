/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["SecureloginService"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const PREF_NAME     = "extensions.securelogin.";
const STRING_BUNDLE = "chrome://securelogin/locale/securelogin.properties";
const CONTENT_PREF_USE_PROTECTION = PREF_NAME + "useProtect";
const OBSERVER_TOPIC = "Securelogin";


Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let SecureloginService = {

	OBSERVER_TOPIC: OBSERVER_TOPIC,

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
		if (!protectMode) {
			protectMode = true;
		}
		return (useProtection && protectMode);
	},

	/*
	 * @param {nsIObserver} anObserver
	 */
	addObserver: function (anObserver) {
		Services.obs.addObserver(anObserver, OBSERVER_TOPIC, true);
	},

	/*
	 * @param {nsIObserver} anObserver
	 */
	removeObserver: function (anObserver) {
		Services.obs.removeObserver(anObserver, OBSERVER_TOPIC);
	},

	/*
	 * @param {Window} aData
	 * @param {string} aData
	 * @param {object} aSubject
	 */
	notifyObservers: function (aWindow, aData, aSubject) {
		aSubject.chromeWindow = aWindow;
		let subject = { wrappedJSObject: aSubject };
		Services.obs.notifyObservers(subject, OBSERVER_TOPIC, aData);
	},

	initialize: function () {
	},

};
SecureloginService.initialize();