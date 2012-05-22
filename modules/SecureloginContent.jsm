/* vim: set filetype=javascript shiftwidth=4 tabstop=4 noexpandtab: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["SecureloginContent"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://securelogin/SecureloginService.jsm");

const LOGIN_FORM_HIGHLIGHT_COLOR = "#ffd700";
const LOGIN_FORM_ID_ATTRIBUTE    = "data-securelogin-form-id";

function SecureloginContent (aGlobal) {
	this.initialize(aGlobal);
}
SecureloginContent.prototype = {

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMEventListener,
	                                       Ci.nsIObserver,
	                                       Ci.nsISupportsWeakReference,
	                                       Ci.nsISupports]),

	global: null,

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

	initialize: function (aGlobal) {
		this.global = aGlobal;
		SecureloginService.addObserver(this);
	},

	destroy: function () {
		SecureloginService.removeObserver(this);
		this.global = null;
	},

	/*
	 * Search login data in the given window.
	 * @param {XULElement} aBrowser
	 * @param {Window}     aContentWindow
	 */
	searchLogin: function (aBrowser, aContentWindow) {
		let document = aContentWindow.document;
		let forms    = document.forms;
		if (forms && forms.length > 0) {

			// Get an array of nsILoginInfo which are related to the document.
			let matchData = this._createMatchdata(document.documentURI);
			let savedLogins = Services.logins.searchLogins({}, matchData);

			if (savedLogins.length > 0) {
				let infosArray = [];
				for (let i = 0, l = savedLogins.length; i < l; i++) {
					let info = this.searchLoginInForm(savedLogins[i], forms);
					if (info != null) {
						infosArray.push(info);
					}
				}

				if (infosArray.length > 0) {
					// Store the array of founded SecureLoginInfo.
					this.secureLoginInfoMap.set(aBrowser, infosArray);
					// Pass the array of username to UI parts.
					this.notifyLoginsFound(aBrowser, infosArray, aContentWindow);
				}

			}
		}
	},

	/*
	 * @param   {string}         aURL
	 * @returns {nsIPropertyBag}
	 */
	_createMatchdata: function (aURL) {
		let origin = SecureloginService.createNsIURI(aURL, null, null).prePath;
		let matchData = Cc["@mozilla.org/hash-property-bag;1"]
		                .createInstance(Ci.nsIWritablePropertyBag);
		matchData.setProperty("hostname", origin);

		return matchData;
	},

	/*
	 * @param   {nsILoginInfo}    aLoginInfo
	 * @param   {HTMLCollection}  aForms
	 * @returns {SecureLoginInfo}
	 */
	searchLoginInForm: function (aLoginInfo, aForms) {
		let info = null;
		for (let i = 0, l = aForms.length; i < l; i++) {
			let form = aForms[i];
			let documentURI = form.ownerDocument.documentURI;

			let formActionURI = SecureloginService.createNsIURI(form.action, null, documentURI);//nsIURI

			let isSameURL = (aLoginInfo.formSubmitURL == formActionURI.prePath);

			if (isSameURL) {
				info = this.findLoginElements(aLoginInfo, formActionURI, form);
				if (info != null) {
					break;
				}
			}
			else {
				continue;
			}
		}
		return info;
	},

	/*
	 * @param   {nsILoginInfo}    aLoginInfo
	 * @param   {nsIURI}          aFormActionURI
	 * @param   {HTMLFormElement} aForm
	 * @returns {SecureLoginInfo}
	 */
	findLoginElements: function (aLoginInfo, aFormActionURI, aForm) {
		let loginInfo = null;
		let [user, pass] = this._getLoginElements(aLoginInfo, aForm);
		if (pass) {
			// Set identifier
			let formId = aForm.getAttribute(LOGIN_FORM_ID_ATTRIBUTE);
			let id     = formId ? formId : ( Date.now() + "" );
			if (formId === null) {
				aForm.setAttribute(LOGIN_FORM_ID_ATTRIBUTE, id);
			}

			loginInfo = new SecureLoginInfo(aLoginInfo, aFormActionURI, aForm, id);
			this.highlightForm(user, pass);
		}
		return loginInfo;
	},

	/*
	 * @param   {nsILoginInfo}     aLoginInfo
	 * @param   {HTMLFormElement}  aForm
	 * @returns {Array}            Destructuring assignment.
	 *          {HTMLInputElement} the username input field.
	 *          {HTMLInputElement} the username password field.
	 */
	_getLoginElements: function (aLoginInfo, aForm) {
		let [user, pass] = [null, null];
		let elements = aForm.elements;

		user = elements.namedItem(aLoginInfo.usernameField);

		pass = elements.namedItem(aLoginInfo.passwordField);
		if (pass && pass.type != "password") {
			pass = null;
		}

		return [user, pass];
	},

	/*
	 * @param {Element} aUserField
	 * @param {Element} aPassField
	 */
	highlightForm: function (aUserField, aPassField) {
		if (aUserField) {
			this.highlightElement(aUserField);
		}

		if (aPassField) {
			this.highlightElement(aPassField);
		}
	},

	/*
	 * @param {Element} aElement
	 */
	highlightElement: function (aElement) {
		let style = aElement.style;
		style.backgroundColor = LOGIN_FORM_HIGHLIGHT_COLOR;
	},

	/*
	 * @param {XULElement} aBrowser
	 * @param {Array}      aInfoArray
	 * @param {Window}     aContentWindow
	 */
	notifyLoginsFound: function (aBrowser, aInfoArray, aContentWindow) {
		let usernames = aInfoArray.map(function(elem){
			return elem.username;
		});

		this.notifyObservers("loginFound", { contentWindow : aContentWindow,
		                                     browser       : aBrowser,
		                                     logins        : usernames });
	},

	/*
	 * @param {string} aData
	 * @param {object} aSubject
	 */
	notifyObservers: function (aData, aSubject) {
		SecureloginService.notifyObservers(this.global, aData, aSubject);
	},

	/*
	 * @param {XULElement} aBrowser
	 *        The browser for login.
	 * @param {string} aLoginDataId
	 *        The identifier of login data to login.
	 *        This parameter is based on an username.
	 */
	login: function (aBrowser, aLoginDataId) {
		let info = this.getSecureLoginInfo(aBrowser, aLoginDataId);
		if (!info) {
			return Cu.reportError("No SecureLoginInfo. Please reload this page.");
		}

		if (SecureloginService.useProtection(aBrowser.currentURI)) {
			this._loginWithProtection(aBrowser, info);
		}
		else {
			this._loginWithNormal(aBrowser, info);
		}
	},

	getSecureLoginInfo: function (aBrowser, aLoginDataId) {
		let loginInfo = null;
		let infos = this.secureLoginInfoMap.get(aBrowser);
		if (aLoginDataId && infos && infos.length > 0) {
			let login = infos.filter(function(elm){
				return (elm.username == aLoginDataId);
			});
			loginInfo = login[0];
		}
		return loginInfo;
	},

	/*
	 * @param {XULElement}      aBrowser
	 * @param {SecureLoginInfo} aLoginInfo
	 */
	_loginWithProtection: function (aBrowser, aLoginInfo) {
		let form = aLoginInfo.getForm(aBrowser.contentDocument);
		let dataString = this._createDataString(aLoginInfo, form);
		let referrer = SecureloginService.createNsIURI(form.baseURI);

		this._sendLoginDataWithProtection(aBrowser,
		                                  aLoginInfo.formMethod,
		                                  aLoginInfo.formAction,
		                                  dataString,
		                                  referrer);
	},

	/*
	 * @param   {SecureLoginInfo} aLoginInfo
	 * @param   {HTMLFormElement} aForm
	 * @returns {string}
	 */
	_createDataString: function (aLoginInfo, aForm) {
		let param    = [];
		let elements = aForm.elements;
		let charset  = aForm.ownerDocument.characterSet;

		let setDataString = function setDataString (aKey, aValue) {
			let data = SecureloginService.encodeString(aKey, charset) +
			           "=" +
			           SecureloginService.encodeString(aValue, charset);
			param.push(data);
		};

		// Set key & value.
		for (let i = 0, l = elements.length; i < l; i++) {
			let element = elements[i];

			/*
			 * NOTE:
			 * W3C HTML5 specification,
			 * 4.10.22.4 Constructing the form data set, 3.1.
			 * <http://www.w3.org/TR/html5/association-of-controls-and-forms.html>
			 *
			 * Skip if the element is disabled.
			 */
			if (element.disabled) {
				continue;
			}

			switch (element.type) {
				case "checkbox":
				case "radio":
					/*
					 * NOTE:
					 * W3C HTML5 specification,
					 * 4.10.22.4 Constructing the form data set, 3.1.
					 * <http://www.w3.org/TR/html5/association-of-controls-and-forms.html>
					 *
					 * Skip an |input| element whose type is |checkbox| or |radio|,
					 * and it is not checked.
					 */
					if (element.checked) {
						setDataString(element.name, element.value);
					}
					break;
				case "password":
					if (element.name == aLoginInfo.passwordField) {
						setDataString(aLoginInfo.passwordField, aLoginInfo.password);
					}
					break;
				case "submit":
					/*
					 * The current interface of nsILoginInfo does not have an identifier 
					 * for submit button.
					 * This part is disable so it can't be helped.
					 * If it needs to set submit button's value,
					 * this part might be implemented to regard first submit button in the form
					 * as the "login" button.
					 */
					break;
				case "image":
					/*
					 * NOTE:
					 * W3C HTML5 specification,
					 * 4.10.22.4, Constructing the form data set, 3.3
					 * <http://www.w3.org/TR/html5/association-of-controls-and-forms.html>
					 *
					 * Set coordinates if element's type is |image|.
					 */
					if (!element.name) {
						setDataString("x", "1");
						setDataString("y", "1");
					}
					else {
						setDataString(element.name + ".x", "1");
						setDataString(element.name + ".y", "1");
					}
				default:
					if (element.name == aLoginInfo.usernameField) {
						setDataString(aLoginInfo.usernameField, aLoginInfo.username);
					}
					else {
						setDataString(element.name, element.value);
					}
					break;
			}
		}

		return param.join("&");
	},

	/*
	 * @param {XULElement} aBrowser
	 * @param {string}     aFormMethod
	 * @param {string}     aUrl
	 * @param {string}     aDataStr
	 * @param {nsIURI}     aReferrer
	 */
	_sendLoginDataWithProtection: function (aBrowser, aFormMethod, aUrl, aDataStr, aReferrer) {
		let method = aFormMethod.toUpperCase();
		if (method === "POST") {
			// Create post data mime stream. (params: aStringData, aKeyword, aEncKeyword, aType)
			let postData = this.global.getPostDataStream(aDataStr, "", "", "application/x-www-form-urlencoded");
			// Load the url in the browser.
			this._loadURI(aBrowser, aUrl, aReferrer, postData);
		}
		else if (method === "GET") {
			// Remove existing parameters & add the parameter list to the uri.
			let index = aUrl.indexOf("?");
			if (index === -1) {
				aUrl += "?" + aDataStr;
			}
			else {
				aUrl = aUrl.substring(0, index + 1) + aDataStr;
			}
			// Load the uri in the browser.
			this._loadURI(aBrowser, aUrl, aReferrer, null);
		}
		else {
			let message = "Failed Login. HTTP " + method + " method is not supported by Secure Login";
			Cu.reportError(message);
		}
	},

	/*
	 * @param {XULElement}     aBrowser
	 * @param {string}         aUrl
	 * @param {nsIURI}         aReferrer
	 * @param {nsIInputStream} aPostData
	 */
	_loadURI: function (aBrowser, aUrl, aReferrer, aPostData) {
		if (aPostData === undefined) {
			aPostData = null;
		}

		let flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
		try {
			aBrowser.loadURIWithFlags(aUrl, flags, aReferrer, null, aPostData);
		}
		catch (e) {
			Cu.reportError(e);
		}
	},

	/*
	 * @param {SecureLoginInfo} aLoginInfo
	 */
	_loginWithNormal: function (aBrowser, aLoginInfo) {
		let form = aLoginInfo.getForm(aBrowser.contentDocument);

		let formIsValid  = this._checkFormIsValid(aLoginInfo, form);
		if (formIsValid) {
			this._sendLoginData(aLoginInfo, form);
		}
		else if (SecureloginService.prefs.getBoolPref("overrideFormAction")) {
			// override the form action & method
			form.action = aLoginInfo.formAction;
			form.method = aLoginInfo.formMethod;
			// login
			this._sendLoginData(aLoginInfo, form);
		}
		else {
			let message = SecureloginService.stringBundle
			              .GetStringFromName("prompt.formIsChengedFromBefore.description");
			this.global.alert(message);
		}
	},

	/*
	 * @param {SecureLoginInfo} aLoginInfo
	 * @param {HTMLFormElement} aForm
	 */
	_checkFormIsValid: function (aLoginInfo, aForm) {
		let isValid = false;

		let formAction = SecureloginService.createNsIURI(aForm.action, null, aForm.baseURI);
		// Check same action location as before.
		if (aLoginInfo.formActionURI.equalsExceptRef(formAction)) {
			// Check same http method as before.
			if (aForm.method.toLowerCase() === aLoginInfo.formMethod.toLowerCase()) {
				isValid = true;
			}
		}

		return isValid;
	},

	/*
	 * @param {SecureLoginInfo} aLoginInfo
	 * @param {HTMLFormElement} aForm
	 */
	_sendLoginData: function (aLoginInfo, aForm) {
		let elements     = aForm.elements;
		let user         = elements.namedItem(aLoginInfo.usernameField);
		let pass         = elements.namedItem(aLoginInfo.passwordField);
		let isSetPass    = false;
		let submitButton = null;

		if (user) {
			user.value = aLoginInfo.username;
		}
		if (pass) {
			pass.value = aLoginInfo.password;
			isSetPass = true;
		}

		searchSubmit:
		if (isSetPass) {
			// The current interface of nsILoginInfo does not have an identifier 
			// for submit button.
			// So this part is implemented to regard first submit button 
			// in the form as the "login" button.
			// The element whose |type| attribute is in the Image Button state
			// is not contained in |HTMLFormElement.elements|.
			// ref. <http://www.w3.org/TR/html5/forms.html#the-form-element>
			let selector = "input[type='submit'], input[type='image'], button";
			let element  = aForm.querySelector(selector);

			// Check the element is associated with login form.
			if (element.form && (element.form != aForm)) {
				break searchSubmit;
			}

			// Check whether the element's formaction attribute overwrites the original form action.
			if (element.formAction) {
				let formAction = SecureloginService.createNsIURI(element.formAction, null, aForm.baseURI);
				// The case of the element's formaction attribute overwrites the original action.
				if (aLoginInfo.formActionURI.equalsExceptRef(formAction)) {
					break searchSubmit;
				}
			}

			submitButton = element;
		}

		try {
			if (submitButton) {
				submitButton.click();
			}
			else {
				aForm.submit();
			}
		}
		catch (e) {
			Cu.reportError(e);
		}
	},

	/* EventListner */
	handleEvent: function (aEvent) {
		switch (aEvent.type) {
		}
	},

	/* nsIObserver */
	observe: function (aSubject, aTopic, aData) {
		if (aTopic === SecureloginService.OBSERVER_TOPIC) {
			let message = aSubject.wrappedJSObject;
			let chromeWindow = message.chromeWindow;
			switch (aData) {
				case "searchLogin":
					if (this.global === chromeWindow) {
						this.searchLogin(message.browser, message.contentWindow);
					}
					break;
				case "login":
					if (this.global === chromeWindow) {
						this.login(message.browser, message.loginId);
					}
					break;
			}
		}
	},

};

