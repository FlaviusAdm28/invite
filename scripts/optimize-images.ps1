# Generates web-sized derivatives of the original photographs in /media.
# Originals are never modified. Output: /media/web/<name>-<width>.jpg
# The colour photograph (main) also gets a monochrome grade: main-bw-<width>.jpg
# Usage: npm run images
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'media'
$out = Join-Path $src 'web'
$widths = @(720, 1080, 1440)
$quality = 80

New-Item -ItemType Directory -Force $out | Out-Null
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

# Monochrome grade for main: Rec.601 luminance, slight contrast lift and a faint
# warm tone so it sits with the analogue-looking black & white set.
function New-MonoMatrix {
  $c = 1.22; $o = (1 - $c) / 2 - 0.03
  $m = New-Object System.Drawing.Imaging.ColorMatrix
  foreach ($j in 0..2) {
    $m[0, $j] = 0.299 * $c; $m[1, $j] = 0.587 * $c; $m[2, $j] = 0.114 * $c
  }
  $m[4, 0] = $o + 0.012; $m[4, 1] = $o + 0.004; $m[4, 2] = $o - 0.01
  $m[3, 3] = 1; $m[4, 4] = 1
  return $m
}

function Save-Resized($img, $w, $target, $matrix) {
  $h = [int][Math]::Round($w * $img.Height / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $attrs = New-Object System.Drawing.Imaging.ImageAttributes
  if ($matrix) { $attrs.SetColorMatrix($matrix) }
  $g.DrawImage($img, $rect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
  $bmp.Save($target, $codec, $params)
  $attrs.Dispose(); $g.Dispose(); $bmp.Dispose()
  "{0} ({1}x{2})" -f (Split-Path -Leaf $target), $w, $h
}

Get-ChildItem (Join-Path $src '*.jpg') | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  $base = $_.BaseName -replace '^HelderCoutoPhoto_', ''
  foreach ($w in $widths) {
    $target = Join-Path $out ("{0}-{1}.jpg" -f $base, $w)
    if (-not (Test-Path $target)) { Save-Resized $img $w $target $null }
    if ($base -eq 'main') {
      $target = Join-Path $out ("main-bw-{0}.jpg" -f $w)
      if (-not (Test-Path $target)) { Save-Resized $img $w $target (New-MonoMatrix) }
    }
  }
  $img.Dispose()
}
