ZIP     = zip
OPTION  = -6
# IGNORE  = -x .DS_Store
PACKAGE = securelogin-rebooted.xpi
FILE    = \
  ./locale/en-US/securelogin.properties \
  ./skin/classic/securelogin.css \
  ./content/SecureloginChrome.jsm \
  ./content/SecureloginContent.jsm \
  ./content/SecureloginService.jsm \
  chrome.manifest \
  bootstrap.js \
  install.rdf \


all: xpi

xpi:  $(FILES)
	$(ZIP) $(OPTION) $(PACKAGE) $(FILE)
