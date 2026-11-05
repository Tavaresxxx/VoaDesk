using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
public static class OperatorSettings {
    public static int Main(string[] args) {
        if(args.Length<2)throw new ArgumentException("Informe o arquivo e o endereco do servidor.");
        var json=new JavaScriptSerializer(); string file=args[0]; Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file)));
        Dictionary<string,string> settings; string token;
        var currentUser=WindowsIdentity.GetCurrent().User;
        int ownerIndex=Array.IndexOf(args,"--owner-sid");
        if(ownerIndex>=0&&ownerIndex+1>=args.Length)throw new ArgumentException("Informe o SID da conta que abrira o aplicativo.");
        settings=File.Exists(file)?json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file)):new Dictionary<string,string>();
        var owner=ownerIndex>=0?new SecurityIdentifier(args[ownerIndex+1]):settings.ContainsKey("ownerSid")?new SecurityIdentifier(settings["ownerSid"]):currentUser;
        if(File.Exists(file)) { token=settings.ContainsKey("protectedToken") ? Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(settings["protectedToken"]),null,DataProtectionScope.CurrentUser)) : settings["token"]; }
        else {
            byte[] bytes=new byte[32]; using(var random=RandomNumberGenerator.Create())random.GetBytes(bytes); token=Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_');
            try { if(!owner.Equals(currentUser))throw new CryptographicException(); settings["protectedToken"]=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token),null,DataProtectionScope.CurrentUser)); }
            catch(CryptographicException) { settings["token"]=token; settings["storage"]="windows-user-acl"; }
        }
        if(!owner.Equals(currentUser)&&settings.ContainsKey("protectedToken")) { settings.Remove("protectedToken");settings["token"]=token;settings["storage"]="windows-user-acl"; }
        settings["ownerSid"]=owner.Value;
        settings["server"]=args[1];
        var security=new FileSecurity(); security.SetAccessRuleProtection(true,false);
        security.AddAccessRule(new FileSystemAccessRule(currentUser,FileSystemRights.FullControl,AccessControlType.Allow));
        if(!owner.Equals(currentUser))security.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));
        using(var output=new FileStream(file,FileMode.Create,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,security)) using(var writer=new StreamWriter(output,new UTF8Encoding(false))) writer.Write(json.Serialize(settings));
        // The FileStream security argument only applies when creating a file.
        // Persist the DACL explicitly on updates; no ownership or audit privileges required.
        File.SetAccessControl(file,security);
        // Private stdout is consumed by deployment orchestration; never echo to logs/chat.
        if(Array.IndexOf(args,"--issue")>=0)Console.Write(token);
        return 0;
    }
}
