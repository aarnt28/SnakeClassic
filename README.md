# Snake Classic

Snake Classic is a modern take on the arcade snake formula. A FastAPI backend serves the single-page web app and persists leaderboards in SQLite, while the JavaScript front end renders the neon playfield, handles input, and keeps the HUD and overlays in sync with the game state.

## Gameplay Overview

- **Controls:** Use the arrow keys, `WASD`, or swipe gestures on touch devices to steer the snake. The HUD pause button and the `Space` bar toggle pause at any time.
- **Wrapping board:** Movement wraps around the edges of the arena—only colliding with your own body can normally end a run.
- **Bonuses:** Glowing bonus pickups periodically appear, awarding score bursts, extra growth, or ultra bonuses that scale with difficulty and streak multipliers.
- **Power-ups:** Maintaining a streak of bonus pickups on Medium and Hard difficulties spawns rotating power-ups that augment your next run (see below).

## Power-ups

Power-ups appear one at a time and expire if ignored for too long. Collecting them immediately applies their effect:

- **Invincible Shield (`⛨`):** Grants a timed shield that lets you barrel through obstacles without losing the run. Each hit while the shield is active also clears the obstacle you struck.
- **Tail Saver (`✂️`):** Awards a one-time safety charge. If you collide with your own tail, the charge is consumed to snip the snake at the impact point, removing the loop so play can continue.

The HUD shows active effects and remaining Tail Saver charges so you can plan your route.

## Game Settings Reference

The front-end game loop centralizes its tunable variables near the top of `app/static/game.js`. The following tables summarize their defaults and intent so you can confidently tweak gameplay.

### Board, storage, and UI plumbing

- `BASE_CELL_SIZE` (`24`): Base pixel size each grid cell starts from before responsive scaling adjusts it.
- `ORIENTATIONS` (`portrait` / `landscape`): Tokens used when reacting to viewport changes and showing the rotation guard.
- `THEME_STORAGE_KEY` (`snake-theme-preference`): LocalStorage key storing the active light/dark mode selection.
- `LEADERBOARD_CACHE_KEY` (`snake-leaderboard-cache`): LocalStorage cache bucket for fetched leaderboard results.
- `LEGACY_HIGH_SCORE_KEY` (`snake-high-score`): Key that migrates scores saved by the original build.
- `PLAYER_NAME_STORAGE_KEY` (`snake-player-name`): Remembers the last player name entered.
- `UI_STATES` (`intro`, `settings`, `running`, `postgame`, `leaderboard`): Identifiers that drive which panel is visible at any moment.

### Speed and pacing

- `MIN_SPEED_INTERVAL` (`55 ms`): Fastest allowed movement interval when the snake is fully accelerated.
- `MAX_SPEED_INTERVAL` (`220 ms`): Slowest allowed interval, used at the start of runs or in constant mode.
- `SPEED_ACCELERATION` (`2.5 ms`): Amount shaved off the movement interval when leveling up in progressive mode.
- `SPEED_LEVEL_MIN` / `SPEED_LEVEL_MAX` (`1`–`10`): Bounds for manual testing overrides.
- `INITIAL_SAFE_PATH_STEPS` (`3`): Number of moves granted before self-collision checks are enforced after spawning.

### Bonus system configuration

- `DEFAULT_BONUS_DURATION_STEPS` (`32`): Baseline lifetime of a bonus pickup, subject to board-size scaling.
- `BONUS_DURATION_BASELINE_DIMENSION` (`25`) & `BONUS_DURATION_MIN_STEPS` (`12`): Control how lifetimes scale with the average grid size.
- `DEFAULT_BONUS_MIN_GAP_STEPS` (`8`): Minimum steps that must pass between bonus spawns.
- `DEFAULT_BONUS_INITIAL_COOLDOWN` (`6` fruit): Delay before the first bonus becomes eligible to spawn.
- `BONUS_STREAK_INCREMENT` (`0.1`): Additional score multiplier applied per consecutive bonus collected.

**Bonus types (`BONUS_TYPES`):**

| Kind      | Label | Reward / Effect                                                                 | Weight |
|-----------|-------|-----------------------------------------------------------------------------------|--------|
| `points`  | `★`   | Flat `30` point bonus in addition to streak multipliers.                         | `1.75` |
| `growth`  | `⇑`   | Grows the snake by `3` segments on collection.                                   | `1`    |
| `ultra`   | `⚡`   | Awards `50/100/150` points on Easy/Medium/Hard and respects a `0.8` duration scale.| `0.2` |

