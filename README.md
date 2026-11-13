# Orbit Thief

A browser game about stealing cargo with a ship that has no engine.

You can only move by latching onto a planet's gravity, winding up speed in orbit, and
letting go to slingshot across the sector. Fly through orbiting stations to steal their
cargo, then escape through the exit gate before the patrols close in.

## How to play

| Input | Action |
| --- | --- |
| Hold `Space` / mouse button / touch | Latch onto the planet whose gravity well you are in |
| Release | Slingshot away along the dotted trajectory line |
| `R` | Retry the current level |
| `P` | Pause |
| `M` | Mute |
| `C` | Change the ship's color (`Shift+C` goes back) |

- **Orbiting builds speed.** The longer you stay latched, the faster you leave.
- **The dotted line is exact.** It shows where you will go if you let go right now. A red
  dot means that path ends in a planet.
- **The camera follows you.** The sector is much bigger than the screen. Arrows at the
  screen edge point to cargo (gold), patrols (red) and the open exit (green), and the
  minimap in the corner shows the whole sector.
- **There are no walls.** You can fly out of the sector on any side; a tide that grows
  with distance swings you back in.
- **Hold early to catch a planet.** If you are already holding when you enter a gravity
  well, you latch at its edge.
- **Stealing raises the alarm.** The first theft calls in patrols, and more arrive as you
  steal more. They are slower than a good slingshot but they never stop.
- **Patrols can be baited.** Lead one into a planet for bonus points.
- **The exit unlocks** once every station in the sector is empty. Finishing fast earns a
  speed bonus.
- Hitting a planet or getting caught ends the run; you retry the same level.

Levels are generated from the level number, so level 5 is the same layout every time.
Your best score is saved in the browser.

## Running it

Requires [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm run dev       # start the dev server with hot reload
npm run build     # type-check and build a static site into dist/
npm run preview   # serve the built site locally
```

The contents of `dist/` are plain static files and can be hosted anywhere (itch.io,
GitHub Pages, Netlify).

## Tech

TypeScript and the HTML5 Canvas 2D API, bundled with Vite. There is no game engine and
there are no runtime dependencies or asset files: the physics is custom, and the sound
effects are synthesized with the Web Audio API.

## Project layout

```
index.html        page shell and canvas
src/
  main.ts         canvas setup, input, fixed-timestep loop, best-score storage
  game.ts         game state and rules: latching, pickups, patrols, win/lose
  physics.ts      free-flight gravity step shared by the game and the trajectory preview
  level.ts        seeded level generator
  render.ts       all drawing: camera, backdrop, planets, world, HUD, minimap, overlays
  audio.ts        synthesized sound effects
  config.ts       every tunable gameplay number
  types.ts        shared data types
```

To change how the game feels, start with `src/config.ts`.
