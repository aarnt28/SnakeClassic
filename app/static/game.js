const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const scoreValue = document.getElementById('score-value');
const highScoreValue = document.getElementById('high-score-value');
const startButton = document.getElementById('start-button');
const pauseButton = document.getElementById('pause-button');
const modeSelect = document.getElementById('mode-select');
const difficultySelect = document.getElementById('difficulty-select');
const playerNameInput = document.getElementById('player-name-input');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const overlayButton = document.getElementById('overlay-button');
const introLeaderboardList = document.getElementById('intro-leaderboard');
const postgameLeaderboardList = document.getElementById('postgame-leaderboard');
const settingsForm = document.getElementById('settings-form');
const settingsBackButton = document.getElementById('settings-back-button');
const playAgainButton = document.getElementById('play-again-button');
const difficultyDescription = document.getElementById('difficulty-description');
const introPanel = document.getElementById('intro-panel');
const settingsPanel = document.getElementById('settings-panel');
const postGamePanel = document.getElementById('postgame-panel');

const CELL_SIZE = 32;
const GRID_SIZE = canvas.width / CELL_SIZE;
const MIN_SPEED_INTERVAL = 55;
const MAX_SPEED_INTERVAL = 220;
const SPEED_LEVEL_MIN = 1;
const SPEED_LEVEL_MAX = 10;
const SPEED_ACCELERATION = 2.5;
const DEFAULT_BONUS_DURATION_STEPS = 32;
const DEFAULT_BONUS_MIN_GAP_STEPS = 8;
const DEFAULT_BONUS_INITIAL_COOLDOWN = 6;
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

const DIFFICULTY_CONFIG = {
  easy: {
    label: 'Easy',
    speedLevel: 3,
    bonusChance: 0.65,
    bonusMinGapSteps: 4,
    bonusInitialCooldown: 3,
    bonusDurationSteps: 40,
    bonusValueMultiplier: 1,
    obstacleCount: 0,
    obstacleChangeInterval: Infinity,
    basePoints: 10,
  },
  medium: {
    label: 'Medium',
    speedLevel: 6,
    bonusChance: 0.38,
    bonusMinGapSteps: 6,
    bonusInitialCooldown: 5,
    bonusDurationSteps: 36,
    bonusValueMultiplier: 1.15,
    obstacleCount: 4,
    obstacleChangeInterval: 15,
    basePoints: 25,
  },
  hard: {
    label: 'Hard',
    speedLevel: 9,
    bonusChance: 0.38,
    bonusMinGapSteps: 6,
    bonusInitialCooldown: 5,
    bonusDurationSteps: 30,
    bonusValueMultiplier: 1.5,
    obstacleCount: 12,
    obstacleChangeInterval: 10,
    basePoints: 30,
  },
};

const DIFFICULTY_DESCRIPTIONS = {
  easy:
    'A relaxed pace: fruit is worth 10 points, bonuses drop often, and there are no obstacles in your way.',
  medium:
    'Balanced speed: fruit earns 25 points, bonuses arrive steadily, and a few obstacles reshuffle every 15 fruits.',
  hard:
    'High intensity: fruit pays 30 points, bonuses hit harder, and dense obstacle fields shift frequently.',
};

const settings = {
  mode: modeSelect ? modeSelect.value : 'progressive',
  difficulty: difficultySelect ? difficultySelect.value : 'easy',
  playerName: '',
};

const UI_STATES = {
  INTRO: 'intro',
  SETTINGS: 'settings',
  RUNNING: 'running',
  POSTGAME: 'postgame',
};

const LEADERBOARD_STORAGE_KEY = 'snake-leaderboard';
const LEGACY_HIGH_SCORE_KEY = 'snake-high-score';
const PLAYER_NAME_STORAGE_KEY = 'snake-player-name';
const LEADERBOARD_MAX_ENTRIES = 100;
const LEADERBOARD_TOP_DISPLAY_COUNT = 10;