### Power-up system configuration

- `POWER_UP_TRIGGER_STREAK` (`5`): Consecutive bonuses required before a power-up spawns.
- `POWER_UP_MAX_ACTIVE` (`2`): Maximum simultaneous power-ups that may exist on the board.
- `DEFAULT_POWER_UP_LIFETIME_STEPS` (`150`): Number of steps before an uncollected power-up despawns.
- `POWER_UP_ALLOWED_DIFFICULTIES` (`medium`, `hard`): Difficulties that enable the streak mechanic.
- `POWER_UP_DEACTIVATION_FLASH_STEPS` (`20`): Duration HUD icons flash after an effect expires.
- `POWER_UP_SEQUENCE` (`invincible`, `tail-cut`): Rotation order when multiple power-ups are queued.

**Power-up types (`POWER_UP_TYPES`):**

| Kind         | Label | Effect description                                              | Default lifetime |
|--------------|-------|----------------------------------------------------------------|------------------|
| `invincible` | `⛨`   | Grants a `30,000 ms` invulnerability window that is refreshed on pickup.| `150` steps      |
| `tail-cut`   | `✂️`   | Provides a single tail-saving charge that clears collisions.   | `150` steps      |

### Difficulty presets

`DIFFICULTY_CONFIG` defines the knobs for each difficulty, while `DIFFICULTY_DESCRIPTIONS` supplies the helper text that appears in the UI.

| Difficulty | Speed level | Bonus chance | Bonus gap | First bonus delay | Bonus duration | Value multiplier | Obstacles | Obstacle reshuffle | Base fruit points |
|------------|-------------|--------------|-----------|-------------------|----------------|------------------|-----------|--------------------|-------------------|
| Easy       | `2`         | `65%`        | `4` steps | `3` fruit         | `40` steps     | `1.1x`           | `0`       | N/A (`Infinity`)   | `10`              |
| Medium     | `5`         | `50%`        | `6` steps | `5` fruit         | `36` steps     | `1.15x`          | `4`       | Every `15` fruit   | `25`              |
| Hard       | `7`         | `38%`        | `6` steps | `5` fruit         | `30` steps     | `1.5x`           | `12`      | Every `10` fruit   | `30`              |

### Leaderboard limits

- `LEADERBOARD_MAX_ENTRIES` (`100`): Total entries stored per difficulty in the persistent database.
- `LEADERBOARD_TOP_DISPLAY_COUNT` (`10`): Number of entries shown in each leaderboard panel.
- `LEADERBOARD_DIFFICULTIES` (`easy`, `medium`, `hard`): Ordering used across leaderboard tabs and fetch requests.

## Game Modes and Difficulty

When starting a new run you can choose between two pacing modes and three difficulty levels:

- **Progressive mode:** The default option gradually accelerates the game as you survive longer, increasing tension and score potential.
- **Constant mode:** Keeps the speed steady throughout the run.
- **Difficulty (Easy, Medium, Hard):** Adjusts spawn rates, obstacle layouts, bonus values, and whether power-ups are enabled. Medium and Hard unlock the power-up streak mechanic.

## Leaderboards

The game records your name, score, and difficulty to a persistent leaderboard. Tabs across the intro, in-game, and post-game panels let you browse the top runs per difficulty without leaving the session.

## Running the App Locally

1. Ensure Python 3.12+ is installed.
2. Install the dependencies and start the development server:

   ```bash
   pip install fastapi "uvicorn[standard]"
   uvicorn app:app --reload --host 0.0.0.0 --port 6271
   ```

3. Visit `http://localhost:6271` in your browser.

A Dockerfile and `docker-compose.yml` are included if you prefer containerized deployment. The default compose setup binds the app to port `6271` and persists leaderboard data under `./data` on the host machine.

## Project Structure

- `app/`: FastAPI application, leaderboard persistence, and static assets.
  - `app/static/index.html`: Main UI layout and in-game overlays.
  - `app/static/game.js`: Game loop, input handling, HUD updates, bonuses, and power-up logic.
  - `app/static/style.css`: Styling for the board, HUD, modals, and responsive layout.
- `data/`: SQLite database location for leaderboard storage (created on demand).
- `Dockerfile` and `docker-compose.yml`: Container build and runtime configuration.

Enjoy chasing high scores and experimenting with power-up combinations!
