# Generates the dsh desktop tray/window icons as PNGs using only .NET System.Drawing.
# Sizes: 16 (tray), 32 (tray hi-dpi), 256 (window/About).
# Run: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/gen-icon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\resources'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# DeepSeek-ish blue background, white mark.
$bg = [System.Drawing.Color]::FromArgb(255, 78, 120, 255)
$fg = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

function New-IconPng {
  param([int]$Size)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded-square background.
  $inset = [Math]::Max(1, [int]($Size * 0.08))
  $rect = New-Object System.Drawing.Rectangle($inset, $inset, ($Size - 2 * $inset), ($Size - 2 * $inset))
  $radius = [int]($Size * 0.22)
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $gp.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $gp.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $gp.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $gp.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $gp.CloseFigure()

  $brush = New-Object System.Drawing.SolidBrush($bg)
  $g.FillPath($brush, $gp)

  # Stylized "D": left stem, top/bottom bars, right arc.
  $fgBrush = New-Object System.Drawing.SolidBrush($fg)
  $barW = [Math]::Max(2, [int]($Size * 0.12))
  $barX = [int]($Size * 0.30)
  $barTop = [int]($Size * 0.22)
  $barBottom = [int]($Size * 0.78)

  $stem = New-Object System.Drawing.Rectangle($barX, $barTop, $barW, ($barBottom - $barTop))
  $g.FillRectangle($fgBrush, $stem)
  $topBar = New-Object System.Drawing.Rectangle(($barX + $barW), $barTop, [int]($Size * 0.34), [int]($Size * 0.10))
  $g.FillRectangle($fgBrush, $topBar)
  $bottomBar = New-Object System.Drawing.Rectangle(($barX + $barW), [int]($Size * 0.68), [int]($Size * 0.34), [int]($Size * 0.10))
  $g.FillRectangle($fgBrush, $bottomBar)

  $pen = New-Object System.Drawing.Pen($fg, [Math]::Max(2, [int]($Size * 0.10)))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcRect = New-Object System.Drawing.Rectangle(
    [int]($Size * 0.34),
    $barTop,
    [int]($Size * 0.42),
    ($barBottom - $barTop))
  $g.DrawArc($pen, $arcRect, -55, 110)

  $pen.Dispose(); $brush.Dispose(); $fgBrush.Dispose(); $gp.Dispose(); $g.Dispose()
  $bmp.Save((Join-Path $outDir $script:IconName), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $script:IconName ($Size x $Size)"
}

$script:IconName = 'tray-icon.png'
New-IconPng -Size 16
$script:IconName = 'tray-icon@2x.png'
New-IconPng -Size 32
$script:IconName = 'icon.png'
New-IconPng -Size 256