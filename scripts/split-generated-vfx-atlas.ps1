param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [Parameter(Mandatory = $true)]
  [string[]]$Names,

  [int]$TargetSize = 384,
  [int]$Padding = 8,
  [int]$BlackThreshold = 10
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not ("GeneratedVfxAtlasSplitter" -as [type])) {
  $drawingAssembly = ([System.Drawing.Bitmap].Assembly.Location)
  Add-Type -ReferencedAssemblies $drawingAssembly -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class GeneratedVfxAtlasSplitter
{
    public static void Split(
        string inputPath,
        string outputDirectory,
        string[] names,
        int targetSize,
        int padding,
        int blackThreshold)
    {
        if (names == null || names.Length == 0)
            throw new ArgumentException("At least one effect name is required.", "names");
        if (targetSize <= padding * 2)
            throw new ArgumentException("Target canvas is too small for the requested padding.");

        Directory.CreateDirectory(outputDirectory);
        using (Bitmap source = new Bitmap(inputPath))
        {
            for (int index = 0; index < names.Length; index++)
            {
                int left = (int)Math.Round((double)source.Width * index / names.Length);
                int right = (int)Math.Round((double)source.Width * (index + 1) / names.Length);
                Rectangle slot = new Rectangle(left, 0, Math.Max(1, right - left), source.Height);
                Rectangle visible = FindVisibleBounds(source, slot, blackThreshold);
                if (visible.Width <= 0 || visible.Height <= 0)
                    throw new InvalidOperationException("No visible effect pixels found in slot " + index + ".");

                visible = Expand(visible, slot, 8);
                double scale = Math.Min(
                    (double)(targetSize - padding * 2) / visible.Width,
                    (double)(targetSize - padding * 2) / visible.Height);
                int drawWidth = Math.Max(1, (int)Math.Round(visible.Width * scale));
                int drawHeight = Math.Max(1, (int)Math.Round(visible.Height * scale));
                int drawX = (targetSize - drawWidth) / 2;
                int drawY = (targetSize - drawHeight) / 2;

                using (Bitmap output = new Bitmap(targetSize, targetSize, PixelFormat.Format32bppArgb))
                using (Graphics graphics = Graphics.FromImage(output))
                {
                    graphics.Clear(Color.Black);
                    graphics.CompositingMode = CompositingMode.SourceCopy;
                    graphics.CompositingQuality = CompositingQuality.HighQuality;
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    graphics.SmoothingMode = SmoothingMode.HighQuality;
                    graphics.DrawImage(
                        source,
                        new Rectangle(drawX, drawY, drawWidth, drawHeight),
                        visible,
                        GraphicsUnit.Pixel);

                    string outputPath = Path.Combine(outputDirectory, names[index] + ".png");
                    output.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }

    private static Rectangle FindVisibleBounds(Bitmap source, Rectangle slot, int threshold)
    {
        int minX = slot.Right;
        int minY = slot.Bottom;
        int maxX = -1;
        int maxY = -1;

        for (int y = slot.Top; y < slot.Bottom; y++)
        {
            for (int x = slot.Left; x < slot.Right; x++)
            {
                Color pixel = source.GetPixel(x, y);
                if (Math.Max(pixel.R, Math.Max(pixel.G, pixel.B)) <= threshold) continue;
                minX = Math.Min(minX, x);
                minY = Math.Min(minY, y);
                maxX = Math.Max(maxX, x);
                maxY = Math.Max(maxY, y);
            }
        }

        return maxX < minX || maxY < minY
            ? Rectangle.Empty
            : Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
    }

    private static Rectangle Expand(Rectangle bounds, Rectangle limit, int amount)
    {
        return Rectangle.FromLTRB(
            Math.Max(limit.Left, bounds.Left - amount),
            Math.Max(limit.Top, bounds.Top - amount),
            Math.Min(limit.Right, bounds.Right + amount),
            Math.Min(limit.Bottom, bounds.Bottom + amount));
    }
}
'@
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))

[GeneratedVfxAtlasSplitter]::Split(
  $resolvedInput,
  $resolvedOutput,
  $Names,
  $TargetSize,
  $Padding,
  $BlackThreshold
)

Get-ChildItem -LiteralPath $resolvedOutput -Filter "*.png" |
  Where-Object { $_.BaseName -in $Names } |
  Select-Object Name, Length, LastWriteTime
