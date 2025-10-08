const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const scoreValue = document.getElementById('score-value');
const highScoreValue = document.getElementById('high-score-value');
const startButton = document.getElementById('start-button');
const pauseButton = document.getElementById('pause-button');
const modeSelect = document.getElementById('mode-select');
const speedInput = document.getElementById('speed-input');
const speedLabel = document.getElementById('speed-label');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const overlayButton = document.getElementById('overlay-button');

const CELL_SIZE = 32;
const GRID_SIZE = canvas.width / CELL_SIZE;
const MIN_SPEED_INTERVAL = 55;
const MAX_SPEED_INTERVAL = 220;
const SPEED_LEVEL_MIN = 1;
const SPEED_LEVEL_MAX = 10;
const SPEED_ACCELERATION = 2.5;
const BONUS_SPAWN_CHANCE = 0.35;
const BONUS_MIN_GAP_STEPS = 8;
const BONUS_DURATION_STEPS = 32;
const BONUS_INITIAL_COOLDOWN = 6;
const BONUS_TYPES = [
  {
    kind: 'points',
    score: 30,
    colors: ['rgba(255, 215, 99, 0.95)', 'rgba(255, 111, 97, 0.95)'],
    glow: 'rgba(255, 183, 0, 0.65)',
    outline: 'rgba(255, 245, 224, 0.8)',
    label: '★',
  },
  {
    kind: 'growth',
    growth: 3,
    colors: ['rgba(110, 245, 255, 0.95)', 'rgba(186, 110, 255, 0.95)'],
    glow: 'rgba(186, 110, 255, 0.55)',
    outline: 'rgba(230, 215, 255, 0.75)',
    label: '⇑',
  },
];
const isTouchDevice =
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

const directions = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

const settings = {
  mode: modeSelect.value,
  speedLevel: Number(speedInput.value),
};

let state = createInitialState();
let highScore = Number(localStorage.getItem('snake-high-score') || '0');
let animationFrameId = null;
let lastFrameTime = 0;
let accumulatedTime = 0;
let paused = false;
let touchStart = null;

highScoreValue.textContent = highScore.toString();

function attemptFullscreen() {
  if (!isTouchDevice) {
    return;
  }

  if (document.fullscreenElement) {
    return;
  }

  const element = document.documentElement;
  const requestFullscreen =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullscreen;

  if (typeof requestFullscreen !== 'function') {
    return;
  }

  try {
    const result = requestFullscreen.call(element);
    if (result instanceof Promise) {
      result.catch(() => {});
    }
  } catch (error) {
    // Ignore failures — browsers may block the request if the user dismisses it.
  }
}

function levelToInterval(level) {
  const clamped = Math.min(Math.max(level, SPEED_LEVEL_MIN), SPEED_LEVEL_MAX);
  const ratio =
    SPEED_LEVEL_MAX === SPEED_LEVEL_MIN
      ? 0
      : (clamped - SPEED_LEVEL_MIN) / (SPEED_LEVEL_MAX - SPEED_LEVEL_MIN);
  const interval = Math.round(
    MAX_SPEED_INTERVAL - ratio * (MAX_SPEED_INTERVAL - MIN_SPEED_INTERVAL),
  );
  return Math.max(MIN_SPEED_INTERVAL, Math.min(MAX_SPEED_INTERVAL, interval));
}

function updateSpeedLabel() {
  const interval = levelToInterval(settings.speedLevel);
  const descriptor = settings.mode === 'constant' ? 'Constant speed' : 'Starting speed';
  speedLabel.textContent = `${descriptor}: Level ${settings.speedLevel} (${interval} ms / move)`;
}

function applySettingsToState() {
  const interval = levelToInterval(settings.speedLevel);
  state.mode = settings.mode;
  if (!state.running || state.mode === 'constant') {
    state.baseSpeed = interval;
    state.speed = interval;
  }
}

