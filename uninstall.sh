#!/usr/bin/env bash
# Cockpit Dashboard Plugin Uninstaller
set -e

PLUGIN_NAME="dashboard"

echo "=== Uninstalling Cockpit Dashboard Plugin ==="

REMOVED=0

# Check system location
if [ -d "/usr/share/cockpit/${PLUGIN_NAME}" ]; then
    echo "Removing from /usr/share/cockpit/${PLUGIN_NAME}..."
    if [ "$EUID" -eq 0 ]; then
        rm -rf "/usr/share/cockpit/${PLUGIN_NAME}"
    else
        sudo rm -rf "/usr/share/cockpit/${PLUGIN_NAME}"
    fi
    REMOVED=1
fi

# Check user location
if [ -d "${HOME}/.local/share/cockpit/${PLUGIN_NAME}" ]; then
    echo "Removing from ${HOME}/.local/share/cockpit/${PLUGIN_NAME}..."
    rm -rf "${HOME}/.local/share/cockpit/${PLUGIN_NAME}"
    REMOVED=1
fi

if [ "$REMOVED" -eq 1 ]; then
    echo "✓ Cockpit Dashboard removed successfully."
else
    echo "Notice: Cockpit Dashboard was not found in standard directories."
fi
