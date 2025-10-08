const canvas = document.getElementById('game-board');
const boardWrapper = document.querySelector('.board-wrapper');
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
const orientationGuard = document.getElementById('orientation-guard');
const orientationGuardTitle = document.getElementById('orientation-guard-title');
const orientationGuardMessage = document.getElementById('orientation-guard-message');
const introLeaderboardList = document.getElementById('intro-leaderboard');
const postgameLeaderboardList = document.getElementById('postgame-leaderboard');
const settingsForm = document.getElementById('settings-form');
const settingsBackButton = document.getElementById('settings-back-button');
const playAgainButton = document.getElementById('play-again-button');
const difficultyDescription = document.getElementById('difficulty-description');
const introPanel = document.getElementById('intro-panel');
const settingsPanel = document.getElementById('settings-panel');
const postGamePanel = document.getElementById('postgame-panel');
const bonusIndicator = document.getElementById('bonus-indicator');

const BASE_CELL_SIZE = 32;
const LEADERBOARD_CACHE_KEY = 'snake-leaderboard-cache';
let cellSize = BASE_CELL_SIZE;
let gridColumns = Math.max(12, Math.round(canvas.width / cellSize));
let gridRows = Math.max(12, Math.round(canvas.height / cellSize));
const ORIENTATIONS = { PORTRAIT: 'portrait', LANDSCAPE: 'landscape' };
const deviceInfo = {
  isIOS:
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
};
deviceInfo.isIPhone = /iphone/i.test(navigator.userAgent);
deviceInfo.isIPad = deviceInfo.isIOS && !deviceInfo.isIPhone;
const MIN_SPEED_INTERVAL = 55;
const MAX_SPEED_INTERVAL = 220;
const SPEED_LEVEL_MIN = 1;
const SPEED_LEVEL_MAX = 10;
const SPEED_ACCELERATION = 2.5;
const DEFAULT_BONUS_DURATION_STEPS = 32;
const DEFAULT_BONUS_MIN_GAP_STEPS = 8;
const DEFAULT_BONUS_INITIAL_COOLDOWN = 6;
const BONUS_STREAK_INCREMENT = 0.1;
const BONUS_DURATION_BASELINE_DIMENSION = 25;
const BONUS_DURATION_MIN_STEPS = 12;
const BONUS_TYPES = [
  {
    kind: 'points',
    name: 'Points',
    score: 30,
    colors: ['rgba(255, 215, 99, 0.95)', 'rgba(255, 111, 97, 0.95)'],
    glow: 'rgba(255, 183, 0, 0.65)',
    outline: 'rgba(255, 245, 224, 0.8)',
    label: '★',
    weight: 1,
  },
  {
    kind: 'growth',
    name: 'Growth',
    growth: 3,
    colors: ['rgba(110, 245, 255, 0.95)', 'rgba(186, 110, 255, 0.95)'],
    glow: 'rgba(186, 110, 255, 0.55)',
    outline: 'rgba(230, 215, 255, 0.75)',
    label: '⇑',
    weight: 1,
  },
  {
    kind: 'ultra',
    name: 'Ultra',
    scores: { easy: 50, medium: 100, hard: 150 },
    colors: ['rgba(255, 255, 163, 0.95)', 'rgba(255, 110, 196, 0.95)'],
    glow: 'rgba(255, 233, 120, 0.6)',
    outline: 'rgba(255, 248, 210, 0.85)',
    label: '⚡',
    weight: 0.2,
    durationScale: 0.6,
  },
];

