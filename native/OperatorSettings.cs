using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
public static class OperatorSettings {
    public static string ReadToken(string file) {
        var values=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
        return values.ContainsKey("protectedToken")?Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(values["protectedToken"]),null,DataProtectionScope.CurrentUser)):values["token"];
    }
    public static void CopyForCurrentUser(string source,string target) {
        string token=ReadToken(source);var values=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(source));
        if(File.Exists(target)){if(ReadToken(target)!=token)throw new Exception("A configuração existente do técnico foi preservada; credenciais diferentes.");return;}
        var safe=new Dictionary<string,string>{{"server",values["server"]},{"ownerSid",WindowsIdentity.GetCurrent().User.Value}};
        try{safe["protectedToken"]=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token),null,DataProtectionScope.CurrentUser));}
        catch(CryptographicException){safe["token"]=token;safe["storage"]="windows-user-acl";}
        Directory.CreateDirectory(Path.GetDirectoryName(target));var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);
        acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));
        using(var stream=new FileStream(target,FileMode.CreateNew,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,acl))using(var writer=new StreamWriter(stream,new UTF8Encoding(false)))writer.Write(new JavaScriptSerializer().Serialize(safe));
    }
    public static int Main(string[] args) {
        // Private stdout is consumed only by local QA orchestration, never logged.
        if(args.Length==2&&args[0]=="--read"){Console.Write(ReadToken(args[1]));return 0;}
        if(args.Length==3&&args[0]=="--copy-to-user"){CopyForCurrentUser(args[1],args[2]);return 0;}
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
