#!/usr/bin/env bash
# collector.sh - High performance system and storage telemetry collector
# Returns snapshot data for CPU, RAM, Disk I/O, Disks, and Volumes
set -e

echo "===CPUINFO==="
if command -v lscpu >/dev/null 2>&1; then
    LC_ALL=C lscpu 2>/dev/null || true
else
    cat /proc/cpuinfo 2>/dev/null || true
fi

echo "===UPTIME==="
cat /proc/uptime 2>/dev/null || true

echo "===LOADAVG==="
cat /proc/loadavg 2>/dev/null || true

echo "===STAT==="
cat /proc/stat 2>/dev/null || true

echo "===MEMINFO==="
cat /proc/meminfo 2>/dev/null || true

echo "===DISKSTATS==="
cat /proc/diskstats 2>/dev/null || true

echo "===LSBLK==="
if command -v lsblk >/dev/null 2>&1; then
    lsblk -J -b -o NAME,KNAME,PATH,TYPE,SIZE,MOUNTPOINT,FSTYPE,MODEL,ROTA,TRAN,LABEL,UUID 2>/dev/null || echo '{"blockdevices":[]}'
else
    echo '{"blockdevices":[]}'
fi

echo "===DF==="
LC_ALL=C df -B1 -P -T 2>/dev/null || true