let uiState = UI_STATES.INTRO;
let leaderboard = loadLeaderboard();
let state = createInitialState();
let animationFrameId = null;
let lastFrameTime = 0;
let accumulatedTime = 0;
let paused = false;
let touchStart = null;

settings.playerName = loadStoredPlayerName();
if (playerNameInput) {
  playerNameInput.value = settings.playerName;
}
if (difficultySelect) {
  settings.difficulty = difficultySelect.value;
}
if (modeSelect) {
  settings.mode = modeSelect.value;
}
updateDifficultyDescription();

function setUIState(next) {
  uiState = next;
  document.body.dataset.uiState = next;
  const shouldExpand = next === UI_STATES.RUNNING;
  document.body.classList.toggle('game-active', shouldExpand);

  if (introPanel) {
    introPanel.classList.toggle('hidden', next !== UI_STATES.INTRO);
  }
  if (settingsPanel) {
    settingsPanel.classList.toggle('hidden', next !== UI_STATES.SETTINGS);
  }
  if (postGamePanel) {
    postGamePanel.classList.toggle('hidden', next !== UI_STATES.POSTGAME);
  }

  if (next === UI_STATES.SETTINGS) {
    updateDifficultyDescription();
    if (playerNameInput) {
      playerNameInput.focus();
    }
  }
}

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

