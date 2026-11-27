# Encodes the save-the-date film for the web. The original is never modified.
# Output: /media/web/film-720.mp4 — 720x1280 H.264 + AAC, moov at the front so it
# starts playing before it has fully downloaded.
# Usage: npm run film -- "D:\caminho\para\o\filme.mp4"
param([Parameter(Mandatory = $true)][string]$Source)

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'media\web\film-720.mp4'

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) {
  $ffmpeg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ffmpeg) { throw 'ffmpeg not found (winget install Gyan.FFmpeg)' }

& $ffmpeg -hide_banner -y -i $Source `
  -map 0:v:0 -map 0:a:0 `
  -vf 'scale=720:1280:flags=lanczos,format=yuv420p' `
  -c:v libx264 -preset slow -crf 22 -maxrate 2600k -bufsize 5200k `
  -profile:v high -level:v 4.0 -g 50 -tune film `
  -c:a aac -b:a 128k -ac 2 `
  -movflags +faststart `
  $out
if ($LASTEXITCODE) { exit $LASTEXITCODE }
'{0} ({1:N1} MB)' -f (Split-Path -Leaf $out), ((Get-Item $out).Length / 1MB)
