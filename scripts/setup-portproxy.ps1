# setup-portproxy.ps1
#
# Configures Windows port forwarding so an Android phone on the same WiFi
# network can reach the Spring Boot backend (port 8083) running inside WSL2.
#
# HOW IT WORKS
#   WSL2 runs in its own virtual network. The Android phone can reach your
#   Windows machine's WiFi IP, but NOT the WSL2 IP directly. This script
#   uses Windows netsh portproxy to forward any connection arriving at
#   0.0.0.0:8083 (all Windows interfaces) to the current WSL2 IP:8083.
#
# WHEN TO RUN
#   - Once after you first set up the project.
#   - Again after any WSL2 restart (shutdown / wsl --shutdown), because
#     WSL2 is assigned a new IP each time it starts.
#
# USAGE
#   1. Open PowerShell as Administrator.
#   2. Run:  .\scripts\setup-portproxy.ps1
#
# AFTER RUNNING
#   1. Find your Windows WiFi IP:
#      Run `ipconfig` in PowerShell.
#      Look for "IPv4 Address" under your WiFi adapter
#      (e.g., 192.168.1.42 - ignore the WSL adapter).
#   2. Update BACKEND_URL in mobile/src/config.ts:
#      export const BACKEND_URL = 'http://192.168.1.42:8083';
#   3. Test from your Android browser: http://192.168.1.42:8083/lessons
#      You should see a JSON array (empty [] is fine - it means it is working).

#Requires -RunAsAdministrator

$Port = 8083

# --- Get current WSL2 IP ---

$wsl2Ip = (wsl hostname -I 2>$null).Trim() -split '\s+' | Select-Object -First 1

if (-not $wsl2Ip) {
    Write-Error "Could not determine the WSL2 IP address. Make sure WSL2 is running (try: wsl --list --running)."
    exit 1
}

Write-Host "WSL2 IP:   $wsl2Ip"
Write-Host "Port:      $Port"
Write-Host ""

# --- Remove any existing proxy on this port ---
# This clears out a stale entry from a previous WSL2 session before adding
# the fresh one. Errors are suppressed because there may be nothing to delete.

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$Port 2>$null | Out-Null

# --- Add the new port proxy ---

$result = netsh interface portproxy add v4tov4 `
    listenaddress=0.0.0.0 `
    listenport=$Port `
    connectaddress=$wsl2Ip `
    connectport=$Port

Write-Host "Port proxy: 0.0.0.0:$Port  ->  $wsl2Ip`:$Port"

# --- Firewall rule ---
# Allow inbound TCP on port 8083. If the rule already exists, skip creation
# to avoid duplicates.

$ruleName = "Piano Lesson Spring Boot $Port"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
    Write-Host "Firewall:  rule '$ruleName' already exists - no change."
} else {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow | Out-Null
    Write-Host "Firewall:  rule '$ruleName' created."
}

# --- Show the current proxy table ---

Write-Host ""
Write-Host "Current portproxy entries:"
netsh interface portproxy show v4tov4

# --- Next steps ---

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run 'ipconfig' and find your WiFi adapter's IPv4 Address."
Write-Host "     It will look like 192.168.x.x."
Write-Host "  2. Update mobile/src/config.ts:"
Write-Host "       export const BACKEND_URL = 'http://<WINDOWS-WIFI-IP>:$Port';"
Write-Host "  3. Make sure Spring Boot is running (port $Port in WSL2)."
Write-Host "  4. From your Android phone browser, visit:"
Write-Host "       http://<WINDOWS-WIFI-IP>:$Port/lessons"
Write-Host "     A response of [] (empty array) confirms connectivity."
Write-Host ""
Write-Host "If the portproxy stops working after a WSL2 restart, run this"
Write-Host "script again. The WSL2 IP changes on every restart."
