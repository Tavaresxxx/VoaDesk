using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;
public static class VoaTheme {
 public static readonly Color Ink=Color.FromArgb(21,23,28),Muted=Color.FromArgb(98,103,113),Blue=Color.FromArgb(0,91,255),Line=Color.FromArgb(230,232,236),Surface=Color.FromArgb(247,248,250);
 public const int Width=440,CompactHeight=366,SessionHeight=548;
 public static GraphicsPath Rounded(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 public static void Watermark(Graphics graphics,Image image,RectangleF area){float scale=Math.Min(area.Width/image.Width,area.Height/image.Height);var r=new RectangleF(area.X+(area.Width-image.Width*scale)/2,area.Y+(area.Height-image.Height*scale)/2,image.Width*scale,image.Height*scale);using(var attributes=new ImageAttributes()){var matrix=new ColorMatrix();matrix.Matrix33=.045f;attributes.SetColorMatrix(matrix);graphics.DrawImage(image,Rectangle.Round(r),0,0,image.Width,image.Height,GraphicsUnit.Pixel,attributes);}}
}
public sealed class VoaButton:Button {
 bool hover;
 public VoaButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);}
 protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
 protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
 protected override void OnEnabledChanged(EventArgs e){Invalidate();base.OnEnabledChanged(e);}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.Clear(Parent==null?Color.White:Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;bool primary=BackColor==VoaTheme.Blue;Color fill=!Enabled?VoaTheme.Surface:primary?(hover?Color.FromArgb(0,75,214):VoaTheme.Blue):(hover?VoaTheme.Surface:Color.White);using(var p=VoaTheme.Rounded(new RectangleF(1,1,Width-3,Height-3),6)){using(var brush=new SolidBrush(fill))e.Graphics.FillPath(brush,p);using(var pen=new Pen(primary&&Enabled?fill:VoaTheme.Line))e.Graphics.DrawPath(pen,p);}TextRenderer.DrawText(e.Graphics,Text,Font,new Rectangle(8,2,Width-16,Height-4),!Enabled?VoaTheme.Muted:primary?Color.White:ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);if(Focused&&ShowFocusCues)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(5,5,Width-10,Height-10),VoaTheme.Blue,fill);}
}
public sealed class VoaCodeLabel:Label {
 public VoaCodeLabel(){SetStyle(ControlStyles.Selectable,true);TabStop=true;AccessibleRole=AccessibleRole.PushButton;AccessibleName="Copiar código de acesso";}
 protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space){OnClick(EventArgs.Empty);e.Handled=true;e.SuppressKeyPress=true;}base.OnKeyDown(e);}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(Focused)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(3,3,Width-6,Height-6),VoaTheme.Blue,BackColor);}
 protected override void OnGotFocus(EventArgs e){base.OnGotFocus(e);Invalidate();}
 protected override void OnLostFocus(EventArgs e){base.OnLostFocus(e);Invalidate();}
}
public sealed class VoaMenuRenderer:ToolStripProfessionalRenderer {
 protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e){using(var b=new SolidBrush(e.Item.Selected?Color.FromArgb(237,243,255):Color.White))e.Graphics.FillRectangle(b,new Rectangle(Point.Empty,e.Item.Size));}
}
