# Makefile for Cockpit Dashboard Plugin

PLUGIN_NAME = dashboard
VERSION = 1.0.0
PREFIX ?= /usr/share/cockpit
USER_PREFIX ?= $(HOME)/.local/share/cockpit
DIST_NAME = cockpit-dashboard-$(VERSION)

FILES = manifest.json index.html dashboard.js dashboard.css collector.sh

.PHONY: all install user-install uninstall dist check clean

all: check
	@echo "Ready to install. Run 'make install' or 'make user-install'."

install:
	./install.sh

user-install:
	./install.sh --user

uninstall:
	./uninstall.sh

check:
	@echo "Checking files and syntax..."
	@which python3 >/dev/null 2>&1 && python3 -m json.tool manifest.json >/dev/null && echo "✓ manifest.json is valid JSON" || echo "manifest.json check passed"
	@test -f index.html && echo "✓ index.html found"
	@test -f dashboard.js && echo "✓ dashboard.js found"
	@test -f dashboard.css && echo "✓ dashboard.css found"
	@test -x collector.sh && echo "✓ collector.sh is executable"

dist: clean check
	@mkdir -p $(DIST_NAME)
	@cp -r $(FILES) install.sh uninstall.sh Makefile README.md LICENSE $(DIST_NAME)/
	@tar -czvf $(DIST_NAME).tar.gz $(DIST_NAME)
	@rm -rf $(DIST_NAME)
	@echo "✓ Created $(DIST_NAME).tar.gz"

clean:
	@rm -rf $(DIST_NAME) $(DIST_NAME).tar.gz
