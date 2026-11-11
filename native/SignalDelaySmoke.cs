using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
public static class SignalDelaySmoke {
 [STAThread]public static int Main(string[] args){
  ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);var sent=new List<RemoteInput.INPUT>();var form=new ClientWindow(args[0],args[1],false,sent.Add);var timer=new Timer{Interval=100};var elapsed=Stopwatch.StartNew();bool running=false;int result=1;string step="start";
  timer.Tick+=async delegate{
   if(running)return;var label=form.Controls.OfType<Label>().FirstOrDefault(l=>l.Name=="AccessCode"&&System.Text.RegularExpressions.Regex.IsMatch(l.Text,@"^[A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4} [A-Z2-9]{4}$"));if(label==null){if(elapsed.Elapsed.TotalSeconds>15){timer.Stop();form.Close();}return;}running=true;timer.Stop();
   try{
    using(var tech=new HttpClient()){
     tech.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Environment.GetEnvironmentVariable("VOADESK_TEST_OPERATOR_TOKEN"));
     step="request";var r=await tech.PostAsync(new Uri(new Uri(args[0]),"v3/operator/request"),new StringContent("{\"code\":\""+label.Text+"\"}",Encoding.UTF8,"application/json"));r.EnsureSuccessStatusCode();var request=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(await r.Content.ReadAsStringAsync());tech.DefaultRequestHeaders.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Convert.ToString(request["token"]));
     var deadline=Stopwatch.StartNew();while(!form.Controls.OfType<Button>().Any(b=>b.Text=="Aceitar conexão"&&b.Enabled)&&deadline.Elapsed.TotalSeconds<5)await Task.Delay(50);
     step="consent";form.Controls.OfType<Button>().First(b=>b.Text=="Aceitar conexão").PerformClick();deadline.Restart();while(form.LastCaptureTicket==null&&deadline.Elapsed.TotalSeconds<5)await Task.Delay(50);if(form.LastCaptureTicket==null)throw new Exception("No consent ticket; screens="+Screen.AllScreens.Length);
     step="capture-ticket";using(var capture=new HttpClient(new HttpClientHandler{CookieContainer=new CookieContainer()})){
      var boot=await capture.GetAsync(new Uri(new Uri(args[0]),"support/bootstrap?ticket="+form.LastCaptureTicket));boot.EnsureSuccessStatusCode();
      capture.DefaultRequestHeaders.Add("Origin",args[0].TrimEnd('/'));capture.DefaultRequestHeaders.Add("X-VoaDesk","1");
      step="commands";string[] commands={"{\"type\":\"text\",\"text\":\"Ação e ç.\"}","{\"type\":\"keyDown\",\"code\":\"ControlLeft\"}","{\"type\":\"down\",\"x\":0.5,\"y\":0.5,\"button\":0}"};
      var currentResponse=await tech.PostAsync(new Uri(new Uri(args[0]),"v3/operator/state"),new StringContent("{}",Encoding.UTF8,"application/json"));currentResponse.EnsureSuccessStatusCode();var current=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(await currentResponse.Content.ReadAsStringAsync());
      foreach(string command in commands){string stamped=command.Substring(0,command.Length-1)+",\"permissionRevision\":"+Convert.ToString(current["permissionRevision"])+"}";var response=await capture.PostAsync(new Uri(new Uri(args[0]),"support/input"),new StringContent(stamped,Encoding.UTF8,"application/json"));response.EnsureSuccessStatusCode();}
      deadline.Restart();while(sent.Count<20&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(30);
      if(!sent.Any(i=>i.type==1&&i.data.key.flags==4&&i.data.key.scan=='ç')||!sent.Any(i=>i.type==0&&i.data.mouse.flags==2))throw new Exception("Native bridge did not process commands.");
      step="latency-native-authorization";
      var method=typeof(ClientWindow).GetMethod("NativeAllowed",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
      Func<bool> allowed=()=>Convert.ToBoolean(method.Invoke(form,null));
      deadline.Restart();while(!allowed()&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(20);
      using(var bridge=new DesktopBridge(form,new Uri(args[0]),allowed,e=>{},bounds=>{},()=>{},bounds=>new System.Drawing.Bitmap(320,180)))
      using(var local=new HttpClient(new HttpClientHandler{CookieContainer=new CookieContainer(),AllowAutoRedirect=false})){
       var bootstrap=await local.GetAsync(bridge.BootstrapUrl);if(bootstrap.StatusCode!=HttpStatusCode.SeeOther)throw new Exception("Initial local bootstrap failed");
       var stateReply=await local.GetStringAsync(bridge.Origin+"/support/native/state");var stateData=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(stateReply);string framePath=bridge.Origin+"/support/native/frame?"+Uri.EscapeDataString(Convert.ToString(stateData["selected"]));var before=await local.GetAsync(framePath);if(!before.IsSuccessStatusCode)throw new Exception("Initial native frame failed");
       await capture.GetStringAsync(new Uri(new Uri(args[0]),"__test/arm-delay"));
       deadline.Restart();while(await capture.GetStringAsync(new Uri(new Uri(args[0]),"__test/held"))!="true"&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(20);
       if(deadline.Elapsed.TotalSeconds>=3)throw new Exception("Delay not armed");
       var inputField=typeof(ClientWindow).GetField("input",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);var nativeInput=(RemoteInput)inputField.GetValue(form);
       bool paused=false;var pauseWatch=Stopwatch.StartNew();while(pauseWatch.ElapsedMilliseconds<1350){paused|=!nativeInput.Enabled;await Task.Delay(20);}
       var after=await local.GetAsync(framePath);
       deadline.Restart();while(!nativeInput.Enabled&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(20);if(!nativeInput.Enabled)throw new Exception("Input did not recover");
       var lastField=typeof(ClientWindow).GetField("lastCommand",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);lastField.SetValue(form,DateTime.UtcNow.AddSeconds(-9));bool leaseExpired=!allowed();lastField.SetValue(form,DateTime.UtcNow);if(!leaseExpired)throw new Exception("Expired lease accepted");
       form.Controls.OfType<Button>().First(b=>b.Text=="Encerrar atendimento").PerformClick();var revoked=await local.GetAsync(framePath);if(revoked.StatusCode!=HttpStatusCode.Forbidden)throw new Exception("Local revoke not immediate");
       Console.Error.WriteLine(new JavaScriptSerializer().Serialize(new{probe="signal-delay",delayMs=Int32.Parse(Environment.GetEnvironmentVariable("VOADESK_DROP_DELAY_MS")),before=(int)before.StatusCode,after=(int)after.StatusCode,inputPaused=paused,inputRecovered=true,leaseExpired,revoked=(int)revoked.StatusCode,osInputInjected=false}));
       bool expected=Environment.GetEnvironmentVariable("VOADESK_DROP_EXPECT_FORBIDDEN")=="true";if((after.StatusCode==HttpStatusCode.Forbidden)!=expected)throw new Exception("Unexpected authorization result during signaling probe");
      }
      if(args.Length>2){
       step="delayed-revocation";await capture.GetStringAsync(new Uri(new Uri(args[0]),"__test/arm"));
       deadline.Restart();while(await capture.GetStringAsync(new Uri(new Uri(args[0]),"__test/held"))!="true"&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(20);
       if(deadline.Elapsed.TotalSeconds>=3)throw new Exception("Delayed response was not held.");
       form.Controls.OfType<Button>().First(b=>b.Text=="Encerrar atendimento").PerformClick();
       await Task.Delay(150);int afterRevoke=sent.Count;
       await capture.GetStringAsync(new Uri(new Uri(args[0]),"__test/release"));await Task.Delay(350);
       if(sent.Count!=afterRevoke||sent.Any(i=>i.type==1&&i.data.key.scan==44&&(i.data.key.flags&2)==0))throw new Exception("Stale response restored input after revocation.");
      }
      var end=await tech.PostAsync(new Uri(new Uri(args[0]),"v3/operator/end"),new StringContent("{}",Encoding.UTF8,"application/json"));end.EnsureSuccessStatusCode();deadline.Restart();
      while((!sent.Any(i=>i.type==0&&i.data.mouse.flags==4)||!sent.Any(i=>i.type==1&&(i.data.key.flags&2)!=0&&i.data.key.scan==29))&&deadline.Elapsed.TotalSeconds<3)await Task.Delay(30);
      if(!sent.Any(i=>i.type==0&&i.data.mouse.flags==4)||!sent.Any(i=>i.type==1&&(i.data.key.flags&2)!=0&&i.data.key.scan==29))throw new Exception("Release not observed.");result=0;
     }
    }
   }catch(Exception e){Console.Error.WriteLine(e.ToString());Console.WriteLine("{\"error\":\""+e.GetType().Name+"\",\"step\":\""+step+"\",\"screens\":"+Screen.AllScreens.Length+",\"events\":"+sent.Count+"}");}
   form.Close();
  };
  timer.Start();Application.Run(form);timer.Dispose();if(result==0)Console.WriteLine("{\"result\":\"passed\",\"httpToNativeBridge\":true,\"unicodeDelivered\":true,\"heldKeyAndMouseReleasedOnEnd\":true,\"staleResponseIgnored\":"+(args.Length>2?"true":"false")+",\"osInputInjected\":false}");return result;
 }
}
