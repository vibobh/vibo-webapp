# Compress public/videos/vid1.mp4 … vid5.mp4 to ~720p H.264 for web (target: smaller files, often under 10MB).
# Requires: FFmpeg (winget install --id Gyan.FFmpeg -e). Works even if ffmpeg is not on PATH (finds WinGet install).
$ErrorActionPreference = "Stop"

function Get-FfmpegExe {
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $pkgs = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  $gyan = Get-ChildItem -Path $pkgs -Directory -Filter "Gyan.FFmpeg*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($gyan) {
    $found = Get-ChildItem -Path $gyan.FullName -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.DirectoryName -match "\\bin$" } | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  if (Test-Path "C:\ffmpeg\bin\ffmpeg.exe") { return "C:\ffmpeg\bin\ffmpeg.exe" }
  return $null
}

$ffmpeg = Get-FfmpegExe
if (-not $ffmpeg) {
  Write-Host "FFmpeg not found. Install with: winget install --id Gyan.FFmpeg -e" -ForegroundColor Red
  Write-Host "Then close this terminal, open a new PowerShell, and run this script again." -ForegroundColor Yellow
  exit 1
}
Write-Host "Using ffmpeg: $ffmpeg" -ForegroundColor DarkGray

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root "public\videos"
$outDir = Join-Path $srcDir "compressed"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

1..5 | ForEach-Object {
  $name = "vid$_.mp4"
  $in = Join-Path $srcDir $name
  $out = Join-Path $outDir $name
  if (-not (Test-Path $in)) {
    Write-Warning "Skip (missing): $in"
    return
  }
  Write-Host "Encoding $name ..."
  # -an = no audio (hero clips are muted; avoids "b:a not used" when source has no audio track)
  & $ffmpeg -y -hide_banner -loglevel warning -i $in `
    -vf "scale=720:-2" `
    -c:v libx264 -crf 28 -preset medium `
    -an `
    -movflags +faststart `
    $out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $name" }
}

Write-Host ""
Write-Host "Done. Output: $outDir" -ForegroundColor Green
Get-ChildItem $outDir\*.mp4 | ForEach-Object { Write-Host ("  {0}: {1:N2} MB" -f $_.Name, ($_.Length / 1MB)) }
Write-Host ""
Write-Host "If sizes look good: Copy-Item $outDir\*.mp4 $srcDir\ -Force" -ForegroundColor Cyan
