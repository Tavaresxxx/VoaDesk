using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public sealed class RemoteInput : IDisposable {
    [StructLayout(LayoutKind.Sequential)] public struct MOUSE { public int dx,dy; public uint mouseData,flags,time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] public struct KEY { public ushort vk,scan; public uint flags,time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSE mouse; [FieldOffset(0)] public KEY key; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
    [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,INPUT[] inputs,int size);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    readonly HashSet<int> keys=new HashSet<int>(); readonly HashSet<int> buttons=new HashSet<int>(); readonly Action<INPUT> sink; bool enabled;
    public bool Enabled { get{return enabled;} set{if(!value)Release();enabled=value;} }
    public int Held { get{return keys.Count+buttons.Count;} }
    public Rectangle TargetBounds=Screen.PrimaryScreen.Bounds;
    public static Point MapDesktop(double x,double y,Rectangle target,Rectangle desktop){var p=Map(x,y,target.Width,target.Height);return new Point((int)Math.Round((target.Left+p.X-desktop.Left)*65535.0/Math.Max(1,desktop.Width-1)),(int)Math.Round((target.Top+p.Y-desktop.Top)*65535.0/Math.Max(1,desktop.Height-1)));}
    public RemoteInput(Action<INPUT> testSink=null){sink=testSink;}
    void Send(INPUT value){if(sink!=null)sink(value);else if(SendInput(1,new[]{value},Marshal.SizeOf(typeof(INPUT)))!=1){enabled=false;throw new InvalidOperationException("Entrada bloqueada pelo Windows.");}}
    void Mouse(uint flags,int x=0,int y=0,int delta=0){Send(new INPUT{type=0,data=new UNION{mouse=new MOUSE{dx=x,dy=y,flags=flags,mouseData=unchecked((uint)delta)}}});}
    void Key(int scan,bool up){Send(new INPUT{type=1,data=new UNION{key=new KEY{scan=(ushort)(scan&255),flags=8u|(up?2u:0u)|((scan&256)!=0?1u:0u)}}});}
    public void Release(){foreach(int k in new List<int>(keys)){try{Key(k,true);}catch{}}keys.Clear();foreach(int b in new List<int>(buttons)){try{Mouse(b==0?4u:b==1?64u:16u);}catch{}}buttons.Clear();}
    public static Point Map(double x,double y,int width,int height){if(x<0||x>1||y<0||y>1||Double.IsNaN(x)||Double.IsNaN(y))throw new ArgumentException();return new Point((int)Math.Round(x*(width-1)),(int)Math.Round(y*(height-1)));}
    static readonly Dictionary<string,int> scans=new Dictionary<string,int> {
      {"Escape",1},{"Digit1",2},{"Digit2",3},{"Digit3",4},{"Digit4",5},{"Digit5",6},{"Digit6",7},{"Digit7",8},{"Digit8",9},{"Digit9",10},{"Digit0",11},{"Minus",12},{"Equal",13},{"Backspace",14},{"Tab",15},
      {"KeyQ",16},{"KeyW",17},{"KeyE",18},{"KeyR",19},{"KeyT",20},{"KeyY",21},{"KeyU",22},{"KeyI",23},{"KeyO",24},{"KeyP",25},{"BracketLeft",26},{"BracketRight",27},{"Enter",28},{"ControlLeft",29},
      {"KeyA",30},{"KeyS",31},{"KeyD",32},{"KeyF",33},{"KeyG",34},{"KeyH",35},{"KeyJ",36},{"KeyK",37},{"KeyL",38},{"Semicolon",39},{"Quote",40},{"Backquote",41},{"ShiftLeft",42},{"Backslash",43},
      {"KeyZ",44},{"KeyX",45},{"KeyC",46},{"KeyV",47},{"KeyB",48},{"KeyN",49},{"KeyM",50},{"Comma",51},{"Period",52},{"Slash",53},{"ShiftRight",54},{"AltLeft",56},{"Space",57},{"IntlBackslash",86},{"IntlRo",115},
      {"ControlRight",285},{"AltRight",312},{"MetaLeft",347},{"MetaRight",348},{"ArrowUp",328},{"ArrowLeft",331},{"ArrowRight",333},{"ArrowDown",336},{"Insert",338},{"Delete",339},{"Home",327},{"End",335},{"PageUp",329},{"PageDown",337},
      {"F1",59},{"F2",60},{"F3",61},{"F4",62},{"F5",63},{"F6",64},{"F7",65},{"F8",66},{"F9",67},{"F10",68},{"F11",87},{"F12",88},{"Numpad0",82},{"Numpad1",79},{"Numpad2",80},{"Numpad3",81},{"Numpad4",75},{"Numpad5",76},{"Numpad6",77},{"Numpad7",71},{"Numpad8",72},{"Numpad9",73},{"NumpadAdd",78},{"NumpadSubtract",74},{"NumpadMultiply",55},{"NumpadDivide",309},{"NumpadDecimal",83},{"NumpadEnter",284}
    };
    public void Apply(Dictionary<string,object> e) {
        string type=Convert.ToString(e["type"]);if(type=="release"){Release();return;}if(!enabled)return;
        if(type=="text"){foreach(char c in Convert.ToString(e["text"])) {Send(new INPUT{type=1,data=new UNION{key=new KEY{scan=c,flags=4}}});Send(new INPUT{type=1,data=new UNION{key=new KEY{scan=c,flags=6}}});}return;}
        if(type=="keyDown"||type=="keyUp"){int scan;if(!scans.TryGetValue(Convert.ToString(e["code"]),out scan))return;bool up=type=="keyUp";if(up){if(keys.Remove(scan))Key(scan,true);}else if(keys.Add(scan))Key(scan,false);return;}
        if(type=="wheel"){Mouse(0x800,0,0,(int)Math.Round(Convert.ToDouble(e["delta"])));return;}
        if(type=="move"||type=="down"||type=="up"){
            var p=MapDesktop(Convert.ToDouble(e["x"]),Convert.ToDouble(e["y"]),TargetBounds,SystemInformation.VirtualScreen);Mouse(0xC001,p.X,p.Y);
            if(type!="move"){int b=Convert.ToInt32(e["button"]);if(type=="down"){if(buttons.Add(b))Mouse(b==0?2u:b==1?32u:8u);}else if(buttons.Remove(b))Mouse(b==0?4u:b==1?64u:16u);}
        }
    }
    public void Dispose(){Enabled=false;}
}
public sealed class GuideOverlay : Form {
    readonly Timer timer=new Timer(); Point mark;
    public Rectangle TargetBounds=Screen.PrimaryScreen.Bounds;
    public GuideOverlay(){FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;BackColor=Color.Magenta;TransparencyKey=Color.Magenta;DoubleBuffered=true;Bounds=Screen.PrimaryScreen.Bounds;timer.Interval=2000;timer.Tick+=delegate{timer.Stop();Hide();};}
    protected override bool ShowWithoutActivation { get{return true;} }
    protected override CreateParams CreateParams { get{var cp=base.CreateParams;cp.ExStyle|=0x08000020;return cp;} }
    public void PointAt(double x,double y){Bounds=TargetBounds;mark=RemoteInput.Map(x,y,Bounds.Width,Bounds.Height);Show();Invalidate();timer.Stop();timer.Start();}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;using(var pen=new Pen(Color.FromArgb(0,91,255),5)){e.Graphics.DrawEllipse(pen,mark.X-24,mark.Y-24,48,48);e.Graphics.DrawLine(pen,mark.X-8,mark.Y,mark.X+8,mark.Y);e.Graphics.DrawLine(pen,mark.X,mark.Y-8,mark.X,mark.Y+8);}}
    protected override void Dispose(bool disposing){if(disposing)timer.Dispose();base.Dispose(disposing);}
}
