#!/usr/bin/env bash
# Cockpit Dashboard Plugin Installer
set -e

PLUGIN_NAME="dashboard"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==============================================="
echo "   Cockpit System Dashboard Plugin Installer   "
echo "==============================================="

chmod +x "${SCRIPT_DIR}/collector.sh"

# Determine target destination: system-wide if root/sudo, or ~/.local/share/cockpit
if [ "$1" == "--user" ]; then
    INSTALL_MODE="user"
elif [ "$1" == "--system" ]; then
    INSTALL_MODE="system"
elif [ "$EUID" -eq 0 ]; then
    INSTALL_MODE="root"
elif sudo -n true 2>/dev/null; then
    INSTALL_MODE="sudo"
else
    INSTALL_MODE="user"
fi

if [ "$INSTALL_MODE" == "root" ]; then
    TARGET="/usr/share/cockpit/${PLUGIN_NAME}"
    echo "-> Installing system-wide into ${TARGET}..."
    mkdir -p "${TARGET}"
    cp -r "${SCRIPT_DIR}/manifest.json" \
          "${SCRIPT_DIR}/index.html" \
          "${SCRIPT_DIR}/dashboard.js" \
          "${SCRIPT_DIR}/dashboard.css" \
          "${SCRIPT_DIR}/collector.sh" \
          "${TARGET}/"
    chmod -R 755 "${TARGET}"
elif [ "$INSTALL_MODE" == "sudo" ] || [ "$INSTALL_MODE" == "system" ]; then
    TARGET="/usr/share/cockpit/${PLUGIN_NAME}"
    echo "-> Installing system-wide using sudo into ${TARGET}..."
    sudo mkdir -p "${TARGET}"
    sudo cp -r "${SCRIPT_DIR}/manifest.json" \
               "${SCRIPT_DIR}/index.html" \
               "${SCRIPT_DIR}/dashboard.js" \
               "${SCRIPT_DIR}/dashboard.css" \
               "${SCRIPT_DIR}/collector.sh" \
               "${TARGET}/"
    sudo chmod -R 755 "${TARGET}"
else
    TARGET="${HOME}/.local/share/cockpit/${PLUGIN_NAME}"
    echo "-> Installing for current user into ${TARGET}..."
    mkdir -p "${TARGET}"
    cp -r "${SCRIPT_DIR}/manifest.json" \
          "${SCRIPT_DIR}/index.html" \
          "${SCRIPT_DIR}/dashboard.js" \
          "${SCRIPT_DIR}/dashboard.css" \
          "${SCRIPT_DIR}/collector.sh" \
          "${TARGET}/"
    chmod -R 755 "${TARGET}"
fi

echo ""
echo "✓ Cockpit Dashboard installed successfully!"
echo "Destination: ${TARGET}"
echo ""
echo "To access it:"
echo "1. Open Cockpit in your browser (e.g. https://localhost:9090)"
echo "2. Look for 'Dashboard' in the navigation menu"
echo ""
