import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./game.js', import.meta.url), 'utf8');
function game() {
  const elements = new Map();
  const drawing = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      style: {}, classList: { add() {}, remove() {} },
      getContext: () => drawing, focus() {}, addEventListener() {},
      replaceChildren() {}, append() {}, setAttribute() {}
    });
    return elements.get(id);
  }
  const sandbox = vm.createContext({
    document: { querySelector: element, getElementById: element, querySelectorAll: () => [], createElement: () => element(Symbol()), addEventListener() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, HTMLButtonElement: class {}
  });
  vm.runInContext(source + '\n globalThis.game = { start, update, pause, draw, canSee, keys, get state() { return state; } };', sandbox);
  sandbox.game.start();
  return sandbox.game;
}
function advance(game, seconds) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) game.update(1 / 60);
}

test('cutting prevents a fall; replanting lowers suspicion and delays regrowth', () => {
  const instance = game();
  const tree = instance.state.trees[0];
  Object.assign(instance.state.player, { x: tree.x, y: tree.y + 30 });
  instance.state.officers = [];
  instance.keys.add(' ');
  advance(instance, 1.6);
  assert.equal(tree.status, 'stump');
  assert.equal(instance.state.cutCount, 1);
  instance.keys.clear();
  instance.state.suspicion = 60;
  instance.keys.add('e');
  advance(instance, 1.3);
  assert.equal(tree.status, 'sapling');
  assert.ok(instance.state.suspicion < 36);
  assert.equal(instance.state.health, 100);
});

test('house blocks council sight; trees and open yard do not', () => {
  const instance = game();
  assert.equal(instance.canSee({ x: 480, y: 210, facing: Math.PI / 2 }, { x: 480, y: 430 }), false);
  assert.equal(instance.canSee({ x: 200, y: 210, facing: Math.PI / 2 }, { x: 200, y: 430 }), true);
  assert.equal(instance.canSee({ x: 200, y: 210, facing: -Math.PI / 2 }, { x: 200, y: 430 }), false);
});

test('ignoring aggressive trees destroys the house', () => {
  const instance = game();
  advance(instance, 40);
  assert.equal(instance.state.mode, 'lost');
  assert.equal(instance.state.health, 0);
});

test('visible chainsaw use causes a fine and three fines end the game', () => {
  const instance = game();
  const tree = instance.state.trees[0];
  Object.assign(instance.state.player, { x: tree.x, y: tree.y + 30 });
  instance.state.officers = [{ x: 110, y: 150, path: 0, facing: 0 }];
  instance.state.suspicion = 99;
  instance.state.fines = 2;
  instance.keys.add(' ');
  advance(instance, .1);
  assert.equal(instance.state.fines, 3);
  assert.equal(instance.state.mode, 'lost');
});

test('pause freezes simulation and surviving the timer wins', () => {
  const instance = game();
  instance.pause();
  advance(instance, 5);
  assert.equal(instance.state.elapsed, 0);
  instance.pause();
  instance.state.elapsed = 89.9;
  advance(instance, .2);
  assert.equal(instance.state.mode, 'won');
  instance.draw();
});

test('movement cannot pass through the house', () => {
  const instance = game();
  instance.keys.add('w');
  advance(instance, 1);
  assert.ok(instance.state.player.y >= 418);
  assert.ok(instance.state.player.y < 447);
});
