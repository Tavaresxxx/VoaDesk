using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
public static class FeatureSmoke {
 static void Check(bool value){if(!value)throw new Exception("Feature regression failed.");}
 static Dictionary<string,object> Event(string type,string code=null){return new Dictionary<string,object>{{"type",type},{"code",code}};}
 public static int Main(string[] args){
  try{
   var sent=new List<RemoteInput.INPUT>();using(var engine=new RemoteInput(sent.Add)){
    engine.Apply(Event("keyDown","ControlLeft"));Check(sent.Count==0);engine.Enabled=true;
    engine.Apply(Event("keyDown","ControlLeft"));engine.Apply(Event("keyDown","KeyC"));
    engine.Apply(new Dictionary<string,object>{{"type","down"},{"button",0},{"x",1.0},{"y",1.0}});
    Check(engine.Held==3);engine.Enabled=false;Check(engine.Held==0);Check(sent[sent.Count-1].data.mouse.flags==4);
    engine.Enabled=true;int from=sent.Count;string text="Ação, café, João, maçã e ç.";
    engine.Apply(new Dictionary<string,object>{{"type","text"},{"text",text}});
    Check(sent.Count-from==text.Length*2);var actual=new StringBuilder();for(int i=from;i<sent.Count;i+=2){actual.Append((char)sent[i].data.key.scan);Check(sent[i].data.key.flags==4&&sent[i+1].data.key.flags==6);}Check(actual.ToString()==text);
    Check(RemoteInput.Map(.5,.5,1920,1080).X==960);Check(RemoteInput.Map(1,1,3840,2160).X==3839);Check(RemoteInput.Map(0,0,1920,1080).Y==0);
    var desktop=new System.Drawing.Rectangle(-1920,-1080,3840,2160);
    Check(RemoteInput.MapDesktop(0,0,new System.Drawing.Rectangle(-1920,-1080,1920,1080),desktop)==System.Drawing.Point.Empty);
    var bottom=RemoteInput.MapDesktop(1,1,new System.Drawing.Rectangle(0,0,1920,1080),desktop);Check(bottom.X==65535&&bottom.Y==65535);
    var left=RemoteInput.MapDesktop(1,1,new System.Drawing.Rectangle(-1920,-1080,1920,1080),desktop);Check(left.X>32700&&left.X<32768&&left.Y>32700&&left.Y<32768);
   }
   string envelope=File.ReadAllText(args[0]),xml=File.ReadAllText(args[1]);Check(UpdatePackage.Verify(envelope,xml,DateTime.UtcNow)!=null);
   bool rejected=false;try{UpdatePackage.Verify(envelope.Replace("payload\":\"","payload\":\"A"),xml,DateTime.UtcNow);}catch{rejected=true;}Check(rejected);
   rejected=false;try{UpdatePackage.Verify(envelope,xml,DateTime.UtcNow.AddDays(365));}catch{rejected=true;}Check(rejected);
   if(args.Length>2){Directory.CreateDirectory(args[2]);string target=Path.Combine(args[2],"VoaDeskCliente.exe"),staged=Path.Combine(args[2],"candidate.new");File.WriteAllText(target,"previous-version");File.WriteAllText(staged,"next-version");bool denied=false;try{UpdateWorker.ReplaceVerifiedFile(staged,target,new string('0',64));}catch{denied=true;}Check(denied&&File.ReadAllText(target)=="previous-version");string hash;using(var sha=System.Security.Cryptography.SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(staged))).Replace("-","").ToLowerInvariant();UpdateWorker.ReplaceVerifiedFile(staged,target,hash);Check(File.ReadAllText(target)=="next-version"&&File.ReadAllText(target+".previous")=="previous-version");}
   if(args.Length>3)foreach(string kind in new[]{"declared/","chunked/"})using(var http=new System.Net.Http.HttpClient()){
    http.Timeout=TimeSpan.FromSeconds(3);var clock=System.Diagnostics.Stopwatch.StartNew();bool oversized=false;
    try{new UpdatePackage(new Uri(args[3]+kind)).Check(http).GetAwaiter().GetResult();}catch{oversized=true;}
    Check(oversized&&clock.Elapsed.TotalMilliseconds<2000);
   }
   Console.WriteLine("{\"result\":\"passed\",\"realOsInputInjected\":false,\"unicodeAccentsPreserved\":true,\"releaseAll\":true,\"normalizedCoordinates\":true,\"signedUpdateVerified\":true,\"tamperAndExpiryRejected\":true}");return 0;
  }catch(Exception e){Console.WriteLine(e.GetType().Name+": "+e.Message);return 1;}
 }
}
