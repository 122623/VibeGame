param(
  [Parameter(Mandatory = $true)]
  [string]$FramesDirectory,

  [int]$AlphaThreshold = 8
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not ("SpriteComponentCleaner" -as [type])) {
  $drawingAssembly = ([System.Drawing.Bitmap].Assembly.Location)
  Add-Type -ReferencedAssemblies $drawingAssembly -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class SpriteComponentCleaner
{
    public static int Clean(string path, int alphaThreshold)
    {
        using (Bitmap source = new Bitmap(path))
        using (Bitmap image = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (Graphics graphics = Graphics.FromImage(image))
            {
                graphics.DrawImageUnscaled(source, 0, 0);
            }

            int width = image.Width;
            int height = image.Height;
            bool[] visible = new bool[width * height];
            bool[] visited = new bool[visible.Length];
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                    visible[y * width + x] = image.GetPixel(x, y).A > alphaThreshold;

            List<int> largest = new List<int>();
            int[] dx = new int[] { -1, 0, 1, -1, 1, -1, 0, 1 };
            int[] dy = new int[] { -1, -1, -1, 0, 0, 1, 1, 1 };
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
                    for (int neighbor = 0; neighbor < dx.Length; neighbor++)
                    {
                        int nextX = x + dx[neighbor];
                        int nextY = y + dy[neighbor];
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
            int removed = 0;
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = y * width + x;
                    if (!visible[index] || keep[index]) continue;
                    Color color = image.GetPixel(x, y);
                    image.SetPixel(x, y, Color.FromArgb(0, color.R, color.G, color.B));
                    removed++;
                }
            }
            string temporaryPath = path + ".cleaning.png";
            image.Save(temporaryPath, ImageFormat.Png);
            source.Dispose();
            File.Copy(temporaryPath, path, true);
            File.Delete(temporaryPath);
            return removed;
        }
    }
}
'@
}

$resolvedDirectory = (Resolve-Path -LiteralPath $FramesDirectory).Path
Get-ChildItem -LiteralPath $resolvedDirectory -File -Filter "*.png" |
  Sort-Object Name |
  ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      RemovedPixels = [SpriteComponentCleaner]::Clean($_.FullName, $AlphaThreshold)
    }
  }
