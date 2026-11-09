// Local QA only: synthetic pixels and a SendInput collector, never the user's desktop or keyboard.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class DesktopBridgeFixture {
 [STAThread]public static void Main(string[] args){
  Application.EnableVisualStyles();var form=new Form{ShowInTaskbar=false,Opacity=0};DesktopBridge bridge=null;var input=new RemoteInput(e=>Console.WriteLine(new JavaScriptSerializer().Serialize(new{kind="input",type=e.type,scan=e.data.key.scan,flags=e.type==0?e.data.mouse.flags:e.data.key.flags})));bool allowed=true,busy=false;var http=new HttpClient();http.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Environment.GetEnvironmentVariable("VOADESK_FIXTURE_CLIENT"));var timer=new Timer{Interval=250};
  form.Shown+=async delegate{
   try{bridge=new DesktopBridge(form,new Uri(args[0]),()=>allowed,e=>{input.Enabled=true;input.Apply(e);},bounds=>input.TargetBounds=bounds,()=>form.Close(),bounds=>{
    if(!form.InvokeRequired)throw new InvalidOperationException("A captura está bloqueando a janela que processa a entrada.");
    var bitmap=new Bitmap(1280,720);using(var g=Graphics.FromImage(bitmap)){g.Clear(Color.White);g.DrawString("VoaDesk QA local - pixels sinteticos",SystemFonts.DefaultFont,Brushes.Blue,40,40);g.FillRectangle(Brushes.CornflowerBlue,(DateTime.UtcNow.Millisecond/5),180,80,80);}return bitmap;
   });await bridge.Initialize(Environment.GetEnvironmentVariable("VOADESK_FIXTURE_TICKET"));Console.WriteLine(new JavaScriptSerializer().Serialize(new{kind="ready",url=bridge.BootstrapUrl}));timer.Start();}
   catch(Exception e){Console.WriteLine(new{error=e.GetType().Name});form.Close();}
  };
  timer.Tick+=async delegate{if(busy)return;busy=true;try{var json=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(await http.GetStringAsync(new Uri(new Uri(args[0]),"v3/client/commands")));string state=Convert.ToString(json["state"]);if(state!="active"&&state!="approved"){allowed=false;input.Enabled=false;bridge.Dispose();form.Close();}}catch{allowed=false;form.Close();}finally{busy=false;}};
  form.FormClosed+=delegate{allowed=false;timer.Stop();input.Dispose();if(bridge!=null)bridge.Dispose();http.Dispose();};Application.Run(form);timer.Dispose();
 }
}
