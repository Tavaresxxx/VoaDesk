using System;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

// Applies identity only to the Edge process started for this application.
public static class WindowBranding {
    [DllImport("user32.dll",CharSet=CharSet.Auto)] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wparam,IntPtr lparam,uint flags,uint timeout,out IntPtr result);
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
    [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid Format; public uint Id; }
    [StructLayout(LayoutKind.Explicit,Size=24)] public struct Variant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Value; }
    [ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore {
        [PreserveSig] int GetCount(out uint count); [PreserveSig] int GetAt(uint i,out Key key); [PreserveSig] int GetValue(ref Key key,out Variant value); [PreserveSig] int SetValue(ref Key key,ref Variant value); [PreserveSig] int Commit();
    }
    static void Set(IPropertyStore store,uint id,string value) {
        var key=new Key { Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),Id=id };
        var variant=new Variant { Type=31,Value=Marshal.StringToCoTaskMemUni(value) };
        try { Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref variant)); } finally { PropVariantClear(ref variant); }
    }
    [STAThread] public static int Main(string[] args) {
        try {
            int pid;if(args.Length!=1||!Int32.TryParse(args[0],out pid))return 1;
            var process=Process.GetProcessById(pid);if(process.ProcessName!="msedge")return 1;
            IntPtr window=IntPtr.Zero;
            for(int i=0;i<150;i++) { if(process.HasExited)return 1; process.Refresh(); window=process.MainWindowHandle; if(window!=IntPtr.Zero&&process.MainWindowTitle.StartsWith("VoaDesk"))break; Thread.Sleep(100); }
            if(window==IntPtr.Zero||!process.MainWindowTitle.StartsWith("VoaDesk"))return 1;
            using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("VoaDesk.Icon")) using(var icon=new Icon(stream,48,48)) {
                Guid iid=new Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"); IPropertyStore store;
                if(SHGetPropertyStoreForWindow(window,ref iid,out store)==0) {
                    try {
                        string launcher=Assembly.GetExecutingAssembly().Location.Replace("VoaDeskWindow.exe","VoaDesk.exe");
                        Set(store,2,"\""+launcher+"\""); Set(store,4,"VoaDesk"); Set(store,3,launcher+",0"); Set(store,5,"VoaDesk.Principal"); store.Commit();
                    } finally { Marshal.ReleaseComObject(store); }
                }
                // Keep icon handles alive while the branded application window exists.
                IntPtr result;
                for(int i=0;i<3;i++) { SendMessageTimeout(window,0x80,new IntPtr(0),icon.Handle,2,1000,out result); SendMessageTimeout(window,0x80,new IntPtr(1),icon.Handle,2,1000,out result); Thread.Sleep(1000); }
                process.WaitForExit();
            }
            return 0;
        } catch { return 1; }
    }
}
