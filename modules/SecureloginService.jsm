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
 * The Original Code is Secure Login Manager Module.
 *
 * The Initial Developer of the Original Code is
 * saneyuki_s
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   saneyuki_s <saneyuki.snyk@gmail.com>
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
var EXPORTED_SYMBOLS = ["SecureloginService"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const kPREF_NAME     = "extensions.securelogin.";
const kSTRING_BUNDLE = "chrome://securelogin/locale/securelogin.properties";

const kOBSERVER_TOPIC = "Securelogin";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var SecureloginService = {

	OBSERVER_TOPIC: kOBSERVER_TOPIC,

	get prefs () {
		delete this.prefs;
		return this.prefs = Services.prefs.getBranch(kPREF_NAME)
		                    .QueryInterface(Ci.nsIPrefBranch2);
	},

	get stringBundle () {
		delete this.stringBundle;
		return this.stringBundle = Services.strings.createBundle(kSTRING_BUNDLE);
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
		let newURI = Services.io.newURI;
		try {
			URI = newURI(aURIStr, aOriginCharset, null);
		}
		catch (e) {
			let resolvedURIStr = newURI(aBaseURI, aOriginCharset, null).resolve(aURIStr);
			URI                = newURI(resolvedURIStr, aOriginCharset, null);
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
	 * @returns {boolean}
	 */
	useProtection: function () {
		let useProtection = this.prefs.getBoolPref("loginWithProtection");
		return useProtection;
	},

	/*
	 * @param {Window} aData
	 * @param {string} aData
	 * @param {object} aSubject
	 */
	notifyObservers: function (aWindow, aData, aSubject) {
		aSubject.chromeWindow = aWindow;
		let subject = { wrappedJSObject: aSubject };
		Services.obs.notifyObservers(subject, kOBSERVER_TOPIC, aData);
	},

	initialize: function () {
	},

};
SecureloginService.initialize();