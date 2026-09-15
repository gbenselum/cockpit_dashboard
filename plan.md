# Cockpit Dashboard Improvement Plan

## Executive Summary
This document outlines the findings of a security and code quality evaluation of the Cockpit Dashboard plugin. The findings are categorized into Security Issues and Code Quality / Functional Issues, along with actionable recommendations for each.

## 1. Security Issues

### 1.1 Cross-Site Scripting (XSS) Vulnerabilities in `dashboard.js`
**Finding:** The dashboard makes extensive use of the `innerHTML` property to dynamically render the UI based on data collected from the system. For example, building the rows for the Disks table (`el.disksTableBody.innerHTML = html;`), Volumes table, CPU Cores Grid, and SVG generation.
**Impact:** While the data is sourced from the local system (e.g., `/proc` files, `lsblk`, `df`), malicious actors can exploit this. For example, inserting a USB drive with a maliciously crafted partition label or model name could execute arbitrary JavaScript within the context of the Cockpit session (which runs with high privileges).
**Recommendation:**
- Replace `innerHTML` with standard DOM manipulation APIs (e.g., `document.createElement`, `element.textContent`, etc.).
- Alternatively, use a secure templating function or a library like `DOMPurify` to sanitize all dynamic HTML strings before assignment.
- Ensure all hardware-derived strings (e.g., disk models, partition labels, mount paths) are properly escaped if string interpolation must be used.

### 1.2 Improper File Permissions in Install Scripts
**Finding:** In `install.sh`, after copying the files, a blanket `chmod -R 755 "${TARGET}"` is applied to the installation directory.
**Impact:** This grants execute permissions to all files, including `index.html`, `dashboard.js`, and `dashboard.css`. Non-executable files should not have the executable bit set.
**Recommendation:**
- Apply `chmod 755` only to directories and executable scripts (e.g., `collector.sh`).
- Apply `chmod 644` to standard files (HTML, JS, CSS, JSON).

## 2. Code Quality & Functional Issues

### 2.1 Redundant Collector Script
**Finding:** The repository includes a `collector.sh` script intended to gather telemetry. However, `dashboard.js` does not execute this file; instead, it defines a hardcoded bash script inside a JavaScript string (`scriptCommand` in `collectSystemTelemetry`) which mirrors the logic of `collector.sh`.
**Impact:** Having duplicated logic leads to maintenance overhead. If one script is updated, the other might be forgotten, leading to inconsistencies and confusion.
**Recommendation:**
- Choose one approach: Either execute `collector.sh` directly using `window.cockpit.spawn(["/path/to/collector.sh"])` or completely remove `collector.sh` from the repository and rely on the inline `scriptCommand`. Using the dedicated bash script is generally cleaner and easier to test.

### 2.2 Brittle Substring Matching in `dashboard.js`
**Finding:** In `parseDiskStats`, there is logic relying on `!devName.match(/\d+$/) || devName.startsWith("nvme") && devName.endsWith("n1")` to determine if a block device is a root disk.
**Impact:** This heuristic is brittle and may fail for non-standard device names, such as eMMC storage (`mmcblk0`) or virtuous instances (`vdX`).
**Recommendation:**
- Cross-reference the devices from `/proc/diskstats` directly against the physical disks detected by `lsblk` instead of relying on regex patterns on the device name.

### 2.3 Hardcoded System Paths in `uninstall.sh`
**Finding:** `uninstall.sh` hardcodes `/usr/share/cockpit/dashboard` instead of deriving it dynamically. While this is standard for Cockpit plugins, it could be problematic if installed in non-standard locations.
**Impact:** Uninstallation may fail or leave orphaned files.
**Recommendation:**
- Ensure consistency between paths in `install.sh` and `uninstall.sh`.

### 2.4 Fallback Execution with `/bin/sh`
**Finding:** In `dashboard.js` inside `collectSystemTelemetry`, if the first `cockpit.spawn` with `bash` fails, it falls back to `/bin/sh`.
**Impact:** The shell script (`scriptCommand`) contains bashisms (like `set -e`, arrays or specific pipefail behaviors if added later). `/bin/sh` on some systems (like Debian/Ubuntu) points to `dash`, which may fail to parse complex bash commands.
**Recommendation:**
- Ensure the collector script is fully POSIX-compliant if falling back to `/bin/sh`. Given Cockpit heavily relies on Red Hat / modern Linux environments, `bash` is almost universally available.

## 3. Recommended Action Plan
1. **Immediate:** Refactor `dashboard.js` to eliminate `innerHTML` vulnerabilities by escaping output or using safe DOM methods.
2. **Short-term:** Remove the duplicate collector logic by executing the standalone `collector.sh` script or deleting it in favor of the inline version.
3. **Short-term:** Update `install.sh` to enforce correct `644`/`755` file permissions.
4. **Long-term:** Improve the disk root-device detection heuristic by correlating data with the output of `lsblk`.