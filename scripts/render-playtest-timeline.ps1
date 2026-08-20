param(
  [Parameter(Mandatory = $true)]
  [string[]]$InputPaths,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$CropX = 160,
  [int]$CropY = 235,
  [int]$CropWidth = 220,
  [int]$CropHeight = 210
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$labelHeight = 24
$timeline = [System.Drawing.Bitmap]::new($CropWidth * $InputPaths.Count, $CropHeight + $labelHeight)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($timeline)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(8, 13, 22))
    $font = [System.Drawing.Font]::new("Segoe UI", 9)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    try {
      for ($index = 0; $index -lt $InputPaths.Count; $index += 1) {
        $resolved = (Resolve-Path -LiteralPath $InputPaths[$index]).Path
        $source = [System.Drawing.Bitmap]::new($resolved)
        try {
          $sourceRect = [System.Drawing.Rectangle]::new($CropX, $CropY, $CropWidth, $CropHeight)
          $destinationRect = [System.Drawing.Rectangle]::new($index * $CropWidth, 0, $CropWidth, $CropHeight)
          $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
          $label = [System.IO.Path]::GetFileNameWithoutExtension($resolved).Replace("basic-attack-final-", "")
          $graphics.DrawString($label, $font, $brush, $index * $CropWidth + 8, $CropHeight + 4)
        } finally {
          $source.Dispose()
        }
      }
    } finally {
      $brush.Dispose()
      $font.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
  $timeline.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $timeline.Dispose()
}

Get-Item -LiteralPath $resolvedOutput | Select-Object Name, Length, FullName
