# Cockpit Dashboard 🚀

A modern, lightweight, real-time system monitoring plugin for **[Cockpit](https://cockpit-project.org/)**.

Monitor **storage by physical disk and mounted volume**, **real-time disk I/O throughput**, **CPU utilization per core**, and **RAM / swap memory distribution** — all updated live with zero external runtime dependencies.

![Cockpit Dashboard Preview](https://raw.githubusercontent.com/cockpit-project/cockpit/main/branding/cockpit-banner.png)

---

## ✨ Features

### 💾 Storage Monitoring (By Disk & Volume)
* **Physical & Virtual Block Disks**:
  * Detects all block devices (`sda`, `nvme0n1`, `vda`, etc.) with transport types (`NVMe`, `SATA`, `USB`, `SCSI`).
  * Automatic SSD vs. HDD media detection with visual badges.
  * **Real-time Disk I/O**: Live Read rate (MB/s), Write rate (MB/s), and total IOPS per disk.
  * **Visual Partition Map**: Proportional horizontal bar displaying partition allocation, filesystem types, and unallocated free space.
* **Mounted Filesystem Volumes**:
  * Detailed breakdown of mount points (`/`, `/boot`, `/home`, etc.), device sources, filesystem types (`ext4`, `xfs`, `btrfs`, `zfs`, `vfat`, etc.), and partition labels.
  * Capacity, used space, available space, and color-coded utilization progress bars with health alerts (**Normal**, **Warning >75%**, **Critical >90%**).
  * Smart filter toggle to switch between **Standard Filesystems** and **All Mounts** (including container overlay and tmpfs layers).
  * Instant search filter for fast lookups.

### ⚡ Real-Time CPU Monitoring
* **Overall CPU Utilization**: Live percentage gauge and 60-second scrolling history area chart.
* **Per-Core Breakdown**: Grid of individual cores/threads with real-time utilization bars and load percentages.
* **Hardware Telemetry**: Model name, architecture (`x86_64`, `aarch64`), core count, frequency, 1m/5m/15m load averages, system uptime, and process statistics.

### 🧠 Real-Time Memory (RAM & Swap)
* **Memory Utilization**: Live percentage, used RAM, available RAM, and 60-second scrolling history area chart.
* **Segmented Memory Distribution**: Visual distribution of Active Used Memory, Buffers & Page Cache, and Free Memory.
* **Swap Space Monitoring**: Total swap, used swap, free swap, and utilization percentage.

### 📊 Real-Time Engine & UI/UX
* **Adjustable Telemetry Rate**: Choose between `1s (Fast)`, `2s (Normal)`, or `5s (Eco)`.
* **Pause & Resume**: Freeze live streaming at any time to inspect metrics.
* **Pure SVG Charts**: High performance vector charts with smooth gradients, zero bloated charting dependencies.
* **Cockpit / PatternFly Aesthetic**: Matches Cockpit's native look and feel with full **Dark Mode** and **Light Mode** support (including auto-detection of system/Cockpit preferences).
* **Standalone Preview Mode**: Opening `index.html` directly in a browser activates an automatic demo mode with simulated telemetry for quick design previews.

---

## 📥 Installation

### Option 1: Automated Installer (Recommended)

Clone the repository and run the installer script:

```bash
git clone https://github.com/gabriel/cockpit_dashboard.git
cd cockpit_dashboard
chmod +x install.sh
./install.sh
```

The script will automatically detect privileges:
* If run with `sudo` or as `root`, it installs system-wide to `/usr/share/cockpit/dashboard`.
* If run as a standard user, it installs for the current user in `~/.local/share/cockpit/dashboard`.

### Option 2: Using Make

```bash
# System-wide installation (requires sudo)
sudo make install

# User-space installation
make user-install
```

### Option 3: Manual Installation

Copy the plugin directory into your Cockpit plugins folder:

```bash
# For current user:
mkdir -p ~/.local/share/cockpit/dashboard
cp -r manifest.json index.html dashboard.js dashboard.css collector.sh ~/.local/share/cockpit/dashboard/

# Or system-wide:
sudo mkdir -p /usr/share/cockpit/dashboard
sudo cp -r manifest.json index.html dashboard.js dashboard.css collector.sh /usr/share/cockpit/dashboard/
```

---

## 🖥️ Usage

1. Open Cockpit in your web browser (usually at `https://<server-ip>:9090`).
2. Log in with your credentials.
3. Look for **Dashboard** in the Cockpit sidebar navigation.
4. Enjoy real-time system and storage telemetry!

---

## 📂 Repository Structure

```
cockpit_dashboard/
├── manifest.json    # Cockpit plugin manifest & menu entry
├── index.html       # Main HTML5 dashboard interface
├── dashboard.js     # Real-time telemetry engine & SVG chart renderer
├── dashboard.css    # Responsive styles with Dark & Light theme support
├── collector.sh     # Fast POSIX telemetry collector script
├── install.sh       # Automated installation script
├── uninstall.sh     # Clean removal script
├── Makefile         # Build, install, and distribution targets
├── LICENSE          # MIT Open Source License
└── README.md        # Documentation
```

---

## ⚙️ How It Works

Cockpit Dashboard communicates with the host system using Cockpit's secure `cockpit.spawn` bridge:
1. Every tick (configurable between 1s and 5s), the dashboard samples Linux `/proc` virtual files (`/proc/stat`, `/proc/meminfo`, `/proc/diskstats`, `/proc/loadavg`, `/proc/uptime`) and standard utilities (`lsblk -J`, `df -B1`).
2. Execution finishes in **~50–150 ms** with virtually zero CPU overhead (< 0.1%).
3. Differential metrics ($\Delta\text{busy} / \Delta\text{total}$, $\Delta\text{sectors} \times 512 / \Delta t$) compute exact real-time CPU percentages, disk read/write bandwidths, and IOPS.

---

## 🗑️ Uninstallation

To remove the plugin:

```bash
./uninstall.sh
# or
make uninstall
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