function applySettingsToState() {
function getDifficultyConfig(difficulty) {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
}

function updateDifficultyDescription() {
  if (!difficultyDescription) {
    return;
  }
  const config = getDifficultyConfig(settings.difficulty);
  difficultyDescription.textContent = DIFFICULTY_DESCRIPTIONS[settings.difficulty] || '';
  if (difficultyDescription.dataset.speedInterval !== String(config.speedLevel)) {
    difficultyDescription.dataset.speedInterval = String(config.speedLevel);
  }
}

function applySettingsToState() {
  const config = getDifficultyConfig(settings.difficulty);
  const interval = levelToInterval(config.speedLevel);
  state.mode = settings.mode;
  state.difficulty = settings.difficulty;
  state.bonusChance = config.bonusChance;
  state.bonusMinGapSteps = config.bonusMinGapSteps ?? DEFAULT_BONUS_MIN_GAP_STEPS;
  state.bonusDurationSteps = config.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS;
  state.bonusValueMultiplier = config.bonusValueMultiplier ?? 1;
  state.obstacleBaseCount = config.obstacleCount ?? 0;
  state.obstacleCount = config.obstacleCount ?? 0;
  state.obstacleChangeInterval = config.obstacleChangeInterval ?? Infinity;
  state.foodPoints = config.basePoints;
  if (!state.running || state.mode === 'constant') {
    state.baseSpeed = interval;
    state.speed = interval;
  }
}

function createInitialState() {
  const config = getDifficultyConfig(settings.difficulty);
  const center = Math.floor(GRID_SIZE / 2);
  const baseSpeed = levelToInterval(config.speedLevel);
  const snake = [
    { x: center + 1, y: center },
    { x: center, y: center },
    { x: center - 1, y: center },
  ];
  const food = spawnFood(snake);
  const obstacles =
    config.obstacleCount > 0
      ? generateObstacles(config.obstacleCount, [...snake, food])
      : [];

  return {
    snake,
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food,
    bonus: null,
    bonusTimer: config.bonusInitialCooldown ?? DEFAULT_BONUS_INITIAL_COOLDOWN,
    bonusDurationSteps: config.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS,
    bonusChance: config.bonusChance,
    bonusMinGapSteps: config.bonusMinGapSteps ?? DEFAULT_BONUS_MIN_GAP_STEPS,
    bonusValueMultiplier: config.bonusValueMultiplier ?? 1,
    pendingGrowth: 0,
    score: 0,
    speed: baseSpeed,
    baseSpeed,
    mode: settings.mode,
    running: false,
    difficulty: settings.difficulty,
    foodPoints: config.basePoints,
    foodEaten: 0,
    obstacles,
    obstacleCount: config.obstacleCount ?? 0,
    obstacleBaseCount: config.obstacleCount ?? 0,
    obstacleChangeInterval: config.obstacleChangeInterval ?? Infinity,
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

function generateObstacles(count, blocked = []) {
  const obstacles = [];
  for (let i = 0; i < count; i += 1) {
    const obstacle = findAvailableCell([...blocked, ...obstacles]);
    if (!obstacle) {
      break;
    }
    obstacles.push(obstacle);
  }
  return obstacles;
}

function maybeShuffleObstacles() {
  if (!state.obstacleChangeInterval || !Number.isFinite(state.obstacleChangeInterval)) {
    return;
  }
  if (state.obstacleChangeInterval <= 0) {
    return;
  }
  if (state.foodEaten <= 0) {
    return;
  }
  if (state.foodEaten % state.obstacleChangeInterval !== 0) {
    return;
  }

  const config = getDifficultyConfig(state.difficulty);
  let targetCount = config.obstacleCount ?? 0;
  if (state.difficulty === 'hard') {
    const increments = Math.floor(state.foodEaten / state.obstacleChangeInterval);
    targetCount += Math.min(6, increments);
  }

  const blocked = [...state.snake, state.food];
  if (state.bonus) {
    blocked.push(state.bonus.position);
  }
  state.obstacles = generateObstacles(targetCount, blocked);
  state.obstacleCount = targetCount;
}

function spawnBonus(occupied, currentState = state) {
  const position = findAvailableCell(occupied);
  if (!position) {
    return null;
  }

  const type = BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  return {
    position,
    type,
    remainingSteps: currentState.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS,
  };
}

function resetGame({ showIntroOverlay = false } = {}) {
  state = createInitialState();
  applySettingsToState();
  paused = false;
  accumulatedTime = 0;
  cancelAnimationFrame(animationFrameId);
  updateScoreboard();
  draw();
  if (showIntroOverlay) {
    showOverlay(
      'Ready to Play?',
      'Tap Start Game to configure your run. Use arrow keys, WASD, or swipe on mobile to guide the snake.',
      'Got it',
      { buttonAction: 'dismiss' },
    );
  } else {
    overlay.classList.add('hidden');
  }
}

function formatScore(value) {
  return Number.isFinite(value) ? Number(value).toLocaleString() : '0';
}

function updateScoreboard() {
  scoreValue.textContent = formatScore(state.score);
  const topScore = leaderboard[0];
  highScoreValue.textContent = topScore ? formatScore(topScore.score) : '0';
  renderIntroLeaderboard();
}

function saveLeaderboard() {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
  } catch (error) {
    // Ignore storage errors (e.g., Safari private mode).
  }
}

function sanitizeName(value) {
  return (typeof value === 'string' ? value : '').trim().slice(0, 24);
}

function ensureDifficulty(value) {
  return Object.prototype.hasOwnProperty.call(DIFFICULTY_CONFIG, value)
    ? value
    : 'easy';
}

function normalizeLeaderboardEntry(entry) {
  if (!entry) {
    return null;
  }
  const score = Number(entry.score);
  if (!Number.isFinite(score)) {
    return null;
  }
  return {
    name: sanitizeName(entry.name) || 'Anonymous',
    score: Math.max(0, Math.floor(score)),
    difficulty: ensureDifficulty(entry.difficulty),
  };
}

function loadLeaderboard() {
  try {
    const stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeLeaderboardEntry)
          .filter(Boolean)
          .sort((a, b) => b.score - a.score)
          .slice(0, LEADERBOARD_MAX_ENTRIES);
      }
    }
  } catch (error) {
    // Ignore parse or storage errors.
  }

  const legacyScore = Number(localStorage.getItem(LEGACY_HIGH_SCORE_KEY) || '0');
  if (Number.isFinite(legacyScore) && legacyScore > 0) {
    const legacyLeaderboard = [
      {
        name: 'Player',
        score: Math.floor(legacyScore),
        difficulty: 'easy',
      },
    ];
    try {
      localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(legacyLeaderboard));
    } catch (error) {
      // Ignore storage errors.
    }
    return legacyLeaderboard;
  }

  return [];
}

