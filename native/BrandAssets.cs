using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
public static class BrandAssets {
    public static int Main(string[] args) {
        Directory.CreateDirectory(args[1]);
        using (var original = new Bitmap(args[0])) {
            // Exact crops of supplied artwork; no redrawing or replacement font.
            var wordmark = new Rectangle((int)(original.Width*.037), (int)(original.Height*.205), (int)(original.Width*.93), (int)(original.Height*.60));
            var symbol = new Rectangle((int)(original.Width*.037), (int)(original.Height*.205), (int)(original.Width*.263), (int)(original.Height*.60));
            using (var logo=original.Clone(wordmark, PixelFormat.Format32bppArgb)) logo.Save(Path.Combine(args[1],"logo.png"),ImageFormat.Png);
            using (var iconFile=new BinaryWriter(File.Create(Path.Combine(args[1],"voadesk.ico")))) {
                int[] sizes={16,24,32,48,64,128,256}; var images=new byte[sizes.Length][];
                for (int i=0;i<sizes.Length;i++) {
                    int size=sizes[i];
                    using (var bitmap=new Bitmap(size,size,PixelFormat.Format32bppArgb)) using (var graphics=Graphics.FromImage(bitmap)) {
                        graphics.Clear(Color.Transparent); graphics.SmoothingMode=SmoothingMode.AntiAlias; graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;
                        using (var brush=new SolidBrush(Color.White)) graphics.FillEllipse(brush,0,0,size-1,size-1);
                        float scale=Math.Min(size*.82f/symbol.Width,size*.72f/symbol.Height);
                        var destination=new RectangleF((size-symbol.Width*scale)/2,(size-symbol.Height*scale)/2,symbol.Width*scale,symbol.Height*scale);
                        graphics.DrawImage(original,destination,symbol,GraphicsUnit.Pixel);
                        using (var stream=new MemoryStream()) { bitmap.Save(stream,ImageFormat.Png); images[i]=stream.ToArray(); }
                        if (size==256) bitmap.Save(Path.Combine(args[1],"symbol.png"),ImageFormat.Png);
                    }
                }
                iconFile.Write((ushort)0); iconFile.Write((ushort)1); iconFile.Write((ushort)sizes.Length); int offset=6+16*sizes.Length;
                for(int i=0;i<sizes.Length;i++) { iconFile.Write((byte)(sizes[i]==256?0:sizes[i])); iconFile.Write((byte)(sizes[i]==256?0:sizes[i])); iconFile.Write((byte)0); iconFile.Write((byte)0); iconFile.Write((ushort)1); iconFile.Write((ushort)32); iconFile.Write(images[i].Length); iconFile.Write(offset); offset+=images[i].Length; }
                foreach(var image in images) iconFile.Write(image);
            }
        }
        return 0;
    }
}
