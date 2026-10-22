# Re-derives all icon pack sizes and project assets from Icon-Pack/2048 x 2048.png
Add-Type -AssemblyName System.Drawing

$root = (Get-Item $PSScriptRoot).Parent.FullName
$iconPackDir = Join-Path $root "Icon-Pack"
$sourcePath = Join-Path $iconPackDir "2048 x 2048.png"

if (-not (Test-Path $sourcePath)) {
  Write-Error "Source icon not found at: $sourcePath"
  exit 1
}

Write-Host "Loading source image from: $sourcePath"
$rawBytes = [System.IO.File]::ReadAllBytes($sourcePath)
$ms = New-Object System.IO.MemoryStream(,$rawBytes)
$srcImg = [System.Drawing.Image]::FromStream($ms)

Write-Host "Source dimensions: $($srcImg.Width) x $($srcImg.Height)"

# Create a true 2048x2048 master canvas
$master2048 = New-Object System.Drawing.Bitmap(2048, 2048, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gMaster = [System.Drawing.Graphics]::FromImage($master2048)
$gMaster.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gMaster.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gMaster.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gMaster.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$gMaster.Clear([System.Drawing.Color]::Transparent)

$yOffset = [int][Math]::Round((2048 - $srcImg.Height) / 2)
$xOffset = [int][Math]::Round((2048 - $srcImg.Width) / 2)
$gMaster.DrawImage($srcImg, $xOffset, $yOffset, $srcImg.Width, $srcImg.Height)

$srcImg.Dispose()
$ms.Dispose()
$gMaster.Dispose()

# Overwrite 2048 x 2048.png with true square master
$master2048.Save($sourcePath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Master saved to $sourcePath (2048x2048 square)"

# All 12 other icon sizes
$sizes = @(1024, 512, 256, 192, 180, 128, 120, 64, 48, 32, 24, 16)

# 1. Remove all other 12 icons
foreach ($s in $sizes) {
  $file = Join-Path $iconPackDir ("$s x $s.png")
  if (Test-Path $file) {
    Remove-Item -Force $file
    Write-Host "Removed existing: $file"
  }
}

# 2. Re-derive all 12 icons with HighQualityBicubic
foreach ($s in $sizes) {
  $targetFile = Join-Path $iconPackDir ("$s x $s.png")
  $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($master2048, 0, 0, $s, $s)
  $g.Dispose()
  $bmp.Save($targetFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Derived: $targetFile ($s x $s)"
}

$master2048.Dispose()

# 3. Update project icons wherever needed
$buildDir = Join-Path $root "build"
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Force -Path $buildDir | Out-Null }
Copy-Item -Force (Join-Path $iconPackDir "1024 x 1024.png") (Join-Path $buildDir "icon.png")
Write-Host "Updated build\icon.png (1024x1024)"

$rendererIcons = Join-Path $root "src\renderer\src\assets\icons"
if (-not (Test-Path $rendererIcons)) { New-Item -ItemType Directory -Force -Path $rendererIcons | Out-Null }
Copy-Item -Force (Join-Path $iconPackDir "256 x 256.png") (Join-Path $rendererIcons "app-icon-256.png")
Copy-Item -Force (Join-Path $iconPackDir "128 x 128.png") (Join-Path $rendererIcons "app-icon-128.png")
Copy-Item -Force (Join-Path $iconPackDir "32 x 32.png") (Join-Path $rendererIcons "favicon.png")
Write-Host "Updated renderer assets: app-icon-256, app-icon-128, favicon"

$websiteAssets = Join-Path $root "website\assets"
if (-not (Test-Path $websiteAssets)) { New-Item -ItemType Directory -Force -Path $websiteAssets | Out-Null }
Copy-Item -Force (Join-Path $iconPackDir "256 x 256.png") (Join-Path $websiteAssets "app-icon-256.png")
Copy-Item -Force (Join-Path $iconPackDir "128 x 128.png") (Join-Path $websiteAssets "app-icon-128.png")
Copy-Item -Force (Join-Path $iconPackDir "32 x 32.png") (Join-Path $websiteAssets "favicon.png")
Write-Host "Updated website assets: app-icon-256, app-icon-128, favicon"

Write-Host "All icons successfully re-derived and updated!"