/*
 * @param {nsILoginInfo}    aLoginInfo
 * @param {nsIURI}          aFormActionURI
 * @param {HTMLFormElement} aForm
 * @param {string}          aFormId
 */
function SecureLoginInfo (aLoginInfo, aFormActionURI, aForm, aFormId) {
	this.nsILoginInfo  = aLoginInfo;
	this.formActionURI = aFormActionURI;
	this.formMethod    = aForm.method;
	this.formId        = aFormId;
}
SecureLoginInfo.prototype = {

	/*
	 * The nsILoginInfo for the login.
	 *
	 * @type {nsILoginInfo}
	 */
	nsILoginInfo: null,

	/*
	 * The LOGIN_FORM_ID_ATTRIBUTE attribute of the login form.
	 *
	 * @type {string}
	 */
	formId: null,

	/*
	 * The form action URI as nsIURI for the login.
	 *
	 * @type {nsIURI}
	 */
	formActionURI: null,

	/*
	 * The form method for the login.
	 *
	 * @type {string}
	 */
	formMethod: null,

	/*
	 * The form action URI as string for the login.
	 *
	 * @returns {string}
	 */
	get formAction () {
		return this.formActionURI.spec;
	},

	/*
	 * The username for the login.
	 *
	 * @returns {string}
	 */
	get username () {
		return this.nsILoginInfo.username;
	},

	/*
	 * The |name| attribute for the username input field.
	 *
	 * @returns {string}
	 */
	get usernameField () {
		return this.nsILoginInfo.usernameField;
	},

	/*
	 * The password for the login.
	 *
	 * @returns {string}
	 */
	get password () {
		return this.nsILoginInfo.password;
	},

	/*
	 * The |name| attribute for the password input field.
	 *
	 * @returns {string}
	 */
	get passwordField () {
		return this.nsILoginInfo.passwordField;
	},

	/*
	 * Return the form for the login.
	 *
	 * @param  {Document}        aDoc
	 * @return {HTMLFormElement}
	 */
	getForm: function (aDoc) {
		let selector = "form[" + LOGIN_FORM_ID_ATTRIBUTE + "='" + this.formId + "']";
		return aDoc.querySelector(selector);
	},

};