function loadStoredPlayerName() {
  try {
    const stored = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (typeof stored === 'string') {
      return sanitizeName(stored);
    }
  } catch (error) {
    // Ignore storage errors.
  }
  return '';
}

function persistPlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  } catch (error) {
    // Ignore storage errors.
  }
}

function evaluateLeaderboardPlacement(entries, candidate) {
  const taggedCandidate = { ...candidate, __candidate: true };
  const augmented = [...entries.map((entry) => ({ ...entry })), taggedCandidate];
  augmented.sort((a, b) => b.score - a.score);
  const index = augmented.findIndex((entry) => entry.__candidate);
  const rank = index >= 0 ? index + 1 : null;
  const qualifies = typeof rank === 'number' && rank <= LEADERBOARD_MAX_ENTRIES;
  const cleaned = augmented.map(({ __candidate, ...rest }) => rest);
  const updated = qualifies ? cleaned.slice(0, LEADERBOARD_MAX_ENTRIES) : entries;
  const candidateEntry = index >= 0 ? cleaned[index] : null;
  return {
    updated,
    rank,
    qualifies,
    sorted: cleaned,
    candidateEntry,
  };
}

function formatLeaderboardName(entry) {
  const difficultyLabel = getDifficultyConfig(entry.difficulty).label;
  return `${entry.name} (${difficultyLabel})`;
}

function createLeaderboardItem(entry, position, { highlight = false, spaced = false } = {}) {
  const item = document.createElement('li');
  item.className = 'leaderboard-item';
  if (highlight) {
    item.classList.add('current-run');
  }
  if (spaced) {
    item.classList.add('spaced');
  }

  const positionSpan = document.createElement('span');
  positionSpan.className = 'position';
  positionSpan.textContent = Number.isFinite(position) ? `${position}.` : position;
  item.append(positionSpan);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = formatLeaderboardName(entry);
  item.append(nameSpan);

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'score';
  scoreSpan.textContent = formatScore(entry.score);
  item.append(scoreSpan);

  return item;
}

function renderIntroLeaderboard() {
  if (!introLeaderboardList) {
    return;
  }

  introLeaderboardList.innerHTML = '';
  const entries = leaderboard.slice(0, LEADERBOARD_TOP_DISPLAY_COUNT);
  if (entries.length === 0) {
    const placeholder = document.createElement('li');
    placeholder.className = 'leaderboard-item';

    const position = document.createElement('span');
    position.className = 'position';
    position.textContent = '—';
    placeholder.append(position);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'No high scores yet';
    placeholder.append(name);

    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = '—';
    placeholder.append(score);

    introLeaderboardList.append(placeholder);
    return;
  }

  entries.forEach((entry, index) => {
    introLeaderboardList.append(createLeaderboardItem(entry, index + 1));
  });
}

function renderPostGameLeaderboard(topEntries, currentEntry, rank) {
  if (!postgameLeaderboardList) {
    return;
  }

  postgameLeaderboardList.innerHTML = '';
  const seenPositions = new Set();

  if (topEntries.length === 0 && !currentEntry) {
    const placeholder = document.createElement('li');
    placeholder.className = 'leaderboard-item';

    const position = document.createElement('span');
    position.className = 'position';
    position.textContent = '—';
    placeholder.append(position);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'No scores recorded yet';
    placeholder.append(name);

    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = '—';
    placeholder.append(score);

    postgameLeaderboardList.append(placeholder);
  }

  topEntries.forEach((entry, index) => {
    const position = index + 1;
    const highlight = currentEntry && rank === position && entry === currentEntry;
    const item = createLeaderboardItem(entry, position, { highlight });
    postgameLeaderboardList.append(item);
    seenPositions.add(position);
  });

  if (currentEntry && typeof rank === 'number' && !seenPositions.has(rank)) {
    const item = createLeaderboardItem(currentEntry, rank, { highlight: true, spaced: true });
    postgameLeaderboardList.append(item);
  }
}