function createInitialState() {
  const center = Math.floor(GRID_SIZE / 2);
  const baseSpeed = levelToInterval(settings.speedLevel);
  return {
    snake: [
      { x: center + 1, y: center },
      { x: center, y: center },
      { x: center - 1, y: center },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: spawnFood(
      [
        { x: center + 1, y: center },
        { x: center, y: center },
        { x: center - 1, y: center },
      ],
    ),
    bonus: null,
    bonusTimer: BONUS_INITIAL_COOLDOWN,
    pendingGrowth: 0,
    score: 0,
    speed: baseSpeed,
    baseSpeed,
    mode: settings.mode,
    running: false,
  };
}

function spawnFood(snake, blocked = []) {
  return findAvailableCell([...snake, ...blocked]) ?? { x: 0, y: 0 };
}

function findAvailableCell(occupied) {
  const available = [];
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      const cellOccupied = occupied.some(
        (segment) => segment && segment.x === x && segment.y === y,
      );
      if (!cellOccupied) {
        available.push({ x, y });
      }
    }
  }

  if (available.length === 0) {
    return null;
  }

  return available[Math.floor(Math.random() * available.length)];
}

function spawnBonus(occupied) {
  const position = findAvailableCell(occupied);
  if (!position) {
    return null;
  }

  const type = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  return {
    position,
    type,
    remainingSteps: BONUS_DURATION_STEPS,
  };
}

function resetGame({ keepExpandedLayout = false } = {}) {
  if (!keepExpandedLayout) {
    document.body.classList.remove('game-active');
  }
  state = createInitialState();
  updateScoreboard();
  draw();
  showOverlay(
    'Press Start',
    'Choose a speed mode above, then use the arrow keys, WASD, or swipe on mobile to guide the snake. On phones, allow fullscreen for the smoothest controls.',
    'Play',
  );
}

function updateScoreboard() {
  scoreValue.textContent = state.score.toString();
  highScoreValue.textContent = highScore.toString();
}

