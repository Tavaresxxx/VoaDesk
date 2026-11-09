using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Per-consent loopback bridge. No inbound LAN listener, persistent credential or OS policy change.
public sealed class DesktopBridge : IDisposable {
 readonly TcpListener listener; readonly HttpClient upstream; readonly Control owner; readonly Func<bool> allowed;
 readonly Action<Dictionary<string,object>> input; readonly Action<Rectangle> target; readonly Action stop;
 readonly string secret=Guid.NewGuid().ToString("N")+Guid.NewGuid().ToString("N"); readonly Uri endpoint;
 readonly Func<Rectangle,Bitmap> capture;
 readonly object gate=new object(); readonly Dictionary<string,Transfer> transfers=new Dictionary<string,Transfer>();
 string selected=Screen.PrimaryScreen.DeviceName; long generation=0;int activeRequests=0;bool disposed,booted; public readonly string Origin;
 public string BootstrapUrl {get{return Origin+"/bootstrap?key="+secret;}}
 sealed class Transfer {public FileStream Stream;public string Partial,Final;public long Size,Offset;public bool Writing;}
 public DesktopBridge(Control owner,Uri endpoint,Func<bool> allowed,Action<Dictionary<string,object>> input,Action<Rectangle> target,Action stop,Func<Rectangle,Bitmap> capture=null){
  this.owner=owner;this.endpoint=endpoint;this.allowed=allowed;this.input=input;this.target=target;this.stop=stop;this.capture=capture;
  upstream=new HttpClient(new HttpClientHandler{CookieContainer=new CookieContainer(),AllowAutoRedirect=false});upstream.Timeout=TimeSpan.FromSeconds(10);
  listener=new TcpListener(IPAddress.Loopback,0);listener.Start(12);Origin="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port;var loop=Accept();
 }
 public async Task Initialize(string ticket){using(var r=await upstream.GetAsync(new Uri(endpoint,"support/bootstrap?ticket="+Uri.EscapeDataString(ticket)))){if(r.StatusCode!=HttpStatusCode.SeeOther)throw new InvalidOperationException("Não foi possível autorizar a captura.");}}
 static readonly Dictionary<string,string[]> Assets=new Dictionary<string,string[]> {
  {"/support/",new[]{"VoaDesk.Capture.capture.html","text/html; charset=utf-8"}},
  {"/support/capture.mjs",new[]{"VoaDesk.Capture.capture.mjs","text/javascript"}},
  {"/support/shared.mjs",new[]{"VoaDesk.Capture.shared.mjs","text/javascript"}},
  {"/support/quality.mjs",new[]{"VoaDesk.Capture.quality.mjs","text/javascript"}},
  {"/support/stats.mjs",new[]{"VoaDesk.Capture.stats.mjs","text/javascript"}},
  {"/support/profiles.mjs",new[]{"VoaDesk.Capture.profiles.mjs","text/javascript"}},
  {"/support/files.mjs",new[]{"VoaDesk.Capture.files.mjs","text/javascript"}},
  {"/support/theme.css",new[]{"VoaDesk.Capture.theme.css","text/css"}},
  {"/support/capture.css",new[]{"VoaDesk.Capture.capture.css","text/css"}},
  {"/support/logo.png",new[]{"VoaDesk.Logo","image/png"}},
  {"/support/symbol.png",new[]{"VoaDesk.Symbol","image/png"}}
 };
 bool Authorized(){if(disposed||owner.IsDisposed)return false;try{return (bool)owner.Invoke(new Func<bool>(allowed));}catch{return false;}}
 async Task Accept(){while(!disposed)try{var client=await listener.AcceptTcpClientAsync();if(System.Threading.Interlocked.Increment(ref activeRequests)>24){System.Threading.Interlocked.Decrement(ref activeRequests);client.Close();continue;}var work=Handle(client).ContinueWith(t=>{System.Threading.Interlocked.Decrement(ref activeRequests);if(t.IsFaulted){var ignored=t.Exception;}});}catch{if(disposed)return;}}
 static string Header(Dictionary<string,string> headers,string name){string v;return headers.TryGetValue(name,out v)?v:"";}
 async Task Handle(TcpClient client){using(client)using(var deadline=new System.Threading.Timer(delegate{try{client.Close();}catch{}},null,10000,System.Threading.Timeout.Infinite)){client.ReceiveTimeout=5000;client.SendTimeout=5000;var stream=client.GetStream();bool failed=false;string failure="Acesso encerrado ou solicitação inválida.";try{
  // Bound parsing independently of file size; file bodies are always chunks <= 64 KiB.
  var bytes=new List<byte>();var one=new byte[1];int matched=0;while(bytes.Count<16384){int n=await stream.ReadAsync(one,0,1);if(n==0)return;bytes.Add(one[0]);matched=one[0]==new byte[]{13,10,13,10}[matched]?matched+1:(one[0]==13?1:0);if(matched==4)break;}if(matched!=4)throw new Exception();
  string[] lines=Encoding.ASCII.GetString(bytes.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None);var first=lines[0].Split(' ');if(first.Length!=3)throw new Exception();string method=first[0];var url=new Uri(new Uri(Origin),first[1]);var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(string line in lines.Skip(1)){int i=line.IndexOf(':');if(i>0)headers[line.Substring(0,i)]=line.Substring(i+1).Trim();}
  if(Header(headers,"Host")!=new Uri(Origin).Authority||url.Authority!=new Uri(Origin).Authority)throw new Exception();
  int length=0;string size=Header(headers,"Content-Length");if(size!=""&&(!Int32.TryParse(size,out length)||length<0||length>131072))throw new Exception();if(Header(headers,"Transfer-Encoding")!="")throw new Exception();
  var body=new byte[length];int at=0;while(at<length){int n=await stream.ReadAsync(body,at,length-at);if(n==0)throw new Exception();at+=n;}
  if(!Authorized())throw new Exception();
  if(url.AbsolutePath=="/bootstrap"&&method=="GET"&&!booted&&url.Query=="?key="+secret){booted=true;await Reply(stream,303,new byte[0],"text/plain","Location: /support/\r\nSet-Cookie: voadesk_native="+secret+"; HttpOnly; SameSite=Strict; Path=/\r\n");return;}
  if(!Header(headers,"Cookie").Split(';').Any(c=>c.Trim()=="voadesk_native="+secret))throw new Exception();
  if(method=="POST"&&(Header(headers,"Origin")!=Origin||Header(headers,"X-VoaDesk")!="1"))throw new Exception();
  if(method!="GET"&&method!="POST")throw new Exception();
  string[] asset;if(method=="GET"&&Assets.TryGetValue(url.AbsolutePath,out asset)){using(var resource=typeof(DesktopBridge).Assembly.GetManifestResourceStream(asset[0]))using(var content=new MemoryStream()){if(resource==null)throw new InvalidOperationException("Recompile o cliente com os arquivos de captura.");resource.CopyTo(content);await Reply(stream,200,content.ToArray(),asset[1]);}return;}
  if(url.AbsolutePath.StartsWith("/support/native/")){await Native(stream,method,url,body);return;}
  if(url.AbsolutePath=="/support/input"&&method=="POST"){
   var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(body));var events=data.ContainsKey("events")?data["events"] as System.Collections.IEnumerable:new object[]{data};if(events==null)throw new Exception();
   owner.Invoke(new Action(delegate{if(!allowed())return;int count=0;foreach(var raw in events){if(++count>8)throw new Exception();var e=(Dictionary<string,object>)raw;ValidateInput(e);if(Convert.ToString(e["type"])!="release"&&(!e.ContainsKey("monitorId")||Convert.ToString(e["monitorId"])!=selected||!e.ContainsKey("monitorGeneration")||Convert.ToInt64(e["monitorGeneration"])!=generation))continue;input(e);}}));await Json(stream,new{ok=true});return;
  }
  if(!new[]{"/support/state","/support/signal","/support/stats","/support/end"}.Contains(url.AbsolutePath))throw new Exception();
  using(var req=new HttpRequestMessage(new HttpMethod(method),new Uri(endpoint,url.PathAndQuery))){if(method=="POST"){req.Headers.Add("Origin",endpoint.GetLeftPart(UriPartial.Authority));req.Headers.Add("X-VoaDesk","1");req.Content=new ByteArrayContent(body);req.Content.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");}using(var r=await upstream.SendAsync(req)){var result=await r.Content.ReadAsByteArrayAsync();await Reply(stream,(int)r.StatusCode,result,r.Content.Headers.ContentType==null?"text/plain":r.Content.Headers.ContentType.ToString());}}
 }catch(Exception error){failed=true;if(error is UnauthorizedAccessException)failure="Sem permissão para acessar o arquivo ou a pasta.";else if(error is IOException)failure=error.Message=="O arquivo de destino já existe."?error.Message:"Não foi possível acessar ou gravar o arquivo. Confira o caminho e o espaço livre.";}if(failed){try{await Reply(stream,403,Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new{message=failure})),"application/json; charset=utf-8");}catch{}}}}
 async Task Native(Stream output,string method,Uri url,byte[] body){var json=new JavaScriptSerializer();var data=body.Length==0?new Dictionary<string,object>():url.AbsolutePath.EndsWith("/write")?null:json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(body));string route=url.AbsolutePath.Substring("/support/native/".Length);
  if(route=="state"&&method=="GET"){await Json(output,new{native=true,selected=selected,generation=generation,monitors=Screen.AllScreens.Select((s,i)=>new{id=s.DeviceName,label="Monitor "+(i+1)+(s.Primary?" · principal":""),width=s.Bounds.Width,height=s.Bounds.Height}).ToArray(),sas=false});return;}
  if(route=="select"&&method=="POST"){string id=Convert.ToString(data["id"]);var screen=Screen.AllScreens.FirstOrDefault(s=>s.DeviceName==id);if(screen==null)throw new Exception();owner.Invoke(new Action(delegate{if(!allowed())throw new Exception();input(new Dictionary<string,object>{{"type","release"}});target(screen.Bounds);selected=id;generation++;}));await Json(output,new{selected=selected,generation=generation});return;}
  if(route=="frame"&&method=="GET"){
   string requested=Uri.UnescapeDataString(url.Query.TrimStart('?'));var screen=Screen.AllScreens.FirstOrDefault(s=>s.DeviceName==requested&&s.DeviceName==selected);if(screen==null)throw new Exception();
   // Capture and encode without blocking the window thread that applies input and revokes consent.
   var bounds=screen.Bounds;
   byte[] jpeg=await Task.Run(()=>CaptureJpeg(bounds));
   if(!Authorized())throw new Exception();
   await Reply(output,200,jpeg,"image/jpeg");return;
  }
  if(route=="shortcut"&&method=="POST"){string action=Convert.ToString(data["action"]);if(action!="task-manager")throw new Exception();owner.Invoke(new Action(delegate{if(!allowed())throw new Exception();Process.Start(new ProcessStartInfo("taskmgr.exe"){UseShellExecute=true});}));await Json(output,new{ok=true});return;}
  if(route=="stop"&&method=="POST"){owner.BeginInvoke(stop);await Json(output,new{ok=true});return;}
  lock(gate){if(disposed)throw new Exception();}
  if(route=="list"&&method=="POST"){
   string path=Convert.ToString(data["path"]);if(path==""){await Json(output,new{path="",parent=(string)null,entries=DriveInfo.GetDrives().Where(d=>d.IsReady).Select(d=>new{name=d.Name,path=d.RootDirectory.FullName,directory=true,size=0L}).ToArray()});return;}
   int offset=data.ContainsKey("offset")?Convert.ToInt32(data["offset"]):0;if(offset<0)throw new Exception();var dir=new DirectoryInfo(Path.GetFullPath(path));var entries=new List<object>();var page=dir.EnumerateFileSystemInfos().Skip(offset).Take(51).ToArray();foreach(var item in page.Take(50)){try{bool folder=(item.Attributes&FileAttributes.Directory)!=0;entries.Add(new{name=item.Name,path=item.FullName,directory=folder,size=folder?0L:((FileInfo)item).Length});}catch(UnauthorizedAccessException){}}
   await Json(output,new{path=dir.FullName,parent=dir.Parent==null?"":dir.Parent.FullName,entries=entries,hasMore=page.Length>50,nextOffset=offset+50});return;
  }
  if(route=="open-read"&&method=="POST"){
   lock(gate){if(disposed||transfers.Count!=0)throw new Exception();var file=new FileStream(Path.GetFullPath(Convert.ToString(data["path"])),FileMode.Open,FileAccess.Read,FileShare.Read,65536,FileOptions.SequentialScan);string id=Guid.NewGuid().ToString("N");transfers[id]=new Transfer{Stream=file,Size=file.Length};data=new Dictionary<string,object>{{"id",id},{"name",Path.GetFileName(file.Name)},{"size",file.Length}};}await Json(output,data);return;
  }
  if(route=="open-write"&&method=="POST"){
   string name=Convert.ToString(data["name"]),directory=Convert.ToString(data["directory"]);long size=Convert.ToInt64(data["size"]);if(size<0||size>9007199254740991L||String.IsNullOrWhiteSpace(name)||name!=Path.GetFileName(name)||name.IndexOfAny(Path.GetInvalidFileNameChars())>=0||name.EndsWith(".")||name.EndsWith(" "))throw new Exception();
   if(directory=="")directory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Downloads","VoaDesk");directory=Path.GetFullPath(directory);Directory.CreateDirectory(directory);string final=Path.Combine(directory,name);if(File.Exists(final))throw new IOException("O arquivo de destino já existe.");string id=Guid.NewGuid().ToString("N"),partial=Path.Combine(directory,".voadesk-"+id+".partial");lock(gate){if(disposed||transfers.Count!=0)throw new Exception();transfers[id]=new Transfer{Stream=new FileStream(partial,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.SequentialScan),Size=size,Writing=true,Partial=partial,Final=final};}await Json(output,new{id=id,path=final});return;
  }
  if(new[]{"read","write","finish","cancel"}.Contains(route)&&method=="POST"){
   string id=route=="write"?url.Query.TrimStart('?'):Convert.ToString(data["id"]);byte[] chunk=null;lock(gate){Transfer t;if(!transfers.TryGetValue(id,out t))throw new Exception();
    if(route=="read"){if(t.Writing)throw new Exception();chunk=new byte[(int)Math.Min(16384,t.Size-t.Offset)];int n=t.Stream.Read(chunk,0,chunk.Length);if(n!=chunk.Length)Array.Resize(ref chunk,n);t.Offset+=n;}
    if(route=="write"){if(!t.Writing||body.Length>65536||t.Offset+body.Length>t.Size)throw new Exception();t.Stream.Write(body,0,body.Length);t.Offset+=body.Length;}
    if(route=="finish"||route=="cancel"){transfers.Remove(id);try{if(route=="finish"&&t.Offset!=t.Size)throw new IOException();t.Stream.Dispose();if(t.Writing&&route=="finish")File.Move(t.Partial,t.Final);}finally{t.Stream.Dispose();if(t.Partial!=null&&File.Exists(t.Partial))File.Delete(t.Partial);}}
   }if(chunk!=null)await Reply(output,200,chunk,"application/octet-stream");else await Json(output,new{ok=true});return;
  }
  throw new Exception();
 }
 byte[] CaptureJpeg(Rectangle bounds){
  using(var bitmap=capture==null?new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format24bppRgb):capture(bounds))
  using(var memory=new MemoryStream())
  using(var parameters=new EncoderParameters(1)){
   if(capture==null)using(var graphics=Graphics.FromImage(bitmap))
    graphics.CopyFromScreen(bounds.Location,Point.Empty,bounds.Size,CopyPixelOperation.SourceCopy);
   var codec=ImageCodecInfo.GetImageEncoders().First(c=>c.FormatID==ImageFormat.Jpeg.Guid);
   parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,85L);
   bitmap.Save(memory,codec,parameters);
   return memory.ToArray();
  }
 }
 static void ValidateInput(Dictionary<string,object> e){string type=Convert.ToString(e["type"]);if(!new[]{"release","move","down","up","wheel","text","keyDown","keyUp","guide"}.Contains(type))throw new Exception();if(new[]{"move","down","up","guide"}.Contains(type)){double x=Convert.ToDouble(e["x"]),y=Convert.ToDouble(e["y"]);if(Double.IsNaN(x)||Double.IsNaN(y)||x<0||x>1||y<0||y>1)throw new Exception();}if(type=="down"||type=="up"){int b=Convert.ToInt32(e["button"]);if(b<0||b>2)throw new Exception();}if(type=="text"&&Convert.ToString(e["text"]).Length>64)throw new Exception();if(type=="wheel"){double delta=Convert.ToDouble(e["delta"]);if(Double.IsNaN(delta)||Math.Abs(delta)>1200)throw new Exception();}}
 static Task Json(Stream stream,object value){return Reply(stream,200,Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value)),"application/json");}
 static async Task Reply(Stream stream,int status,byte[] body,string type,string extra=""){
  string head="HTTP/1.1 "+status+" Result\r\nContent-Type: "+type+"\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'\r\n"+extra+"\r\n";var bytes=Encoding.ASCII.GetBytes(head);await stream.WriteAsync(bytes,0,bytes.Length);await stream.WriteAsync(body,0,body.Length);
 }
 public void Dispose(){if(disposed)return;disposed=true;listener.Stop();upstream.Dispose();lock(gate){foreach(var t in transfers.Values){t.Stream.Dispose();if(t.Partial!=null)try{File.Delete(t.Partial);}catch{}}transfers.Clear();}}
}