function startGame() {
  attemptFullscreen();
  if (state.running) {
    return;
  }
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
    showOverlay('Paused', 'Tap resume or press Space to keep going.', 'Resume', {
      buttonAction: 'resume',
    });
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
  updateScoreboard();
  const scoreMessage = `You scored ${formatScore(state.score)} points.`;

  let placement = null;
  let currentEntry = null;
  let rank = null;

  if (state.score > 0) {
    const entryCandidate = {
      name: sanitizeName(settings.playerName) || 'Anonymous',
      score: state.score,
      difficulty: state.difficulty,
    };
    placement = evaluateLeaderboardPlacement(leaderboard, entryCandidate);
    if (placement.qualifies) {
      leaderboard = placement.updated;
      saveLeaderboard();
    }
    rank = placement.rank;
    currentEntry = placement.candidateEntry;
  }

  updateScoreboard();

  const sortedForDisplay = placement ? placement.sorted : leaderboard;
  const topEntries = sortedForDisplay.slice(0, 3);
  renderPostGameLeaderboard(topEntries, currentEntry, rank);

  setUIState(UI_STATES.POSTGAME);

  let message = scoreMessage;
  if (typeof rank === 'number') {
    message += ` You're ranked #${rank}.`;
  } else if (state.score > 0) {
    message += ' Keep going to reach the leaderboard.';
  } else {
    message += ' Try grabbing some fruit to earn points!';
  }

  showOverlay('Game Over', message, 'Continue', { buttonAction: 'postgame' });
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
      state.bonusTimer = state.bonusMinGapSteps;
    }
  } else {
    if (state.bonusTimer > 0) {
      state.bonusTimer -= 1;
    }
    if (!state.bonus && state.bonusTimer <= 0) {
      const shouldSpawn = Math.random() < (state.bonusChance ?? 0);
      const occupied = [...state.snake, state.food, ...(state.obstacles ?? [])];
      const bonus = shouldSpawn ? spawnBonus(occupied, state) : null;
      if (bonus) {
        state.bonus = bonus;
        state.bonusTimer = state.bonusMinGapSteps;
      } else {
        state.bonusTimer = state.bonusMinGapSteps;
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
    state.score += state.foodPoints;
    state.pendingGrowth += 1;
    state.foodEaten += 1;
    const blocked = [...(state.obstacles ?? [])];
    if (state.bonus) {
      blocked.push(state.bonus.position);
    }
    state.food = spawnFood(state.snake, blocked);
    if (state.mode === 'progressive') {
      state.speed = Math.max(MIN_SPEED_INTERVAL, state.speed - SPEED_ACCELERATION);
    } else {
      state.speed = state.baseSpeed;
    }
    pulseBoard();
    maybeShuffleObstacles();
  } else if (state.bonus && newHead.x === state.bonus.position.x && newHead.y === state.bonus.position.y) {
    const { type } = state.bonus;
    if (type.kind === 'points') {
      const bonusScore = Math.round(type.score * (state.bonusValueMultiplier ?? 1));
      state.score += bonusScore;
    }
    if (type.kind === 'growth') {
      state.pendingGrowth += type.growth;
      pulseBoard();
    }
    state.bonus = null;
    state.bonusTimer = state.bonusMinGapSteps;
  }

  if (state.pendingGrowth > 0) {
    state.pendingGrowth -= 1;
  } else {
    state.snake.pop();
  }

  updateScoreboard();
}

function isCollision(position) {
  const hitsSnake = state.snake.some(
    (segment) => segment.x === position.x && segment.y === position.y,
  );
  if (hitsSnake) {
    return true;
  }
  if (state.obstacles && state.obstacles.some((obstacle) => obstacle.x === position.x && obstacle.y === position.y)) {
    return true;
  }
  return false;
}

function draw(interpolation = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawObstacles();
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

function drawObstacles() {
  if (!state.obstacles || state.obstacles.length === 0) {
    return;
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255, 215, 99, 0.22)';
  ctx.strokeStyle = 'rgba(255, 215, 99, 0.6)';
  ctx.lineWidth = 2;
  state.obstacles.forEach((obstacle) => {
    const x = obstacle.x * CELL_SIZE + 4;
    const y = obstacle.y * CELL_SIZE + 4;
    const size = CELL_SIZE - 8;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);
  });
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

function isOppositeDirection(current, next) {
  return current.x + next.x === 0 && current.y + next.y === 0;
}

function setNextDirection(candidate) {
  if (!candidate || uiState !== UI_STATES.RUNNING) {
    return;
  }

  const currentHeading = state.nextDirection ?? state.direction;
  const opposite =
    state.snake.length > 1 && isOppositeDirection(currentHeading, candidate);
  if (opposite) {
    return;
  }

  state.nextDirection = candidate;
}

function handleKeyDown(event) {
  if (event.code === 'Space') {
    event.preventDefault();
    if (uiState === UI_STATES.RUNNING && state.running) {
      pauseGame();
    }
    return;
  }

  if (uiState !== UI_STATES.RUNNING) {
    return;
  }

  const next = directions[event.code];
  setNextDirection(next);
}

function showOverlay(title, message, buttonLabel, options = {}) {
  const { buttonAction = 'default', hideButton = false } = options;
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlayButton.textContent = buttonLabel;
  overlayButton.dataset.action = buttonAction;
  overlayButton.classList.toggle('hidden', hideButton);
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
        setNextDirection(dx > 0 ? directions.ArrowRight : directions.ArrowLeft);
      } else {
        setNextDirection(dy > 0 ? directions.ArrowDown : directions.ArrowUp);
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

function handleSettingsSubmit(event) {
  event.preventDefault();
  if (modeSelect) {
    settings.mode = modeSelect.value;
  }
  if (difficultySelect) {
    settings.difficulty = difficultySelect.value;
  }
  if (playerNameInput) {
    const sanitized = sanitizeName(playerNameInput.value);
    settings.playerName = sanitized;
    playerNameInput.value = sanitized;
    persistPlayerName(sanitized);
  }
  resetGame({ showIntroOverlay: false });
  setUIState(UI_STATES.RUNNING);
  startGame();
}

if (startButton) {
  startButton.addEventListener('click', () => {
    setUIState(UI_STATES.SETTINGS);
    overlay.classList.add('hidden');
  });
}

if (settingsBackButton) {
  settingsBackButton.addEventListener('click', () => {
    setUIState(UI_STATES.INTRO);
    resetGame({ showIntroOverlay: false });
    overlay.classList.add('hidden');
  });
}

if (settingsForm) {
  settingsForm.addEventListener('submit', handleSettingsSubmit);
}

if (modeSelect) {
  modeSelect.addEventListener('change', () => {
    settings.mode = modeSelect.value;
  });
}

if (difficultySelect) {
  difficultySelect.addEventListener('change', () => {
    settings.difficulty = difficultySelect.value;
    updateDifficultyDescription();
  });
}

if (playerNameInput) {
  playerNameInput.addEventListener('input', (event) => {
    settings.playerName = event.target.value;
  });
}

if (playAgainButton) {
  playAgainButton.addEventListener('click', () => {
    setUIState(UI_STATES.SETTINGS);
    resetGame({ showIntroOverlay: false });
    overlay.classList.add('hidden');
  });
}

if (pauseButton) {
  pauseButton.addEventListener('click', pauseGame);
}

overlayButton.addEventListener('click', () => {
  const action = overlayButton.dataset.action;
  if (action === 'resume') {
    pauseGame();
    return;
  }
  overlay.classList.add('hidden');
});

document.addEventListener('keydown', handleKeyDown);
registerTouchControls();
resetGame({ showIntroOverlay: false });
setUIState(UI_STATES.INTRO);

renderIntroLeaderboard();

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
