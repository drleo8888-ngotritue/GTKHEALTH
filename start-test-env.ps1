# start-test-env.ps1
$root     = Split-Path -Parent $MyInvocation.MyCommand.Path
$testDir  = "C:\gvc-test"          # Khong co spaces - Electron nhan dung --user-data-dir
$hubDir   = "$testDir\hub"
$spokeDir = "$testDir\spoke"
$tmpDir   = "$testDir\bat"

New-Item -ItemType Directory -Force $hubDir  | Out-Null
New-Item -ItemType Directory -Force $spokeDir | Out-Null
New-Item -ItemType Directory -Force $tmpDir   | Out-Null

# --- Pre-config sync-state.json ---
@"
{
  "syncConfig": {
    "enabled": true,
    "serverUrl": "http://localhost:3500",
    "apiKey": "ytegoertek2026",
    "retryIntervalMinutes": 1,
    "syncEmployeesOnStartup": false,
    "employeeSyncIntervalHours": 24
  },
  "stationConfig": { "id": "E4-DEV", "name": "E4-DEV" }
}
"@ | Out-File "$hubDir\sync-state.json" -Encoding UTF8

@"
{
  "syncConfig": {
    "enabled": true,
    "serverUrl": "http://localhost:3500",
    "apiKey": "ytegoertek2026",
    "retryIntervalMinutes": 1,
    "syncEmployeesOnStartup": false,
    "employeeSyncIntervalHours": 24
  },
  "stationConfig": { "id": "A6-DEV", "name": "A6-DEV" }
}
"@ | Out-File "$spokeDir\sync-state.json" -Encoding UTF8

# --- Ghi bat files (path ngan, khong spaces) ---
@"
@echo off
title GVC-SERVER (TEST - localhost:3500)
cd /d "$root\gvc-server"
set DB_PATH=C:\gvc-test\test_server.db
set API_KEY=ytegoertek2026
node server.js
pause
"@ | Out-File "$tmpDir\server.bat" -Encoding ASCII

@"
@echo off
title VITE DEV (port 3000)
cd /d "$root"
npm run dev
pause
"@ | Out-File "$tmpDir\vite.bat" -Encoding ASCII

@"
@echo off
title HUB - E4-DEV  [DB: C:\gvc-test\hub]
cd /d "$root"
node_modules\.bin\electron.cmd . --user-data-dir=C:\gvc-test\hub
pause
"@ | Out-File "$tmpDir\hub.bat" -Encoding ASCII

@"
@echo off
title SPOKE - A6-DEV  [DB: C:\gvc-test\spoke]
cd /d "$root"
node_modules\.bin\electron.cmd . --user-data-dir=C:\gvc-test\spoke
pause
"@ | Out-File "$tmpDir\spoke.bat" -Encoding ASCII

Write-Host "Starting gvc-server (test)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k C:\gvc-test\bat\server.bat"
Start-Sleep -Seconds 1

Write-Host "Starting Vite..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k C:\gvc-test\bat\vite.bat"

Write-Host ""
Write-Host "Cho Vite khoi dong xong (~10s) roi nhan Enter..." -ForegroundColor Cyan
Read-Host

Write-Host "Starting HUB (E4-DEV)..." -ForegroundColor Green
Start-Process cmd -ArgumentList "/k C:\gvc-test\bat\hub.bat"
Start-Sleep -Seconds 2

Write-Host "Starting SPOKE (A6-DEV)..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/k C:\gvc-test\bat\spoke.bat"

Write-Host ""
Write-Host "Done! DB rieng biet:" -ForegroundColor Cyan
Write-Host "  HUB  -> C:\gvc-test\hub\local_data.db" -ForegroundColor Green
Write-Host "  SPOKE-> C:\gvc-test\spoke\local_data.db" -ForegroundColor Yellow
Write-Host "  SERVER DB -> C:\gvc-test\test_server.db" -ForegroundColor Gray
Write-Host ""
Write-Host "HUB  : Settings -> Type=HUB,   Name=E4-DEV" -ForegroundColor Green
Write-Host "SPOKE: Settings -> Type=SPOKE, Name=A6-DEV (da co san)" -ForegroundColor Yellow
