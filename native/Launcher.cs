using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class Launcher {
 public static string DescribeError(Exception error){
  if(error is UnauthorizedAccessException)return "O Windows negou acesso a um arquivo do VoaDesk. A conta que abre o aplicativo precisa de permissao na configuracao local.\n\n"+error.Message;
  if(error is System.Security.Cryptography.CryptographicException)return "A credencial do VoaDesk pertence a outra conta do Windows. Configure o operador para esta conta.";
  var processError=error as System.ComponentModel.Win32Exception;
  if(processError!=null&&(processError.NativeErrorCode==2||processError.NativeErrorCode==3))return "Node.js portatil nao encontrado. Extraia novamente o pacote completo do VoaDesk Tecnico.";
  return error.Message;
 }
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("shell32.dll")]static extern int SetCurrentProcessExplicitAppUserModelID(string id);
 [STAThread]public static int Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}SetCurrentProcessExplicitAppUserModelID("VoaDesk.Technician");Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  try{
   string folder=AppDomain.CurrentDomain.BaseDirectory,root=File.Exists(Path.Combine(folder,"src","host","server.mjs"))?folder:Directory.GetParent(folder.TrimEnd(Path.DirectorySeparatorChar)).FullName;
   foreach(string name in new[]{"Microsoft.Web.WebView2.Core.dll","Microsoft.Web.WebView2.WinForms.dll","WebView2Loader.dll"})if(!File.Exists(Path.Combine(folder,name)))throw new InvalidOperationException("Extraia a pasta completa do VoaDesk Tecnico. Dependencia ausente: "+name);
   return Run(root,args);
  }catch(Exception error){MessageBox.Show(DescribeError(error),"VoaDesk Tecnico - nao foi possivel iniciar",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
 [MethodImpl(MethodImplOptions.NoInlining)]static int Run(string root,string[] args){
  bool acquired;using(var mutex=new Mutex(true,"Local\\VoaDesk.Principal",out acquired)){
   if(!acquired){try{EventWaitHandle.OpenExisting("Local\\VoaDesk.Principal.Show").Set();}catch{}return 0;}
   bool online=Array.IndexOf(args,"--local")<0&&(Array.IndexOf(args,"--online")>=0||File.Exists(Path.Combine(root,"modo-online.flag")));
   using(var show=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\VoaDesk.Principal.Show"))using(var window=new TechnicianWindow(root,online)){
    var registration=ThreadPool.RegisterWaitForSingleObject(show,delegate(object state,bool timeout){if(window.IsHandleCreated&&!window.IsDisposed)try{window.BeginInvoke(new Action(window.Reveal));}catch{}},null,-1,false);
    Application.Run(window);registration.Unregister(null);
   }mutex.ReleaseMutex();
  }return 0;
 }
}
