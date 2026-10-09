const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const keys = new Set();
const house = { x: 378, y: 245, width: 204, height: 158 };
const treePositions = [[215, 170], [351, 135], [606, 143], [752, 210], [739, 391], [639, 497], [399, 497], [226, 425], [190, 305], [500, 111], [800, 310], [288, 520]];
let state;
let lastFrame = 0;
let toastTime = 0;
let soundEnabled = false;
let audioContext;
let actionTarget = null;
let weatherTime = 0;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const elements = Object.fromEntries(['overlay', 'phase', 'clock', 'health-label', 'health-meter', 'suspicion-label', 'suspicion-meter', 'trees-label', 'fines-label', 'council-note', 'toast', 'pause'].map(id => [id, document.getElementById(id)]));

function reset() {
  keys.clear();
  actionTarget = null;
  elements.toast.classList.remove('visible');
  state = {
    mode: 'intro', elapsed: 0, health: 100, suspicion: 0, fines: 0, cutCount: 0,
    player: { x: 480, y: 447, facing: -Math.PI / 2, action: 0 },
    trees: treePositions.map(([x, y], index) => ({ x, y, index, status: 'standing', danger: 0, deadline: 20 + index * 2.3, cut: 0, plant: 0, fall: 0, recover: 0 })),
    officers: [{ x: 110, y: 100, path: 0, facing: 0 }, { x: 850, y: 550, path: 2, facing: Math.PI }],
    particles: [], warning: 0, invulnerability: 0, spotted: false, shake: 0
  };
  updateHud();
}
function notify(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTime = 3;
}
function tone(frequency, duration = .08, type = 'sine', volume = .035) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is optional. */ }
}
function distance(first, second) { return Math.hypot(first.x - second.x, first.y - second.y); }
function insideHouse(x, y, margin = 0) {
  return x > house.x - margin && x < house.x + house.width + margin && y > house.y - margin && y < house.y + house.height + margin;
}
function lineBlocked(first, second) {
  const steps = Math.ceil(distance(first, second) / 8);
  for (let step = 1; step < steps; step++) {
    const fraction = step / steps;
    if (insideHouse(first.x + (second.x - first.x) * fraction, first.y + (second.y - first.y) * fraction)) return true;
  }
  return false;
}
function canSee(officer, player) {
  const angle = Math.atan2(player.y - officer.y, player.x - officer.x);
  const difference = Math.atan2(Math.sin(angle - officer.facing), Math.cos(angle - officer.facing));
  return distance(officer, player) < 245 && Math.abs(difference) < .65 && !lineBlocked(officer, player);
}
function burst(x, y, color, count = 12) {
  for (let index = 0; index < count; index++) state.particles.push({ x, y, velocityX: (Math.random() - .5) * 110, velocityY: (Math.random() - .5) * 110, life: .7, color });
}
function start() {
  reset();
  state.mode = 'playing';
  elements.overlay.hidden = true;
  elements.pause.innerHTML = 'Ⅱ Pause <kbd>P</kbd>';
  canvas.focus({ preventScroll: true });
  notify('Get close to a tree and hold SPACE. Watch the yellow sight cones!');
  tone(420, .15);
}
function showOverlay(title, description, buttonText, handler) {
  elements.overlay.replaceChildren();
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'MY PROPERTY';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  const button = document.createElement('button');
  button.className = 'primary-button';
  button.textContent = buttonText;
  button.addEventListener('click', handler);
  elements.overlay.append(eyebrow, heading, paragraph, button);
  elements.overlay.hidden = false;
}
function finish(won) {
  state.mode = won ? 'won' : 'lost';
  keys.clear();
  const title = won ? 'Still standing. Just.' : state.health <= 0 ? 'The trees won.' : 'Council says: cease & desist.';
  showOverlay(title, `${won ? 'You survived the afternoon!' : state.health <= 0 ? 'Your roof had one tree too many.' : 'Three fines. Your chainsaw has been confiscated.'} ${state.cutCount} trees felled · ${state.fines} fines · ${Math.ceil(state.health)}% house remaining.`, 'Another afternoon ↗', start);
  tone(won ? 660 : 140, .5, 'triangle');
  updateHud();
}
function pause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    keys.clear();
    showOverlay('A moment of peace.', 'The trees and council can wait. Take a breather.', 'Back to the backyard ↗', pause);
    elements.pause.innerHTML = '▶ Resume <kbd>P</kbd>';
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    elements.overlay.hidden = true;
    elements.pause.innerHTML = 'Ⅱ Pause <kbd>P</kbd>';
    canvas.focus({ preventScroll: true });
  }
}
function update(delta) {
  if (state.mode !== 'playing') return;
  state.elapsed += delta;
  state.invulnerability = Math.max(0, state.invulnerability - delta);
  state.shake = Math.max(0, state.shake - delta);
  toastTime -= delta;
  if (toastTime <= 0) elements.toast.classList.remove('visible');
  const player = state.player;
  const sneaking = keys.has('Shift');
  const cutting = keys.has(' ');
  let horizontal = Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft'));
  let vertical = Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp'));
  const length = Math.hypot(horizontal, vertical);
  if (length) {
    horizontal /= length; vertical /= length;
    player.facing = Math.atan2(vertical, horizontal);
    const speed = sneaking ? 100 : 200;
    const nextX = Math.max(144, Math.min(818, player.x + horizontal * speed * delta));
    const nextY = Math.max(124, Math.min(527, player.y + vertical * speed * delta));
    if (!insideHouse(nextX, player.y, 15)) player.x = nextX;
    if (!insideHouse(player.x, nextY, 15)) player.y = nextY;
  }
  const patrol = [{ x: 110, y: 100 }, { x: 850, y: 100 }, { x: 850, y: 550 }, { x: 110, y: 550 }];
  for (const officer of state.officers) {
    const target = patrol[(officer.path + 1) % patrol.length];
    const remaining = distance(officer, target);
    officer.facing = Math.atan2(target.y - officer.y, target.x - officer.x);
    const travel = (58 + state.elapsed * .25) * delta;
    if (remaining <= travel) { officer.x = target.x; officer.y = target.y; officer.path = (officer.path + 1) % 4; }
    else { officer.x += (target.x - officer.x) / remaining * travel; officer.y += (target.y - officer.y) / remaining * travel; }
  }
  actionTarget = state.trees.filter(tree => tree.status === 'standing' || tree.status === 'stump').sort((a, b) => distance(a, player) - distance(b, player))[0];
  if (!actionTarget || distance(actionTarget, player) > 59) actionTarget = null;
  let doingCut = false;
  let doingPlant = false;
  for (const tree of state.trees) {
    if (tree.status === 'standing') {
      tree.danger += delta / tree.deadline;
      if (tree === actionTarget && cutting) {
        doingCut = true;
        player.facing = Math.atan2(tree.y - player.y, tree.x - player.x);
        tree.cut += delta / 1.5;
        if (Math.random() < delta * 15) { burst(tree.x, tree.y, '#e0bf75', 2); tone(85 + Math.random() * 50, .05, 'sawtooth', .016); }
        if (tree.cut >= 1) {
          tree.status = 'stump'; tree.recover = 20; state.cutCount++;
          burst(tree.x, tree.y - 20, '#718c47', 18); tone(240, .15, 'triangle');
          if (state.cutCount === 1) notify('Tree down! Hold E at its stump to replant and lower suspicion.');
        }
      } else tree.cut = Math.max(0, tree.cut - delta * .25);
      if (tree.status === 'standing' && tree.danger >= 1) { tree.status = 'falling'; tree.fall = 0; tone(170, .2, 'triangle'); }
    } else if (tree.status === 'falling') {
      tree.fall += delta;
      if (tree.fall >= 1.4) {
        tree.status = 'stump'; tree.recover = 16;
        state.health = Math.max(0, state.health - 20); state.shake = .35;
        burst(house.x + house.width / 2, house.y + house.height / 2, '#b78f64', 30);
        notify('TIMBER! The house took a hit. −20% condition.'); tone(70, .35, 'sawtooth');
      }
    } else if (tree.status === 'stump') {
      tree.recover -= delta;
      if (tree === actionTarget && keys.has('e')) {
        doingPlant = true;
        tree.plant += delta / 1.2;
        if (tree.plant >= 1) {
          tree.status = 'sapling'; tree.recover = 26;
          state.suspicion = Math.max(0, state.suspicion - 24);
          burst(tree.x, tree.y, '#8fab60'); notify('A responsible citizen! Suspicion −24%.'); tone(540, .12);
        }
      } else tree.plant = Math.max(0, tree.plant - delta * .3);
      if (tree.status === 'stump' && tree.recover <= 0) regrow(tree);
    } else if (tree.status === 'sapling') {
      tree.recover -= delta;
      if (tree.recover <= 0) regrow(tree);
    }
  }
  state.spotted = state.officers.some(officer => canSee(officer, player));
  const audible = doingCut && state.officers.some(officer => distance(officer, player) < 135 && !lineBlocked(officer, player));
  if (state.invulnerability <= 0) {
    if (doingCut && (state.spotted || audible)) state.suspicion += delta * 43;
    else if (state.spotted && !sneaking && !doingPlant) state.suspicion += delta * 5;
    else state.suspicion -= delta * (sneaking ? 9 : 5);
  }
  state.suspicion = Math.max(0, Math.min(100, state.suspicion));
  if (state.suspicion >= 100) {
    state.fines++; state.suspicion = 35; state.invulnerability = 4;
    notify(`Caught! Council fine ${state.fines}/3. Hide behind the house.`); tone(780, .3, 'square', .025);
  }
  player.action = doingCut ? 1 : doingPlant ? 2 : 0;
  state.particles = state.particles.filter(particle => {
    particle.life -= delta; particle.x += particle.velocityX * delta; particle.y += particle.velocityY * delta;
    return particle.life > 0;
  });
  updateHud();
  if (state.health <= 0 || state.fines >= 3) finish(false);
  else if (state.elapsed >= 90) finish(true);
}
function regrow(tree) {
  Object.assign(tree, { status: 'standing', danger: 0, deadline: 18 + Math.random() * 16, cut: 0, plant: 0 });
  burst(tree.x, tree.y, '#6d8d48', 8);
}
function updateHud() {
  const remaining = Math.max(0, Math.ceil(90 - state.elapsed));
  elements.clock.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  elements['health-label'].textContent = Math.ceil(state.health) + '%';
  elements['health-meter'].style.width = state.health + '%';
  elements['health-meter'].style.background = state.health <= 40 ? '#c57855' : '#74985e';
  elements['suspicion-label'].textContent = Math.ceil(state.suspicion) + '%';
  elements['suspicion-meter'].style.width = state.suspicion + '%';
  elements['trees-label'].textContent = state.cutCount;
  elements['fines-label'].innerHTML = `${state.fines} <small>/ 3</small>`;
  elements['council-note'].textContent = state.spotted && state.player.action === 1 ? 'They can see your chainsaw!' : state.suspicion > 65 ? 'They’re getting suspicious. Lay low.' : state.spotted ? 'In council sight. Stay casual.' : 'Nothing to see here, officer.';
  elements.phase.textContent = state.mode === 'intro' ? 'A STORM IS ROLLING IN…' : state.mode === 'paused' ? 'ON A TEA BREAK' : state.mode === 'won' ? 'PROPERTY PROTECTED' : state.mode === 'lost' ? 'A ROUGH AFTERNOON' : state.spotted && state.player.action === 1 ? 'COUNCIL IS WATCHING!' : state.trees.some(tree => tree.status === 'standing' && tree.danger > .75) ? 'WATCH THOSE LEANING TREES' : 'OPERATION: KEEP THE ROOF';
}
function rectangle(x, y, width, height, color, radius = 0) {
  context.fillStyle = color; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}
