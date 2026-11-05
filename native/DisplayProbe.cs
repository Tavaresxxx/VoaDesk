using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

// Win32 structures follow the Windows DISPLAYCONFIG ABI, no C++ SDK required.
public static class DisplayProbe {
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct Source { public Luid Adapter; public uint Id, Mode, Flags; }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct Target {
        public Luid Adapter; public uint Id, Mode, Technology, Rotation, Scaling, RefreshNumerator, RefreshDenominator, Scanline;
        public int Available; public uint Flags;
    }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct DisplayPath { public Source Source; public Target Target; public uint Flags; }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct Header { public uint Type, Size; public Luid Adapter; public uint Id; }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct ColorInfo { public Header Header; public uint Flags, Encoding, Bits; }
    [StructLayout(LayoutKind.Sequential, Pack=4)] public struct ColorInfo2 { public Header Header; public uint Flags, Encoding, Bits, ActiveMode; }
    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, [Out] DisplayPath[] pathArray, ref uint modes, IntPtr modeArray, IntPtr topology);
    [DllImport("user32.dll", EntryPoint="DisplayConfigGetDeviceInfo")] static extern int GetColor(ref ColorInfo info);
    [DllImport("user32.dll", EntryPoint="DisplayConfigGetDeviceInfo")] static extern int GetColor2(ref ColorInfo2 info);
    static object Unknown(string reason) { return new { status="unknown", reason=reason, displays=new object[0] }; }
    public static object Read() {
        try {
            if (Marshal.SizeOf(typeof(DisplayPath)) != 72 || Marshal.SizeOf(typeof(ColorInfo)) != 32 || Marshal.SizeOf(typeof(ColorInfo2)) != 36) return Unknown("Estrutura nativa incompatível.");
            for (int retry=0; retry<3; retry++) {
                uint paths, modes;
                int status = GetDisplayConfigBufferSizes(2, out paths, out modes);
                if (status != 0 || paths == 0) return Unknown("Enumeração de monitores falhou: " + status);
                if (paths > 64 || modes > 1024) return Unknown("Quantidade de monitores fora do limite.");
                DisplayPath[] data = new DisplayPath[paths];
                IntPtr memory = Marshal.AllocHGlobal(checked((int)modes * 64));
                try {
                    status = QueryDisplayConfig(2, ref paths, data, ref modes, memory, IntPtr.Zero);
                    if (status == 122) continue;
                    if (status != 0) return Unknown("Consulta de monitores falhou: " + status);
                    var displays = new List<object>(); bool unsupported = false, unknown = false;
                    for (int i=0; i<paths; i++) {
                        var header = new Header { Type=15, Size=36, Adapter=data[i].Target.Adapter, Id=data[i].Target.Id };
                        var color2 = new ColorInfo2 { Header=header };
                        int code = GetColor2(ref color2);
                        if (code == 0) {
                            string mode = color2.ActiveMode == 0 ? "sdr" : color2.ActiveMode == 1 ? "wcg" : color2.ActiveMode == 2 ? "hdr" : "unknown";
                            unsupported |= mode == "hdr" || mode == "wcg"; unknown |= mode == "unknown";
                            displays.Add(new { mode=mode, bitsPerChannel=color2.Bits, colorEncoding=color2.Encoding, api="advanced-color-info-2" });
                        } else {
                            header.Type=9; header.Size=32;
                            var color = new ColorInfo { Header=header };
                            code=GetColor(ref color);
                            if (code != 0) { unknown=true; displays.Add(new { mode="unknown", error=code }); }
                            else {
                                bool active=(color.Flags & 2) != 0;
                                unsupported |= active;
                                displays.Add(new { mode=active ? "advanced-color-active" : "sdr", bitsPerChannel=color.Bits, colorEncoding=color.Encoding, api="advanced-color-info-legacy" });
                            }
                        }
                    }
                    return new { status=unknown ? "unknown" : unsupported ? "unsupported-color" : "sdr", reason=unsupported ? "HDR/WCG ativo; tone mapping ainda não implementado." : unknown ? "Estado de cor não confirmado." : "SDR confirmado via Win32.", displays=displays };
                } finally { Marshal.FreeHGlobal(memory); }
            }
            return Unknown("Topologia de monitores mudou durante a consulta.");
        } catch (Exception e) { return Unknown("Consulta indisponível: " + e.GetType().Name); }
    }
    public static int Main() { Console.WriteLine(new JavaScriptSerializer().Serialize(Read())); return 0; }
}
