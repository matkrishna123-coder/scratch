param(
  [switch]$StartGui,
  [switch]$StartDesktop,
  [switch]$StartAll,
  [switch]$IncludeBlocks,
  [switch]$ForceClean
)

# ==========================================
# Scratch Reset & Rebuild (Windows PowerShell)
# - Works whether repos were cloned or copied
# - Chooses npm ci vs npm install intelligently
# - Publishes VM (and optionally blocks) via yalc
# - Links VM -> GUI, GUI -> Desktop
# ==========================================

$ErrorActionPreference = "Stop"

function Ensure-Tool($exe, $installScript) {
  Write-Host "Checking $exe..."
  $found = (Get-Command $exe -ErrorAction SilentlyContinue)
  if (-not $found) {
    Write-Host "$exe not found. Installing..."
    Invoke-Expression $installScript
  }
}

function Check-NodeNpm {
  Write-Host "Checking Node/npm versions..."
  $nodev = (node -v)
  $npmv  = (npm -v)
  Write-Host "Node: $nodev"
  Write-Host "npm : $npmv"
  if (-not $nodev.StartsWith("v18.")) {
    Write-Host "Warning: Recommended Node is v18.x (e.g., 18.20.4)."
  }
  if (-not $npmv.StartsWith("9.")) {
    Write-Host "Warning: Recommended npm is 9.x."
  }
}

function Remove-IfExists($path) {
  if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}

function Reset-Repo($path, $build = $false, $publish = $false, $forceClean = $false) {
  if (-not (Test-Path $path)) {
    throw "Missing repo: $path"
  }

  Write-Host ""
  Write-Host "Resetting $path"
  Set-Location $path

  # Clean folders
  Remove-IfExists "node_modules"
  Remove-IfExists ".yalc"

  # Lockfiles
  if ($forceClean) {
    if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }
    if (Test-Path "yarn.lock")        { Remove-Item -Force "yarn.lock" }
  }

  # Install strategy
  $hasNpmLock = Test-Path "package-lock.json"
  $hasShrink  = Test-Path "npm-shrinkwrap.json"
  if ($hasNpmLock -or $hasShrink) {
    Write-Host "Running: npm ci"
    npm ci
  } else {
    Write-Host "No lockfile found. Running: npm install"
    npm install
  }

  if ($build) {
    Write-Host "Building..."
    npm run build
  }

  if ($publish) {
    Write-Host "Publishing with yalc..."
    try {
      npx yalc publish
    } catch {
      throw "yalc publish failed in $path. Stop and fix before continuing."
    }
  }
}

function Start-NewShell($title, $workdir, $command) {
  Write-Host "Launching: $title"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title $title && cd /d `"$workdir`" && $command"
}

# --------- PRECHECKS ----------
Write-Host "Starting full reset"
Check-NodeNpm

Ensure-Tool "yalc"   'npm i -g yalc'
Ensure-Tool "rimraf" 'npm i -g rimraf'

# --------- PATHS ----------
$root    = "C:\scratch"
$vm      = Join-Path $root "scratch-vm"
$gui     = Join-Path $root "scratch-gui"
$desktop = Join-Path $root "scratch-desktop"
$blocks  = Join-Path $root "scratch-blocks"

$includeBlocksNow = $IncludeBlocks -and (Test-Path $blocks)

# --------- ORDER ----------
# 1) VM
Reset-Repo $vm $true $true $ForceClean

# 2) Blocks (optional)
if ($includeBlocksNow) {
  Write-Host "Including scratch-blocks as requested."
  Reset-Repo $blocks $true $true $ForceClean
} else {
  Write-Host "scratch-blocks not included (skip). Use -IncludeBlocks if needed."
}

# 3) GUI
Reset-Repo $gui $false $false $ForceClean
Set-Location $gui
npx yalc add scratch-vm
if ($includeBlocksNow) { npx yalc add scratch-blocks }

Write-Host "Publishing GUI for Desktop..."
try {
  npx yalc publish
} catch {
  throw "GUI prepublish failed. Ensure GUI dependencies are installed and retry."
}

# 4) Desktop
Reset-Repo $desktop $false $false $ForceClean
Set-Location $desktop

# Fetch assets
try {
  npm run fetch
} catch {
  Write-Host "npm run fetch failed; attempting cleanup of static\fetched with npx rimraf..."
  if (Test-Path ".\static\fetched\") { npx rimraf ".\static\fetched\" }
  # Retry once
  npm run fetch
}

# Link GUI into Desktop
npx yalc add @scratch/scratch-gui

Write-Host ""
Write-Host "Reset complete."
Write-Host "Manual starts (if not using switches):"
Write-Host "  cd C:\scratch\scratch-gui; npm start"
Write-Host "  cd C:\scratch\scratch-desktop; npm start"

# --------- AUTOSTART ----------
if ($StartAll) { $StartGui = $true; $StartDesktop = $true }

if ($StartGui) {
  Start-NewShell "Scratch GUI (npm start)" $gui "npm start"
}
if ($StartDesktop) {
  Start-NewShell "Scratch Desktop (npm start)" $desktop "npm start"
}

Write-Host "Done."
