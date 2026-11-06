using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
public static class StartupSmoke {
    static void Check(bool value) { if(!value)throw new Exception("Startup regression failed."); }
    static string Token(Dictionary<string,string> value) { return value.ContainsKey("token")?value["token"]:Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value["protectedToken"]),null,DataProtectionScope.CurrentUser)); }
    public static int Main(string[] args) {
        string folder=Path.GetFullPath(args[0]); Directory.CreateDirectory(folder); string file=Path.Combine(folder,"fixture-settings.json");
        var owner=new SecurityIdentifier(args[1]);var json=new JavaScriptSerializer();
        try {
            OperatorSettings.Main(new[]{file,"https://example.invalid","--owner-sid",owner.Value});
            var first=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
            OperatorSettings.Main(new[]{file,"https://updated.invalid"});
            var second=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
            Check(first["ownerSid"]==second["ownerSid"]&&second["ownerSid"]==owner.Value);
            Check(Token(first)==Token(second));
            string beforeCopy=File.ReadAllText(file),copy=Path.Combine(folder,"fixture-user-settings.json");
            try{OperatorSettings.CopyForCurrentUser(file,copy);Check(OperatorSettings.ReadToken(copy)==Token(second));Check(File.ReadAllText(file)==beforeCopy);OperatorSettings.CopyForCurrentUser(file,copy);Check(File.GetAccessControl(copy).AreAccessRulesProtected);}finally{if(File.Exists(copy))File.Delete(copy);}
            bool ownerAllowed=false;var acl=File.GetAccessControl(file,AccessControlSections.Access);
            foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
                string sid=rule.IdentityReference.Value;
                Check(sid!="S-1-1-0"&&sid!="S-1-5-11"&&sid!="S-1-5-32-545");
                if(sid==owner.Value&&rule.AccessControlType==AccessControlType.Allow)ownerAllowed=true;
            }
            Check(ownerAllowed&&acl.AreAccessRulesProtected);
            string permission=Launcher.DescribeError(new UnauthorizedAccessException("Fixture denied"));
            Check(permission.Contains("permissao")&&!permission.Contains("Instale Node"));
            Check(Launcher.DescribeError(new System.ComponentModel.Win32Exception(2)).Contains("Node.js"));
            Console.WriteLine("{\"result\":\"passed\",\"ownerRetainedOnUpdate\":true,\"credentialPreserved\":true,\"broadGroupsExcluded\":true,\"permissionErrorIsSpecific\":true}");
            return 0;
        } finally {if(File.Exists(file))File.Delete(file);}
    }
}
