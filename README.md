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
