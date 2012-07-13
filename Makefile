ZIP     = zip
OPTION  = -6
# IGNORE  = -x .DS_Store
PACKAGE = securelogin-rebooted.xpi
FILE    = \
  ./content/securelogin-browser.js \
  ./content/securelogin-browser.xul \
  ./locale/en-US/securelogin.properties \
  ./skin/classic/securelogin.css \
  ./modules/SecureloginChrome.jsm \
  ./modules/SecureloginContent.jsm \
  ./modules/SecureloginService.jsm \
  ./defaults/preferences/securelogin.js \
  chrome.manifest \
  install.rdf \


all:  $(PACKAGE)

$(PACKAGE):  $(FILES)
	$(ZIP) $(OPTION) $(PACKAGE) $(FILE)
