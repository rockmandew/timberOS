<#
    TimberOS setup & environment check (Windows / PowerShell).

    Installs TimberOS's dependencies, then verifies the pieces the *live colony data*
    feed (Step 4 in the README) needs: your Timberborn install and the timberOS Data
    Console mod. TimberOS runs fine against its built-in simulator without any of this;
    this script just makes the real-game path painless by finding everything for you.

    It locates Timberborn automatically across every Steam library on every drive
    (parsed from Steam's libraryfolders.vdf), and finds your Mods folder under your real
    Documents path — honoring OneDrive's "Documents" redirection, which is common on
    Windows 11 and otherwise sends the mod where the game never looks.

    Runs under both PowerShell 7 (pwsh) and Windows PowerShell 5.1.

    Usage:
        pwsh scripts/setup.ps1
        # Windows PowerShell (no pwsh installed):
        powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
        # Skip "npm install" and only run the environment check:
        pwsh scripts/setup.ps1 -SkipInstall
#>
param(
    [switch]$SkipInstall,
    [string]$TimberbornPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$modId = "rockmandew.TimberOSDataConsole"

function Write-Head([string]$t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Write-OK([string]$t)   { Write-Host "  [ok]  $t" -ForegroundColor Green }
function Write-Miss([string]$t) { Write-Host "  [--]  $t" -ForegroundColor Yellow }

# Normalize a user-supplied path (or a Steam library's Timberborn folder) to the game
# root that actually contains Timberborn.exe. Returns $null if it isn't the game folder.
function Resolve-GameRoot([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return $null }
    $path = $path.Trim().Trim('"')
    $candidates = @($path, (Join-Path $path "Timberborn"))
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c "Timberborn.exe")) { return (Resolve-Path $c).Path }
    }
    return $null
}

# Find Timberborn by scanning every Steam library across all drives.
function Find-Timberborn {
    $steamRoots = @()
    foreach ($key in @("HKCU:\Software\Valve\Steam", "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam", "HKLM:\SOFTWARE\Valve\Steam")) {
        try {
            $p = (Get-ItemProperty -Path $key -ErrorAction Stop).SteamPath
            if ($p) { $steamRoots += $p }
        } catch { }
    }
    $steamRoots += @("C:\Program Files (x86)\Steam", "C:\Program Files\Steam", "$env:ProgramFiles\Steam", "${env:ProgramFiles(x86)}\Steam")

    $libraries = New-Object System.Collections.Generic.List[string]
    foreach ($steam in ($steamRoots | Where-Object { $_ } | Select-Object -Unique)) {
        if (Test-Path $steam) { $libraries.Add($steam) }
        $vdf = Join-Path $steam "steamapps\libraryfolders.vdf"
        if (Test-Path $vdf) {
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s*"([^"]+)"')) {
                $libraries.Add($m.Groups[1].Value.Replace('\\', '\'))
            }
        }
    }
    foreach ($lib in ($libraries | Select-Object -Unique)) {
        $root = Resolve-GameRoot (Join-Path $lib "steamapps\common\Timberborn")
        if ($root) { return $root }
    }
    return $null
}

# The game's Mods folder under the user's real Documents path. GetFolderPath honors
# OneDrive's Documents redirection; fall back to $USERPROFILE\Documents only if empty.
function Get-ModsRoot {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if ([string]::IsNullOrWhiteSpace($docs)) { $docs = Join-Path $env:USERPROFILE "Documents" }
    return (Join-Path $docs "Timberborn\Mods")
}

# --- 1. Dependencies ------------------------------------------------------------------
Write-Head "TimberOS setup"
if ($SkipInstall) {
    Write-Miss "Skipping 'npm install' (-SkipInstall)."
} else {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm not found. Install Node.js LTS 22.5+ from https://nodejs.org, reopen your terminal, and re-run."
    }
    Write-Host "  Installing dependencies (npm install)..." -ForegroundColor Gray
    Push-Location $root
    try { & npm install } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit code $LASTEXITCODE)." }
    Write-OK "Dependencies installed. Run 'npm run gateway:sim' + 'npm run dashboard' for the simulator."
}

# --- 2. Timberborn install (for live colony data) -------------------------------------
Write-Head "Live colony data feed (optional)"
$game = Resolve-GameRoot $TimberbornPath
if (-not $game) { $game = Find-Timberborn }
if ($game) {
    Write-OK "Timberborn found: $game"
} else {
    Write-Miss "Timberborn not found automatically. You only need it for live colony data."
    Write-Host "         If it's installed in a custom spot, re-run with:" -ForegroundColor Gray
    Write-Host "         pwsh scripts/setup.ps1 -TimberbornPath `"D:\YourPath\Timberborn`"" -ForegroundColor Gray
}

# --- 3. Data Console mod ---------------------------------------------------------------
$modsRoot = Get-ModsRoot
$modDir = Join-Path $modsRoot $modId
$modManifest = Join-Path $modDir "manifest.json"
if (Test-Path $modManifest) {
    $ver = try { (Get-Content $modManifest -Raw | ConvertFrom-Json).Version } catch { "unknown" }
    Write-OK "Data Console mod installed (v$ver): $modDir"
} else {
    Write-Miss "Data Console mod not installed. Mods folder: $modsRoot"
    Write-Host "         For live colony data, install it from:" -ForegroundColor Gray
    Write-Host "         https://github.com/rockmandew/timberOSDataConsole  (one-command install)" -ForegroundColor Gray
}

# --- 4. Next steps --------------------------------------------------------------------
Write-Head "Next steps"
Write-Host "  Simulator (no game needed):  npm run gateway:sim   +   npm run dashboard"
Write-Host "  Live game (mod + settlement loaded):  npm run gateway   +   npm run dashboard"
Write-Host "  Dashboard: http://localhost:3000   Colony feed: http://localhost:8081/api/colony`n"
