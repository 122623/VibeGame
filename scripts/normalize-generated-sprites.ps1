param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [Parameter(Mandatory = $true)]
  [string[]]$Names,

  [int]$TargetWidth = 128,
  [int]$TargetHeight = 192,
  [int]$Padding = 5
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

if (-not ("GeneratedSpriteNormalizer" -as [type])) {
  $drawingAssembly = ([System.Drawing.Bitmap].Assembly.Location)
  Add-Type -ReferencedAssemblies $drawingAssembly -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class GeneratedSpriteNormalizer
{
    public static void Normalize(
        string inputPath,
        string outputDirectory,
        string[] names,
        int targetWidth,
        int targetHeight,
        int padding)
    {
        if (names == null || names.Length == 0)
            throw new ArgumentException("At least one sprite name is required.", "names");
        if (targetWidth <= padding * 2 || targetHeight <= padding * 2)
            throw new ArgumentException("Target canvas is too small for the requested padding.");

        Directory.CreateDirectory(outputDirectory);
        using (Bitmap source = new Bitmap(inputPath))
        {
            Color key = AverageCorners(source);
            for (int index = 0; index < names.Length; index++)
            {
                int left = (int)Math.Round((double)source.Width * index / names.Length);
                int right = (int)Math.Round((double)source.Width * (index + 1) / names.Length);
                using (Bitmap keyed = ExtractSlot(source, left, right, key))
                {
                    KeepLargestComponent(keyed);
                    Rectangle bounds = FindVisibleBounds(keyed);
                    if (bounds.Width <= 0 || bounds.Height <= 0)
                        throw new InvalidOperationException("No visible sprite pixels found in slot " + index + ".");

                    int expandedLeft = Math.Max(0, bounds.Left - 2);
                    int expandedTop = Math.Max(0, bounds.Top - 2);
                    int expandedRight = Math.Min(keyed.Width, bounds.Right + 2);
                    int expandedBottom = Math.Min(keyed.Height, bounds.Bottom + 2);
                    Rectangle crop = Rectangle.FromLTRB(expandedLeft, expandedTop, expandedRight, expandedBottom);

                    double scale = Math.Min(
                        (double)(targetWidth - padding * 2) / crop.Width,
                        (double)(targetHeight - padding * 2) / crop.Height);
                    int drawWidth = Math.Max(1, (int)Math.Round(crop.Width * scale));
                    int drawHeight = Math.Max(1, (int)Math.Round(crop.Height * scale));
                    int drawX = (targetWidth - drawWidth) / 2;
                    int drawY = targetHeight - padding - drawHeight;

                    using (Bitmap output = new Bitmap(targetWidth, targetHeight, PixelFormat.Format32bppArgb))
                    using (Graphics graphics = Graphics.FromImage(output))
                    {
                        graphics.Clear(Color.Transparent);
                        graphics.CompositingMode = CompositingMode.SourceCopy;
                        graphics.CompositingQuality = CompositingQuality.HighQuality;
                        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        graphics.SmoothingMode = SmoothingMode.HighQuality;
                        graphics.DrawImage(
                            keyed,
                            new Rectangle(drawX, drawY, drawWidth, drawHeight),
                            crop,
                            GraphicsUnit.Pixel);

                        string outputPath = Path.Combine(outputDirectory, names[index] + ".png");
                        output.Save(outputPath, ImageFormat.Png);
                    }
                }
            }
        }
    }

    private static Bitmap ExtractSlot(Bitmap source, int left, int right, Color key)
    {
        int width = Math.Max(1, right - left);
        Bitmap output = new Bitmap(width, source.Height, PixelFormat.Format32bppArgb);
        bool greenKey = key.G > key.R + 70 && key.G > key.B + 70;

        for (int y = 0; y < source.Height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                Color color = source.GetPixel(left + x, y);
                double distance = Math.Sqrt(
                    Square(color.R - key.R)
                    + Square(color.G - key.G)
                    + Square(color.B - key.B));
                int alpha;
                if (distance <= 45) alpha = 0;
                else if (distance >= 155) alpha = 255;
                else alpha = (int)Math.Round((distance - 45) * 255 / 110);

                int red = color.R;
                int green = color.G;
                int blue = color.B;
                if (greenKey && alpha > 0 && alpha < 250)
                {
                    int edgeGreenLimit = Math.Max(red, blue) + 14;
                    green = Math.Min(green, edgeGreenLimit);
                }
                output.SetPixel(x, y, Color.FromArgb(Clamp(alpha), red, Clamp(green), blue));
            }
        }
        return output;
    }

    private static Rectangle FindVisibleBounds(Bitmap image)
    {
        int minX = image.Width;
        int minY = image.Height;
        int maxX = -1;
        int maxY = -1;
        for (int y = 0; y < image.Height; y++)
        {
            for (int x = 0; x < image.Width; x++)
            {
                if (image.GetPixel(x, y).A <= 32) continue;
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

    private static void KeepLargestComponent(Bitmap image)
    {
        int width = image.Width;
        int height = image.Height;
        bool[] visible = new bool[width * height];
        bool[] visited = new bool[visible.Length];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
                visible[y * width + x] = image.GetPixel(x, y).A > 16;
        }

        List<int> largest = new List<int>();
        int[] neighborX = new int[] { -1, 0, 1, -1, 1, -1, 0, 1 };
        int[] neighborY = new int[] { -1, -1, -1, 0, 0, 1, 1, 1 };
        for (int start = 0; start < visible.Length; start++)
        {
            if (!visible[start] || visited[start]) continue;
            Queue<int> pending = new Queue<int>();
            List<int> component = new List<int>();
            pending.Enqueue(start);
            visited[start] = true;
            while (pending.Count > 0)
            {
                int current = pending.Dequeue();
                component.Add(current);
                int x = current % width;
                int y = current / width;
                for (int neighbor = 0; neighbor < neighborX.Length; neighbor++)
                {
                    int nextX = x + neighborX[neighbor];
                    int nextY = y + neighborY[neighbor];
                    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
                    int next = nextY * width + nextX;
                    if (!visible[next] || visited[next]) continue;
                    visited[next] = true;
                    pending.Enqueue(next);
                }
            }
            if (component.Count > largest.Count) largest = component;
        }

        bool[] keep = new bool[visible.Length];
        foreach (int pixel in largest) keep[pixel] = true;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int index = y * width + x;
                if (keep[index] || !visible[index]) continue;
                Color color = image.GetPixel(x, y);
                image.SetPixel(x, y, Color.FromArgb(0, color.R, color.G, color.B));
            }
        }
    }

    private static Color AverageCorners(Bitmap image)
    {
        Color[] samples = new Color[] {
            image.GetPixel(0, 0),
            image.GetPixel(image.Width - 1, 0),
            image.GetPixel(0, image.Height - 1),
            image.GetPixel(image.Width - 1, image.Height - 1)
        };
        int red = 0, green = 0, blue = 0;
        foreach (Color sample in samples)
        {
            red += sample.R;
            green += sample.G;
            blue += sample.B;
        }
        return Color.FromArgb(red / samples.Length, green / samples.Length, blue / samples.Length);
    }

    private static int Square(int value) { return value * value; }
    private static int Clamp(int value) { return Math.Max(0, Math.Min(255, value)); }
}
'@
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[GeneratedSpriteNormalizer]::Normalize(
  $resolvedInput,
  $resolvedOutput,
  $Names,
  $TargetWidth,
  $TargetHeight,
  $Padding
)

Get-ChildItem -LiteralPath $resolvedOutput -File -Filter "*.png" |
  Where-Object { $Names -contains $_.BaseName } |
  Sort-Object Name |
  Select-Object Name, Length, FullName
