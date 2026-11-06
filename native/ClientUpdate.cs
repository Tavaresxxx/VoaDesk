using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
public sealed class UpdatePackage {
 public const string CurrentVersion="0.4.2";
 public string Version,Hash; public int Size; readonly Uri server;
 static Stream Resource(string n){return Assembly.GetExecutingAssembly().GetManifestResourceStream(n);}
 public UpdatePackage(Uri server){this.server=server;}
 public static Dictionary<string,object> Verify(string envelope,string publicXml,DateTime now) {
  var json=new JavaScriptSerializer();var signed=json.Deserialize<Dictionary<string,object>>(envelope);
  var bytes=Convert.FromBase64String(Convert.ToString(signed["payload"]));
  if(bytes.Length>4096)throw new Exception();
  using(var rsa=new RSACryptoServiceProvider(new CspParameters { Flags=CspProviderFlags.CreateEphemeralKey })){rsa.PersistKeyInCsp=false;rsa.FromXmlString(publicXml);if(!rsa.VerifyData(bytes,CryptoConfig.MapNameToOID("SHA256"),Convert.FromBase64String(Convert.ToString(signed["signature"]))))throw new Exception("Assinatura inválida.");}
  var data=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes));
  System.Version ver;if(!System.Version.TryParse(Convert.ToString(data["version"]),out ver)||ver<=new System.Version(CurrentVersion))return null;
  DateTime expires;if(!DateTime.TryParse(Convert.ToString(data["expires"]),null,System.Globalization.DateTimeStyles.RoundtripKind,out expires)||expires.ToUniversalTime()<=now.ToUniversalTime())throw new Exception("Manifesto expirado.");
  int size=Convert.ToInt32(data["size"]);if(size<1024||size>40000000||!System.Text.RegularExpressions.Regex.IsMatch(Convert.ToString(data["sha256"]),"^[a-f0-9]{64}$"))throw new Exception("Arquivo inválido.");return data;
 }
 public async Task<bool> Check(HttpClient http) {
  using(var response=await http.GetAsync(new Uri(server,"updates/manifest.json"),HttpCompletionOption.ResponseHeadersRead)) {
   if(response.StatusCode==System.Net.HttpStatusCode.NotFound)return false;
   response.EnsureSuccessStatusCode();if(response.Content.Headers.ContentLength>12000)throw new Exception();
   string envelope;using(var source=await response.Content.ReadAsStreamAsync())using(var manifestBytes=new MemoryStream()){
    byte[] buffer=new byte[2048];int count;while((count=await source.ReadAsync(buffer,0,buffer.Length))>0){if(manifestBytes.Length+count>12000)throw new Exception();manifestBytes.Write(buffer,0,count);}envelope=Encoding.UTF8.GetString(manifestBytes.ToArray());
   }
   string xml;using(var reader=new StreamReader(Resource("VoaDesk.UpdateKey")))xml=reader.ReadToEnd();
   var data=Verify(envelope,xml,DateTime.UtcNow);if(data==null)return false;
   Version=Convert.ToString(data["version"]);Hash=Convert.ToString(data["sha256"]);Size=Convert.ToInt32(data["size"]);return true;
  }
 }
 static FileSecurity PrivateAcl(){var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));return acl;}
 public async Task Install(HttpClient http) {
  string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VoaDesk","updates",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
  string staged=Path.Combine(folder,"client.new"),helper=Path.Combine(folder,"VoaDeskUpdate.exe");
  using(var response=await http.GetAsync(new Uri(server,"updates/client.exe"),HttpCompletionOption.ResponseHeadersRead)) {
   response.EnsureSuccessStatusCode();using(var source=await response.Content.ReadAsStreamAsync())
   using(var dest=new FileStream(staged,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,8192,FileOptions.None,PrivateAcl())) {
    byte[] buffer=new byte[8192];int count,total=0;while((count=await source.ReadAsync(buffer,0,buffer.Length))>0){total+=count;if(total>Size)throw new Exception();await dest.WriteAsync(buffer,0,count);}if(total!=Size)throw new Exception();
   }
  }
  using(var sha=SHA256.Create())using(var file=File.OpenRead(staged))if(BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant()!=Hash)throw new Exception("Integridade inválida.");
  using(var source=Resource("VoaDesk.Updater"))using(var dest=new FileStream(helper,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,8192,FileOptions.None,PrivateAcl()))source.CopyTo(dest);
  string target=Assembly.GetExecutingAssembly().Location;
  Process.Start(new ProcessStartInfo(helper,"\""+staged+"\" \""+target+"\" "+Process.GetCurrentProcess().Id+" "+Hash){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});
 }
}
