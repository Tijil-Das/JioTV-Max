# Generates build/icon.png (1024x1024) for electron-builder.
# Mirrors the in-app BrandMark: three gradient screens with a play cut-out.
Add-Type -AssemblyName System.Drawing

$size = 1024
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $r * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

# Warm violet-to-black rounded canvas.
$canvas = New-RoundedPath 0 0 $size $size 220
$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(120, 0)),
  (New-Object System.Drawing.Point(900, 1024)),
  [System.Drawing.Color]::FromArgb(255, 26, 21, 46),
  [System.Drawing.Color]::FromArgb(255, 5, 5, 8)
)
$graphics.FillPath($background, $canvas)

# Motion accents echoing the app's hero beams.
$beamPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(26, 255, 255, 255), 3)
$graphics.DrawLine($beamPen, 880, 60, 800, 940)
$accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(34, 124, 92, 255), 5)
$graphics.DrawLine($accentPen, 930, 40, 850, 980)

# Three stacked screens.
$bars = @(
  @{ y = 230; height = 150; alpha = 120 },
  @{ y = 410; height = 150; alpha = 200 },
  @{ y = 590; height = 176; alpha = 255 }
)
foreach ($bar in $bars) {
  $path = New-RoundedPath 202 $bar.y 620 $bar.height 76
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(202, $bar.y)),
    (New-Object System.Drawing.Point(822, ($bar.y + $bar.height))),
    [System.Drawing.Color]::FromArgb($bar.alpha, 157, 133, 255),
    [System.Drawing.Color]::FromArgb($bar.alpha, 34, 211, 238)
  )
  $graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

# Play cut-out in the bottom screen.
$play = New-Object System.Drawing.Drawing2D.GraphicsPath
$play.AddPolygon(@(
  (New-Object System.Drawing.Point(430, 630)),
  (New-Object System.Drawing.Point(430, 726)),
  (New-Object System.Drawing.Point(520, 678))
))
$playBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 5, 5, 7))
$graphics.FillPath($playBrush, $play)
$playBrush.Dispose()
$play.Dispose()

# Hairline edge for definition on light and dark taskbars.
$edge = New-RoundedPath 3 3 1018 1018 217
$edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(34, 255, 255, 255), 4)
$graphics.DrawPath($edgePen, $edge)

New-Item -ItemType Directory -Force -Path "build" | Out-Null
$bitmap.Save((Join-Path (Get-Location) "build\icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$edgePen.Dispose()
$edge.Dispose()
$background.Dispose()
$canvas.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Wrote build\icon.png"
