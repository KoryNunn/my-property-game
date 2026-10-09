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
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
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

test('council must chase and reach the player before charging a fine', () => {
  const instance = game();
  const tree = instance.state.trees[0];
  Object.assign(instance.state.player, { x: tree.x, y: tree.y + 30 });
  instance.state.officers = [{ x: 110, y: 150, path: 0, facing: 0 }];
  instance.state.suspicion = 99;
  const initialCash = instance.state.cash;
  instance.keys.add(' ');
  advance(instance, .1);
  assert.equal(instance.state.officers[0].chasing, true);
  assert.equal(instance.state.fines, 0);
  assert.ok(instance.state.cash > initialCash);
  instance.keys.clear();
  advance(instance, 1);
  assert.equal(instance.state.fines, 1);
  assert.equal(instance.state.finesPaid, 120);
  assert.ok(Math.abs(instance.state.cash - (initialCash + instance.state.wagesEarned - 120)) < .001);
  assert.equal(instance.state.officers[0].chasing, false);
  advance(instance, 1);
  assert.equal(instance.state.fines, 1);
});

test('fines can create debt and do not end the game at three fines', () => {
  const instance = game();
  instance.state.cash = 10;
  instance.state.fines = 2;
  instance.state.officers = [{ x: 480, y: 430, path: 0, facing: Math.PI / 2, chasing: true, searchTime: 0, lastKnown: { x: 480, y: 447 } }];
  advance(instance, .1);
  assert.equal(instance.state.fines, 3);
  assert.ok(instance.state.cash < 0);
  assert.equal(instance.state.mode, 'playing');
  instance.state.officers = [];
  advance(instance, 14);
  assert.ok(instance.state.cash > 0);
});

test('council routes around the house instead of running through it', () => {
  const instance = game();
  Object.assign(instance.state.player, { x: 650, y: 325 });
  const officer = { x: 300, y: 325, path: 0, facing: 0, chasing: true, searchTime: 0, lastKnown: { x: 650, y: 325 } };
  instance.state.officers = [officer];
  for (let frame = 0; frame < 240; frame++) {
    instance.update(1 / 60);
    assert.ok(!(officer.x > 378 && officer.x < 582 && officer.y > 245 && officer.y < 403));
  }
  assert.equal(instance.state.fines, 1);
});

test('breaking sight for five seconds ends the pursuit without a fine', () => {
  const instance = game();
  Object.assign(instance.state.player, { x: 480, y: 447 });
  instance.state.officers = [{ x: 480, y: 200, path: 0, facing: -Math.PI / 2, chasing: true, searchTime: 0, lastKnown: { x: 480, y: 200 } }];
  advance(instance, 5.1);
  assert.equal(instance.state.officers[0].chasing, false);
  assert.equal(instance.state.fines, 0);
});

test('wages accrue over time and pause stops earnings', () => {
  const instance = game();
  advance(instance, 5);
  assert.ok(Math.abs(instance.state.cash - 240) < .001);
  instance.pause();
  advance(instance, 5);
  assert.ok(Math.abs(instance.state.cash - 240) < .001);
});

test('repairing requires cash and proximity, charges once, and restores condition', () => {
  const instance = game();
  instance.state.officers = [];
  instance.state.health = 60;
  instance.keys.add('r');
  advance(instance, 2.1);
  assert.equal(instance.state.health, 80);
  assert.equal(instance.state.repairsPaid, 60);
  assert.ok(Math.abs(instance.state.cash - (200 + instance.state.wagesEarned - 60)) < .001);
  Object.assign(instance.state.player, { x: 200, y: 200 });
  advance(instance, 2.1);
  assert.equal(instance.state.health, 80);
  assert.equal(instance.state.repairsPaid, 60);
  Object.assign(instance.state.player, { x: 480, y: 447 });
  instance.state.cash = 0;
  advance(instance, 2.1);
  assert.equal(instance.state.health, 80);
  assert.equal(instance.state.repairsPaid, 60);
});

test('repair cannot overfill health or charge for an intact house', () => {
  const instance = game();
  instance.state.health = 90;
  instance.keys.add('r');
  advance(instance, 5);
  assert.equal(instance.state.health, 100);
  assert.equal(instance.state.repairsPaid, 60);
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

test('holding Shift dashes faster and still respects house collisions', () => {
  const walking = game();
  const dashing = game();
  walking.keys.add('a');
  dashing.keys.add('a');
  dashing.keys.add('Shift');
  advance(walking, .5);
  advance(dashing, .5);
  const walkingDistance = 480 - walking.state.player.x;
  const dashDistance = 480 - dashing.state.player.x;
  assert.ok(dashDistance > walkingDistance * 1.8);
  dashing.keys.clear();
  Object.assign(dashing.state.player, { x: 480, y: 447 });
  dashing.keys.add('w');
  dashing.keys.add('Shift');
  advance(dashing, 1);
  assert.ok(dashing.state.player.y >= 418);
});
