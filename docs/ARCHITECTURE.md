# Architecture

> Planned architecture. Updated as systems are implemented; sections describe intent until code links appear.

## Tech Stack

| Area | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Type safety across a large codebase |
| Rendering | Three.js (WebGL2) | Mature, runs on all target hardware; game systems are written by hand rather than provided by an engine |
| Shaders | GLSL | Custom materials and effects |
| Physics | Rapier (WASM) | Fast, deterministic, built-in kinematic character controller |
| UI | HTML/CSS overlay, SVG icons | Crisp at any resolution, easy to style and make accessible |
| Audio | Web Audio API | Spatial sound, procedural effects |
| Storage | IndexedDB | Offline saves |
| Build | Vite | Fast dev server, optimized production builds |
| Tests | Vitest | Unit tests for game logic |
| CI/CD | GitHub Actions to GitHub Pages | Lint, type-check, test, deploy on every push |

## Principles

- **Composition over inheritance.** Entities are built from components rather than deep class hierarchies.
- **Systems communicate through events,** not direct imports, so combat, UI, and audio stay decoupled.
- **Data-driven content.** Classes, skills, items, and enemies are typed data definitions, not hard-coded logic.
- **Logic separated from rendering,** so game rules can be unit-tested without a GPU.
- **Patterns where they solve a problem,** not for their own sake.

## Core Systems

### Game loop
Fixed timestep for physics and gameplay (60 Hz), variable rate for rendering with interpolation. Keeps simulation stable regardless of frame rate.

### Entities and components
An entity is an ID with a set of components (Transform, Health, Movement, Combat, AI, Renderable, ...). Systems iterate over entities with the components they need. A lightweight approach, not a full archetype-based ECS.

### State machines
A generic, typed finite state machine drives player and enemy behavior (idle, patrol, chase, attack, stagger, dead) and the boss phases. States have enter/update/exit hooks and explicit transitions.

### Event bus
A typed publish/subscribe bus. Event names and payloads are checked at compile time. Example: combat publishes `damage:dealt`; UI shows damage numbers and audio plays a hit sound without either knowing about combat.

### Object pools
Projectiles, particles, damage numbers, and enemies are pooled to avoid garbage-collection pauses during combat.

### Saving
Save data is a versioned schema stored in IndexedDB. Each format change adds a migration, so older saves upgrade automatically.

### Audio
Built on the Web Audio API.
- **Music director:** a state machine (exploration, combat, boss) driven by event-bus events such as `combat:started` and `boss:entered`. Transitions crossfade between tracks on the beat.
- **Positional sound:** fire, enemies, and impacts are placed in 3D with HRTF panning relative to the listener, so they move between speakers as the player does.
- **Sound effects** are pooled voices with randomized pitch and volume to avoid repetition. Footsteps are triggered from animation events.

## Rendering

- **Baked lighting:** the dungeon's static lighting is computed in Blender and stored in lightmaps. Characters receive matching light from light probes.
- **Dynamic lights:** a small number of shadow-casting lights (torches, spells), limited per quality preset.
- **PBR materials** using photo-scanned textures.
- **Post-processing:** ambient occlusion, bloom, filmic tone mapping, color grading, vignette, film grain.
- **Custom shaders:** upgrade glow (+7 to +9), rune glow, dissolve on death, fog, liquids.
- **Quality presets:** Low / Medium / High / Ultra, chosen automatically from the detected GPU and adjustable in settings.
- **Dynamic resolution:** render resolution drops temporarily when the frame rate does.

## Asset Pipeline

| Asset | Source |
|---|---|
| Modular environment (walls, pillars, floors, stairs) | Python scripts run in Blender |
| Textures | Poly Haven, ambientCG (CC0) |
| Props | Poly Haven (CC0), Sketchfab (CC-BY) |
| Characters & animations | Mixamo |
| Weapons | Python scripts run in Blender |

All models export as glTF and are compressed (meshopt geometry, KTX2 textures). The entrance camp loads first; the rest of the dungeon streams in the background.

## Folder Structure

```
src/
  core/        game loop, time, event bus, asset loader, object pools
  ecs/         entities, components, systems
  physics/     Rapier wrapper, character controller
  render/      scene, camera rig, post-processing, quality presets
  shaders/     GLSL shaders
  gameplay/    combat, inventory, items, skills, upgrades
  ai/          state machines, enemy behaviors
  ui/          HUD, menus, SVG icons
  audio/       sound effects, music
  save/        IndexedDB persistence, schema migrations
  levels/      level data, triggers
  debug/       debug overlay, visual helpers
data/          class, skill, item, and enemy definitions
tools/blender/ asset-generation scripts
public/assets/ models, textures, audio
tests/
```