function chooseBonusType() {
  const totalWeight = BONUS_TYPES.reduce((sum, type) => sum + (type.weight ?? 1), 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (let index = 0; index < BONUS_TYPES.length; index += 1) {
    const type = BONUS_TYPES[index];
    cumulative += type.weight ?? 1;
    if (roll <= cumulative) {
      return type;
    }
  }
  return BONUS_TYPES[BONUS_TYPES.length - 1];
}

function getAverageGridDimension() {
  return (gridColumns + gridRows) / 2;
}

function scaleBonusDuration(baseDuration) {
  const dimension = getAverageGridDimension();
  const scale = Math.max(0.5, dimension / BONUS_DURATION_BASELINE_DIMENSION);
  const scaled = Math.round(baseDuration * scale);
  return Math.max(BONUS_DURATION_MIN_STEPS, scaled);
}

function getBonusDurationForType(type, currentState = state) {
  const base = currentState
    ? currentState.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS
    : scaleBonusDuration(DEFAULT_BONUS_DURATION_STEPS);
  const modifier = type && type.durationScale ? type.durationScale : 1;
  return Math.max(1, Math.round(base * modifier));
}
const isTouchDevice =
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
const bonusIndicatorItems = new Map();

function createBonusStreaks() {
  const streaks = {};
  BONUS_TYPES.forEach(({ kind }) => {
    streaks[kind] = 0;
  });
  return streaks;
}

function incrementBonusStreak(streaks, kind) {
  if (!streaks[kind] && streaks[kind] !== 0) {
    streaks[kind] = 0;
  }
  streaks[kind] += 1;
  return streaks[kind];
}

function resetBonusStreak(streaks, kind) {
  if (Object.prototype.hasOwnProperty.call(streaks, kind)) {
    streaks[kind] = 0;
  }
}

function getBonusStreakMultiplier(streaks, kind) {
  const streak = streaks && Object.prototype.hasOwnProperty.call(streaks, kind)
    ? streaks[kind]
    : 0;
  return 1 + streak * BONUS_STREAK_INCREMENT;
}

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
    speedLevel: 2,
    bonusChance: 0.65,
    bonusMinGapSteps: 4,
    bonusInitialCooldown: 3,
    bonusDurationSteps: 40,
    bonusValueMultiplier: 1.1,
    obstacleCount: 0,
    obstacleChangeInterval: Infinity,
    basePoints: 10,
  },
  medium: {
    label: 'Medium',
    speedLevel: 4,
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
    speedLevel: 7,
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

const LEGACY_HIGH_SCORE_KEY = 'snake-high-score';
const PLAYER_NAME_STORAGE_KEY = 'snake-player-name';
const LEADERBOARD_MAX_ENTRIES = 100;
const LEADERBOARD_TOP_DISPLAY_COUNT = 10;

let uiState = UI_STATES.INTRO;
let leaderboard = [];
let state = null;
let lockedOrientation = null;
let orientationPauseActive = false;
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
buildBonusIndicator();
updateBonusIndicator();

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

  if (next === UI_STATES.RUNNING) {
    enforceOrientationRules({ respectLock: true });
  } else {
    orientationPauseActive = false;
    releaseOrientationLock();
    enforceOrientationRules({ respectLock: false });
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

function getOrientation() {
  return window.innerHeight >= window.innerWidth
    ? ORIENTATIONS.PORTRAIT
    : ORIENTATIONS.LANDSCAPE;
}

function computeBoardGeometry() {
  const viewportWidth = window.innerWidth || canvas.width;
  const viewportHeight = window.innerHeight || canvas.height;
  const orientation = getOrientation();
  const isPortrait = orientation === ORIENTATIONS.PORTRAIT;

  let horizontalPadding = isPortrait ? 48 : 96;
  let verticalPadding = isPortrait ? 240 : 200;

  if (deviceInfo.isIPhone) {
    horizontalPadding = isPortrait ? 36 : 96;
    verticalPadding = isPortrait ? 280 : 220;
  } else if (deviceInfo.isIPad) {
    horizontalPadding = isPortrait ? 64 : 96;
    verticalPadding = isPortrait ? 220 : 200;
  }

  const maxWidth = Math.max(320, viewportWidth - horizontalPadding);
  const maxHeight = Math.max(320, viewportHeight - verticalPadding);
  const limitingDimension = Math.min(maxWidth, maxHeight);

  let targetCellSize = BASE_CELL_SIZE;
  if (limitingDimension < 420) {
    targetCellSize = 24;
  } else if (limitingDimension < 640) {
    targetCellSize = 28;
  } else if (limitingDimension > 920) {
    targetCellSize = 40;
  }

  if (deviceInfo.isIPad) {
    targetCellSize = Math.max(36, Math.min(48, Math.round(Math.min(maxWidth, maxHeight) / 22)));
  } else if (deviceInfo.isIPhone) {
    targetCellSize = limitingDimension < 420 ? 24 : 28;
  }

  let columns = Math.max(12, Math.floor(maxWidth / targetCellSize));
  let rows = Math.max(12, Math.floor(maxHeight / targetCellSize));

  if (deviceInfo.isIPad) {
    if (isPortrait) {
      columns = Math.max(columns, 24);
      rows = Math.max(rows, 28);
    } else {
      columns = Math.max(columns, 30);
      rows = Math.max(rows, 22);
    }
  } else if (!deviceInfo.isIPhone) {
    if (isPortrait) {
      rows = Math.max(rows, 22);
    } else {
      columns = Math.max(columns, 26);
    }
  }

  columns = Math.min(columns, 48);
  rows = Math.min(rows, 48);

  return {
    cellSize: targetCellSize,
    columns,
    rows,
    width: columns * targetCellSize,
    height: rows * targetCellSize,
  };
}

function applyBoardGeometry(geometry) {
  if (!geometry) {
    return;
  }
  cellSize = geometry.cellSize;
  gridColumns = geometry.columns;
  gridRows = geometry.rows;
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  if (boardWrapper) {
    boardWrapper.style.setProperty('--board-width', `${geometry.width}px`);
    boardWrapper.style.setProperty('--board-height', `${geometry.height}px`);
  }
}

function adjustActiveBonusDuration(oldBaseScaled, newBaseScaled) {
  if (!state || !state.bonus) {
    return;
  }
  const typeScale = state.bonus.type && state.bonus.type.durationScale ? state.bonus.type.durationScale : 1;
  const previousBase = Number.isFinite(oldBaseScaled) && oldBaseScaled > 0 ? oldBaseScaled : newBaseScaled;
  const oldTotal = Math.max(1, Math.round(previousBase * typeScale));
  const newTotal = Math.max(1, Math.round(newBaseScaled * typeScale));
  const remaining = Math.max(0, Math.min(state.bonus.remainingSteps, oldTotal));
  const consumedRatio = 1 - remaining / oldTotal;
  const adjustedRemaining = Math.max(0, Math.round(newTotal * (1 - consumedRatio)));
  state.bonus.remainingSteps = Math.min(newTotal, adjustedRemaining);
}

function handleBoardGeometryChange() {
  if (!state) {
    return;
  }
  const previousScaled = state.bonusDurationSteps;
  const baseDuration = state.baseBonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS;
  const scaled = scaleBonusDuration(baseDuration);
  state.bonusDurationSteps = scaled;
  if (state.bonus && Number.isFinite(previousScaled)) {
    adjustActiveBonusDuration(previousScaled, scaled);
  }
  updateBonusIndicator();
}

function refreshBoardGeometry({ force = false, allowDuringGame = false } = {}) {
  if (state && state.running && !allowDuringGame) {
    return false;
  }
  const geometry = computeBoardGeometry();
  const changed =
    force ||
    geometry.cellSize !== cellSize ||
    geometry.columns !== gridColumns ||
    geometry.rows !== gridRows;
  if (changed) {
    applyBoardGeometry(geometry);
    handleBoardGeometryChange();
  }
  return changed;
}

function getOrientationLabel(orientation) {
  return orientation === ORIENTATIONS.LANDSCAPE ? 'landscape' : 'portrait';
}

function showOrientationGuard(title, message) {
  if (!orientationGuard) {
    return;
  }
  if (orientationGuardTitle) {
    orientationGuardTitle.textContent = title;
  }
  if (orientationGuardMessage) {
    orientationGuardMessage.textContent = message;
  }
  orientationGuard.classList.remove('hidden');
}

function hideOrientationGuard() {
  if (!orientationGuard) {
    return;
  }
  orientationGuard.classList.add('hidden');
}

function enforceOrientationRules({ respectLock = true } = {}) {
  const orientation = getOrientation();
  const iPhoneLandscapeBlocked = deviceInfo.isIPhone && orientation === ORIENTATIONS.LANDSCAPE;
  const lockedMismatch = respectLock && lockedOrientation && orientation !== lockedOrientation;

  if (startButton) {
    startButton.disabled = iPhoneLandscapeBlocked;
  }

  if (iPhoneLandscapeBlocked) {
    showOrientationGuard(
      'Portrait Only',
      'Snake Classic requires portrait orientation on iPhone. Rotate your device upright to play.',
    );
  } else if (lockedMismatch) {
    showOrientationGuard(
      'Orientation Locked',
      `Rotate back to ${getOrientationLabel(lockedOrientation)} to keep playing.`,
    );
  } else {
    hideOrientationGuard();
  }

  if (uiState === UI_STATES.RUNNING) {
    if (iPhoneLandscapeBlocked || lockedMismatch) {
      if (state && state.running) {
        orientationPauseActive = true;
        state.running = false;
        cancelAnimationFrame(animationFrameId);
      }
      return false;
    }

    if (orientationPauseActive && state && !state.running) {
      orientationPauseActive = false;
      setTimeout(() => {
        if (uiState === UI_STATES.RUNNING && state && !state.running) {
          startGame();
        }
      }, 0);
    }
  }

  return !iPhoneLandscapeBlocked;
}

function lockOrientationForGame() {
  lockedOrientation = getOrientation();
  if (screen.orientation && typeof screen.orientation.lock === 'function') {
    const target = lockedOrientation === ORIENTATIONS.PORTRAIT ? 'portrait' : 'landscape';
    try {
      const result = screen.orientation.lock(target);
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (error) {
      // Ignore lock failures.
    }
  }
}

function releaseOrientationLock() {
  if (screen.orientation && typeof screen.orientation.unlock === 'function') {
    try {
      screen.orientation.unlock();
    } catch (error) {
      // Ignore unlock failures.
    }
  }
  lockedOrientation = null;
}

function handleResize() {
  const wasRunning = state && state.running;
  const geometryChanged = refreshBoardGeometry({ allowDuringGame: false });
  enforceOrientationRules({ respectLock: !wasRunning });
  if (geometryChanged && state && !wasRunning) {
    resetGame({ showIntroOverlay: false });
  }
}

function handleOrientationChange() {
  const wasRunning = state && state.running;
  enforceOrientationRules({ respectLock: true });
  const geometryChanged = refreshBoardGeometry({ allowDuringGame: false });
  if (geometryChanged && state && !wasRunning) {
    resetGame({ showIntroOverlay: false });
  }
}

function applySettingsToState() {
  const config = getDifficultyConfig(settings.difficulty);
  const interval = levelToInterval(config.speedLevel);
  state.mode = settings.mode;
  state.difficulty = settings.difficulty;
  state.bonusChance = config.bonusChance;
  state.bonusMinGapSteps = config.bonusMinGapSteps ?? DEFAULT_BONUS_MIN_GAP_STEPS;
  const previousScaledDuration = state.bonusDurationSteps;
  state.baseBonusDurationSteps = config.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS;
  state.bonusDurationSteps = scaleBonusDuration(state.baseBonusDurationSteps);
  state.bonusValueMultiplier = config.bonusValueMultiplier ?? 1;
  if (!state.bonusStreaks) {
    state.bonusStreaks = createBonusStreaks();
  }
  if (state.bonus && Number.isFinite(previousScaledDuration)) {
    adjustActiveBonusDuration(previousScaledDuration, state.bonusDurationSteps);
  }
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
  const centerX = Math.floor(gridColumns / 2);
  const centerY = Math.floor(gridRows / 2);
  const baseSpeed = levelToInterval(config.speedLevel);
  const baseBonusDuration = config.bonusDurationSteps ?? DEFAULT_BONUS_DURATION_STEPS;
  const scaledBonusDuration = scaleBonusDuration(baseBonusDuration);
  const snake = [
    { x: (centerX + 1) % gridColumns, y: centerY % gridRows },
    { x: centerX % gridColumns, y: centerY % gridRows },
    { x: (centerX - 1 + gridColumns) % gridColumns, y: centerY % gridRows },
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
    baseBonusDurationSteps: baseBonusDuration,
    bonusDurationSteps: scaledBonusDuration,
    bonusChance: config.bonusChance,
    bonusMinGapSteps: config.bonusMinGapSteps ?? DEFAULT_BONUS_MIN_GAP_STEPS,
    bonusValueMultiplier: config.bonusValueMultiplier ?? 1,
    bonusStreaks: createBonusStreaks(),
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
  for (let x = 0; x < gridColumns; x += 1) {
    for (let y = 0; y < gridRows; y += 1) {
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

  const type = chooseBonusType();
  return {
    position,
    type,
    remainingSteps: getBonusDurationForType(type, currentState),
  };
}

function resetGame({ showIntroOverlay = false } = {}) {
  refreshBoardGeometry({ allowDuringGame: true });
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

function formatBonusMultiplier(multiplier) {
  return `x${multiplier.toFixed(1)}`;
}

function buildBonusIndicator() {
  if (!bonusIndicator) {
    return;
  }
  bonusIndicator.innerHTML = '';
  bonusIndicatorItems.clear();
  BONUS_TYPES.forEach((type) => {
    const item = document.createElement('div');
    item.className = 'bonus-indicator-item';
    item.dataset.kind = type.kind;

    const icon = document.createElement('span');
    icon.className = 'bonus-icon';
    icon.textContent = type.label;
    if (type.colors && type.colors.length > 0) {
      icon.style.setProperty('--bonus-color-start', type.colors[0]);
      icon.style.setProperty(
        '--bonus-color-end',
        type.colors[type.colors.length - 1] ?? type.colors[0],
      );
    }

    const multiplier = document.createElement('span');
    multiplier.className = 'bonus-multiplier';
    const initialMultiplierText = formatBonusMultiplier(1);
    multiplier.textContent = initialMultiplierText;

    const labelText = type.name ? `${type.name} bonus` : `${type.kind} bonus`;
    const accessibleLabel = `${labelText} multiplier ${initialMultiplierText}`;
    item.setAttribute('aria-label', accessibleLabel);
    item.setAttribute('title', accessibleLabel);

    item.append(icon, multiplier);
    bonusIndicator.appendChild(item);
    bonusIndicatorItems.set(type.kind, { item, multiplier, labelText });
  });
}

function updateBonusIndicator() {
  if (!bonusIndicator) {
    return;
  }
  if (bonusIndicatorItems.size === 0) {
    buildBonusIndicator();
  }
  BONUS_TYPES.forEach((type) => {
    const entry = bonusIndicatorItems.get(type.kind);
    if (!entry) {
      return;
    }
    const multiplierValue =
      state && state.bonusStreaks
        ? getBonusStreakMultiplier(state.bonusStreaks, type.kind)
        : 1;
    const multiplierText = formatBonusMultiplier(multiplierValue);
    entry.multiplier.textContent = multiplierText;
    const labelText = entry.labelText || `${type.kind} bonus`;
    const accessibleLabel = `${labelText} multiplier ${multiplierText}`;
    entry.item.setAttribute('aria-label', accessibleLabel);
    entry.item.setAttribute('title', accessibleLabel);
    entry.item.classList.toggle('boosted', multiplierValue > 1.0001);
    const isActive = state && state.bonus && state.bonus.type.kind === type.kind;
    entry.item.classList.toggle('active', Boolean(isActive));
  });
}

function updateScoreboard() {
  const currentScore = state ? state.score : 0;
  scoreValue.textContent = formatScore(currentScore);
  const topScore = leaderboard[0];
  highScoreValue.textContent = topScore ? formatScore(topScore.score) : '0';
  updateBonusIndicator();
  renderIntroLeaderboard();
}

function saveCachedLeaderboard(entries) {
  try {
    localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(entries));
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
    submittedAt: typeof entry.submitted_at === 'string'
      ? entry.submitted_at
      : typeof entry.submittedAt === 'string'
      ? entry.submittedAt
      : null,
  };
}

function isSameLeaderboardEntry(a, b) {
  if (!a || !b) {
    return false;
  }
  const sameBasics = a.name === b.name && a.score === b.score && a.difficulty === b.difficulty;
  if (!sameBasics) {
    return false;
  }
  if (a.submittedAt && b.submittedAt) {
    return a.submittedAt === b.submittedAt;
  }
  return true;
}

function loadCachedLeaderboard() {
  try {
    const stored = localStorage.getItem(LEADERBOARD_CACHE_KEY);
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
    saveCachedLeaderboard(legacyLeaderboard);
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

async function refreshLeaderboardFromServer({ allowFallback = false } = {}) {
  try {
    const response = await fetch('/api/leaderboard?limit=100', {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Failed to load leaderboard: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.entries)) {
      throw new Error('Malformed leaderboard response');
    }
    const normalized = payload.entries
      .map(normalizeLeaderboardEntry)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, LEADERBOARD_MAX_ENTRIES);
    leaderboard = normalized;
    saveCachedLeaderboard(leaderboard);
    if (state) {
      updateScoreboard();
    } else {
      renderIntroLeaderboard();
    }
    return leaderboard;
  } catch (error) {
    console.error(error);
    if (allowFallback && leaderboard.length === 0) {
      const cached = loadCachedLeaderboard();
      if (cached.length > 0) {
        leaderboard = cached;
        if (state) {
          updateScoreboard();
        } else {
          renderIntroLeaderboard();
        }
      }
    }
    return leaderboard;
  }
}

async function submitLeaderboardEntry(entry) {
  const payload = {
    name: entry.name,
    score: entry.score,
    difficulty: entry.difficulty,
  };
  const response = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to submit score: ${response.status}`);
  }
  const result = await response.json();
  const normalizedEntries = Array.isArray(result.entries)
    ? result.entries
        .map(normalizeLeaderboardEntry)
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, LEADERBOARD_MAX_ENTRIES)
    : leaderboard;
  if (normalizedEntries.length > 0) {
    leaderboard = normalizedEntries;
    saveCachedLeaderboard(leaderboard);
    updateScoreboard();
  }
  const normalizedEntry = normalizeLeaderboardEntry(result.entry) || entry;
  const rank = Number.isFinite(result.rank) ? Number(result.rank) : null;
  renderIntroLeaderboard();
  return {
    entries: leaderboard,
    entry: normalizedEntry,
    rank,
  };
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
    const highlight =
      currentEntry && typeof rank === 'number' && rank === position && isSameLeaderboardEntry(entry, currentEntry);
    const item = createLeaderboardItem(entry, position, { highlight });
    postgameLeaderboardList.append(item);
    seenPositions.add(position);
  });

  if (currentEntry && typeof rank === 'number' && !seenPositions.has(rank)) {
    const item = createLeaderboardItem(currentEntry, rank, { highlight: true, spaced: true });
    postgameLeaderboardList.append(item);
  }
}

function buildGameOverMessage(score, rank, baseMessage = `You scored ${formatScore(score)} points.`) {
  let message = baseMessage;
  if (typeof rank === 'number') {
    message += ` You're ranked #${rank}.`;
  } else if (score > 0) {
    message += ' Keep going to reach the leaderboard.';
  } else {
    message += ' Try grabbing some fruit to earn points!';
  }
  return message;
}

function startGame() {
  attemptFullscreen();
  if (state.running) {
    return;
  }
  if (!enforceOrientationRules({ respectLock: false })) {
    return;
  }
  lockOrientationForGame();
  orientationPauseActive = false;
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
  const baseMessage = `You scored ${formatScore(state.score)} points.`;

  let placement = null;
  let currentEntry = null;
  let rank = null;
  let candidate = null;

  if (state.score > 0) {
    candidate = {
      name: sanitizeName(settings.playerName) || 'Anonymous',
      score: state.score,
      difficulty: state.difficulty,
    };
    placement = evaluateLeaderboardPlacement(leaderboard, candidate);
    if (placement.qualifies) {
      leaderboard = placement.updated;
      saveCachedLeaderboard(leaderboard);
    }
    rank = placement.rank;
    currentEntry = placement.candidateEntry;
  }

  const sortedForDisplay = placement ? placement.sorted : leaderboard;
  const topEntries = sortedForDisplay.slice(0, 3);
  renderPostGameLeaderboard(topEntries, currentEntry, rank);

  setUIState(UI_STATES.POSTGAME);

  const initialMessage = buildGameOverMessage(state.score, rank, baseMessage);
  showOverlay('Game Over', initialMessage, 'Continue', { buttonAction: 'postgame' });

  if (candidate) {
    submitLeaderboardEntry(candidate)
      .then((result) => {
        if (!result) {
          return;
        }
        const resolvedRank = typeof result.rank === 'number' ? result.rank : rank;
        const resolvedEntry = result.entry || currentEntry || candidate;
        const displayEntries = (result.entries || leaderboard).slice(0, 3);
        renderPostGameLeaderboard(displayEntries, resolvedEntry, resolvedRank);
        const updatedMessage = buildGameOverMessage(state.score, resolvedRank, baseMessage);
        overlayMessage.textContent = updatedMessage;
      })
      .catch((error) => {
        console.error(error);
      });
  }
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
      const expiredType = state.bonus.type.kind;
      state.bonus = null;
      state.bonusTimer = state.bonusMinGapSteps;
      resetBonusStreak(state.bonusStreaks, expiredType);
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

  newHead.x = (newHead.x + gridColumns) % gridColumns;
  newHead.y = (newHead.y + gridRows) % gridRows;

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
    const streakMultiplier = getBonusStreakMultiplier(state.bonusStreaks, type.kind);
    const difficultyMultiplier = state.bonusValueMultiplier ?? 1;
    if (type.kind === 'points') {
      const baseScore = type.score * difficultyMultiplier;
      const bonusScore = Math.round(baseScore * streakMultiplier);
      state.score += bonusScore;
    } else if (type.kind === 'growth') {
      state.pendingGrowth += type.growth;
      const baseGrowthPoints = type.growth * state.foodPoints;
      if (baseGrowthPoints > 0) {
        const growthScore = Math.round(baseGrowthPoints * streakMultiplier);
        state.score += growthScore;
      }
      pulseBoard();
    } else if (type.kind === 'ultra') {
      const difficultyKey = state.difficulty ?? 'easy';
      const baseValue =
        (type.scores && type.scores[difficultyKey]) || type.score || 0;
      const totalValue = Math.round(baseValue * difficultyMultiplier * streakMultiplier);
      state.score += totalValue;
      pulseBoard();
    }
    incrementBonusStreak(state.bonusStreaks, type.kind);
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
  for (let x = 1; x < gridColumns; x += 1) {
    const position = x * cellSize;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();
  }
  for (let y = 1; y < gridRows; y += 1) {
    const position = y * cellSize;
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
    const x = obstacle.x * cellSize + 4;
    const y = obstacle.y * cellSize + 4;
    const size = cellSize - 8;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);
  });
  ctx.restore();
}

function drawFood() {
  const padding = cellSize * 0.2;
  const x = state.food.x * cellSize + padding;
  const y = state.food.y * cellSize + padding;
  const size = cellSize - padding * 2;

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
  const basePadding = cellSize * 0.2;
  const baseSize = cellSize - basePadding * 2;
  const time = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pulse = 1 + Math.sin(time / 220) * 0.08;
  const centerX = position.x * cellSize + cellSize / 2;
  const centerY = position.y * cellSize + cellSize / 2;
  const size = Math.max(0, baseSize * pulse);
  const x = Math.round(centerX - size / 2);
  const y = Math.round(centerY - size / 2);

  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, type.colors[0]);
  gradient.addColorStop(1, type.colors[1]);

  ctx.save();
  ctx.shadowBlur = Math.min(28, Math.max(14, cellSize * 0.7));
  ctx.shadowColor = type.glow;
  ctx.fillStyle = gradient;
  const radius = Math.min(12, Math.max(8, cellSize * 0.3));
  pathRoundedRect(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = type.outline;
  pathRoundedRect(ctx, x, y, size, size, radius);
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
    let drawX = segment.x * cellSize;
    let drawY = segment.y * cellSize;

    if (nextSegment && interpolation) {
      drawX += (nextSegment.x - segment.x) * interpolation * cellSize * 0.25;
      drawY += (nextSegment.y - segment.y) * interpolation * cellSize * 0.25;
    }

    const padding = i === 0 ? cellSize * 0.15 : cellSize * 0.2;
    const size = cellSize - padding * 2;
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
  const target = event.target;
  const tagName = target && target.tagName ? target.tagName.toUpperCase() : '';
  const isEditable =
    (target && target.isContentEditable) ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT';

  if (isEditable) {
    return;
  }

  const isDirectional = Object.prototype.hasOwnProperty.call(directions, event.code);

  if (event.code === 'Space') {
    event.preventDefault();
    if (uiState === UI_STATES.RUNNING && state.running) {
      pauseGame();
    }
    return;
  }

  if (!isDirectional) {
    return;
  }

  event.preventDefault();

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

document.addEventListener('keydown', handleKeyDown, { passive: false });
registerTouchControls();

window.addEventListener('resize', handleResize, { passive: true });
if (screen.orientation && typeof screen.orientation.addEventListener === 'function') {
  screen.orientation.addEventListener('change', handleOrientationChange);
} else {
  window.addEventListener('orientationchange', handleOrientationChange);
}

leaderboard = loadCachedLeaderboard();

refreshBoardGeometry({ force: true, allowDuringGame: true });
resetGame({ showIntroOverlay: false });
setUIState(UI_STATES.INTRO);
enforceOrientationRules({ respectLock: false });
renderIntroLeaderboard();

refreshLeaderboardFromServer({ allowFallback: leaderboard.length === 0 });

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
