// QA executable only, never shipped: drives the real embedded control through its in-process test API.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class TechnicianFixture {
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576};static readonly object Output=new object();
 static void Write(object value){lock(Output)Console.WriteLine(Json.Serialize(value));}
 [STAThread]public static int Main(string[] args){
  Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);bool acquired;using(var mutex=new Mutex(true,"Local\\VoaDesk.Principal",out acquired)){
   if(!acquired){Write(new{kind="failed",message="Feche a janela do VoaDesk antes do teste isolado."});return 1;}
   var form=new TechnicianWindow(args[0],false,args[1],start=>{start.EnvironmentVariables["VOADESK_TEST_DATA_DIR"]=args[1];start.EnvironmentVariables["VOADESK_LOCAL_PAIRING_PORT"]="0";if(Environment.GetEnvironmentVariable("VOADESK_QA_PORTABLE_ONLY")=="1")start.EnvironmentVariables["PATH"]=Environment.GetFolderPath(Environment.SpecialFolder.System);});int reveals=0;bool announced=false;var timer=new System.Windows.Forms.Timer{Interval=100};var clock=System.Diagnostics.Stopwatch.StartNew();
   using(var show=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\VoaDesk.Principal.Show")){
    var registration=ThreadPool.RegisterWaitForSingleObject(show,delegate(object state,bool timeout){Interlocked.Increment(ref reveals);if(!form.IsDisposed)form.BeginInvoke(new Action(form.Reveal));},null,-1,false);
    timer.Tick+=delegate{if(form.Ready&&!announced){announced=true;Write(new{kind="ready",origin=form.HostOrigin,pairingOrigin=form.PairingOrigin,pid=form.HostProcessId,version=form.Browser.CoreWebView2.Environment.BrowserVersionString});}else if(!announced&&clock.Elapsed.TotalSeconds>25){Write(new{kind="failed",message="A janela nativa não ficou pronta."});form.Close();}};
    var reader=Task.Run(delegate{string line;while((line=Console.ReadLine())!=null){var message=Json.Deserialize<Dictionary<string,object>>(line);if(form.IsDisposed)break;form.BeginInvoke(new Action(async delegate{object result=null;string error=null;try{string action=Convert.ToString(message["action"]);
      if(action=="eval"){string response=await form.Browser.CoreWebView2.CallDevToolsProtocolMethodAsync("Runtime.evaluate",Json.Serialize(new{expression=Convert.ToString(message["script"]),awaitPromise=true,returnByValue=true,userGesture=message.ContainsKey("gesture")&&Convert.ToBoolean(message["gesture"])}));var data=Json.Deserialize<Dictionary<string,object>>(response);if(data.ContainsKey("exceptionDetails"))throw new Exception(Json.Serialize(data["exceptionDetails"]));var value=(Dictionary<string,object>)data["result"];result=value.ContainsKey("value")?value["value"]:null;}
      else if(action=="cdp"){result=Json.DeserializeObject(await form.Browser.CoreWebView2.CallDevToolsProtocolMethodAsync(Convert.ToString(message["method"]),Json.Serialize(message["parameters"])));}
      else if(action=="state")result=new{reveals=reveals,full=form.FormBorderStyle==FormBorderStyle.None,width=form.Width,height=form.Height,title=form.Text,status=form.StatusText,ready=form.Ready,hostExecutable=form.HostExecutable,hostRunning=form.HostRunning,nodeWindow=form.HostWindowHandle};
      else if(action=="screenshot"){using(var stream=File.Create(Convert.ToString(message["path"])))await form.Browser.CoreWebView2.CapturePreviewAsync(Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Png,stream);result=true;}
      else if(action=="activate"){form.Activate();form.BringToFront();result=true;}
      else if(action=="window"){form.WindowState=(FormWindowState)Enum.Parse(typeof(FormWindowState),Convert.ToString(message["state"]));if(message.ContainsKey("width"))form.Size=new System.Drawing.Size(Convert.ToInt32(message["width"]),Convert.ToInt32(message["height"]));result=form.WindowState.ToString();}
      else if(action=="zoom"){form.Browser.ZoomFactor=Convert.ToDouble(message["factor"]);result=form.Browser.ZoomFactor;}
      else if(action=="stop-host"){await form.StopHost();result=true;}
      else if(action=="close"){form.Close();result=true;}
      else throw new Exception("Ação de QA desconhecida.");
     }catch(Exception e){error=e.Message;}Write(new{id=message["id"],value=result,error=error});}));}if(!form.IsDisposed)form.BeginInvoke(new Action(form.Close));});
    form.FormClosed+=delegate{timer.Stop();Write(new{kind="closed"});};timer.Start();Application.Run(form);registration.Unregister(null);
   }timer.Dispose();form.Dispose();mutex.ReleaseMutex();
  }return 0;
 }
}