function startGame() {
  attemptFullscreen();
  if (state.running) {
    return;
  }
  document.body.classList.add('game-active');
  state.running = true;
  paused = false;
  overlay.classList.add('hidden');
  lastFrameTime = performance.now();
  accumulatedTime = 0;
  cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (!state.running) {
    return;
  }
  paused = !paused;
  if (paused) {
    showOverlay('Paused', 'Tap resume or press Space to keep going.', 'Resume');
    cancelAnimationFrame(animationFrameId);
  } else {
    overlay.classList.add('hidden');
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function endGame() {
  state.running = false;
  cancelAnimationFrame(animationFrameId);
  if (state.score > highScore) {
    highScore = state.score;
    localStorage.setItem('snake-high-score', String(highScore));
  }
  updateScoreboard();
  showOverlay('Game Over', 'Your neon snake crashed. Ready for another run?', 'Play Again');
}

function gameLoop(timestamp) {
  animationFrameId = requestAnimationFrame(gameLoop);
  const delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  accumulatedTime += delta;

  while (accumulatedTime >= state.speed) {
    accumulatedTime -= state.speed;
    step();
  }

  draw(delta / state.speed);
}

function step() {
  if (state.bonus) {
    state.bonus.remainingSteps -= 1;
    if (state.bonus.remainingSteps <= 0) {
      state.bonus = null;
      state.bonusTimer = BONUS_MIN_GAP_STEPS;
    }
  } else {
    if (state.bonusTimer > 0) {
      state.bonusTimer -= 1;
    }
    if (!state.bonus && state.bonusTimer <= 0) {
      const shouldSpawn = Math.random() < BONUS_SPAWN_CHANCE;
      const occupied = [...state.snake, state.food];
      const bonus = shouldSpawn ? spawnBonus(occupied) : null;
      if (bonus) {
        state.bonus = bonus;
        state.bonusTimer = BONUS_MIN_GAP_STEPS;
      } else {
        state.bonusTimer = BONUS_MIN_GAP_STEPS;
      }
    }
  }

  state.direction = state.nextDirection;
  const newHead = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y,
  };

  newHead.x = (newHead.x + GRID_SIZE) % GRID_SIZE;
  newHead.y = (newHead.y + GRID_SIZE) % GRID_SIZE;

  if (isCollision(newHead)) {
    endGame();
    return;
  }

  state.snake.unshift(newHead);

  if (newHead.x === state.food.x && newHead.y === state.food.y) {
    state.score += 10;
    state.pendingGrowth += 1;
    state.food = spawnFood(state.snake, state.bonus ? [state.bonus.position] : []);
    if (state.mode === 'progressive') {
      state.speed = Math.max(MIN_SPEED_INTERVAL, state.speed - SPEED_ACCELERATION);
    } else {
      state.speed = state.baseSpeed;
    }
    pulseBoard();
  } else if (state.bonus && newHead.x === state.bonus.position.x && newHead.y === state.bonus.position.y) {
    const { type } = state.bonus;
    if (type.kind === 'points') {
      state.score += type.score;
    }
    if (type.kind === 'growth') {
      state.pendingGrowth += type.growth;
      pulseBoard();
    }
    state.bonus = null;
    state.bonusTimer = BONUS_MIN_GAP_STEPS;
  }

  if (state.pendingGrowth > 0) {
    state.pendingGrowth -= 1;
  } else {
    state.snake.pop();
  }

  updateScoreboard();
}

function isCollision(position) {
  return state.snake.some((segment) => segment.x === position.x && segment.y === position.y);
}

function draw(interpolation = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  drawBonus();
  drawSnake(interpolation);
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(239, 243, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const position = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFood() {
  const padding = CELL_SIZE * 0.2;
  const x = state.food.x * CELL_SIZE + padding;
  const y = state.food.y * CELL_SIZE + padding;
  const size = CELL_SIZE - padding * 2;

  const gradient = ctx.createRadialGradient(
    x + size / 2,
    y + size / 2,
    size * 0.1,
    x + size / 2,
    y + size / 2,
    size * 0.6,
  );
  gradient.addColorStop(0, 'rgba(112, 255, 119, 0.95)');
  gradient.addColorStop(1, 'rgba(110, 245, 255, 0.55)');

  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = 'rgba(110, 245, 255, 0.45)';
  ctx.fillStyle = gradient;
  pathRoundedRect(ctx, x, y, size, size, 6);
  ctx.fill();
  ctx.restore();
}

function drawBonus() {
  if (!state.bonus) {
    return;
  }

  const { position, type } = state.bonus;
  const basePadding = CELL_SIZE * 0.2;
  const baseSize = CELL_SIZE - basePadding * 2;
  const time = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pulse = 1 + Math.sin(time / 220) * 0.08;
  const size = baseSize * pulse;
  const x = position.x * CELL_SIZE + (CELL_SIZE - size) / 2;
  const y = position.y * CELL_SIZE + (CELL_SIZE - size) / 2;

  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, type.colors[0]);
  gradient.addColorStop(1, type.colors[1]);

  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = type.glow;
  ctx.fillStyle = gradient;
  pathRoundedRect(ctx, x, y, size, size, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = type.outline;
  pathRoundedRect(ctx, x, y, size, size, 10);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(5, 10, 16, 0.85)';
  ctx.font = '600 18px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(type.label, x + size / 2, y + size / 2 + 1);

  ctx.restore();
}

function drawSnake(interpolation) {
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = 'rgba(255, 110, 196, 0.35)';

  for (let i = state.snake.length - 1; i >= 0; i -= 1) {
    const segment = state.snake[i];
    const nextSegment = state.snake[i - 1];
    let drawX = segment.x * CELL_SIZE;
    let drawY = segment.y * CELL_SIZE;

    if (nextSegment && interpolation) {
      drawX += (nextSegment.x - segment.x) * interpolation * CELL_SIZE * 0.25;
      drawY += (nextSegment.y - segment.y) * interpolation * CELL_SIZE * 0.25;
    }

    const padding = i === 0 ? CELL_SIZE * 0.15 : CELL_SIZE * 0.2;
    const size = CELL_SIZE - padding * 2;
    const x = drawX + padding;
    const y = drawY + padding;

    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    if (i === 0) {
      gradient.addColorStop(0, 'rgba(255, 110, 196, 0.95)');
      gradient.addColorStop(1, 'rgba(110, 245, 255, 0.95)');
    } else {
      const alpha = Math.max(0.35, 1 - i / 25);
      gradient.addColorStop(0, `rgba(255, 110, 196, ${alpha})`);
      gradient.addColorStop(1, `rgba(110, 245, 255, ${alpha - 0.1})`);
    }

    ctx.fillStyle = gradient;
    pathRoundedRect(ctx, x, y, size, size, i === 0 ? 10 : 8);
    ctx.fill();

    if (i === 0) {
      drawEyes(x, y, size);
    }
  }

  ctx.restore();
}

function drawEyes(x, y, size) {
  const eyeSize = size * 0.2;
  const offsetX = state.direction.x !== 0 ? (state.direction.x * size) / 4 : 0;
  const offsetY = state.direction.y !== 0 ? (state.direction.y * size) / 4 : 0;
  const baseX = x + size / 2 - eyeSize / 2 + offsetX;
  const baseY = y + size / 2 - eyeSize / 2 + offsetY;

  ctx.save();
  ctx.fillStyle = '#050a10';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(baseX - eyeSize * 0.55, baseY - eyeSize * 0.2, eyeSize / 2.5, 0, Math.PI * 2);
  ctx.arc(baseX + eyeSize * 0.55, baseY - eyeSize * 0.2, eyeSize / 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function handleKeyDown(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    if (!state.running) {
      startGame();
    } else {
      pauseGame();
    }
    return;
  }

  const next = directions[event.code];
  if (!next) {
    return;
  }

  const isOpposite = state.direction.x + next.x === 0 && state.direction.y + next.y === 0;
  if (isOpposite && state.snake.length > 1) {
    return;
  }

  state.nextDirection = next;
}

function showOverlay(title, message, buttonLabel) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlayButton.textContent = buttonLabel;
  overlay.classList.remove('hidden');
}

function pulseBoard() {
  canvas.classList.remove('pulse');
  void canvas.offsetWidth;
  canvas.classList.add('pulse');
}

function registerTouchControls() {
  canvas.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 0) {
        return;
      }
      event.preventDefault();
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (event) => {
      if (!touchStart) {
        return;
      }
      event.preventDefault();
      const touch = event.touches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) < 24) return;

      if (absX > absY) {
        state.nextDirection = dx > 0 ? directions.ArrowRight : directions.ArrowLeft;
      } else {
        state.nextDirection = dy > 0 ? directions.ArrowDown : directions.ArrowUp;
      }

      touchStart = null;
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchend',
    (event) => {
      event.preventDefault();
      touchStart = null;
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchcancel',
    (event) => {
      event.preventDefault();
      touchStart = null;
    },
    { passive: false },
  );
}

startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', pauseGame);
modeSelect.addEventListener('change', () => {
  settings.mode = modeSelect.value;
  updateSpeedLabel();
  applySettingsToState();
});
speedInput.addEventListener('input', () => {
  settings.speedLevel = Number(speedInput.value);
  updateSpeedLabel();
  applySettingsToState();
});
overlayButton.addEventListener('click', () => {
  if (!state.running) {
    resetGame({ keepExpandedLayout: true });
    startGame();
  } else {
    pauseGame();
  }
});

document.addEventListener('keydown', handleKeyDown);
registerTouchControls();
resetGame();
updateSpeedLabel();

// Visual pulse when eating food
const style = document.createElement('style');
style.textContent = `
  @keyframes boardPulse {
    0% { box-shadow: inset 0 0 0 1px rgba(110, 245, 255, 0.05); }
    50% { box-shadow: inset 0 0 0 8px rgba(110, 245, 255, 0.25); }
    100% { box-shadow: inset 0 0 0 1px rgba(110, 245, 255, 0.05); }
  }
  canvas.pulse {
    animation: boardPulse 320ms ease;
  }
`;
document.head.append(style);

function pathRoundedRect(context, x, y, width, height, radius) {
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
    for (const side of Object.keys(defaultRadius)) {
      radius[side] = radius[side] || defaultRadius[side];
    }
  }

  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, width, height, [radius.tl, radius.tr, radius.br, radius.bl]);
    return;
  }

  context.beginPath();
  context.moveTo(x + radius.tl, y);
  context.lineTo(x + width - radius.tr, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  context.lineTo(x + width, y + height - radius.br);
  context.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  context.lineTo(x + radius.bl, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  context.lineTo(x, y + radius.tl);
  context.quadraticCurveTo(x, y, x + radius.tl, y);
}
