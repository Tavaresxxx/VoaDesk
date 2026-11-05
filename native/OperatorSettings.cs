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
        var json=new JavaScriptSerializer(); string file=args[0]; Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file)));
        Dictionary<string,string> settings; string token;
        if(File.Exists(file)) { settings=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file)); token=settings.ContainsKey("protectedToken") ? Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(settings["protectedToken"]),null,DataProtectionScope.CurrentUser)) : settings["token"]; }
        else {
            byte[] bytes=new byte[32]; using(var random=RandomNumberGenerator.Create())random.GetBytes(bytes); token=Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_'); settings=new Dictionary<string,string>();
            try { settings["protectedToken"]=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token),null,DataProtectionScope.CurrentUser)); }
            catch(CryptographicException) { settings["token"]=token; settings["storage"]="windows-user-acl"; }
        }
        settings["server"]=args[1];
        var security=new FileSecurity(); security.SetAccessRuleProtection(true,false);
        security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),FileSystemRights.FullControl,AccessControlType.Allow));
        using(var output=new FileStream(file,FileMode.Create,FileSystemRights.Write,FileShare.None,4096,FileOptions.None,security)) using(var writer=new StreamWriter(output,new UTF8Encoding(false))) writer.Write(json.Serialize(settings));
        // Private stdout is consumed by deployment orchestration; never echo to logs/chat.
        if(args.Length>2&&args[2]=="--issue")Console.Write(token);
        return 0;
    }
}
