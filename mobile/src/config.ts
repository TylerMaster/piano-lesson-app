// SETUP REQUIRED: replace this placeholder with your Windows machine's LAN IP.
//
// Why not localhost?
// The Android phone and WSL2 are on different network segments. "localhost" on
// the phone refers to the phone itself, not your development machine. You need
// the IP address your Windows machine advertises on your local WiFi network.
//
// How to find your Windows LAN IP:
//   1. Open PowerShell on Windows.
//   2. Run: ipconfig
//   3. Look for "IPv4 Address" under your WiFi adapter (e.g., 192.168.1.42).
//      (Ignore the WSL adapter address.)
//
// The portproxy script (scripts/setup-portproxy.ps1) must also be run so that
// Windows forwards port 8083 from your LAN IP into WSL2 where Spring Boot runs.
// Step 4 of Stage 3 covers the full networking setup.
export const BACKEND_URL = 'http://192.168.2.30:8083';
