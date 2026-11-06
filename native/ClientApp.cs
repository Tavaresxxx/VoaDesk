using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class ClientIdentity {
    public string DeviceId, Secret;
    public static ClientIdentity Load(string folder, Uri server) {
        Directory.CreateDirectory(folder);
        string name;
        using(var sha=SHA256.Create()) name=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(server.AbsoluteUri))).Replace("-","").ToLowerInvariant();
        string file=Path.Combine(folder,name+".json");
        var json=new JavaScriptSerializer();
        if(File.Exists(file)) {
            var data=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
            string secret=data.ContainsKey("protectedSecret")?Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(data["protectedSecret"]),null,DataProtectionScope.CurrentUser)):data["secret"];
            if(!Regex.IsMatch(data["deviceId"],"^[a-f0-9]{32}$")||!Regex.IsMatch(secret,"^[A-Za-z0-9_-]{43}$"))throw new InvalidDataException();
            return new ClientIdentity { DeviceId=data["deviceId"], Secret=secret };
        }
        byte[] bytes=new byte[32]; using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);
        var identity=new ClientIdentity { DeviceId=Guid.NewGuid().ToString("N"), Secret=Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_') };
        var payload=new Dictionary<string,string> { {"deviceId",identity.DeviceId} };
        try { payload["protectedSecret"]=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(identity.Secret),null,DataProtectionScope.CurrentUser)); }
        catch(CryptographicException) { payload["secret"]=identity.Secret; payload["storage"]="windows-user-acl"; }
        var security=new FileSecurity(); security.SetAccessRuleProtection(true,false);
        security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));
        using(var output=new FileStream(file,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,security))
        using(var writer=new StreamWriter(output,new UTF8Encoding(false)))writer.Write(json.Serialize(payload));
        return identity;
    }
}
public sealed class ClientWindow : Form {
 readonly HttpClient http=new HttpClient(); readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly Label code=new Label(),status=new Label(),connection=new Label(),requester=new Label();readonly Button copy=new Button(),reconnect=new Button(),view=new Button(),control=new Button(),end=new Button(),update=new Button();
 readonly CheckBox startup=new CheckBox();readonly Timer timer=new Timer();readonly NotifyIcon tray=new NotifyIcon();readonly RemoteInput input;readonly GuideOverlay overlay=new GuideOverlay(); readonly bool testing; public string LastCaptureTicket {get;private set;} DateTime lastCommand=DateTime.UtcNow; readonly Timer watchdog=new Timer();
 string token,accessCode,sessionId,displayedId,consentSession,localPermission="none";long consentEpoch;int updateTicks;bool busy,closing,allowClose,exitRequested,background,initialized,updateRequired,checkingUpdate,decisionPending;Uri server;ClientIdentity identity;UpdatePackage package;
 readonly Color blue=Color.FromArgb(0,91,255),muted=Color.FromArgb(106,113,126);
 static Stream Resource(string name){return Assembly.GetExecutingAssembly().GetManifestResourceStream(name);}
 public ClientWindow(string endpoint):this(endpoint,null,false){}
 public ClientWindow(string endpoint,string identityFolder):this(endpoint,identityFolder,false){}
 public ClientWindow(string endpoint,string identityFolder,bool startInBackground,Action<RemoteInput.INPUT> testInputSink=null) {
  testing=identityFolder!=null;input=new RemoteInput(testing?(testInputSink??delegate(RemoteInput.INPUT ignored){}):null);background=startInBackground;Text="VoaDesk · Receber suporte";ClientSize=new Size(460,580);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;BackColor=Color.White;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
  using(var r=Resource("VoaDesk.Icon"))Icon=new Icon(r);
  var logo=new PictureBox{Location=new Point(58,20),Size=new Size(344,82),SizeMode=PictureBoxSizeMode.Zoom};using(var r=Resource("VoaDesk.Logo"))using(var img=Image.FromStream(r))logo.Image=new Bitmap(img);Controls.Add(logo);
  AddLabel("SEU CÓDIGO DE ACESSO",new Rectangle(20,115,420,20),muted,9,FontStyle.Bold);
  code.Name="AccessCode";code.SetBounds(10,142,440,45);code.Text="Conectando…";code.Font=new Font("Consolas",22,FontStyle.Bold);code.TextAlign=ContentAlignment.MiddleCenter;Controls.Add(code);
  connection.SetBounds(15,191,430,24);connection.ForeColor=muted;connection.TextAlign=ContentAlignment.MiddleCenter;connection.Font=new Font("Segoe UI",9);Controls.Add(connection);
  Setup(copy,"Copiar código",new Rectangle(67,226,180,36),true);copy.Enabled=false;copy.Click+=delegate{try{Clipboard.SetText(accessCode);status.Text="Código copiado. Envie ao suporte.";}catch{status.Text="Anote o código acima.";}};
  Setup(reconnect,"Reconectar",new Rectangle(255,226,135,36),false);reconnect.Enabled=false;reconnect.Click+=async delegate{await Register();};
  requester.SetBounds(24,285,412,55);requester.Text="Aguardando atendimento";requester.Font=new Font("Segoe UI",11,FontStyle.Bold);requester.TextAlign=ContentAlignment.MiddleCenter;Controls.Add(requester);
  Setup(view,"Permitir visualizar",new Rectangle(24,349,200,38),false);Setup(control,"Permitir controle",new Rectangle(236,349,200,38),true);view.Enabled=control.Enabled=false;view.Click+=async delegate{await Decide("view");};control.Click+=async delegate{if(!testing&&Screen.AllScreens.Length!=1){status.Text="Controle exige um único monitor nesta prévia.";return;}await Decide("control");};
  Setup(end,"Encerrar / recusar atendimento",new Rectangle(24,399,412,40),true);end.BackColor=Color.FromArgb(183,32,62);end.Click+=async delegate{input.Enabled=false;overlay.Hide();await Decide("end");};
  startup.SetBounds(24,458,412,26);startup.Text="Iniciar com Windows, somente na bandeja";Controls.Add(startup);
  string executable=Assembly.GetExecutingAssembly().Location;
  if(!testing){using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))startup.Checked=Convert.ToString(key==null?null:key.GetValue("VoaDeskCliente"))=="\""+executable+"\" --background";}
  startup.CheckedChanged+=delegate{if(testing)return;try{using(var key=Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){if(startup.Checked)key.SetValue("VoaDeskCliente","\""+executable+"\" --background");else key.DeleteValue("VoaDeskCliente",false);}status.Text=startup.Checked?"Inicialização ativada para esta conta Windows.":"Inicialização automática desativada.";}catch{status.Text="Não foi possível alterar a inicialização.";}}; 
  Setup(update,"Verificar atualização",new Rectangle(24,494,412,30),false);update.Click+=async delegate{if(updateRequired)await InstallUpdate();else await CheckUpdate(true);};
  status.SetBounds(16,536,428,20);status.Font=new Font("Segoe UI",8);status.TextAlign=ContentAlignment.MiddleCenter;status.ForeColor=muted;Controls.Add(status);
  AddLabel("Prévia LAN 0.4.1 · acesso sempre autorizado",new Rectangle(12,559,436,18),muted,8,FontStyle.Regular);
  tray.Icon=Icon;tray.Text="VoaDesk · aguardando atendimento";tray.Visible=!testing;
  var menu=new ContextMenuStrip();menu.Items.Add("Abrir VoaDesk",null,delegate{Reveal();});menu.Items.Add("Encerrar atendimento",null,async delegate{input.Enabled=false;await Decide("end");});menu.Items.Add("Sair do VoaDesk",null,delegate{exitRequested=true;Close();});tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{Reveal();};
  http.Timeout=TimeSpan.FromSeconds(5);http.DefaultRequestHeaders.UserAgent.ParseAdd("VoaDeskClient/0.4");
  try{server=ValidateEndpoint(endpoint);identity=ClientIdentity.Load(identityFolder??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","client"),server);package=new UpdatePackage(server);}catch{code.Text="Configuração indisponível";status.Text="Sua identidade foi preservada. Contate o suporte.";return;}
  Shown+=async delegate{if(!initialized){initialized=true;await Begin();}};
  watchdog.Interval=100;watchdog.Tick+=delegate{if((DateTime.UtcNow-lastCommand).TotalMilliseconds>1200){input.Enabled=false;if(localPermission=="control"){localPermission="none";consentEpoch++;}}};watchdog.Start();
  timer.Interval=5000;timer.Tick+=async delegate{if(closing||busy)return;if(++updateTicks%60==0)await CheckUpdate(false);if(token==null)await Register();else{try{var state=await Request("v2/clients/status",HttpMethod.Get,token);if(Convert.ToString(state["state"])=="offline")await Register();}catch{input.Enabled=false;connection.Text="Offline · tentando reconectar…";}}};
  FormClosing+=async delegate(object sender,FormClosingEventArgs e){
   input.Enabled=false;overlay.Hide();
   if(allowClose)return;e.Cancel=true;
   if(!testing&&!exitRequested){if(sessionId!=null)await Decide("end");Hide();return;}
   if(closing)return;closing=true;timer.Stop();await Decide("end");await Revoke();allowClose=true;Close();
  };
  FormClosed+=delegate{tray.Visible=false;tray.Dispose();input.Dispose();overlay.Dispose();http.Dispose();timer.Dispose();watchdog.Dispose();logo.Image.Dispose();};
 }
 protected override void SetVisibleCore(bool value){if(background&&!initialized&&IsHandleCreated==false){initialized=true;CreateHandle();BeginInvoke(new Action(async delegate{await Begin();}));base.SetVisibleCore(false);return;}base.SetVisibleCore(value);}
 async Task Begin(){await CheckUpdate(false);await Register();if(!closing){timer.Start();var loop=PollLoop();}}
 void Reveal(){background=false;Show();WindowState=FormWindowState.Normal;Activate();}
 void Setup(Button b,string text,Rectangle bounds,bool primary){b.Text=text;b.Bounds=bounds;b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.BackColor=primary?blue:Color.FromArgb(237,243,255);b.ForeColor=primary?Color.White:blue;b.Cursor=Cursors.Hand;Controls.Add(b);}
 void AddLabel(string text,Rectangle bounds,Color color,int size,FontStyle style){Controls.Add(new Label{Text=text,Bounds=bounds,ForeColor=color,Font=new Font("Segoe UI",size,style),TextAlign=ContentAlignment.MiddleCenter});}
 public static Uri ValidateEndpoint(string value){Uri uri;if(!Uri.TryCreate(value,UriKind.Absolute,out uri)||!String.IsNullOrEmpty(uri.UserInfo)||!String.IsNullOrEmpty(uri.Query)||!String.IsNullOrEmpty(uri.Fragment)||(uri.Scheme!="https"&&!(uri.Scheme=="http"&&(uri.Host=="127.0.0.1"||uri.Host=="localhost"))))throw new ArgumentException();return new Uri(uri.ToString().TrimEnd('/')+"/");}
 async Task<Dictionary<string,object>> Request(string route,HttpMethod method,string bearer,object payload=null){using(var req=new HttpRequestMessage(method,new Uri(server,route))){if(bearer!=null)req.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",bearer);if(method==HttpMethod.Post)req.Content=new StringContent(json.Serialize(payload??new{}),Encoding.UTF8,"application/json");using(var res=await http.SendAsync(req)){res.EnsureSuccessStatusCode();return json.Deserialize<Dictionary<string,object>>(await res.Content.ReadAsStringAsync());}}}
 async Task Revoke(){var old=token;token=null;consentEpoch++;decisionPending=false;localPermission="none";input.Enabled=false;if(old!=null)try{await Task.WhenAny(Request("v2/clients/revoke",HttpMethod.Post,old),Task.Delay(1500));}catch{}}
 async Task Register(){if(busy||closing||updateRequired)return;busy=true;reconnect.Enabled=false;try{await Revoke();var r=await Request("v2/clients",HttpMethod.Post,null,new{deviceId=identity.DeviceId,secret=identity.Secret});token=Convert.ToString(r["token"]);accessCode=Convert.ToString(r["code"]);code.Text=accessCode;copy.Enabled=true;connection.Text="Online · informe o código ao suporte";status.Text="Informe este código ao técnico.";}catch{input.Enabled=false;connection.Text=server.Scheme=="https"?"Servidor indisponível · tentando reconectar…":"Abra o VoaDesk principal neste computador.";status.Text="Reconexão automática · sua identidade foi mantida.";}finally{busy=false;reconnect.Enabled=true;}}
 async Task Decide(string permission){
  bool failed=false;long epoch=++consentEpoch;localPermission="none";string decidedSession=sessionId;
  input.Enabled=false;overlay.Hide();if(permission!="end"&&permission!="deny"&&!testing){var color=json.Deserialize<Dictionary<string,object>>(json.Serialize(DisplayProbe.Read()));if(Convert.ToString(color["status"])!="sdr"){status.Text="Captura indisponível: HDR/WCG ou cor não confirmada.";return;}}if(sessionId==null||token==null)return;
  decisionPending=true;
  try{var r=await Request("v3/client/decision",HttpMethod.Post,token,new{id=decidedSession,permission=permission});
   if(epoch!=consentEpoch)return;
   if(permission=="view"||permission=="control"){consentSession=decidedSession;localPermission=permission;}
   view.Enabled=control.Enabled=false;
   if(permission=="end"){sessionId=null;requester.Text="Atendimento encerrado";return;}
   requester.Text=permission=="control"?"Controle autorizado · selecione sua tela":"Visualização autorizada · selecione sua tela";
   if(r.ContainsKey("ticket")){LastCaptureTicket=Convert.ToString(r["ticket"]);if(testing)return;string url=new Uri(server,"support/bootstrap?ticket="+Convert.ToString(r["ticket"])).AbsoluteUri;string profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","capture-profile");Process.Start(new ProcessStartInfo("msedge.exe","--app=\""+url+"\" --user-data-dir=\""+profile+"\" --disable-features=WebRtcHideLocalIpsWithMdns --disable-extensions --no-first-run --window-size=800,650"){UseShellExecute=true});}
  }catch{failed=true;}finally{if(epoch==consentEpoch)decisionPending=false;}
  if(epoch!=consentEpoch)return;
  if(failed){localPermission="none";input.Enabled=false;try{await Request("v3/client/decision",HttpMethod.Post,token,new{id=decidedSession,permission="end"});}catch{}status.Text="Não foi possível iniciar. Atendimento encerrado.";}
 }
 async Task PollLoop(){
  while(!closing){
   if(token!=null&&!updateRequired)try{
    long epoch=consentEpoch;string pollToken=token;DateTime pollStart=DateTime.UtcNow;
    var s=await Request("v3/client/commands",HttpMethod.Get,pollToken);if(closing)break;
    if(epoch!=consentEpoch||pollToken!=token||decisionPending||(DateTime.UtcNow-pollStart).TotalMilliseconds>1200){await Task.Delay(40);continue;}
    lastCommand=DateTime.UtcNow;string state=Convert.ToString(s["state"]),permission=Convert.ToString(s["permission"]);
    if(state=="pending"){input.Enabled=false;sessionId=Convert.ToString(s["id"]);if(displayedId!=sessionId){displayedId=sessionId;Reveal();tray.ShowBalloonTip(5000,"VoaDesk",Convert.ToString(s["operatorName"])+" solicita atendimento.",ToolTipIcon.Info);}requester.Text=Convert.ToString(s["operatorName"])+" solicita acesso";view.Enabled=control.Enabled=true;control.Enabled=testing||Screen.AllScreens.Length==1;tray.Text="VoaDesk · autorização pendente";}
    else if(state=="approved"||state=="active"){sessionId=Convert.ToString(s["id"]);input.Enabled=permission=="control"&&localPermission=="control"&&consentSession==sessionId&&(testing||Screen.AllScreens.Length==1);requester.Text=Convert.ToString(s["operatorName"])+(input.Enabled?" · controle autorizado":" · somente visualização");view.Enabled=permission=="control";control.Enabled=localPermission=="none"&&(testing||Screen.AllScreens.Length==1);tray.Text="VoaDesk · atendimento ativo";var events=s["commands"] as System.Collections.IEnumerable;if(events!=null)foreach(var raw in events){var item=raw as Dictionary<string,object>;if(item==null)continue;if(Convert.ToString(item["type"])=="guide"){if(consentSession==sessionId&&localPermission!="none"&&Screen.AllScreens.Length==1)overlay.PointAt(Convert.ToDouble(item["x"]),Convert.ToDouble(item["y"]));}else input.Apply(item);}}
    else{input.Enabled=false;overlay.Hide();if(sessionId!=null){requester.Text="Atendimento encerrado";sessionId=null;}view.Enabled=control.Enabled=false;tray.Text="VoaDesk · aguardando atendimento";}
   }catch{input.Enabled=false;localPermission="none";consentEpoch++;overlay.Hide();connection.Text="Conexão interrompida · controle liberado";}
   await Task.Delay(sessionId==null?500:40);
  }
 }
 async Task CheckUpdate(bool showResult){
  if(checkingUpdate||sessionId!=null)return;checkingUpdate=true;update.Enabled=false;
  try{if(await package.Check(http)){updateRequired=true;input.Enabled=false;await Revoke();code.Visible=copy.Visible=reconnect.Visible=false;requester.Text="Atualização "+package.Version+" disponível";connection.Text="Atualize para continuar recebendo suporte.";update.Text="Atualizar agora";ClientSize=new Size(460,338);update.SetBounds(67,155,326,42);connection.SetBounds(20,213,420,42);connection.Text="Versão "+package.Version+" · atualize para receber suporte.";requester.Visible=view.Visible=control.Visible=end.Visible=startup.Visible=false;status.SetBounds(16,280,428,20);foreach(Control element in Controls){var label=element as Label;if(label!=null&&label.Text=="SEU CÓDIGO DE ACESSO")label.Text="ATUALIZAÇÃO DISPONÍVEL";if(label!=null&&label.Text.StartsWith("Prévia localhost"))label.SetBounds(12,310,436,18);}tray.Text="VoaDesk · atualização necessária";if(showResult)Reveal();}else if(showResult)status.Text="Você está usando a versão atual.";}
  catch{if(showResult)status.Text="Não foi possível verificar a atualização com segurança.";}
  finally{update.Enabled=true;checkingUpdate=false;}
 }
 async Task InstallUpdate(){if(!updateRequired||sessionId!=null)return;update.Enabled=false;try{await package.Install(http);exitRequested=true;Close();}catch{status.Text="Atualização não instalada. Arquivo atual preservado.";update.Enabled=true;}}
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("shell32.dll")]static extern int SetCurrentProcessExplicitAppUserModelID(string id);
 [STAThread]public static int Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}SetCurrentProcessExplicitAppUserModelID("VoaDesk.Client");ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  bool acquired;using(var mutex=new System.Threading.Mutex(true,"Local\\VoaDesk.Client",out acquired)){if(!acquired){if(Array.IndexOf(args,"--background")<0)try{System.Threading.EventWaitHandle.OpenExisting("Local\\VoaDesk.Client.Show").Set();}catch{}return 0;}string endpoint;using(var r=new StreamReader(Resource("VoaDesk.Server")))endpoint=r.ReadToEnd().Trim();using(var show=new System.Threading.EventWaitHandle(false,System.Threading.EventResetMode.AutoReset,"Local\\VoaDesk.Client.Show")){var window=new ClientWindow(endpoint,null,Array.IndexOf(args,"--background")>=0);var registration=System.Threading.ThreadPool.RegisterWaitForSingleObject(show,delegate(object state,bool timeout){if(window.IsHandleCreated&&!window.IsDisposed)window.BeginInvoke(new Action(window.Reveal));},null,-1,false);Application.Run(window);registration.Unregister(null);}mutex.ReleaseMutex();}return 0;
 }
}
