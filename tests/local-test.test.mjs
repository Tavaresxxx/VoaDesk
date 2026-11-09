import test from 'node:test';
import assert from 'node:assert/strict';
import {TestDesktop, INITIAL_TEXT, WIDTH, HEIGHT} from '../src/ui/test-desktop.mjs';

const point = (type, x, y, extra = {}) => ({type, x: x / WIDTH, y: y / HEIGHT, button: 0, ...extra});
test('tela de teste aplica cliques, texto Unicode e edição somente em memória', () => {
  const desktop = new TestDesktop();
  desktop.input({type: 'text', text: 'ignorado sem foco'});
  assert.equal(desktop.text, INITIAL_TEXT);
  desktop.input(point('down', 800, 230)); assert.equal(desktop.count, 1);
  desktop.input(point('down', 1000, 230)); assert.equal(desktop.count, 0);
  desktop.input(point('down', 1000, 230)); assert.equal(desktop.count, 0);
  desktop.input(point('down', 150, 250));
  desktop.input({type: 'text', text: ' Ação 🛫'});
  desktop.input({type: 'keyDown', code: 'Backspace'});
  assert.equal(desktop.text, INITIAL_TEXT + ' Ação ');
  desktop.input({type: 'keyDown', code: 'Enter'});
  desktop.input({type: 'text', text: 'fim'});
  desktop.input({type: 'keyDown', code: 'ArrowLeft'});
  desktop.input({type: 'keyDown', code: 'Delete'});
  assert.ok(desktop.text.endsWith('\nfi'));
  desktop.input({type: 'text', text: 'x'.repeat(3000)});
  assert.equal([...desktop.text].length, 1800);
  assert.deepEqual([...desktop.done], ['click', 'type']);
});

test('arraste, desenho, rolagem e encerramento respeitam os limites da tela simulada', () => {
  const desktop = new TestDesktop();
  desktop.input(point('down', 100, 170));
  desktop.input(point('move', -500, -500));
  assert.deepEqual(desktop.note, {x: 12, y: 116, w: 600, h: 450});
  desktop.input({type: 'release'});
  desktop.input(point('move', 1200, 700)); assert.equal(desktop.note.x, 12);
  desktop.input(point('down', 800, 450)); desktop.input(point('move', 900, 480));
  desktop.input(point('up', 1000, 500));
  assert.equal(desktop.strokes[0].points.length, 3);
  desktop.input(point('move', 1050, 520)); assert.equal(desktop.strokes[0].points.length, 3);
  desktop.input(point('down', 1150, 375)); assert.equal(desktop.strokes.length, 0);
  desktop.input(point('move', 200, 300)); desktop.input({type: 'wheel', delta: -1200});
  assert.equal(desktop.scroll, 120);
  desktop.input({type: 'wheel', delta: Infinity}); assert.equal(desktop.scroll, 120);
  desktop.input({type: 'testReset'});
  assert.equal(desktop.text, INITIAL_TEXT); assert.equal(desktop.done.size, 0);
  assert.equal(desktop.drag, null); assert.equal(desktop.drawing, false);
  assert.equal(desktop.scroll, 0); assert.equal(desktop.strokes.length, 0);
  assert.equal(new TestDesktop().done.size, 0);
});
