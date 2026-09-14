/**
 * Cockpit Dashboard Plugin - dashboard.js
 * Real-time monitoring engine for Storage (Disks & Volumes), CPU, and RAM
 * PatternFly / Cockpit Networking Plugin Architecture
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
        plotView: "io",          // 'io', 'cpu', 'ram'
        expandedDisks: new Set(),
        lastTimestamp: null,
        prevCpuStat: null,
        prevDiskStats: new Map(),
        historyLength: 45,
        history: {
            cpu: [],
            ram: [],
            swap: [],
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

            // Top Plot Card
            tabPlotIo: document.getElementById("tab-plot-io"),
            tabPlotCpu: document.getElementById("tab-plot-cpu"),
            tabPlotRam: document.getElementById("tab-plot-ram"),
            plotLegend: document.getElementById("plot-legend"),
            telemetryPlotSvg: document.getElementById("telemetry-plot-svg"),
            legendReadVal: document.getElementById("legend-read-val"),
            legendWriteVal: document.getElementById("legend-write-val"),
            legendIopsVal: document.getElementById("legend-iops-val"),

            // Overview Stat Cards
            storageHugeVal: document.getElementById("storage-huge-val"),
            storageSubtext: document.getElementById("storage-subtext"),
            storageProgressBar: document.getElementById("storage-progress-bar"),
            storageFreeText: document.getElementById("storage-free-text"),
            storagePill: document.getElementById("storage-pill"),

            ioReadVal: document.getElementById("io-read-val"),
            ioWriteVal: document.getElementById("io-write-val"),
            ioIopsVal: document.getElementById("io-iops-val"),
            ioDisksText: document.getElementById("io-disks-text"),

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

            // Disks Section
            storageSearchInput: document.getElementById("storage-search"),
            disksTableBody: document.getElementById("disks-table-body"),
            disksCountBadge: document.getElementById("disks-count-badge"),

            // Volumes Section
            tabStandardMounts: document.getElementById("tab-standard-mounts"),
            tabAllMounts: document.getElementById("tab-all-mounts"),
            volumesTableBody: document.getElementById("volumes-table-body"),
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

            // RAM Section
            memBarUsed: document.getElementById("mem-bar-used"),
            memBarCached: document.getElementById("mem-bar-cached"),
            memBarFree: document.getElementById("mem-bar-free"),
            memLegendUsedVal: document.getElementById("mem-legend-used-val"),
            memLegendCachedVal: document.getElementById("mem-legend-cached-val"),
            memLegendFreeVal: document.getElementById("mem-legend-free-val"),
            ramTotalVal: document.getElementById("ram-total-val"),
            ramAvailableVal: document.getElementById("ram-available-val"),
            ramBuffersVal: document.getElementById("ram-buffers-val"),
            ramCachedVal: document.getElementById("ram-cached-val"),
            swapBarFill: document.getElementById("swap-bar-fill"),
            swapTextVal: document.getElementById("swap-text-val"),
            swapUsedVal: document.getElementById("swap-used-val"),
            swapTotalVal: document.getElementById("swap-total-val")
        };
    }

    // Byte Formatting Helper
    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0 || !bytes || isNaN(bytes)) return "0 B";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const index = Math.min(i, sizes.length - 1);
        return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + " " + sizes[index];
    }

    // Rate Formatting Helper
    function formatRate(bytesPerSec) {
        if (bytesPerSec === 0 || !bytesPerSec || isNaN(bytesPerSec)) return "0 KB/s";
        if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + " B/s";
        if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
        if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(2) + " MB/s";
        return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + " GB/s";
    }

    // Uptime Formatting Helper
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

    // PatternFly Status Labels and Classes
    function getPfThresholdClass(pct) {
        if (pct >= 90) return "pf-m-red";
        if (pct >= 75) return "pf-m-gold";
        return "pf-m-green";
    }

    function getPfIndicatorClass(pct) {
        if (pct >= 90) return "red";
        if (pct >= 75) return "orange";
        return "green";
    }

    function getThresholdLabel(pct) {
        if (pct >= 90) return "Critical";
        if (pct >= 75) return "Warning";
        return "Normal";
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
        renderPlot();
    }

    // Data Collector Query
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
            console.error("Cockpit spawn error, retrying fallback:", err);
            try {
                const altOutput = await window.cockpit.spawn(["/bin/sh", "-c", scriptCommand], { err: "out" });
                return parseTelemetryOutput(altOutput);
            } catch (fallbackErr) {
                console.error("Critical: Telemetry query failed:", fallbackErr);
                throw fallbackErr;
            }
        }
    }

    // Output Parser
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

        const cpuData = parseCpuSection(sections.STAT, deltaSec);
        const uptimeData = parseUptime(sections.UPTIME);
        const loadAvgData = parseLoadAvg(sections.LOADAVG);
        const cpuSpecs = parseCpuInfo(sections.CPUINFO);
        const memData = parseMemInfo(sections.MEMINFO);
        const diskIoData = parseDiskStats(sections.DISKSTATS, deltaSec);
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
                cores.push({ index: coreIdx, stat: parseStatLine(parts) });
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
            coreResults.push({ index: c.index, usage: coreUsage });
        }

        state.prevCpuStat = {
            total: overall ? overall.total : 0,
            busy: overall ? overall.busy : 0,
            cores: cores.map(c => c.stat)
        };

        return { totalUsage, cores: coreResults };
    }

    function parseStatLine(parts) {
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
        return { seconds: sec, text: formatUptime(sec) };
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

    // Parse lscpu
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
        if (!raw) return { total: 0, used: 0, free: 0, available: 0, cached: 0, buffers: 0, usedPct: 0, swapTotal: 0, swapUsed: 0, swapPct: 0 };
        const mem = {};
        const lines = raw.split("\n");
        for (const line of lines) {
            const [k, v] = line.split(":");
            if (k && v) {
                mem[k.trim()] = parseInt(v.trim().split(/\s+/)[0], 10) * 1024;
            }
        }

        const total = mem.MemTotal || 1;
        const free = mem.MemFree || 0;
        const available = mem.MemAvailable !== undefined ? mem.MemAvailable : free;
        const used = Math.max(0, total - available);
        const buffers = mem.Buffers || 0;
        const cached = mem.Cached || 0;

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

                if (!devName.match(/\d+$/) || devName.startsWith("nvme") && devName.endsWith("n1")) {
                    totalReadBytesSec += readRate;
                    totalWriteBytesSec += writeRate;
                    totalIops += iops;
                }
            }

            state.prevDiskStats.set(devName, { reads, sectorsRead, writes, sectorsWritten });
            disks.set(devName, { devName, readRate, writeRate, iops });
        }

        return { totalReadBytesSec, totalWriteBytesSec, totalIops, disks };
    }

    // Parse lsblk and df
    function parseStorage(lsblkRaw, dfRaw, diskIoMap) {
        let blockDevices = [];
        try {
            const parsed = JSON.parse(lsblkRaw || '{"blockdevices":[]}');
            blockDevices = parsed.blockdevices || [];
        } catch (e) {
            console.warn("Error parsing lsblk:", e);
        }

        const mountsMap = new Map();
        let totalStorageCap = 0;
        let totalStorageUsed = 0;
        let totalStorageAvail = 0;

        if (dfRaw) {
            const dfLines = dfRaw.trim().split("\n");
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
                model: dev.model || "Block Device",
                size: dev.size || 0,
                transport: (dev.tran || "SATA").toUpperCase(),
                techType: techType,
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

    // Mock Telemetry Generator
    function generateMockTelemetry() {
        const now = Date.now();
        const baseCpu = 15 + Math.sin(now / 4000) * 10 + Math.random() * 4;
        const baseRam = 42 + Math.cos(now / 7000) * 6;
        const readRate = Math.max(0, 1024 * 1024 * (3.2 + Math.sin(now / 3500) * 2.5));
        const writeRate = Math.max(0, 1024 * 512 * (2.1 + Math.cos(now / 2500) * 1.8));

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
                iops: 420 + Math.floor(Math.random() * 90),
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
                iops: 130 + Math.floor(Math.random() * 40),
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
                    { index: 0, usage: Math.max(0, Math.min(100, baseCpu + Math.sin(now / 1000) * 12)) },
                    { index: 1, usage: Math.max(0, Math.min(100, baseCpu + Math.cos(now / 1100) * 10)) },
                    { index: 2, usage: Math.max(0, Math.min(100, baseCpu - Math.sin(now / 1200) * 8)) },
                    { index: 3, usage: Math.max(0, Math.min(100, baseCpu - Math.cos(now / 1300) * 6)) }
                ]
            },
            uptime: { seconds: 128400, text: "1d 11h 40m" },
            loadAvg: { load1: "0.38", load5: "0.45", load15: "0.42", procs: "2/390" },
            cpuSpecs: { model: "AMD Ryzen 9 / ARM Cortex-A72", arch: "x86_64 / aarch64", cores: 4, freq: "3400 MHz" },
            memory: {
                total: 34359738368,
                used: (34359738368 * baseRam) / 100,
                available: (34359738368 * (100 - baseRam)) / 100,
                free: 8589934592,
                buffers: 1073741824,
                cached: 8589934592,
                usedPct: baseRam,
                swapTotal: 17179869184,
                swapUsed: 1073741824,
                swapPct: 6.25
            },
            io: {
                totalReadBytesSec: readRate,
                totalWriteBytesSec: writeRate,
                totalIops: 550 + Math.floor(Math.random() * 80),
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

        // Push History for Plots
        state.history.cpu.push(data.cpu.totalUsage);
        if (state.history.cpu.length > state.historyLength) state.history.cpu.shift();

        state.history.ram.push(data.memory.usedPct);
        if (state.history.ram.length > state.historyLength) state.history.ram.shift();

        state.history.swap.push(data.memory.swapPct);
        if (state.history.swap.length > state.historyLength) state.history.swap.shift();

        const readMB = data.io.totalReadBytesSec / (1024 * 1024);
        const writeMB = data.io.totalWriteBytesSec / (1024 * 1024);
        state.history.diskReadMB.push(readMB);
        state.history.diskWriteMB.push(writeMB);
        if (state.history.diskReadMB.length > state.historyLength) state.history.diskReadMB.shift();
        if (state.history.diskWriteMB.length > state.historyLength) state.history.diskWriteMB.shift();

        // 1. Update Top Plot Card
        renderPlot(data);

        // 2. Update Storage Stat Card
        const stPct = data.storage.globalUsagePct;
        if (el.storageHugeVal) el.storageHugeVal.textContent = stPct.toFixed(1);
        if (el.storageProgressBar) {
            el.storageProgressBar.style.width = Math.min(100, Math.max(0, stPct)) + "%";
            el.storageProgressBar.className = "pf-v6-c-progress__indicator " + getPfIndicatorClass(stPct);
        }
        if (el.storagePill) {
            el.storagePill.textContent = getThresholdLabel(stPct);
            el.storagePill.className = "pf-v6-c-label " + getPfThresholdClass(stPct);
        }
        if (el.storageSubtext) el.storageSubtext.textContent = `${formatBytes(data.storage.totalUsed)} / ${formatBytes(data.storage.totalCapacity)}`;
        if (el.storageFreeText) el.storageFreeText.textContent = `Free: ${formatBytes(data.storage.totalAvailable)}`;

        // 3. Update Disk I/O Stat Card
        if (el.ioReadVal) el.ioReadVal.textContent = formatRate(data.io.totalReadBytesSec);
        if (el.ioWriteVal) el.ioWriteVal.textContent = formatRate(data.io.totalWriteBytesSec);
        if (el.ioIopsVal) el.ioIopsVal.textContent = Math.round(data.io.totalIops) + " IOPS";
        if (el.ioDisksText) {
            const count = data.storage.disks.length;
            el.ioDisksText.textContent = `${count} ${count === 1 ? "Disk" : "Disks"}`;
        }

        // 4. Update CPU Stat Card
        const cpuPct = data.cpu.totalUsage;
        if (el.cpuHugeVal) el.cpuHugeVal.textContent = cpuPct.toFixed(1);
        if (el.cpuProgressBar) {
            el.cpuProgressBar.style.width = Math.min(100, Math.max(0, cpuPct)) + "%";
            el.cpuProgressBar.className = "pf-v6-c-progress__indicator " + getPfIndicatorClass(cpuPct);
        }
        if (el.cpuPill) {
            el.cpuPill.textContent = getThresholdLabel(cpuPct);
            el.cpuPill.className = "pf-v6-c-label " + getPfThresholdClass(cpuPct);
        }
        if (el.cpuSubtext) el.cpuSubtext.textContent = `${data.cpu.cores.length || data.cpuSpecs.cores} Cores @ ${data.cpuSpecs.freq}`;
        if (el.cpuLoadText) el.cpuLoadText.textContent = `Load: ${data.loadAvg.load1}`;

        // 5. Update RAM Stat Card
        const memPct = data.memory.usedPct;
        if (el.ramHugeVal) el.ramHugeVal.textContent = memPct.toFixed(1);
        if (el.ramProgressBar) {
            el.ramProgressBar.style.width = Math.min(100, Math.max(0, memPct)) + "%";
            el.ramProgressBar.className = "pf-v6-c-progress__indicator " + (memPct >= 90 ? "red" : (memPct >= 75 ? "orange" : "purple"));
        }
        if (el.ramPill) {
            el.ramPill.textContent = getThresholdLabel(memPct);
            el.ramPill.className = "pf-v6-c-label " + getPfThresholdClass(memPct);
        }
        if (el.ramSubtext) el.ramSubtext.textContent = `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`;
        if (el.ramAvailText) el.ramAvailText.textContent = `Avail: ${formatBytes(data.memory.available)}`;

        // 6. Update Disks Table
        updateDisksTable(data.storage.disks);

        // 7. Update Volumes Table
        updateVolumesTable(data.storage.mounts);

        // 8. Update CPU Cores Grid & Specs
        updateCoresGrid(data.cpu.cores);
        updateCpuSpecs(data.cpuSpecs, data.loadAvg, data.uptime);

        // 9. Update Memory Distribution & Swap
        updateMemoryDetails(data.memory);
    }

    // Top Plot Rendering (Cockpit ct-plot implementation)
    function renderPlot(data) {
        const svg = el.telemetryPlotSvg;
        if (!svg) return;

        const isLight = document.body.classList.contains("theme-light");
        const gridColor = isLight ? "#d2d2d2" : "#36373a";
        const width = svg.clientWidth || 800;
        const height = svg.clientHeight || 160;
        const padX = 50;
        const padY = 16;
        const plotW = width - padX - 16;
        const plotH = height - padY * 2;

        if (state.plotView === "io") {
            // Update Legend
            if (el.plotLegend) {
                const curRead = state.history.diskReadMB.length ? state.history.diskReadMB[state.history.diskReadMB.length - 1] : 0;
                const curWrite = state.history.diskWriteMB.length ? state.history.diskWriteMB[state.history.diskWriteMB.length - 1] : 0;
                const curIops = data ? Math.round(data.io.totalIops) : 0;
                el.plotLegend.innerHTML = `
                    <div class="ct-legend-item">
                        <span class="ct-legend-dot" style="background-color: var(--pf-t--chart--color--blue--300);"></span>
                        <span>Read: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${formatRate(curRead * 1024 * 1024)}</strong></span>
                    </div>
                    <div class="ct-legend-item">
                        <span class="ct-legend-dot" style="background-color: var(--pf-t--chart--color--orange--300);"></span>
                        <span>Write: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${formatRate(curWrite * 1024 * 1024)}</strong></span>
                    </div>
                    <div class="ct-legend-item">
                        <span style="color: var(--pf-t--global--text--color--muted);">&bull;</span>
                        <span>IOPS: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${curIops}</strong></span>
                    </div>
                `;
            }

            // Render Dual Rate Curves
            let maxVal = 2.0;
            state.history.diskReadMB.forEach(v => { if (v > maxVal) maxVal = v; });
            state.history.diskWriteMB.forEach(v => { if (v > maxVal) maxVal = v; });
            maxVal = Math.ceil(maxVal * 1.2 * 10) / 10;

            renderDualSeries(svg, state.history.diskReadMB, state.history.diskWriteMB, maxVal, "MB/s", "#0066cc", "rgba(0, 102, 204, 0.2)", "#ec7a08", "rgba(236, 122, 8, 0.2)", width, height, padX, padY, plotW, plotH, gridColor);

        } else if (state.plotView === "cpu") {
            const curCpu = state.history.cpu.length ? state.history.cpu[state.history.cpu.length - 1] : 0;
            if (el.plotLegend) {
                el.plotLegend.innerHTML = `
                    <div class="ct-legend-item">
                        <span class="ct-legend-dot" style="background-color: var(--pf-t--chart--color--blue--300);"></span>
                        <span>CPU Load: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${curCpu.toFixed(1)}%</strong></span>
                    </div>
                `;
            }
            renderSingleSeries(svg, state.history.cpu, 100, "%", "#0066cc", "rgba(0, 102, 204, 0.25)", width, height, padX, padY, plotW, plotH, gridColor);

        } else if (state.plotView === "ram") {
            const curRam = state.history.ram.length ? state.history.ram[state.history.ram.length - 1] : 0;
            const curSwap = state.history.swap.length ? state.history.swap[state.history.swap.length - 1] : 0;
            if (el.plotLegend) {
                el.plotLegend.innerHTML = `
                    <div class="ct-legend-item">
                        <span class="ct-legend-dot" style="background-color: #8b5cf6;"></span>
                        <span>RAM: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${curRam.toFixed(1)}%</strong></span>
                    </div>
                    <div class="ct-legend-item">
                        <span class="ct-legend-dot" style="background-color: #009596;"></span>
                        <span>Swap: <strong style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--regular);">${curSwap.toFixed(1)}%</strong></span>
                    </div>
                `;
            }
            renderDualSeries(svg, state.history.ram, state.history.swap, 100, "%", "#8b5cf6", "rgba(139, 92, 246, 0.2)", "#009596", "rgba(0, 149, 150, 0.2)", width, height, padX, padY, plotW, plotH, gridColor);
        }
    }

    function renderSingleSeries(svg, series, maxVal, unit, strokeColor, fillColor, width, height, padX, padY, plotW, plotH, gridColor) {
        if (!series || series.length === 0) {
            svg.innerHTML = `<text x="${width/2}" y="${height/2}" fill="gray" text-anchor="middle">Collecting data...</text>`;
            return;
        }

        const maxPoints = state.historyLength;
        const stepX = plotW / (maxPoints - 1);
        const points = series.map((val, i) => {
            const x = padX + (maxPoints - series.length + i) * stepX;
            const y = padY + plotH - (Math.max(0, Math.min(maxVal, val)) / maxVal) * plotH;
            return { x, y };
        });

        let linePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) linePath += ` L ${points[i].x} ${points[i].y}`;
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`;

        svg.innerHTML = `
            <line class="ct-plot-lines" x1="${padX}" y1="${padY}" x2="${width - 16}" y2="${padY}" stroke="${gridColor}" />
            <line class="ct-plot-lines" x1="${padX}" y1="${padY + plotH * 0.5}" x2="${width - 16}" y2="${padY + plotH * 0.5}" stroke="${gridColor}" />
            <line class="ct-plot-lines" x1="${padX}" y1="${padY + plotH}" x2="${width - 16}" y2="${padY + plotH}" stroke="${gridColor}" />

            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + 4}" text-anchor="end">${maxVal}${unit}</text>
            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + plotH * 0.5 + 4}" text-anchor="end">${Math.round(maxVal / 2)}${unit}</text>
            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + plotH + 4}" text-anchor="end">0${unit}</text>

            <path d="${areaPath}" fill="${fillColor}" />
            <path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" />
            <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="3" fill="${strokeColor}" />
        `;
    }

    function renderDualSeries(svg, s1, s2, maxVal, unit, c1, a1, c2, a2, width, height, padX, padY, plotW, plotH, gridColor) {
        const maxPoints = state.historyLength;
        const stepX = plotW / (maxPoints - 1);

        function toPoints(series) {
            return series.map((val, i) => {
                const x = padX + (maxPoints - series.length + i) * stepX;
                const y = padY + plotH - (Math.max(0, Math.min(maxVal, val)) / maxVal) * plotH;
                return { x, y };
            });
        }

        const pts1 = toPoints(s1);
        const pts2 = toPoints(s2);

        let path1 = pts1.length ? `M ${pts1[0].x} ${pts1[0].y}` : "";
        for (let i = 1; i < pts1.length; i++) path1 += ` L ${pts1[i].x} ${pts1[i].y}`;

        let path2 = pts2.length ? `M ${pts2[0].x} ${pts2[0].y}` : "";
        for (let i = 1; i < pts2.length; i++) path2 += ` L ${pts2[i].x} ${pts2[i].y}`;

        svg.innerHTML = `
            <line class="ct-plot-lines" x1="${padX}" y1="${padY}" x2="${width - 16}" y2="${padY}" stroke="${gridColor}" />
            <line class="ct-plot-lines" x1="${padX}" y1="${padY + plotH * 0.5}" x2="${width - 16}" y2="${padY + plotH * 0.5}" stroke="${gridColor}" />
            <line class="ct-plot-lines" x1="${padX}" y1="${padY + plotH}" x2="${width - 16}" y2="${padY + plotH}" stroke="${gridColor}" />

            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + 4}" text-anchor="end">${maxVal}${unit}</text>
            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + plotH * 0.5 + 4}" text-anchor="end">${(maxVal / 2).toFixed(1)}${unit}</text>
            <text class="ct-plot-axis" x="${padX - 8}" y="${padY + plotH + 4}" text-anchor="end">0${unit}</text>

            ${path1 ? `<path d="${path1}" fill="none" stroke="${c1}" stroke-width="2" stroke-linecap="round" />` : ""}
            ${path2 ? `<path d="${path2}" fill="none" stroke="${c2}" stroke-width="2" stroke-linecap="round" />` : ""}
        `;
    }

    // Render Disks Table (Matching Networking Interfaces Table)
    function updateDisksTable(disks) {
        if (!el.disksTableBody) return;
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
            el.disksTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--pf-t--global--text--color--muted); padding: 24px;">No block storage disks match filter.</td></tr>`;
            return;
        }

        let html = "";
        for (const disk of filtered) {
            const diskTotalSize = disk.size || 1;
            const techPillClass = disk.techType === "nvme" ? "pf-m-purple" : (disk.techType === "ssd" ? "pf-m-blue" : "pf-m-gold");
            const isExpanded = state.expandedDisks.has(disk.name);

            // Build Partition Slices for allocation bar
            let slicesHtml = "";
            if (disk.partitions.length === 0) {
                slicesHtml = `<div class="ct-partition-slice" style="width: 100%; background: #0066cc;">Whole (${formatBytes(disk.size)})</div>`;
            } else {
                const colors = ["#0066cc", "#3e8635", "#8b5cf6", "#ec7a08", "#009596", "#b2b0ea"];
                disk.partitions.forEach((p, idx) => {
                    const widthPct = Math.max(5, Math.min(100, (p.size / diskTotalSize) * 100));
                    const color = colors[idx % colors.length];
                    slicesHtml += `
                        <div class="ct-partition-slice" style="width: ${widthPct}%; background-color: ${color};" title="${p.name} [${p.fstype}] ${p.mountpoint || 'unmounted'} - ${formatBytes(p.size)}">
                            ${p.name}
                        </div>
                    `;
                });
            }

            // Main Row
            html += `
                <tr style="cursor: pointer;" data-disk="${disk.name}" class="disk-row">
                    <td>
                        <div class="ct-device-cell">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--pf-t--global--text--color--brand);">
                                <path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"></path>
                            </svg>
                            <span>${disk.name}</span>
                        </div>
                    </td>
                    <td>
                        <div><strong>${disk.model}</strong></div>
                        <div class="ct-subtext">${disk.path} &bull; ${disk.transport}</div>
                    </td>
                    <td>
                        <span class="pf-v6-c-label ${techPillClass}">${disk.techType.toUpperCase()}</span>
                    </td>
                    <td style="font-weight: 600; font-family: var(--pf-t--global--font--family--mono);">${formatBytes(disk.size)}</td>
                    <td style="color: var(--pf-t--chart--color--blue--300); font-family: var(--pf-t--global--font--family--mono); font-weight: 600;">${formatRate(disk.readRate)}</td>
                    <td style="color: var(--pf-t--chart--color--orange--300); font-family: var(--pf-t--global--font--family--mono); font-weight: 600;">${formatRate(disk.writeRate)}</td>
                    <td style="font-family: var(--pf-t--global--font--family--mono);">${Math.round(disk.iops)} IOPS</td>
                    <td>
                        <div class="ct-partition-bar-wrapper">
                            ${slicesHtml}
                        </div>
                    </td>
                </tr>
            `;

            // Expandable Row with Partitions Sub-Table
            if (isExpanded) {
                let partsRows = "";
                if (disk.partitions.length === 0) {
                    partsRows = `<tr><td colspan="6" style="color: var(--pf-t--global--text--color--muted);">No partitions defined on this disk.</td></tr>`;
                } else {
                    disk.partitions.forEach(p => {
                        partsRows += `
                            <tr>
                                <td style="font-family: var(--pf-t--global--font--family--mono); font-weight: 600;">${p.name}</td>
                                <td>${p.mountpoint ? `<span style="color: var(--pf-t--global--text--color--brand); font-weight: 600;">${p.mountpoint}</span>` : '<span style="color: var(--pf-t--global--text--color--muted); font-style: italic;">unmounted</span>'}</td>
                                <td><span class="pf-v6-c-badge">${p.fstype || "raw"}</span></td>
                                <td>${formatBytes(p.size)}</td>
                                <td>${p.mountpoint ? formatBytes(p.usedBytes) + " (" + p.usedPct.toFixed(1) + "%)" : "-"}</td>
                                <td style="font-family: var(--pf-t--global--font--family--mono); font-size: 0.72rem; color: var(--pf-t--global--text--color--muted);">${p.uuid || "-"}</td>
                            </tr>
                        `;
                    });
                }

                html += `
                    <tr class="ct-expand-row">
                        <td colspan="8">
                            <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--pf-t--global--text--color--muted); margin-bottom: 8px;">
                                Partitions on ${disk.name}
                            </div>
                            <table class="ct-partitions-subtable">
                                <thead>
                                    <tr>
                                        <th>Partition</th>
                                        <th>Mount</th>
                                        <th>Type</th>
                                        <th>Size</th>
                                        <th>Used</th>
                                        <th>UUID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${partsRows}
                                </tbody>
                            </table>
                        </td>
                    </tr>
                `;
            }
        }

        el.disksTableBody.innerHTML = html;

        // Attach click to toggle expansion
        el.disksTableBody.querySelectorAll(".disk-row").forEach(row => {
            row.addEventListener("click", () => {
                const diskName = row.getAttribute("data-disk");
                if (state.expandedDisks.has(diskName)) {
                    state.expandedDisks.delete(diskName);
                } else {
                    state.expandedDisks.add(diskName);
                }
                tick();
            });
        });
    }

    // Render Volumes Table
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
            el.volumesTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--pf-t--global--text--color--muted); padding: 24px;">No mounted volumes found matching criteria.</td></tr>`;
            return;
        }

        let html = "";
        for (const vol of filtered) {
            const pct = vol.usedPct;
            const statusLabel = getThresholdLabel(pct);
            const statusClass = getPfThresholdClass(pct);
            const barClass = getPfIndicatorClass(pct);

            html += `
                <tr>
                    <td style="font-weight: 600; color: var(--pf-t--global--text--color--brand);">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span>${vol.mountpoint}</span>
                        </div>
                    </td>
                    <td style="font-family: var(--pf-t--global--font--family--mono); color: var(--pf-t--global--text--color--secondary);">${vol.source}</td>
                    <td><span class="pf-v6-c-badge">${vol.fsType}</span></td>
                    <td style="font-weight: 600; font-family: var(--pf-t--global--font--family--mono);">${formatBytes(vol.totalBytes)}</td>
                    <td style="color: var(--pf-t--global--text--color--secondary); font-family: var(--pf-t--global--font--family--mono);">${formatBytes(vol.usedBytes)}</td>
                    <td style="color: var(--pf-t--global--text--color--secondary); font-family: var(--pf-t--global--font--family--mono);">${formatBytes(vol.availBytes)}</td>
                    <td style="min-width: 140px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="pf-v6-c-progress__bar" style="flex: 1;">
                                <div class="pf-v6-c-progress__indicator ${barClass}" style="width: ${Math.min(100, Math.max(0, pct))}%;"></div>
                            </div>
                            <span style="font-family: var(--pf-t--global--font--family--mono); font-size: 0.78rem; font-weight: 700;">${pct.toFixed(1)}%</span>
                        </div>
                    </td>
                    <td>
                        <span class="pf-v6-c-label ${statusClass}">${statusLabel}</span>
                    </td>
                </tr>
            `;
        }

        el.volumesTableBody.innerHTML = html;
    }

    // Render CPU Cores Grid
    function updateCoresGrid(cores) {
        if (!el.coresGrid) return;
        if (el.coresCountBadge) el.coresCountBadge.textContent = `${cores.length} Cores`;

        let html = "";
        for (const c of cores) {
            const usage = c.usage;
            const barClass = getPfIndicatorClass(usage);
            html += `
                <div class="ct-core-card">
                    <div class="ct-core-header">
                        <span class="ct-core-label">Core ${c.index}</span>
                        <span class="ct-core-val">${usage.toFixed(1)}%</span>
                    </div>
                    <div class="pf-v6-c-progress__bar">
                        <div class="pf-v6-c-progress__indicator ${barClass}" style="width: ${Math.min(100, Math.max(0, usage))}%;"></div>
                    </div>
                </div>
            `;
        }
        el.coresGrid.innerHTML = html;
    }

    // Update Hardware Specs
    function updateCpuSpecs(specs, loadAvg, uptime) {
        if (el.specCpuModel) el.specCpuModel.textContent = specs.model;
        if (el.specCpuArch) el.specCpuArch.textContent = specs.arch;
        if (el.specCpuCores) el.specCpuCores.textContent = `${specs.cores} Cores / Threads`;
        if (el.specCpuFreq) el.specCpuFreq.textContent = specs.freq;
        if (el.specCpuLoad) el.specCpuLoad.textContent = `${loadAvg.load1} (1m), ${loadAvg.load5} (5m), ${loadAvg.load15} (15m)`;
        if (el.specCpuUptime) el.specCpuUptime.textContent = uptime.text;
    }

    // Update Memory Allocation Details
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
        if (el.ramAvailableVal) el.ramAvailableVal.textContent = formatBytes(mem.available);
        if (el.ramBuffersVal) el.ramBuffersVal.textContent = formatBytes(mem.buffers);
        if (el.ramCachedVal) el.ramCachedVal.textContent = formatBytes(mem.cached);

        // Swap
        const swapPct = mem.swapPct;
        if (el.swapBarFill) {
            el.swapBarFill.style.width = Math.min(100, Math.max(0, swapPct)) + "%";
            el.swapBarFill.className = "pf-v6-c-progress__indicator " + (swapPct > 50 ? "orange" : "purple");
        }
        if (el.swapTextVal) el.swapTextVal.textContent = swapPct.toFixed(1) + "%";
        if (el.swapTotalVal) el.swapTotalVal.textContent = formatBytes(mem.swapTotal);
        if (el.swapUsedVal) el.swapUsedVal.textContent = formatBytes(mem.swapUsed);
    }

    // Telemetry Polling Tick
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
        el.statusPill.className = "pf-v6-c-label " + (status === "paused" ? "pf-m-gold" : (status === "error" ? "pf-m-red" : "pf-m-green"));
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
        // Interval change
        if (el.intervalSelect) {
            el.intervalSelect.value = state.intervalMs;
            el.intervalSelect.addEventListener("change", (e) => {
                state.intervalMs = parseInt(e.target.value, 10) || 2000;
                setLiveStatus(state.isPaused ? "paused" : "live", state.isPaused ? "Paused" : `Live (${(state.intervalMs / 1000).toFixed(0)}s)`);
                restartTimer();
            });
        }

        // Pause/Resume button
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

        // Refresh Now
        if (el.btnRefresh) {
            el.btnRefresh.addEventListener("click", () => {
                tick();
            });
        }

        // Theme Select
        if (el.themeSelect) {
            el.themeSelect.value = state.theme;
            el.themeSelect.addEventListener("change", (e) => {
                applyTheme(e.target.value);
            });
        }

        if (window.matchMedia) {
            window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
                if (state.theme === "auto") applyTheme("auto");
            });
        }

        // Plot View Switcher Tabs
        if (el.tabPlotIo) {
            el.tabPlotIo.addEventListener("click", () => {
                state.plotView = "io";
                el.tabPlotIo.classList.add("active");
                if (el.tabPlotCpu) el.tabPlotCpu.classList.remove("active");
                if (el.tabPlotRam) el.tabPlotRam.classList.remove("active");
                renderPlot();
            });
        }
        if (el.tabPlotCpu) {
            el.tabPlotCpu.addEventListener("click", () => {
                state.plotView = "cpu";
                el.tabPlotCpu.classList.add("active");
                if (el.tabPlotIo) el.tabPlotIo.classList.remove("active");
                if (el.tabPlotRam) el.tabPlotRam.classList.remove("active");
                renderPlot();
            });
        }
        if (el.tabPlotRam) {
            el.tabPlotRam.addEventListener("click", () => {
                state.plotView = "ram";
                el.tabPlotRam.classList.add("active");
                if (el.tabPlotIo) el.tabPlotIo.classList.remove("active");
                if (el.tabPlotCpu) el.tabPlotCpu.classList.remove("active");
                renderPlot();
            });
        }

        // Search Filter
        if (el.storageSearchInput) {
            el.storageSearchInput.addEventListener("input", (e) => {
                state.filterText = e.target.value;
                tick();
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

        // Window resize debounced re-plot
        let resizeDebounce = null;
        window.addEventListener("resize", () => {
            clearTimeout(resizeDebounce);
            resizeDebounce = setTimeout(renderPlot, 100);
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

        tick();
        restartTimer();
    });

    window.addEventListener("beforeunload", () => {
        if (state.timerId) clearInterval(state.timerId);
    });

})();
