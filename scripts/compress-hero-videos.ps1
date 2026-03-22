# Compress public/videos/vid1.mp4 … vid5.mp4 to ~720p H.264 for web (target: smaller files, often under 10MB).
# Requires: ffmpeg in PATH (winget install Gyan.FFmpeg)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root "public\videos"
$outDir = Join-Path $srcDir "compressed"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host "FFmpeg not found. Install with: winget install --id Gyan.FFmpeg -e" -ForegroundColor Red
  exit 1
}

1..5 | ForEach-Object {
  $name = "vid$_.mp4"
  $in = Join-Path $srcDir $name
  $out = Join-Path $outDir $name
  if (-not (Test-Path $in)) {
    Write-Warning "Skip (missing): $in"
    return
  }
  Write-Host "Encoding $name ..."
  & ffmpeg -y -hide_banner -loglevel warning -i $in `
    -vf "scale=720:-2" `
    -c:v libx264 -crf 28 -preset medium `
    -c:a aac -b:a 128k `
    -movflags +faststart `
    $out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $name" }
}

Write-Host ""
Write-Host "Done. Output: $outDir" -ForegroundColor Green
Get-ChildItem $outDir\*.mp4 | ForEach-Object { Write-Host ("  {0}: {1:N2} MB" -f $_.Name, ($_.Length / 1MB)) }
Write-Host ""
Write-Host "If sizes look good: Copy-Item $outDir\*.mp4 $srcDir\ -Force" -ForegroundColor Cyan