function ellipse(x, y, radiusX, radiusY, color) {
  context.fillStyle = color; context.beginPath(); context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2); context.fill();
}
function line(x1, y1, x2, y2, color, width = 1) {
  context.strokeStyle = color; context.lineWidth = width; context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
}
function label(text, x, y, color = '#6a8058', size = 10) {
  context.fillStyle = color; context.font = `600 ${size}px 'DM Sans', sans-serif`; context.textAlign = 'center'; context.fillText(text, x, y);
}
function pineCrown(x, y, scale = 1, dangerous = false) {
  const colors = dangerous ? ['#365b50', '#46705b', '#5b8064'] : ['#244d45', '#326351', '#427960'];
  for (let tier = 0; tier < 3; tier++) {
    const width = (35 - tier * 9) * scale;
    const bottom = y - tier * 19 * scale;
    const tip = bottom - (45 - tier * 3) * scale;
    context.fillStyle = colors[tier];
    context.beginPath();
    context.moveTo(x, tip);
    context.lineTo(x + width, bottom);
    context.lineTo(x + width * .45, bottom - 4 * scale);
    context.lineTo(x, bottom + 3 * scale);
    context.lineTo(x - width * .45, bottom - 4 * scale);
    context.lineTo(x - width, bottom);
    context.closePath(); context.fill();
    context.fillStyle = '#102e3340';
    context.beginPath(); context.moveTo(x, tip); context.lineTo(x + width, bottom);
    context.lineTo(x, bottom + 3 * scale); context.closePath(); context.fill();
  }
}
function drawYard() {
  rectangle(0, 0, 960, 640, '#243e40');
  rectangle(0, 568, 960, 72, '#47575a');
  rectangle(0, 583, 960, 57, '#2d3d43');
  for (let x = 20; x < 960; x += 110) rectangle(x, 610, 56, 3, '#84928d');
  rectangle(79, 64, 802, 507, '#38534c', 12);
  rectangle(130, 117, 700, 420, '#4b6451', 6);
  for (let row = 0; row < 10; row++) rectangle(132, 120 + row * 42, 696, 21, '#48614e');
  for (let index = 0; index < 170; index++) {
    const x = 147 + (index * 131 % 663); const y = 129 + (index * 83 % 395);
    if (insideHouse(x, y, 15)) continue;
    line(x, y, x - 2, y - 4, '#70816b50'); line(x, y, x + 3, y - 3, '#70816b50');
  }
  for (const [x, y, width] of [[310, 210, 25], [683, 322, 34], [331, 460, 29], [574, 505, 18], [777, 459, 23]]) {
    ellipse(x, y, width, 7, '#78939524');
    line(x - width * .5, y - 1, x + width * .6, y - 1, '#a2b7aa35');
    const ripple = (weatherTime * .7 + x) % 1;
    context.strokeStyle = '#a7c0be35'; context.lineWidth = 1;
    context.beginPath(); context.ellipse(x + 4, y, 2 + ripple * 11, 1 + ripple * 3, 0, 0, Math.PI * 2); context.stroke();
  }
  rectangle(453, 400, 56, 165, '#879083');
  for (let y = 419; y < 560; y += 24) line(455, y, 506, y, '#657569', 2);
  for (let x = 132; x < 832; x += 22) { rectangle(x, 110, 9, 17, '#a6af97', 2); rectangle(x, 532, 9, 17, '#a6af97', 2); }
  line(130, 118, 830, 118, '#839581', 4); line(130, 540, 445, 540, '#839581', 4); line(517, 540, 830, 540, '#839581', 4);
  for (let y = 126; y < 537; y += 22) { rectangle(122, y, 16, 9, '#a6af97', 2); rectangle(824, y, 16, 9, '#a6af97', 2); }
  line(130, 117, 130, 540, '#839581', 4); line(832, 117, 832, 540, '#839581', 4);
  rectangle(155, 471, 42, 39, '#9cae7f', 4); rectangle(154, 465, 44, 12, '#708966', 2);
  label('COMPOST', 177, 492, '#dee5cb', 6);
  rectangle(771, 148, 33, 42, '#dec4a1', 3); rectangle(765, 143, 45, 13, '#7d9271', 3); rectangle(785, 167, 10, 23, '#8ba17b', 1);
  rectangle(526, 550, 5, 20, '#748765'); rectangle(517, 544, 24, 14, '#d4ad73', 3); label('42', 529, 555, '#4e6445', 8);
  for (let index = 0; index < 17; index++) {
    const x = 65 + index * 53;
    line(x, 82, x, 57, '#223c36', 5);
    pineCrown(x, 60 + Math.sin(index * 8) * 7, .65);
  }
  label('WILLOW LANE', 715, 627, '#c0cfc4', 11);
}
function drawHouse() {
  rectangle(house.x + 10, house.y + 14, house.width + 8, house.height + 5, '#70865d45', 7);
  rectangle(384, 267, 192, 139, '#e4d6b3', 3);
  rectangle(421, 393, 121, 19, '#e8dcc0', 3);
  rectangle(465, 385, 31, 27, '#7c8c72', 2);
  rectangle(380, 247, 200, 141, '#766e68', 4);
  context.fillStyle = '#8d8171'; context.beginPath(); context.moveTo(377, 247); context.lineTo(479, 217); context.lineTo(584, 247); context.lineTo(479, 315); context.closePath(); context.fill();
  context.fillStyle = '#595c5c'; context.beginPath(); context.moveTo(479, 315); context.lineTo(584, 247); context.lineTo(584, 387); context.lineTo(479, 399); context.closePath(); context.fill();
  context.save(); context.beginPath(); context.rect(384, 250, 194, 137); context.clip();
  for (let y = 264; y < 390; y += 14) line(384, y, 578, y + 8, '#8f554931', 1);
  context.restore();
  line(479, 223, 479, 395, '#aaa18b', 5);
  context.save(); context.shadowColor = '#ffcf78'; context.shadowBlur = 18;
  rectangle(413, 268, 28, 24, '#bcb79a', 2); rectangle(417, 272, 20, 16, '#efc57b', 1);
  context.restore(); line(427, 272, 427, 288, '#9b815a', 2);
  const porchLight = context.createRadialGradient(481, 407, 3, 481, 407, 55);
  porchLight.addColorStop(0, '#f6d88e50'); porchLight.addColorStop(1, '#f6d88e00');
  context.fillStyle = porchLight; context.fillRect(426, 352, 110, 110);
  ellipse(481, 406, 3, 3, '#ffe5a2');
  rectangle(534, 255, 21, 32, '#8a7162', 2); rectangle(530, 253, 28, 9, '#d3bea0', 2);
  if (state.health < 100) {
    const count = Math.ceil((100 - state.health) / 20);
    for (let index = 0; index < count; index++) {
      const x = 400 + index * 35; const y = 328 + (index % 2) * 20;
      line(x, y, x + 14, y + 8, '#674f40', 3); line(x + 14, y + 8, x + 6, y + 19, '#674f40', 3); line(x + 6, y + 19, x + 20, y + 30, '#674f40', 3);
    }
  }
  label('HOME SWEET HOME', 480, 437, '#d1d3b4', 8);
}
function drawTree(tree) {
  const { x, y } = tree;
  ellipse(x + 15, y + 7, tree.status === 'standing' ? 34 : 16, 12, '#122c3355');
  if (tree.status === 'stump' || tree.status === 'sapling') {
    rectangle(x - 9, y - 5, 18, 13, '#92765a', 3); ellipse(x, y - 5, 10, 5, '#d3af7b'); ellipse(x, y - 5, 5, 2.5, '#b98f60');
    if (tree.status === 'sapling') { line(x, y - 4, x, y - 14, '#8b9568', 3); pineCrown(x, y - 9, .28); }
  } else {
    const dangerous = tree.danger > .65;
    const fallProgress = tree.status === 'falling' ? tree.fall / 1.4 : 0;
    const direction = Math.atan2(325 - y, 480 - x);
    const lean = tree.status === 'falling' ? (Math.hypot(480 - x, 325 - y) - 35) * fallProgress * fallProgress : Math.max(0, tree.danger - .55) * 40;
    const wind = Math.sin(weatherTime * .7) * 2 + Math.sin(weatherTime * 2.1 + tree.index) * 2;
    const sway = dangerous ? Math.sin(state.elapsed * 7 + tree.index) * 3 + wind : wind;
    const topX = x + Math.cos(direction) * lean + sway;
    const topY = y - 33 + Math.sin(direction) * lean;
    line(x, y, topX, topY, '#8b7354', 11); line(x - 2, y, topX - 2, topY, '#ad9265', 3);
    pineCrown(topX, topY + 4, 1 + tree.index % 3 * .08, dangerous);
    if (dangerous || tree.status === 'falling') {
      ellipse(topX + 24, topY - 45, 11, 11, tree.danger > .85 ? '#c66f46' : '#dbac59'); label('!', topX + 24, topY - 40, '#fff7db', 15);
      rectangle(x - 20, y + 15, 40, 4, '#78905766', 2); rectangle(x - 20, y + 15, 40 * Math.min(1, tree.danger), 4, '#c1844d', 2);
    }
  }
  if (tree === actionTarget && state.mode === 'playing') {
    context.strokeStyle = '#fff7d6'; context.lineWidth = 2; context.setLineDash([4, 5]); context.beginPath(); context.ellipse(x, y + 1, 24, 13, 0, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
    const progress = tree.status === 'standing' ? tree.cut : tree.plant;
    if (progress > 0) { rectangle(x - 24, y + 24, 48, 6, '#294b36', 3); rectangle(x - 23, y + 25, 46 * progress, 4, '#efd387', 2); }
    else if (tree.status !== 'sapling') label(tree.status === 'standing' ? 'HOLD SPACE' : 'HOLD E', x, y + 32, '#e6e3bd', 8);
  }
}
function drawSight(officer) {
  context.beginPath(); context.moveTo(officer.x, officer.y);
  for (let angle = officer.facing - .65; angle <= officer.facing + .65; angle += .025) {
    let radius = 245;
    for (let step = 8; step < 245; step += 8) {
      if (insideHouse(officer.x + Math.cos(angle) * step, officer.y + Math.sin(angle) * step)) { radius = step; break; }
    }
    context.lineTo(officer.x + Math.cos(angle) * radius, officer.y + Math.sin(angle) * radius);
  }
  context.closePath(); context.fillStyle = state.spotted && state.player.action === 1 ? '#df915a35' : '#f9dc7438'; context.fill();
}
function drawPerson(person, council = false) {
  ellipse(person.x + 3, person.y + 5, 11, 6, '#435b432f');
  context.save(); context.translate(person.x, person.y); context.rotate(person.facing + Math.PI / 2);
  const walking = state.mode === 'playing' && (council || ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(key => keys.has(key)));
  const stride = walking ? Math.sin(state.elapsed * 13) * 3 : 0;
  rectangle(-7, 2 + stride, 5, 11, '#4c594d', 2); rectangle(2, 2 - stride, 5, 11, '#4c594d', 2);
  rectangle(-11, -8, 22, 18, council ? '#5c8491' : '#e4c172', 6);
  ellipse(0, -8, 7, 7, '#dcbb8a'); ellipse(0, -11, 9, 5, council ? '#355565' : '#926c48');
  if (council) { rectangle(8, -8, 10, 13, '#d8dbc8', 1); rectangle(10, -6, 6, 2, '#8a9580'); }
  else if (person.action === 1) { rectangle(8, -19, 9, 15, '#ce7142', 3); rectangle(10, -32, 5, 17, '#e3dfcb', 2); }
  else if (person.action === 2) { line(10, -4, 13, -24, '#866c4a', 3); ellipse(13, -27, 5, 7, '#b6c0a9'); }
  context.restore();
  if (council) label('COUNCIL', person.x, person.y + 28, '#cad8c7', 7);
  else { label('YOU', person.x, person.y + 28, '#f2e6b4', 8); if (keys.has('Shift')) label('sneaking', person.x, person.y + 39, '#c1d0ac', 7); }
}
function drawWeather() {
  const gust = .5 + Math.sin(weatherTime * .45) * .5;
  // Broad, faint fog banks keep the hazards and sight cones readable.
  for (let index = 0; index < 5; index++) {
    const x = ((index * 257 + weatherTime * (9 + index * 2)) % 1400) - 220;
    const y = 110 + index * 114 + Math.sin(weatherTime * .2 + index) * 18;
    context.save(); context.translate(x, y); context.scale(2.9, .6);
    const fog = context.createRadialGradient(0, 0, 5, 0, 0, 100);
    fog.addColorStop(0, '#c0d7d523'); fog.addColorStop(1, '#c0d7d500');
    context.fillStyle = fog; context.fillRect(-100, -100, 200, 200); context.restore();
  }
  for (let index = 0; index < 135; index++) {
    const x = ((index * 137 - weatherTime * (80 + gust * 35)) % 1100 + 1100) % 1100 - 70;
    const y = (index * 79 + weatherTime * (340 + index % 5 * 18)) % 720 - 40;
    line(x, y, x - 5 - gust * 5, y + 13 + gust * 6, index % 3 === 0 ? '#b4ced33c' : '#9bb9c526', 1);
  }
  const vignette = context.createRadialGradient(480, 310, 150, 480, 310, 550);
  vignette.addColorStop(0, '#081b2b00'); vignette.addColorStop(1, '#081b2b80');
  context.fillStyle = vignette; context.fillRect(0, 0, 960, 640);
  const lightningPhase = weatherTime % 23;
  if (!reducedMotion && lightningPhase > 17 && lightningPhase < 17.8) {
    const brightness = Math.sin((lightningPhase - 17) / .8 * Math.PI) * .13;
    context.fillStyle = `rgba(200, 222, 238, ${brightness})`;
    context.fillRect(0, 0, 960, 640);
  }
}
function draw() {
  context.save();
  if (state.shake) context.translate((Math.random() - .5) * 9, (Math.random() - .5) * 9);
  drawYard();
  state.officers.forEach(drawSight);
  const objects = state.trees.map(tree => ({ y: tree.y, draw: () => drawTree(tree) }));
  objects.push({ y: 405, draw: drawHouse }, { y: state.player.y, draw: () => drawPerson(state.player) });
  objects.sort((first, second) => first.y - second.y).forEach(object => object.draw());
  state.officers.forEach(officer => drawPerson(officer, true));
  for (const particle of state.particles) { context.globalAlpha = Math.min(1, particle.life * 2); rectangle(particle.x, particle.y, 4, 4, particle.color, 1); }
  context.globalAlpha = 1;
  drawWeather();
  context.restore();
}
document.getElementById('start').addEventListener('click', start);
elements.pause.addEventListener('click', pause);
document.getElementById('sound').addEventListener('click', event => {
  soundEnabled = !soundEnabled;
  event.currentTarget.textContent = soundEnabled ? '♪ Sound on' : '♪ Sound off';
  event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
  if (soundEnabled) tone(480, .12);
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'w', 'a', 's', 'd', 'e', 'p'].includes(key)) {
    if (state.mode === 'playing' || state.mode === 'paused') event.preventDefault();
    if (key === 'p' && !event.repeat) pause(); else keys.add(key);
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('blur', () => { keys.clear(); if (state.mode === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'playing') pause(); });
for (const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.key); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(button.dataset.key));
}
reset();
function frame(timestamp) {
  const delta = Math.min(.05, (timestamp - lastFrame) / 1000 || 0);
  lastFrame = timestamp;
  if (!reducedMotion && (state.mode === 'playing' || state.mode === 'intro')) weatherTime += delta;
  update(delta); draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
