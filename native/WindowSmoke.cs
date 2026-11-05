using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class WindowSmoke {
    [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid Format; public uint Id; }
    [StructLayout(LayoutKind.Explicit,Size=24)] public struct Variant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Value; }
    [ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore {
        [PreserveSig] int GetCount(out uint count); [PreserveSig] int GetAt(uint i,out Key key); [PreserveSig] int GetValue(ref Key key,out Variant value); [PreserveSig] int SetValue(ref Key key,ref Variant value); [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr wp,IntPtr lp,uint flags,uint timeout,out IntPtr result);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,IntPtr wp,IntPtr lp);
    static string Get(IPropertyStore store,uint id) { var key=new Key {Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),Id=id}; Variant value; Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value)); try {return value.Type==31?Marshal.PtrToStringUni(value.Value):null;} finally {PropVariantClear(ref value);} }
    [STAThread] public static int Main(string[] args) {
        bool found=false,title=false,app=false,resource=false,iconPresent=false;
        try {
            var process=Process.GetProcessById(Int32.Parse(args[0]));if(process.ProcessName!="msedge")return 1;
            for(int i=0;i<150;i++) {
                process.Refresh(); IntPtr window=process.MainWindowHandle;
                found|=window!=IntPtr.Zero;title|=process.MainWindowTitle.StartsWith("VoaDesk");
                if(window!=IntPtr.Zero&&process.MainWindowTitle.StartsWith("VoaDesk")) {
                    Guid iid=new Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99");IPropertyStore store;
                    if(SHGetPropertyStoreForWindow(window,ref iid,out store)==0) {
                        try {app=Get(store,5)=="VoaDesk.Principal";var icon=Get(store,3);resource=icon!=null&&icon.EndsWith("VoaDesk.exe,0");} finally {Marshal.ReleaseComObject(store);}
                        IntPtr result;SendMessageTimeout(window,0x7f,new IntPtr(1),IntPtr.Zero,2,1000,out result);
                        iconPresent=result!=IntPtr.Zero;
                        if(app&&resource&&result!=IntPtr.Zero) { Console.WriteLine("{\"appUserModelId\":true,\"relaunchIconIsVoaDesk\":true,\"windowIconPresent\":true}");PostMessage(window,0x10,IntPtr.Zero,IntPtr.Zero);return 0; }
                    }
                }
                Thread.Sleep(100);
            }
            Console.WriteLine("{\"result\":\"not-confirmed\",\"windowFound\":"+found.ToString().ToLower()+",\"titleMatched\":"+title.ToString().ToLower()+",\"appId\":"+app.ToString().ToLower()+",\"iconResource\":"+resource.ToString().ToLower()+",\"windowIcon\":"+iconPresent.ToString().ToLower()+"}");return 1;
        } catch(Exception e) {Console.WriteLine("{\"result\":\"failed\",\"exception\":\""+e.GetType().Name+"\"}");return 1;}
    }
}
