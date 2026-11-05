// SDR-only synthetic source. No desktop pixels are accessed.
export function createPattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d', { alpha: false });
  let frame = 0;
  let closed = false;
  let raf;
  function draw() {
    if (closed) return;
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = '#122a2c'; ctx.fillRect(0, 0, 1920, 105);
    ctx.fillStyle = '#fff'; ctx.font = '32px Segoe UI'; ctx.fillText('FAROL / CARTELA SDR · 1920 × 1080', 48, 66);
    const colors = ['#17232d', '#cc1426', '#08752d', '#204ee6'];
    colors.forEach((color, n) => {
      ctx.fillStyle = color;
      [12, 14, 16, 20].forEach((size, row) => {
        ctx.font = `${size}px Consolas`;
        ctx.fillText(`Texto ${size}px: ÁÉç 0O 1Il 0123456789 R$ 1.234,56 const total = 42;`, 48, 150 + n * 138 + row * 28);
      });
    });
    ctx.strokeStyle = '#87949e'; ctx.lineWidth = 1;
    for (let x = 1050; x < 1860; x += 90) { ctx.beginPath(); ctx.moveTo(x + .5, 140); ctx.lineTo(x + .5, 740); ctx.stroke(); }
    for (let y = 140; y < 740; y += 30) { ctx.beginPath(); ctx.moveTo(1050, y + .5); ctx.lineTo(1860, y + .5); ctx.stroke(); }
    ctx.font = '14px Consolas'; ctx.fillStyle = '#17232d';
    for (let y = 0; y < 19; y++) for (let x = 0; x < 8; x++) ctx.fillText(`${(y * 138.71 + x).toFixed(2)}`, 1060 + x * 90, 161 + y * 30);
    ctx.fillStyle = '#c7d8dc'; ctx.fillRect(48, 790, 1812, 210);
    ctx.fillStyle = '#126b61'; ctx.fillRect(48 + ((frame * 11) % 1612), 820, 200, 140);
    ctx.fillStyle = '#111'; ctx.font = '22px Consolas'; ctx.fillText(`Movimento contínuo · quadro ${frame}`, 60, 1040);
    frame++;
    raf = requestAnimationFrame(draw);
  }
  draw();
  const stream = canvas.captureStream(60);
  return { stream, dispose() { closed = true; cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); canvas.width = canvas.height = 0; } };
}
