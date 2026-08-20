param(
  [Parameter(Mandatory = $true)]
  [string]$FramesDirectory,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$frames = @(Get-ChildItem -LiteralPath $FramesDirectory -File -Filter "*.png" | Sort-Object Name)
if ($frames.Count -eq 0) {
  throw "No PNG frames found in $FramesDirectory."
}

$first = [System.Drawing.Bitmap]::new($frames[0].FullName)
try {
  $frameWidth = $first.Width
  $frameHeight = $first.Height
} finally {
  $first.Dispose()
}

$sheet = [System.Drawing.Bitmap]::new($frameWidth * $frames.Count, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    for ($index = 0; $index -lt $frames.Count; $index += 1) {
      $frame = [System.Drawing.Bitmap]::new($frames[$index].FullName)
      try {
        if ($frame.Width -ne $frameWidth -or $frame.Height -ne $frameHeight) {
          throw "Frame $($frames[$index].Name) does not match ${frameWidth}x${frameHeight}."
        }
        $graphics.DrawImageUnscaled($frame, $index * $frameWidth, 0)
      } finally {
        $frame.Dispose()
      }
    }
  } finally {
    $graphics.Dispose()
  }
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
  $sheet.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $sheet.Dispose()
}

Get-Item -LiteralPath $resolvedOutput | Select-Object Name, Length, FullName
