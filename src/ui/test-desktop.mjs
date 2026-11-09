// A disposable desktop model. Inputs only change this object, never the operating system.
export const WIDTH = 1280, HEIGHT = 720;
export const INITIAL_TEXT = 'Olá! Esta é a sua tela de testes.\nClique aqui e experimente digitar.';
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export class TestDesktop {
  constructor() { this.reset(); }
  reset() {
    this.text = INITIAL_TEXT; this.caret = [...this.text].length; this.count = 0;
    this.note = { x: 54, y: 150, w: 600, h: 450 }; this.focus = null;
    this.drag = null; this.drawing = false; this.strokes = []; this.color = '#005bff';
    this.scroll = 0; this.pointer = null; this.guide = null; this.events = 0;
    this.done = new Set(); this.lastAction = 'Clique em uma das atividades para começar.';
  }
  input(data) {
    if (data.type === 'testReset') { this.reset(); return; }
    if (data.type === 'release') { this.drag = null; this.drawing = false; return; }
    const p = Number.isFinite(data.x) && Number.isFinite(data.y)
      ? { x: clamp(data.x, 0, 1) * WIDTH, y: clamp(data.y, 0, 1) * HEIGHT } : null;
    if (p) this.pointer = p;
    const mark = (task, label) => { this.done.add(task); this.events++; this.lastAction = label; };
    if (data.type === 'guide' && p) { this.guide = p; return; }
    if (data.type === 'down' && p && data.button === 0) {
      this.guide = null;
      if (inside(p, { ...this.note, h: 44 })) {
        this.drag = { x: p.x - this.note.x, y: p.y - this.note.y }; this.focus = null;
      } else if (inside(p, { x: this.note.x + 20, y: this.note.y + 74, w: 560, h: 300 })) {
        this.focus = 'text'; this.caret = [...this.text].length;
        this.lastAction = 'Bloco de notas selecionado. Digite ou use Backspace e Enter.';
      } else if (inside(p, { x: 746, y: 208, w: 170, h: 50 })) {
        this.focus = null; this.count++; mark('click', 'Clique recebido: contador atualizado.');
      } else if (inside(p, { x: 946, y: 208, w: 170, h: 50 })) {
        this.focus = null; this.count = Math.max(0, this.count - 1); mark('click', 'Clique recebido: contador atualizado.');
      } else if (inside(p, { x: 1120, y: 361, w: 90, h: 32 })) {
        this.strokes = []; this.focus = null; this.lastAction = 'Desenho limpo.';
      } else if (inside(p, { x: 744, y: 411, w: 460, h: 176 })) {
        this.focus = 'paint'; this.drawing = true;
        this.strokes.push({ color: this.color, points: [p] });
        if (this.strokes.length > 200) this.strokes.shift();
        mark('draw', 'Traço recebido na área de desenho.');
      } else {
        for (const [i, color] of ['#005bff', '#a32e63', '#10836b'].entries()) {
          if (inside(p, { x: 745 + i * 42, y: 362, w: 32, h: 32 })) this.color = color;
        }
        this.focus = null;
      }
    }
    if ((data.type === 'move' || data.type === 'up') && p) {
      if (this.drag) {
        this.note.x = clamp(p.x - this.drag.x, 12, WIDTH - this.note.w - 12);
        this.note.y = clamp(p.y - this.drag.y, 116, 630 - this.note.h);
        mark('drag', 'Janela movida pela barra de título.');
      }
      if (this.drawing && inside(p, { x: 744, y: 411, w: 460, h: 176 })) {
        const points = this.strokes.at(-1)?.points;
        if (points && points.length < 2000) points.push(p);
      }
    }
    if (data.type === 'up') { this.drag = null; this.drawing = false; }
    if (data.type === 'wheel' && Number.isFinite(data.delta) && this.pointer?.x < 684) {
      this.scroll = clamp(this.scroll - data.delta / 6, 0, 120);
      mark('scroll', 'Rolagem recebida no bloco de notas.');
    }
    if (this.focus !== 'text') return;
    const chars = [...this.text];
    if (data.type === 'text' && typeof data.text === 'string') {
      const insert = [...data.text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')].slice(0, Math.max(0, 1800 - chars.length));
      chars.splice(this.caret, 0, ...insert); this.caret += insert.length;
      mark('type', 'Texto recebido pelo canal de controle.');
    } else if (data.type === 'keyDown') {
      switch (data.code) {
        case 'Backspace': if (this.caret > 0) chars.splice(--this.caret, 1); break;
        case 'Delete': chars.splice(this.caret, 1); break;
        case 'Enter': if (chars.length < 1800) chars.splice(this.caret++, 0, '\n'); break;
        case 'ArrowLeft': this.caret = Math.max(0, this.caret - 1); break;
        case 'ArrowRight': this.caret = Math.min(chars.length, this.caret + 1); break;
        case 'Home': this.caret = chars.slice(0, this.caret).lastIndexOf('\n') + 1; break;
        case 'End': { const end = chars.indexOf('\n', this.caret); this.caret = end < 0 ? chars.length : end; break; }
        default: return;
      }
      mark('type', 'Tecla recebida no bloco de notas.');
    }
    this.text = chars.join('');
  }
}

export function drawDesktop(ctx, desktop) {
  const box = (x, y, w, h, color, radius = 16) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  };
  const text = (value, x, y, size = 18, color = '#151f38', weight = 400) => {
    ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#eef4ff'); gradient.addColorStop(1, '#d6e4ff');
  box(0, 0, WIDTH, HEIGHT, gradient, 0);
  box(0, 0, WIDTH, 82, '#ffffff', 0);
  text('VoaDesk', 40, 40, 25, '#005bff', 600);
  text('Seu computador de testes', 188, 40, 23, '#151f38', 600);
  text('AMBIENTE LOCAL · DESCARTÁVEL', 900, 39, 13, '#53617b', 600);
  text('Experimente à vontade. Tudo aqui é uma simulação interativa.', 40, 65, 15, '#53617b');
  text('01  Arraste a janela · clique no texto para digitar', 54, 127, 16, '#304a77', 600);
  text('02  Teste os cliques', 724, 127, 16, '#304a77', 600);
  box(718, 150, 512, 166, '#ffffff');
  text('Cliques recebidos', 746, 187, 17, '#53617b');
  text(String(desktop.count), 1140, 193, 33, '#005bff', 600);
  box(746, 208, 170, 50, '#005bff', 10); text('+ Adicionar', 778, 240, 18, '#ffffff', 600);
  box(946, 208, 170, 50, '#edf3ff', 10); text('− Diminuir', 981, 240, 18, '#005bff', 600);
  text('O contador responde aos comandos da tela recebida.', 746, 290, 15, '#53617b');
  box(718, 334, 512, 278, '#ffffff');
  text('03  Clique e arraste para desenhar', 744, 358, 17, '#304a77', 600);
  ['#005bff', '#a32e63', '#10836b'].forEach((color, i) => {
    box(745 + i * 42, 366, 30, 24, color, 8);
    if (desktop.color === color) { ctx.strokeStyle = '#151f38'; ctx.lineWidth = 2; ctx.strokeRect(742 + i * 42, 363, 36, 30); }
  });
  text('Limpar', 1135, 384, 16, '#005bff', 600);
  box(744, 411, 460, 176, '#f3f6fb', 10);
  if (!desktop.strokes.length) text('Seu próximo rabisco começa aqui.', 830, 507, 18, '#64728c');
  ctx.save(); ctx.beginPath(); ctx.rect(744, 411, 460, 176); ctx.clip();
  for (const stroke of desktop.strokes) {
    ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineWidth = 4; ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    const first = stroke.points[0]; ctx.beginPath(); ctx.arc(first.x, first.y, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const n = desktop.note;
  ctx.shadowColor = '#214b7c20'; ctx.shadowBlur = 24; box(n.x, n.y, n.w, n.h, '#ffffff'); ctx.shadowBlur = 0;
  box(n.x, n.y, n.w, 44, '#263e68', 12); box(n.x, n.y + 28, n.w, 16, '#263e68', 0);
  text('Bloco de notas', n.x + 22, n.y + 28, 17, '#ffffff', 600);
  text('ARRASTE AQUI', n.x + 448, n.y + 28, 12, '#d5e3ff', 600);
  text('Clique no campo abaixo e escreva. Enter cria uma linha.', n.x + 22, n.y + 65, 15, '#53617b');
  box(n.x + 20, n.y + 74, 560, 300, '#f7f9fc', 8);
  ctx.strokeStyle = desktop.focus === 'text' ? '#005bff' : '#dce3ee'; ctx.lineWidth = 2;
  ctx.strokeRect(n.x + 20, n.y + 74, 560, 300);
  ctx.save(); ctx.beginPath(); ctx.rect(n.x + 26, n.y + 80, 548, 286); ctx.clip();
  ctx.font = '18px "Segoe UI", Arial, sans-serif';
  let x = n.x + 34, y = n.y + 104 - desktop.scroll;
  const startX = x, chars = [...desktop.text];
  for (let i = 0; i <= chars.length; i++) {
    if (i === desktop.caret && desktop.focus === 'text' && Date.now() % 1000 < 650) box(x, y - 19, 2, 24, '#005bff', 0);
    if (i === chars.length) break;
    if (chars[i] === '\n') { x = startX; y += 28; continue; }
    const width = ctx.measureText(chars[i]).width;
    if (x + width > n.x + 562) { x = startX; y += 28; }
    text(chars[i], x, y); x += width;
  }
  ctx.restore();
  text('Teste também a roda do mouse sobre este bloco.', n.x + 22, n.y + 407, 15, '#53617b');
  text(`${[...desktop.text].length}/1800 caracteres · conteúdo só nesta sessão`, n.x + 22, n.y + 433, 13, '#53617b');
  box(40, 642, 1200, 54, '#ffffff', 12);
  const tasks = [['click', 'Clique'], ['type', 'Teclado'], ['drag', 'Arrastar'], ['draw', 'Desenho'], ['scroll', 'Rolagem']];
  tasks.forEach(([key, label], i) => text(`${desktop.done.has(key) ? '✓' : '○'} ${label}`, 62 + i * 130, 676, 16, desktop.done.has(key) ? '#08705a' : '#53617b', 600));
  text(`${desktop.done.size}/5 atividades`, 1060, 676, 16, '#005bff', 600);
  if (desktop.guide) {
    ctx.strokeStyle = '#a32e63'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(desktop.guide.x, desktop.guide.y, 18, 0, Math.PI * 2); ctx.stroke();
  }
  if (desktop.pointer) {
    const p = desktop.pointer; ctx.fillStyle = '#151f38'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4, p.y + 21); ctx.lineTo(p.x + 10, p.y + 14); ctx.lineTo(p.x + 20, p.y + 13); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
