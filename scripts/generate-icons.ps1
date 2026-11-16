# Generates the packaged app icons from the ScreenRec "record dot" mark.
# Outputs build/icon.png (1024), build/icon.ico (16-256) and build/icon.icns.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $build | Out-Null

$masterSize = 1024
$sizes = 16, 24, 32, 48, 64, 128, 256

function New-RoundedPath {
  param([single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $R * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-MasterBitmap {
  param([int]$Size)

  $bmp = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 1024.0

    # Dark squircle plate, matching the app's dark UI.
    $plate = New-RoundedPath 0 0 $Size $Size (235 * $scale)
    $plateRect = [System.Drawing.RectangleF]::new(0, 0, [single]$Size, [single]$Size)
    $plateBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $plateRect,
      [System.Drawing.Color]::FromArgb(255, 44, 44, 56),
      [System.Drawing.Color]::FromArgb(255, 15, 15, 20),
      90.0)
    $g.FillPath($plateBrush, $plate)
    $plateBrush.Dispose()

    # Hairline inner edge keeps the plate crisp on light and dark desktops.
    $edgePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(38, 255, 255, 255), [single](3 * $scale))
    $g.DrawPath($edgePen, $plate)
    $edgePen.Dispose()

    # Red record dot: soft outer glow, then a radial-gradient core.
    $glowRect = [System.Drawing.RectangleF]::new(
      [single](512 - 300) * $scale, [single](512 - 300) * $scale,
      [single]600 * $scale, [single]600 * $scale)
    $glowPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $glowPath.AddEllipse($glowRect)
    $glow = [System.Drawing.Drawing2D.PathGradientBrush]::new($glowPath)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(70, 239, 68, 68)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 239, 68, 68))
    $g.FillPath($glow, $glowPath)
    $glow.Dispose()
    $glowPath.Dispose()

    $dotSize = 500 * $scale
    $dotRect = [System.Drawing.RectangleF]::new(
      [single](512 * $scale - $dotSize / 2), [single](512 * $scale - $dotSize / 2),
      [single]$dotSize, [single]$dotSize)
    $dotPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $dotPath.AddEllipse($dotRect)
    $dot = [System.Drawing.Drawing2D.PathGradientBrush]::new($dotPath)
    $dot.CenterColor = [System.Drawing.Color]::FromArgb(255, 255, 112, 112)
    $dot.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 214, 26, 58))
    $dot.FocusScales = [System.Drawing.PointF]::new(0.32, 0.32)
    $g.FillPath($dot, $dotPath)
    $dot.Dispose()
    $dotPath.Dispose()

    # Small specular highlight so the dot reads as a glossy indicator.
    $glossPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $glossPath.AddEllipse(
      [single](392 * $scale), [single](358 * $scale),
      [single](250 * $scale), [single](160 * $scale))
    $gloss = [System.Drawing.Drawing2D.PathGradientBrush]::new($glossPath)
    $gloss.CenterColor = [System.Drawing.Color]::FromArgb(90, 255, 255, 255)
    $gloss.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    $g.FillPath($gloss, $glossPath)
    $gloss.Dispose()
    $glossPath.Dispose()
  }
  finally {
    $g.Dispose()
  }

  return $bmp
}

function Resize-Bitmap {
  param([System.Drawing.Bitmap]$Source, [int]$Size)
  $bmp = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($Source, 0, 0, $Size, $Size)
  }
  finally {
    $g.Dispose()
  }
  return $bmp
}

function Get-PngBytes {
  param([System.Drawing.Bitmap]$Bitmap)
  $ms = [System.IO.MemoryStream]::new()
  $Bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return , $bytes
}

function Write-BigEndian32 {
  param([System.IO.BinaryWriter]$Writer, [uint32]$Value)
  $Writer.Write([byte](($Value -shr 24) -band 0xFF))
  $Writer.Write([byte](($Value -shr 16) -band 0xFF))
  $Writer.Write([byte](($Value -shr 8) -band 0xFF))
  $Writer.Write([byte]($Value -band 0xFF))
}

$master = New-MasterBitmap $masterSize
try {
  $masterPath = Join-Path $build 'icon.png'
  $master.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "wrote $masterPath"

  # One PNG per size; 512/1024 only feed ICNS, ICO stops at 256.
  $png = @{}
  $png[1024] = Get-PngBytes $master
  foreach ($size in ($sizes + 512)) {
    $small = Resize-Bitmap $master $size
    try {
      $png[$size] = Get-PngBytes $small
    }
    finally {
      $small.Dispose()
    }
  }

  # ICO: PNG-compressed frames (Vista+), 16 through 256 px.
  $icoPath = Join-Path $build 'icon.ico'
  $fs = [System.IO.File]::Create($icoPath)
  $bw = [System.IO.BinaryWriter]::new($fs)
  try {
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    foreach ($size in $sizes) {
      $data = $png[$size]
      $dim = if ($size -ge 256) { 0 } else { $size }
      $bw.Write([byte]$dim)
      $bw.Write([byte]$dim)
      $bw.Write([byte]0)
      $bw.Write([byte]0)
      $bw.Write([uint16]1)
      $bw.Write([uint16]32)
      $bw.Write([uint32]$data.Length)
      $bw.Write([uint32]$offset)
      $offset += $data.Length
    }
    foreach ($size in $sizes) {
      $bw.Write([byte[]]$png[$size])
    }
  }
  finally {
    $bw.Dispose()
    $fs.Dispose()
  }
  Write-Host "wrote $icoPath"

  # ICNS: PNG-backed entries for every slot macOS asks for.
  $icnsEntries = @(
    @{ Type = 'icp4'; Size = 16 },
    @{ Type = 'icp5'; Size = 32 },
    @{ Type = 'ic11'; Size = 32 },
    @{ Type = 'icp6'; Size = 64 },
    @{ Type = 'ic12'; Size = 64 },
    @{ Type = 'ic07'; Size = 128 },
    @{ Type = 'ic08'; Size = 256 },
    @{ Type = 'ic13'; Size = 256 },
    @{ Type = 'ic09'; Size = 512 },
    @{ Type = 'ic14'; Size = 512 },
    @{ Type = 'ic10'; Size = 1024 }
  )

  $icnsPath = Join-Path $build 'icon.icns'
  $total = 8
  foreach ($entry in $icnsEntries) { $total += 8 + $png[$entry.Size].Length }

  $fs = [System.IO.File]::Create($icnsPath)
  $bw = [System.IO.BinaryWriter]::new($fs)
  try {
    $bw.Write([byte[]][System.Text.Encoding]::ASCII.GetBytes('icns'))
    Write-BigEndian32 $bw ([uint32]$total)
    foreach ($entry in $icnsEntries) {
      $data = $png[$entry.Size]
      $bw.Write([byte[]][System.Text.Encoding]::ASCII.GetBytes($entry.Type))
      Write-BigEndian32 $bw ([uint32](8 + $data.Length))
      $bw.Write([byte[]]$data)
    }
  }
  finally {
    $bw.Dispose()
    $fs.Dispose()
  }
  Write-Host "wrote $icnsPath"
}
finally {
  $master.Dispose()
}