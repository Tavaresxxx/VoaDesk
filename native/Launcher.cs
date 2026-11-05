using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Threading;
public static class Launcher {
    public static string DescribeError(Exception error) {
        if(error is UnauthorizedAccessException)return "O Windows negou acesso a um arquivo do VoaDesk. A conta que abre o aplicativo precisa de permissao na configuracao local.\n\n"+error.Message;
        if(error is System.Security.Cryptography.CryptographicException)return "A credencial do VoaDesk pertence a outra conta do Windows. Configure o operador para esta conta.";
        var processError=error as System.ComponentModel.Win32Exception;
        if(processError!=null&&(processError.NativeErrorCode==2||processError.NativeErrorCode==3))return "Node.js nao foi encontrado. Instale Node.js 22 ou posterior e abra o VoaDesk novamente.";
        return error.Message;
    }
    [STAThread] public static int Main() {
        try {
            string root=Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar)).FullName;
            string server=Path.Combine(root,"src","host","server.mjs");
            if (!File.Exists(server)) throw new Exception("Mantenha a pasta dist junto de src. Não mova apenas o executável.");
            string node=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe");
            if (!File.Exists(node)) node="node.exe";
            bool acquired;
            using(var mutex=new Mutex(true,"Local\\VoaDesk.Principal",out acquired)) {
                if(!acquired) { MessageBox.Show("O VoaDesk principal já está aberto.","VoaDesk",MessageBoxButtons.OK,MessageBoxIcon.Information); return 0; }
                // Machine-local protected credentials are loaded only by the technician launcher.
                string settings=Path.Combine(root,".runtime","operator-settings.json");
                var start=new ProcessStartInfo(node,"\""+server+"\" --open") { WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardError=true };
                if(File.Exists(settings)) {
                    var json=new System.Web.Script.Serialization.JavaScriptSerializer();
                    var values=json.Deserialize<System.Collections.Generic.Dictionary<string,string>>(File.ReadAllText(settings));
                    start.EnvironmentVariables["VOADESK_PAIRING_URL"]=values["server"];
                    start.EnvironmentVariables["VOADESK_OPERATOR_TOKEN"]=values.ContainsKey("protectedToken") ? System.Text.Encoding.UTF8.GetString(System.Security.Cryptography.ProtectedData.Unprotect(Convert.FromBase64String(values["protectedToken"]),null,System.Security.Cryptography.DataProtectionScope.CurrentUser)) : values["token"];
                }
                using(var child=Process.Start(start)) { string errors=child.StandardError.ReadToEnd(); child.WaitForExit(); if(child.ExitCode!=0)MessageBox.Show("Não foi possível iniciar o VoaDesk. Verifique Node.js, a configuração do servidor e se há outra janela aberta.","VoaDesk",MessageBoxButtons.OK,MessageBoxIcon.Error); }
                mutex.ReleaseMutex();
            }
            return 0;
        } catch (Exception e) { MessageBox.Show(DescribeError(e), "VoaDesk · Não foi possível iniciar", MessageBoxButtons.OK,MessageBoxIcon.Error); return 1; }
    }
}
