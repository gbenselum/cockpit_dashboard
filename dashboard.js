/**
 * Cockpit Dashboard Plugin - dashboard.js
 * Real-time monitoring engine for Storage (by Disk and Volume), CPU, and RAM
 */

(function () {
    "use strict";

    // Application State
    const state = {
        intervalMs: 2000,
        isPaused: false,
        timerId: null,
        theme: localStorage.getItem("cockpit_dashboard_theme") || "auto",
        filterText: "",
        volumeFilter: "physical", // 'physical' or 'all'
        lastTimestamp: null,
        prevCpuStat: null,
        prevDiskStats: new Map(),
        historyLength: 30,
        history: {
            cpu: [],
            ram: [],
            diskReadMB: [],
            diskWriteMB: []
        },
        specs: null
    };

    // DOM Element References
    let el = {};

    function initDomReferences() {
        el = {
            statusPill: document.getElementById("status-pill"),
            statusText: document.getElementById("status-text"),
            intervalSelect: document.getElementById("interval-select"),
            btnPause: document.getElementById("btn-pause"),
            btnRefresh: document.getElementById("btn-refresh"),
            themeSelect: document.getElementById("theme-select"),
            demoBanner: document.getElementById("demo-banner"),

            // Top Metric Cards
            cpuHugeVal: document.getElementById("cpu-huge-val"),
            cpuSubtext: document.getElementById("cpu-subtext"),
            cpuProgressBar: document.getElementById("cpu-progress-bar"),
            cpuLoadText: document.getElementById("cpu-load-text"),
            cpuPill: document.getElementById("cpu-pill"),

            ramHugeVal: document.getElementById("ram-huge-val"),
            ramSubtext: document.getElementById("ram-subtext"),
            ramProgressBar: document.getElementById("ram-progress-bar"),
            ramAvailText: document.getElementById("ram-avail-text"),
            ramPill: document.getElementById("ram-pill"),

            storageHugeVal: document.getElementById("storage-huge-val"),
            storageSubtext: document.getElementById("storage-subtext"),
            storageProgressBar: document.getElementById("storage-progress-bar"),
            storageFreeText: document.getElementById("storage-free-text"),
            storagePill: document.getElementById("storage-pill"),

            ioReadVal: document.getElementById("io-read-val"),
            ioWriteVal: document.getElementById("io-write-val"),
            ioIopsVal: document.getElementById("io-iops-val"),
            ioDisksText: document.getElementById("io-disks-text"),

            // SVG Charts
            cpuChartSvg: document.getElementById("cpu-chart-svg"),
            ramChartSvg: document.getElementById("ram-chart-svg"),
            ioChartSvg: document.getElementById("io-chart-svg"),
            cpuChartCurrent: document.getElementById("cpu-chart-current"),
            ramChartCurrent: document.getElementById("ram-chart-current"),
            ioChartCurrent: document.getElementById("io-chart-current"),

            // Storage Section
            storageSearchInput: document.getElementById("storage-search"),
            tabStandardMounts: document.getElementById("tab-standard-mounts"),
            tabAllMounts: document.getElementById("tab-all-mounts"),
            disksGrid: document.getElementById("disks-grid"),
            volumesTableBody: document.getElementById("volumes-table-body"),
            disksCountBadge: document.getElementById("disks-count-badge"),
            volumesCountBadge: document.getElementById("volumes-count-badge"),

            // CPU Section
            coresGrid: document.getElementById("cores-grid"),
            coresCountBadge: document.getElementById("cores-count-badge"),
            specCpuModel: document.getElementById("spec-cpu-model"),
            specCpuArch: document.getElementById("spec-cpu-arch"),
            specCpuCores: document.getElementById("spec-cpu-cores"),
            specCpuFreq: document.getElementById("spec-cpu-freq"),
            specCpuLoad: document.getElementById("spec-cpu-load"),
            specCpuUptime: document.getElementById("spec-cpu-uptime"),
            specCpuProcs: document.getElementById("spec-cpu-procs"),

            // RAM Section
            memBarUsed: document.getElementById("mem-bar-used"),
            memBarCached: document.getElementById("mem-bar-cached"),
            memBarFree: document.getElementById("mem-bar-free"),
            memLegendUsedVal: document.getElementById("mem-legend-used-val"),
            memLegendCachedVal: document.getElementById("mem-legend-cached-val"),
            memLegendFreeVal: document.getElementById("mem-legend-free-val"),
            swapBarFill: document.getElementById("swap-bar-fill"),
            swapTextVal: document.getElementById("swap-text-val"),
            swapTotalVal: document.getElementById("swap-total-val"),
            swapUsedVal: document.getElementById("swap-used-val"),
            swapFreeVal: document.getElementById("swap-free-val"),
            ramTotalVal: document.getElementById("ram-total-val"),
            ramUsedVal: document.getElementById("ram-used-val"),
            ramAvailableVal: document.getElementById("ram-available-val"),
            ramBuffersVal: document.getElementById("ram-buffers-val"),
            ramCachedVal: document.getElementById("ram-cached-val"),
            ramActiveVal: document.getElementById("ram-active-val")
        };
    }

    // Helper: Format Bytes into human readable strings (KB, MB, GB, TB)
    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0 || !bytes || isNaN(bytes)) return "0 B";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const index = Math.min(i, sizes.length - 1);
        return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + " " + sizes[index];
    }

    // Helper: Format I/O Rate (Bytes/sec into KB/s, MB/s, etc.)
    function formatRate(bytesPerSec) {
        if (bytesPerSec === 0 || !bytesPerSec || isNaN(bytesPerSec)) return "0 KB/s";
        if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + " B/s";
        if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
        if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(2) + " MB/s";
        return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + " GB/s";
    }

    // Helper: Format Uptime Seconds
    function formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        let parts = [];
        if (d > 0) parts.push(d + "d");
        if (h > 0 || d > 0) parts.push(h + "h");
        parts.push(m + "m");
        parts.push(s + "s");
        return parts.join(" ");
    }

    // Helper: Color threshold class based on percentage
    function getThresholdClass(pct) {
        if (pct >= 90) return "danger";
        if (pct >= 75) return "warning";
        return "normal";
    }

    function getProgressClass(pct) {
        if (pct >= 90) return "danger";
        if (pct >= 75) return "warning";
        return "success";
    }

    // Theme Management
    function applyTheme(theme) {
        state.theme = theme;
        localStorage.setItem("cockpit_dashboard_theme", theme);
        if (el.themeSelect) el.themeSelect.value = theme;

        const isLight = theme === "light" || (theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
        if (isLight) {
            document.body.classList.add("theme-light");
        } else {
            document.body.classList.remove("theme-light");
        }
        renderCharts();
    }

    // High performance Metric Collector Query
    // Runs collector.sh or inline POSIX commands fallback
    async function collectSystemTelemetry() {
        if (!window.cockpit) {
            return generateMockTelemetry();
        }

        const scriptCommand = `
            echo "===CPUINFO===";
            if command -v lscpu >/dev/null 2>&1; then LC_ALL=C lscpu 2>/dev/null || true; else cat /proc/cpuinfo 2>/dev/null || true; fi;
            echo "===UPTIME===";
            cat /proc/uptime 2>/dev/null || true;
            echo "===LOADAVG===";
            cat /proc/loadavg 2>/dev/null || true;
            echo "===STAT===";
            cat /proc/stat 2>/dev/null || true;
            echo "===MEMINFO===";
            cat /proc/meminfo 2>/dev/null || true;
            echo "===DISKSTATS===";
            cat /proc/diskstats 2>/dev/null || true;
            echo "===LSBLK===";
            if command -v lsblk >/dev/null 2>&1; then
                lsblk -J -b -o NAME,KNAME,PATH,TYPE,SIZE,MOUNTPOINT,FSTYPE,MODEL,ROTA,TRAN,LABEL,UUID 2>/dev/null || echo '{"blockdevices":[]}';
            else
                echo '{"blockdevices":[]}';
            fi;
            echo "===DF===";
            LC_ALL=C df -B1 -P -T 2>/dev/null || true;
        `;

        try {
            const output = await window.cockpit.spawn(["bash", "-c", scriptCommand], { err: "out" });
            return parseTelemetryOutput(output);
        } catch (err) {
            console.error("Cockpit spawn error, attempting fallback to collector.sh:", err);
            try {
                const altOutput = await window.cockpit.spawn(["/bin/sh", "-c", scriptCommand], { err: "out" });
                return parseTelemetryOutput(altOutput);
            } catch (fallbackErr) {
                console.error("Critical: Failed to read telemetry:", fallbackErr);
                throw fallbackErr;
            }
        }
    }

    // Telemetry Output Parser
    function parseTelemetryOutput(raw) {
        const sections = {};
        const parts = raw.split(/^===([A-Z]+)===$/m);
        for (let i = 1; i < parts.length; i += 2) {
            const key = parts[i].trim();
            const content = (parts[i + 1] || "").trim();
            sections[key] = content;
        }

        const now = Date.now();
        const deltaSec = state.lastTimestamp ? Math.max(0.1, (now - state.lastTimestamp) / 1000) : 2.0;
        state.lastTimestamp = now;

        // 1. CPU Parsing
        const cpuData = parseCpuSection(sections.STAT, deltaSec);
        const uptimeData = parseUptime(sections.UPTIME);
        const loadAvgData = parseLoadAvg(sections.LOADAVG);
        const cpuSpecs = parseCpuInfo(sections.CPUINFO);

        // 2. Memory Parsing
        const memData = parseMemInfo(sections.MEMINFO);

        // 3. Disk Stats & I/O
        const diskIoData = parseDiskStats(sections.DISKSTATS, deltaSec);

        // 4. Disks & Volumes Hierarchy
        const storageData = parseStorage(sections.LSBLK, sections.DF, diskIoData.disks);

        return {
            timestamp: now,
            deltaSec,
            cpu: cpuData,
            uptime: uptimeData,
            loadAvg: loadAvgData,
            cpuSpecs: cpuSpecs,
            memory: memData,
            io: diskIoData,
            storage: storageData
        };
    }

    // Parse /proc/stat
    function parseCpuSection(statText, deltaSec) {
        if (!statText) return { totalUsage: 0, cores: [] };

        const lines = statText.split("\n");
        let overall = null;
        const cores = [];

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts[0] === "cpu") {
                overall = parseStatLine(parts);
            } else if (parts[0].startsWith("cpu") && parts[0].length > 3) {
                const coreIdx = parseInt(parts[0].substring(3), 10);
                cores.push({
                    index: coreIdx,
                    stat: parseStatLine(parts)
                });
            }
        }

        let totalUsage = 0;
        if (state.prevCpuStat && overall) {
            const totalDelta = overall.total - state.prevCpuStat.total;
            const busyDelta = overall.busy - state.prevCpuStat.busy;
            if (totalDelta > 0) {
                totalUsage = Math.max(0, Math.min(100, (busyDelta / totalDelta) * 100));
            }
        }

        const coreResults = [];
        for (const c of cores) {
            let coreUsage = 0;
            if (state.prevCpuStat && state.prevCpuStat.cores && state.prevCpuStat.cores[c.index]) {
                const prev = state.prevCpuStat.cores[c.index];
                const totalDelta = c.stat.total - prev.total;
                const busyDelta = c.stat.busy - prev.busy;
                if (totalDelta > 0) {
                    coreUsage = Math.max(0, Math.min(100, (busyDelta / totalDelta) * 100));
                }
            }
            coreResults.push({
                index: c.index,
                usage: coreUsage
            });
        }

        // Update previous snapshot
        state.prevCpuStat = {
            total: overall ? overall.total : 0,
            busy: overall ? overall.busy : 0,
            cores: cores.map(c => c.stat)
        };

        return {
            totalUsage: totalUsage,
            cores: coreResults
        };
    }

    function parseStatLine(parts) {
        // parts: [name, user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice]
        const nums = parts.slice(1).map(x => parseInt(x, 10) || 0);
        const user = nums[0] || 0;
        const nice = nums[1] || 0;
        const system = nums[2] || 0;
        const idle = nums[3] || 0;
        const iowait = nums[4] || 0;
        const irq = nums[5] || 0;
        const softirq = nums[6] || 0;
        const steal = nums[7] || 0;

        const idleAll = idle + iowait;
        const busy = user + nice + system + irq + softirq + steal;
        const total = idleAll + busy;

        return { total, busy, idle: idleAll };
    }

    // Parse /proc/uptime
    function parseUptime(raw) {
        if (!raw) return { seconds: 0, text: "0s" };
        const sec = parseFloat(raw.trim().split(/\s+/)[0]) || 0;
        return {
            seconds: sec,
            text: formatUptime(sec)
        };
    }

    // Parse /proc/loadavg
    function parseLoadAvg(raw) {
        if (!raw) return { load1: "0.00", load5: "0.00", load15: "0.00", procs: "0/0" };
        const p = raw.trim().split(/\s+/);
        return {
            load1: p[0] || "0.00",
            load5: p[1] || "0.00",
            load15: p[2] || "0.00",
            procs: p[3] || "0/0"
        };
    }

    // Parse lscpu / cpuinfo
    function parseCpuInfo(raw) {
        if (!raw) return state.specs || { model: "Standard Processor", arch: "x86_64", cores: 4, freq: "N/A" };
        let model = "";
        let arch = "";
        let cores = 0;
        let maxFreq = "";

        const lines = raw.split("\n");
        for (const line of lines) {
            const [k, ...rest] = line.split(":");
            if (!k || rest.length === 0) continue;
            const key = k.trim().toLowerCase();
            const val = rest.join(":").trim();

            if (key === "model name" && !model) model = val;
            if (key === "architecture" && !arch) arch = val;
            if (key === "cpu(s)" && !cores) cores = parseInt(val, 10);
            if ((key === "cpu max mhz" || key === "cpu mhz") && !maxFreq) maxFreq = parseFloat(val).toFixed(0) + " MHz";
        }

        if (!model) {
            const modelMatch = raw.match(/model name\s*:\s*(.+)/i);
            if (modelMatch) model = modelMatch[1].trim();
        }

        const specs = {
            model: model || "Standard CPU",
            arch: arch || "Linux Host",
            cores: cores || 4,
            freq: maxFreq || "Dynamic"
        };
        state.specs = specs;
        return specs;
    }

    // Parse /proc/meminfo
    function parseMemInfo(raw) {
        if (!raw) return { total: 0, used: 0, free: 0, available: 0, cached: 0, buffers: 0, usedPct: 0, swapTotal: 0, swapUsed: 0, swapFree: 0, swapPct: 0 };
        const mem = {};
        const lines = raw.split("\n");
        for (const line of lines) {
            const [k, v] = line.split(":");
            if (k && v) {
                mem[k.trim()] = parseInt(v.trim().split(/\s+/)[0], 10) * 1024; // Convert kB to Bytes
            }
        }

        const total = mem.MemTotal || 1;
        const free = mem.MemFree || 0;
        const available = mem.MemAvailable !== undefined ? mem.MemAvailable : free;
        const used = Math.max(0, total - available);
        const buffers = mem.Buffers || 0;
        const cached = mem.Cached || 0;
        const active = mem.Active || 0;

        const swapTotal = mem.SwapTotal || 0;
        const swapFree = mem.SwapFree || 0;
        const swapUsed = Math.max(0, swapTotal - swapFree);
        const swapPct = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;

        return {
            total,
            used,
            free,
            available,
            buffers,
            cached,
            active,
            usedPct: (used / total) * 100,
            swapTotal,
            swapUsed,
            swapFree,
            swapPct
        };
    }

    // Parse /proc/diskstats
    function parseDiskStats(raw, deltaSec) {
        const disks = new Map();
        let totalReadBytesSec = 0;
        let totalWriteBytesSec = 0;
        let totalIops = 0;

        if (!raw) return { totalReadBytesSec: 0, totalWriteBytesSec: 0, totalIops: 0, disks };

        const lines = raw.split("\n");
        for (const line of lines) {
            const p = line.trim().split(/\s+/);
            if (p.length < 14) continue;
            const devName = p[2];
            // Filter loop and ram devices
            if (devName.startsWith("loop") || devName.startsWith("ram")) continue;

            const reads = parseInt(p[3], 10) || 0;
            const sectorsRead = parseInt(p[5], 10) || 0;
            const writes = parseInt(p[7], 10) || 0;
            const sectorsWritten = parseInt(p[9], 10) || 0;

            const prev = state.prevDiskStats.get(devName);
            let readRate = 0;
            let writeRate = 0;
            let iops = 0;

            if (prev) {
                const deltaReadSectors = Math.max(0, sectorsRead - prev.sectorsRead);
                const deltaWriteSectors = Math.max(0, sectorsWritten - prev.sectorsWritten);
                const deltaReads = Math.max(0, reads - prev.reads);
                const deltaWrites = Math.max(0, writes - prev.writes);

                readRate = (deltaReadSectors * 512) / deltaSec;
                writeRate = (deltaWriteSectors * 512) / deltaSec;
                iops = (deltaReads + deltaWrites) / deltaSec;

                // Aggregate major whole disks (e.g. sda, nvme0n1, vda, not partitions)
                if (!devName.match(/\d+$/) || devName.startsWith("nvme") && devName.endsWith("n1")) {
                    totalReadBytesSec += readRate;
                    totalWriteBytesSec += writeRate;
                    totalIops += iops;
                }
            }

            state.prevDiskStats.set(devName, {
                reads,
                sectorsRead,
                writes,
                sectorsWritten
            });

            disks.set(devName, {
                devName,
                readRate,
                writeRate,
                iops
            });
        }

        return {
            totalReadBytesSec,
            totalWriteBytesSec,
            totalIops,
            disks
        };
    }

    // Parse lsblk and df
    function parseStorage(lsblkRaw, dfRaw, diskIoMap) {
        let blockDevices = [];
        try {
            const parsed = JSON.parse(lsblkRaw || '{"blockdevices":[]}');
            blockDevices = parsed.blockdevices || [];
        } catch (e) {
            console.warn("Failed to parse lsblk JSON:", e);
        }

        // Parse DF output
        const mountsMap = new Map();
        let totalStorageCap = 0;
        let totalStorageUsed = 0;
        let totalStorageAvail = 0;

        if (dfRaw) {
            const dfLines = dfRaw.trim().split("\n");
            // Skip header
            for (let i = 1; i < dfLines.length; i++) {
                const parts = dfLines[i].trim().split(/\s+/);
                if (parts.length < 7) continue;
                const fsSource = parts[0];
                const fsType = parts[1];
                const totalBytes = parseInt(parts[2], 10) || 0;
                const usedBytes = parseInt(parts[3], 10) || 0;
                const availBytes = parseInt(parts[4], 10) || 0;
                const pctStr = parts[5].replace("%", "");
                const usedPct = parseFloat(pctStr) || 0;
                const mountpoint = parts[6];

                const isVirtual = ["tmpfs", "devtmpfs", "overlay", "squashfs", "shm", "efivarfs"].includes(fsType) ||
                                  mountpoint.startsWith("/run/k3s") ||
                                  mountpoint.startsWith("/var/lib/kubelet");

                mountsMap.set(mountpoint, {
                    source: fsSource,
                    fsType,
                    totalBytes,
                    usedBytes,
                    availBytes,
                    usedPct,
                    mountpoint,
                    isVirtual
                });

                if (!isVirtual) {
                    totalStorageCap += totalBytes;
                    totalStorageUsed += usedBytes;
                    totalStorageAvail += availBytes;
                }
            }
        }

        // Build Disks List
        const physicalDisks = [];
        for (const dev of blockDevices) {
            if (dev.type !== "disk") continue;

            const diskName = dev.name;
            const io = diskIoMap.get(diskName) || { readRate: 0, writeRate: 0, iops: 0 };
            const isSsd = dev.rota === false || dev.rota === 0 || dev.tran === "nvme";
            const techType = dev.tran === "nvme" ? "nvme" : (isSsd ? "ssd" : "hdd");

            const partitions = [];
            let partitionsAllocatedSize = 0;

            if (dev.children && dev.children.length > 0) {
                for (const child of dev.children) {
                    partitionsAllocatedSize += child.size || 0;
                    const mountInfo = child.mountpoint ? mountsMap.get(child.mountpoint) : null;
                    partitions.push({
                        name: child.name,
                        path: child.path || ("/dev/" + child.name),
                        size: child.size || 0,
                        mountpoint: child.mountpoint || null,
                        fstype: child.fstype || (mountInfo ? mountInfo.fsType : "unknown"),
                        label: child.label || "",
                        uuid: child.uuid || "",
                        usedBytes: mountInfo ? mountInfo.usedBytes : 0,
                        availBytes: mountInfo ? mountInfo.availBytes : (child.size || 0),
                        usedPct: mountInfo ? mountInfo.usedPct : 0
                    });
                }
            }

            const unallocatedSize = Math.max(0, (dev.size || 0) - partitionsAllocatedSize);

            physicalDisks.push({
                name: dev.name,
                path: dev.path || ("/dev/" + dev.name),
                model: dev.model || "Generic Block Storage",
                size: dev.size || 0,
                transport: (dev.tran || "SATA").toUpperCase(),
                techType: techType,
                rota: dev.rota,
                readRate: io.readRate,
                writeRate: io.writeRate,
                iops: io.iops,
                partitions: partitions,
                unallocatedSize: unallocatedSize
            });
        }

        const globalUsagePct = totalStorageCap > 0 ? (totalStorageUsed / totalStorageCap) * 100 : 0;

        return {
            disks: physicalDisks,
            mounts: Array.from(mountsMap.values()),
            totalCapacity: totalStorageCap,
            totalUsed: totalStorageUsed,
            totalAvailable: totalStorageAvail,
            globalUsagePct: globalUsagePct
        };
    }

    // Mock Telemetry Generator for Standalone Preview Mode
    function generateMockTelemetry() {
        const now = Date.now();
        const baseCpu = 18 + Math.sin(now / 5000) * 12 + Math.random() * 5;
        const baseRam = 45 + Math.cos(now / 8000) * 8;
        const readRate = Math.max(0, 1024 * 1024 * (2.4 + Math.sin(now / 4000) * 2));
        const writeRate = Math.max(0, 1024 * 512 * (1.8 + Math.cos(now / 3000) * 1.5));

        const mockDisks = [
            {
                name: "nvme0n1",
                path: "/dev/nvme0n1",
                model: "Samsung SSD 980 PRO 1TB",
                size: 1000204886016,
                transport: "NVME",
                techType: "nvme",
                readRate: readRate * 0.7,
                writeRate: writeRate * 0.7,
                iops: 420 + Math.floor(Math.random() * 80),
                partitions: [
                    { name: "nvme0n1p1", path: "/dev/nvme0n1p1", size: 1073741824, mountpoint: "/boot/efi", fstype: "vfat", label: "EFI", usedBytes: 157286400, availBytes: 916455424, usedPct: 14.6 },
                    { name: "nvme0n1p2", path: "/dev/nvme0n1p2", size: 999131144192, mountpoint: "/", fstype: "ext4", label: "rootfs", usedBytes: 342583808000, availBytes: 656547336192, usedPct: 34.3 }
                ],
                unallocatedSize: 0
            },
            {
                name: "sda",
                path: "/dev/sda",
                model: "Crucial MX500 2TB SSD",
                size: 2000398934016,
                transport: "SATA",
                techType: "ssd",
                readRate: readRate * 0.3,
                writeRate: writeRate * 0.3,
                iops: 120 + Math.floor(Math.random() * 40),
                partitions: [
                    { name: "sda1", path: "/dev/sda1", size: 2000398934016, mountpoint: "/mnt/data", fstype: "xfs", label: "data-store", usedBytes: 1120000000000, availBytes: 880398934016, usedPct: 56.0 }
                ],
                unallocatedSize: 0
            }
        ];

        const mockMounts = [
            { source: "/dev/nvme0n1p2", fsType: "ext4", totalBytes: 999131144192, usedBytes: 342583808000, availBytes: 656547336192, usedPct: 34.3, mountpoint: "/", isVirtual: false },
            { source: "/dev/sda1", fsType: "xfs", totalBytes: 2000398934016, usedBytes: 1120000000000, availBytes: 880398934016, usedPct: 56.0, mountpoint: "/mnt/data", isVirtual: false },
            { source: "/dev/nvme0n1p1", fsType: "vfat", totalBytes: 1073741824, usedBytes: 157286400, availBytes: 916455424, usedPct: 14.6, mountpoint: "/boot/efi", isVirtual: false },
            { source: "tmpfs", fsType: "tmpfs", totalBytes: 16777216000, usedBytes: 125829120, availBytes: 16651386880, usedPct: 0.8, mountpoint: "/run", isVirtual: true }
        ];

        const totalStorageCap = 999131144192 + 2000398934016 + 1073741824;
        const totalStorageUsed = 342583808000 + 1120000000000 + 157286400;

        return {
            timestamp: now,
            deltaSec: 2.0,
            cpu: {
                totalUsage: baseCpu,
                cores: [
                    { index: 0, usage: Math.max(0, Math.min(100, baseCpu + Math.sin(now / 1000) * 15)) },
                    { index: 1, usage: Math.max(0, Math.min(100, baseCpu + Math.cos(now / 1200) * 12)) },
                    { index: 2, usage: Math.max(0, Math.min(100, baseCpu - Math.sin(now / 1500) * 10)) },
                    { index: 3, usage: Math.max(0, Math.min(100, baseCpu - Math.cos(now / 1300) * 8)) }
                ]
            },
            uptime: { seconds: 124500, text: "1d 10h 35m" },
            loadAvg: { load1: "0.45", load5: "0.52", load15: "0.48", procs: "3/385" },
            cpuSpecs: { model: "AMD Ryzen 9 5950X / ARM Cortex-A72", arch: "x86_64 / aarch64", cores: 4, freq: "3400 MHz" },
            memory: {
                total: 34359738368,
                used: (34359738368 * baseRam) / 100,
                available: (34359738368 * (100 - baseRam)) / 100,
                free: 8589934592,
                buffers: 1073741824,
                cached: 8589934592,
                active: 17179869184,
                usedPct: baseRam,
                swapTotal: 17179869184,
                swapUsed: 1073741824,
                swapFree: 16106127360,
                swapPct: 6.25
            },
            io: {
                totalReadBytesSec: readRate,
                totalWriteBytesSec: writeRate,
                totalIops: 540 + Math.floor(Math.random() * 100),
                disks: new Map()
            },
            storage: {
                disks: mockDisks,
                mounts: mockMounts,
                totalCapacity: totalStorageCap,
                totalUsed: totalStorageUsed,
                totalAvailable: totalStorageCap - totalStorageUsed,
                globalUsagePct: (totalStorageUsed / totalStorageCap) * 100
            }
        };
    }

    // UI Update Pipeline
    function updateDashboardUI(data) {
        if (!data) return;

        // Push History for Charts
        state.history.cpu.push(data.cpu.totalUsage);
        if (state.history.cpu.length > state.historyLength) state.history.cpu.shift();

        state.history.ram.push(data.memory.usedPct);
        if (state.history.ram.length > state.historyLength) state.history.ram.shift();

        const readMB = data.io.totalReadBytesSec / (1024 * 1024);
        const writeMB = data.io.totalWriteBytesSec / (1024 * 1024);
        state.history.diskReadMB.push(readMB);
        state.history.diskWriteMB.push(writeMB);
        if (state.history.diskReadMB.length > state.historyLength) state.history.diskReadMB.shift();
        if (state.history.diskWriteMB.length > state.historyLength) state.history.diskWriteMB.shift();

        // 1. Update CPU Overview Card
        const cpuPct = data.cpu.totalUsage;
        if (el.cpuHugeVal) el.cpuHugeVal.textContent = cpuPct.toFixed(1);
        if (el.cpuProgressBar) {
            el.cpuProgressBar.style.width = Math.min(100, Math.max(0, cpuPct)) + "%";
            el.cpuProgressBar.className = "progress-fill " + getProgressClass(cpuPct);
        }
        if (el.cpuPill) {
            el.cpuPill.textContent = getThresholdLabel(cpuPct);
            el.cpuPill.className = "metric-pill " + getThresholdClass(cpuPct);
        }
        if (el.cpuSubtext) {
            const coresCount = data.cpu.cores.length || data.cpuSpecs.cores || 4;
            el.cpuSubtext.textContent = `${coresCount} Cores @ ${data.cpuSpecs.freq}`;
        }
        if (el.cpuLoadText) {
            el.cpuLoadText.textContent = `Load: ${data.loadAvg.load1}, ${data.loadAvg.load5}, ${data.loadAvg.load15}`;
        }

        // 2. Update RAM Overview Card
        const memPct = data.memory.usedPct;
        if (el.ramHugeVal) el.ramHugeVal.textContent = memPct.toFixed(1);
        if (el.ramProgressBar) {
            el.ramProgressBar.style.width = Math.min(100, Math.max(0, memPct)) + "%";
            el.ramProgressBar.className = "progress-fill purple";
        }
        if (el.ramPill) {
            el.ramPill.textContent = getThresholdLabel(memPct);
            el.ramPill.className = "metric-pill " + getThresholdClass(memPct);
        }
        if (el.ramSubtext) {
            el.ramSubtext.textContent = `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`;
        }
        if (el.ramAvailText) {
            el.ramAvailText.textContent = `Avail: ${formatBytes(data.memory.available)}`;
        }

        // 3. Update Storage Overview Card
        const stPct = data.storage.globalUsagePct;
        if (el.storageHugeVal) el.storageHugeVal.textContent = stPct.toFixed(1);
        if (el.storageProgressBar) {
            el.storageProgressBar.style.width = Math.min(100, Math.max(0, stPct)) + "%";
            el.storageProgressBar.className = "progress-fill " + getProgressClass(stPct);
        }
        if (el.storagePill) {
            el.storagePill.textContent = getThresholdLabel(stPct);
            el.storagePill.className = "metric-pill " + getThresholdClass(stPct);
        }
        if (el.storageSubtext) {
            el.storageSubtext.textContent = `${formatBytes(data.storage.totalUsed)} / ${formatBytes(data.storage.totalCapacity)}`;
        }
        if (el.storageFreeText) {
            el.storageFreeText.textContent = `Free: ${formatBytes(data.storage.totalAvailable)}`;
        }

        // 4. Update Disk I/O Card
        if (el.ioReadVal) el.ioReadVal.textContent = formatRate(data.io.totalReadBytesSec);
        if (el.ioWriteVal) el.ioWriteVal.textContent = formatRate(data.io.totalWriteBytesSec);
        if (el.ioIopsVal) el.ioIopsVal.textContent = Math.round(data.io.totalIops) + " IOPS";
        if (el.ioDisksText) {
            const diskCount = data.storage.disks.length;
            el.ioDisksText.textContent = `${diskCount} ${diskCount === 1 ? "Block Disk" : "Block Disks"}`;
        }

        // 5. Update Charts
        renderCharts();

        // 6. Update Storage Section: Disks & Volumes
        updateDisksGrid(data.storage.disks);
        updateVolumesTable(data.storage.mounts);

        // 7. Update CPU Details & Cores Grid
        updateCoresGrid(data.cpu.cores);
        updateCpuSpecs(data.cpuSpecs, data.loadAvg, data.uptime);

        // 8. Update RAM Details & Memory Allocation Bar
        updateMemoryDetails(data.memory);
    }

    function getThresholdLabel(pct) {
        if (pct >= 90) return "Critical";
        if (pct >= 75) return "Warning";
        return "Normal";
    }

    // Render Disks Cards
    function updateDisksGrid(disks) {
        if (!el.disksGrid) return;
        if (el.disksCountBadge) el.disksCountBadge.textContent = disks.length;

        const query = state.filterText.toLowerCase();
        const filtered = disks.filter(d => {
            if (!query) return true;
            if (d.name.toLowerCase().includes(query)) return true;
            if (d.model.toLowerCase().includes(query)) return true;
            return d.partitions.some(p => (p.name && p.name.toLowerCase().includes(query)) ||
                                          (p.mountpoint && p.mountpoint.toLowerCase().includes(query)));
        });

        if (filtered.length === 0) {
            el.disksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 24px;">No block disks match filter "${state.filterText}".</div>`;
            return;
        }

        let html = "";
        for (const disk of filtered) {
            const diskTotalSize = disk.size || 1;
            const techLabel = disk.techType.toUpperCase();

            // Build partition segments for visual partition bar
            let segmentsHtml = "";
            let partsListHtml = "";

            if (disk.partitions.length === 0) {
                segmentsHtml = `<div class="partition-segment" style="width: 100%; background: #3b82f6;">Whole Device (${formatBytes(disk.size)})</div>`;
                partsListHtml = `<div class="partition-item"><span class="part-name">Entire block device</span><span class="part-mount">No partition table</span></div>`;
            } else {
                const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
                disk.partitions.forEach((p, idx) => {
                    const widthPct = Math.max(4, Math.min(100, (p.size / diskTotalSize) * 100));
                    const color = colors[idx % colors.length];
                    const label = `${p.name} (${formatBytes(p.size)})`;
                    segmentsHtml += `
                        <div class="partition-segment" style="width: ${widthPct}%; background-color: ${color};" title="${p.path} [${p.fstype}] ${p.mountpoint || 'Unmounted'} - ${formatBytes(p.size)}">
                            ${label}
                        </div>
                    `;

                    partsListHtml += `
                        <div class="partition-item">
                            <div class="part-name-mount">
                                <span class="part-name">${p.name}</span>
                                <span class="part-fs">${p.fstype || "raw"}</span>
                                <span class="part-mount">${p.mountpoint ? p.mountpoint : '<span style="color: var(--text-muted); font-style: italic;">unmounted</span>'}</span>
                            </div>
                            <div class="part-usage-meta">
                                ${p.mountpoint ? `<span style="font-family: monospace; font-weight: 600;">${p.usedPct.toFixed(1)}%</span>` : ""}
                                <span style="color: var(--text-muted);">${formatBytes(p.size)}</span>
                            </div>
                        </div>
                    `;
                });

                if (disk.unallocatedSize > 1024 * 1024 * 10) { // More than 10MB unallocated
                    const unallocPct = Math.max(2, (disk.unallocatedSize / diskTotalSize) * 100);
                    segmentsHtml += `
                        <div class="partition-segment" style="width: ${unallocPct}%; background-color: #4b5563;" title="Free Unallocated: ${formatBytes(disk.unallocatedSize)}">
                            Free (${formatBytes(disk.unallocatedSize)})
                        </div>
                    `;
                }
            }

            html += `
                <div class="disk-card">
                    <div class="disk-card-header">
                        <div class="disk-identity">
                            <span class="disk-device-badge">${disk.name}</span>
                            <div class="disk-name-model">
                                <span class="disk-model-text">${disk.model}</span>
                                <span class="disk-transport-text">${disk.path} &bull; ${disk.transport}</span>
                            </div>
                        </div>
                        <span class="disk-tech-pill ${disk.techType}">${techLabel}</span>
                    </div>

                    <div class="disk-stats-row">
                        <div class="disk-stat-box">
                            <span class="disk-stat-label">Capacity</span>
                            <span class="disk-stat-val">${formatBytes(disk.size)}</span>
                        </div>
                        <div class="disk-stat-box">
                            <span class="disk-stat-label">Read Rate</span>
                            <span class="disk-stat-val" style="color: var(--color-success);">${formatRate(disk.readRate)}</span>
                        </div>
                        <div class="disk-stat-box">
                            <span class="disk-stat-label">Write Rate</span>
                            <span class="disk-stat-val" style="color: var(--color-warning);">${formatRate(disk.writeRate)}</span>
                        </div>
                        <div class="disk-stat-box">
                            <span class="disk-stat-label">Throughput</span>
                            <span class="disk-stat-val">${Math.round(disk.iops)} IOPS</span>
                        </div>
                    </div>

                    <div class="partition-map-container">
                        <div class="partition-map-label">
                            <span>Partition Allocation</span>
                            <span>${disk.partitions.length} ${disk.partitions.length === 1 ? "Partition" : "Partitions"}</span>
                        </div>
                        <div class="partition-track">
                            ${segmentsHtml}
                        </div>
                    </div>

                    <div class="disk-partitions-list">
                        ${partsListHtml}
                    </div>
                </div>
            `;
        }

        el.disksGrid.innerHTML = html;
    }

    // Render Volumes & Mounts Table
    function updateVolumesTable(mounts) {
        if (!el.volumesTableBody) return;

        const query = state.filterText.toLowerCase();
        const filtered = mounts.filter(m => {
            if (state.volumeFilter === "physical" && m.isVirtual) return false;
            if (!query) return true;
            return m.mountpoint.toLowerCase().includes(query) ||
                   m.source.toLowerCase().includes(query) ||
                   m.fsType.toLowerCase().includes(query);
        });

        if (el.volumesCountBadge) el.volumesCountBadge.textContent = filtered.length;

        if (filtered.length === 0) {
            el.volumesTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No mounted volumes found matching criteria.</td></tr>`;
            return;
        }

        let html = "";
        for (const vol of filtered) {
            const pct = vol.usedPct;
            const barClass = getProgressClass(pct);
            const statusLabel = pct >= 90 ? "Critical" : (pct >= 75 ? "Warning" : "Healthy");
            const statusClass = pct >= 90 ? "danger" : (pct >= 75 ? "warning" : "normal");

            html += `
                <tr>
                    <td>
                        <div class="mount-path">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span>${vol.mountpoint}</span>
                        </div>
                    </td>
                    <td><span class="device-source">${vol.source}</span></td>
                    <td><span class="fstype-badge">${vol.fsType}</span></td>
                    <td style="font-weight: 600;">${formatBytes(vol.totalBytes)}</td>
                    <td style="color: var(--text-secondary);">${formatBytes(vol.usedBytes)}</td>
                    <td style="color: var(--text-secondary);">${formatBytes(vol.availBytes)}</td>
                    <td>
                        <div class="volume-progress-cell">
                            <div class="progress-track">
                                <div class="progress-fill ${barClass}" style="width: ${Math.min(100, Math.max(0, pct))}%;"></div>
                            </div>
                            <span class="percent-text">${pct.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td>
                        <span class="metric-pill ${statusClass}">${statusLabel}</span>
                    </td>
                </tr>
            `;
        }

        el.volumesTableBody.innerHTML = html;
    }

    // Render CPU Cores Grid
    function updateCoresGrid(cores) {
        if (!el.coresGrid) return;
        if (el.coresCountBadge) el.coresCountBadge.textContent = cores.length;

        let html = "";
        for (const c of cores) {
            const usage = c.usage;
            const barClass = getProgressClass(usage);
            html += `
                <div class="core-card">
                    <div class="core-header">
                        <span class="core-label">Core ${c.index}</span>
                        <span class="core-percent">${usage.toFixed(1)}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill ${barClass}" style="width: ${Math.min(100, Math.max(0, usage))}%;"></div>
                    </div>
                </div>
            `;
        }
        el.coresGrid.innerHTML = html;
    }

    // Update CPU Hardware Specs
    function updateCpuSpecs(specs, loadAvg, uptime) {
        if (el.specCpuModel) el.specCpuModel.textContent = specs.model;
        if (el.specCpuArch) el.specCpuArch.textContent = specs.arch;
        if (el.specCpuCores) el.specCpuCores.textContent = `${specs.cores} Cores / Threads`;
        if (el.specCpuFreq) el.specCpuFreq.textContent = specs.freq;
        if (el.specCpuLoad) el.specCpuLoad.textContent = `${loadAvg.load1} (1m), ${loadAvg.load5} (5m), ${loadAvg.load15} (15m)`;
        if (el.specCpuUptime) el.specCpuUptime.textContent = uptime.text;
        if (el.specCpuProcs) el.specCpuProcs.textContent = loadAvg.procs;
    }

    // Update Memory Allocation & Swap
    function updateMemoryDetails(mem) {
        const total = mem.total || 1;
        const usedPct = (mem.used / total) * 100;
        const cachedPct = ((mem.cached + mem.buffers) / total) * 100;
        const freePct = Math.max(0, 100 - usedPct - cachedPct);

        if (el.memBarUsed) el.memBarUsed.style.width = usedPct.toFixed(1) + "%";
        if (el.memBarCached) el.memBarCached.style.width = cachedPct.toFixed(1) + "%";
        if (el.memBarFree) el.memBarFree.style.width = freePct.toFixed(1) + "%";

        if (el.memLegendUsedVal) el.memLegendUsedVal.textContent = `${formatBytes(mem.used)} (${usedPct.toFixed(1)}%)`;
        if (el.memLegendCachedVal) el.memLegendCachedVal.textContent = `${formatBytes(mem.cached + mem.buffers)} (${cachedPct.toFixed(1)}%)`;
        if (el.memLegendFreeVal) el.memLegendFreeVal.textContent = `${formatBytes(mem.free)} (${freePct.toFixed(1)}%)`;

        if (el.ramTotalVal) el.ramTotalVal.textContent = formatBytes(mem.total);
        if (el.ramUsedVal) el.ramUsedVal.textContent = formatBytes(mem.used);
        if (el.ramAvailableVal) el.ramAvailableVal.textContent = formatBytes(mem.available);
        if (el.ramBuffersVal) el.ramBuffersVal.textContent = formatBytes(mem.buffers);
        if (el.ramCachedVal) el.ramCachedVal.textContent = formatBytes(mem.cached);
        if (el.ramActiveVal) el.ramActiveVal.textContent = formatBytes(mem.active);

        // Swap
        const swapPct = mem.swapPct;
        if (el.swapBarFill) {
            el.swapBarFill.style.width = Math.min(100, Math.max(0, swapPct)) + "%";
            el.swapBarFill.className = "progress-fill " + (swapPct > 50 ? "warning" : "purple");
        }
        if (el.swapTextVal) el.swapTextVal.textContent = swapPct.toFixed(1) + "%";
        if (el.swapTotalVal) el.swapTotalVal.textContent = formatBytes(mem.swapTotal);
        if (el.swapUsedVal) el.swapUsedVal.textContent = formatBytes(mem.swapUsed);
        if (el.swapFreeVal) el.swapFreeVal.textContent = formatBytes(mem.swapFree);
    }

    // High Performance SVG Charts Rendering
    function renderCharts() {
        const isLight = document.body.classList.contains("theme-light");
        const gridColor = isLight ? "#e5e7eb" : "#2e3846";

        // 1. CPU Chart
        renderSingleSeriesChart(
            el.cpuChartSvg,
            state.history.cpu,
            0,
            100,
            "#3b82f6",
            "rgba(59, 130, 246, 0.25)",
            gridColor,
            "%"
        );
        if (el.cpuChartCurrent && state.history.cpu.length > 0) {
            const val = state.history.cpu[state.history.cpu.length - 1];
            el.cpuChartCurrent.textContent = val.toFixed(1) + "%";
        }

        // 2. RAM Chart
        renderSingleSeriesChart(
            el.ramChartSvg,
            state.history.ram,
            0,
            100,
            "#8b5cf6",
            "rgba(139, 92, 246, 0.25)",
            gridColor,
            "%"
        );
        if (el.ramChartCurrent && state.history.ram.length > 0) {
            const val = state.history.ram[state.history.ram.length - 1];
            el.ramChartCurrent.textContent = val.toFixed(1) + "%";
        }

        // 3. Disk I/O Dual Series Chart (Read = Emerald Green, Write = Amber Orange)
        renderDualSeriesChart(
            el.ioChartSvg,
            state.history.diskReadMB,
            state.history.diskWriteMB,
            "#10b981",
            "#f59e0b",
            gridColor
        );
        if (el.ioChartCurrent && state.history.diskReadMB.length > 0) {
            const r = state.history.diskReadMB[state.history.diskReadMB.length - 1];
            const w = state.history.diskWriteMB[state.history.diskWriteMB.length - 1];
            el.ioChartCurrent.textContent = `R: ${r.toFixed(1)} MB/s | W: ${w.toFixed(1)} MB/s`;
        }
    }

    function renderSingleSeriesChart(svg, series, minVal, maxVal, strokeColor, fillColor, gridColor, unit = "") {
        if (!svg) return;
        const width = svg.clientWidth || 320;
        const height = svg.clientHeight || 120;
        const padX = 35;
        const padY = 15;
        const plotW = width - padX - 10;
        const plotH = height - padY * 2;

        if (series.length === 0) {
            svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" fill="gray" text-anchor="middle" font-size="12">Collecting data...</text>`;
            return;
        }

        const maxPoints = state.historyLength;
        const stepX = plotW / (maxPoints - 1);

        // Compute coordinates
        let points = [];
        series.forEach((val, i) => {
            const x = padX + (maxPoints - series.length + i) * stepX;
            const clamped = Math.max(minVal, Math.min(maxVal, val));
            const y = padY + plotH - ((clamped - minVal) / (maxVal - minVal)) * plotH;
            points.push({ x, y });
        });

        // SVG Path Construction
        let linePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            linePath += ` L ${points[i].x} ${points[i].y}`;
        }

        const areaPath = `${linePath} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`;

        // Horizontal Gridlines (0%, 50%, 100%)
        const y0 = padY + plotH;
        const y50 = padY + plotH * 0.5;
        const y100 = padY;

        svg.innerHTML = `
            <line x1="${padX}" y1="${y100}" x2="${width - 10}" y2="${y100}" stroke="${gridColor}" stroke-dasharray="3 3" />
            <line x1="${padX}" y1="${y50}" x2="${width - 10}" y2="${y50}" stroke="${gridColor}" stroke-dasharray="3 3" />
            <line x1="${padX}" y1="${y0}" x2="${width - 10}" y2="${y0}" stroke="${gridColor}" />

            <text x="${padX - 6}" y="${y100 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${maxVal}${unit}</text>
            <text x="${padX - 6}" y="${y50 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${Math.round((maxVal + minVal) / 2)}${unit}</text>
            <text x="${padX - 6}" y="${y0 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${minVal}${unit}</text>

            <path d="${areaPath}" fill="${fillColor}" />
            <path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="3.5" fill="${strokeColor}" />
        `;
    }

    function renderDualSeriesChart(svg, readSeries, writeSeries, readColor, writeColor, gridColor) {
        if (!svg) return;
        const width = svg.clientWidth || 320;
        const height = svg.clientHeight || 120;
        const padX = 40;
        const padY = 15;
        const plotW = width - padX - 10;
        const plotH = height - padY * 2;

        if (readSeries.length === 0 && writeSeries.length === 0) {
            svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" fill="gray" text-anchor="middle" font-size="12">Collecting data...</text>`;
            return;
        }

        // Auto-scale peak value with margin
        let maxVal = 2.0; // minimum ceiling 2 MB/s
        readSeries.forEach(v => { if (v > maxVal) maxVal = v; });
        writeSeries.forEach(v => { if (v > maxVal) maxVal = v; });
        maxVal = Math.ceil(maxVal * 1.25 * 10) / 10; // Round up cleanly

        const maxPoints = state.historyLength;
        const stepX = plotW / (maxPoints - 1);

        function buildPoints(series) {
            return series.map((val, i) => {
                const x = padX + (maxPoints - series.length + i) * stepX;
                const clamped = Math.max(0, Math.min(maxVal, val));
                const y = padY + plotH - (clamped / maxVal) * plotH;
                return { x, y };
            });
        }

        const readPts = buildPoints(readSeries);
        const writePts = buildPoints(writeSeries);

        let readLine = readPts.length > 0 ? `M ${readPts[0].x} ${readPts[0].y}` : "";
        for (let i = 1; i < readPts.length; i++) readLine += ` L ${readPts[i].x} ${readPts[i].y}`;

        let writeLine = writePts.length > 0 ? `M ${writePts[0].x} ${writePts[0].y}` : "";
        for (let i = 1; i < writePts.length; i++) writeLine += ` L ${writePts[i].x} ${writePts[i].y}`;

        const y0 = padY + plotH;
        const y50 = padY + plotH * 0.5;
        const y100 = padY;

        svg.innerHTML = `
            <line x1="${padX}" y1="${y100}" x2="${width - 10}" y2="${y100}" stroke="${gridColor}" stroke-dasharray="3 3" />
            <line x1="${padX}" y1="${y50}" x2="${width - 10}" y2="${y50}" stroke="${gridColor}" stroke-dasharray="3 3" />
            <line x1="${padX}" y1="${y0}" x2="${width - 10}" y2="${y0}" stroke="${gridColor}" />

            <text x="${padX - 6}" y="${y100 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${maxVal.toFixed(1)}M</text>
            <text x="${padX - 6}" y="${y50 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${(maxVal / 2).toFixed(1)}M</text>
            <text x="${padX - 6}" y="${y0 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">0M</text>

            ${readLine ? `<path d="${readLine}" fill="none" stroke="${readColor}" stroke-width="2" stroke-linecap="round" />` : ""}
            ${writeLine ? `<path d="${writeLine}" fill="none" stroke="${writeColor}" stroke-width="2" stroke-linecap="round" />` : ""}
        `;
    }

    // Main Telemetry Loop
    async function tick() {
        if (state.isPaused) return;

        try {
            const data = await collectSystemTelemetry();
            updateDashboardUI(data);
            setLiveStatus("live", `Live (${(state.intervalMs / 1000).toFixed(0)}s)`);
        } catch (err) {
            console.error("Telemetry tick failed:", err);
            setLiveStatus("error", "Error connecting");
        }
    }

    function setLiveStatus(status, label) {
        if (!el.statusPill) return;
        el.statusPill.className = "status-pill " + (status === "paused" ? "paused" : (status === "error" ? "error" : ""));
        if (el.statusText) el.statusText.textContent = label;
    }

    function restartTimer() {
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = null;
        }
        if (!state.isPaused) {
            state.timerId = setInterval(tick, state.intervalMs);
        }
    }

    // Attach Event Listeners
    function setupEventListeners() {
        // Polling interval change
        if (el.intervalSelect) {
            el.intervalSelect.value = state.intervalMs;
            el.intervalSelect.addEventListener("change", (e) => {
                state.intervalMs = parseInt(e.target.value, 10) || 2000;
                setLiveStatus(state.isPaused ? "paused" : "live", state.isPaused ? "Paused" : `Live (${(state.intervalMs / 1000).toFixed(0)}s)`);
                restartTimer();
            });
        }

        // Pause / Resume Button
        if (el.btnPause) {
            el.btnPause.addEventListener("click", () => {
                state.isPaused = !state.isPaused;
                if (state.isPaused) {
                    el.btnPause.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                        <span>Resume</span>
                    `;
                    setLiveStatus("paused", "Paused");
                    if (state.timerId) clearInterval(state.timerId);
                } else {
                    el.btnPause.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                        <span>Pause</span>
                    `;
                    setLiveStatus("live", `Live (${(state.intervalMs / 1000).toFixed(0)}s)`);
                    tick();
                    restartTimer();
                }
            });
        }

        // Refresh Now Button
        if (el.btnRefresh) {
            el.btnRefresh.addEventListener("click", () => {
                tick();
            });
        }

        // Theme Selector
        if (el.themeSelect) {
            el.themeSelect.value = state.theme;
            el.themeSelect.addEventListener("change", (e) => {
                applyTheme(e.target.value);
            });
        }

        // Listen for OS Theme Changes if theme is 'auto'
        if (window.matchMedia) {
            window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
                if (state.theme === "auto") {
                    applyTheme("auto");
                }
            });
        }

        // Storage Search Filter
        if (el.storageSearchInput) {
            el.storageSearchInput.addEventListener("input", (e) => {
                state.filterText = e.target.value;
                tick(); // re-render with filter immediately
            });
        }

        // Mounts Filter Tabs
        if (el.tabStandardMounts) {
            el.tabStandardMounts.addEventListener("click", () => {
                state.volumeFilter = "physical";
                el.tabStandardMounts.classList.add("active");
                if (el.tabAllMounts) el.tabAllMounts.classList.remove("active");
                tick();
            });
        }

        if (el.tabAllMounts) {
            el.tabAllMounts.addEventListener("click", () => {
                state.volumeFilter = "all";
                el.tabAllMounts.classList.add("active");
                if (el.tabStandardMounts) el.tabStandardMounts.classList.remove("active");
                tick();
            });
        }

        // Window resize to re-render charts accurately
        let resizeDebounce = null;
        window.addEventListener("resize", () => {
            clearTimeout(resizeDebounce);
            resizeDebounce = setTimeout(renderCharts, 100);
        });
    }

    // Startup Initialization
    window.addEventListener("DOMContentLoaded", () => {
        initDomReferences();
        setupEventListeners();
        applyTheme(state.theme);

        if (!window.cockpit) {
            if (el.demoBanner) el.demoBanner.classList.add("show");
        }

        // First immediate sample
        tick();

        // Start periodic loop
        restartTimer();
    });

    // Cleanup on window unload
    window.addEventListener("beforeunload", () => {
        if (state.timerId) clearInterval(state.timerId);
    });

})();
