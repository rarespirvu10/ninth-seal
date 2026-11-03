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
A generic, typed finite state machine (`src/core/StateMachine.ts`) drives player and enemy behavior (idle, patrol, chase, attack, stagger, dead) and the boss phases. States have enter/update/exit hooks; `update` returns the next state's name to transition.

### Combat
- **Combos** are data: each step names a clip, the clip-time range it plays, a hit window, damage, reach, and arc (`src/gameplay/warriorAttacks.ts`). Hit windows were set from the measured peak speed of the weapon hand in each animation.
- `AttackSequence` advances a combo on the fixed step. A click during a swing, or holding the button, chains the next step; otherwise the combo ends. Hit-window checks use interval overlap, so a long frame can never skip a hit.
- Each swing re-aims at the cursor, and its clip's root-motion curve moves the body through physics, so lunges stop at walls.
- Animation follows gameplay, not the reverse: action clips have their time set from the fixed-step simulation (interpolated for rendering), so the pose always matches the hit window.
- During a hit window, attackers emit `combat:strike` events. `CombatSystem` subscribes and resolves them with an arc test that counts the target's body width, so neither side calls the other: each swing hits a target at most once, the player hits enemies, and enemies hit the player.
- Damage and deaths are events too (`combat:damaged`, `combat:died`), which the HUD listens to.

### Characters and AI
- `CharacterMotor` is a component owned by both the player and enemies. It handles movement on the fixed step, gravity, facing, root-motion travel, speed measurement, and render interpolation.
- Each enemy is a state machine: idle, then chase once the player is within aggro range, then attack when in reach and off cooldown, with flinch and death reachable from any state. Tuning lives in data (`src/gameplay/enemies.ts`).
- The player flinches when hit, then ignores further flinches for a moment, so groups can't stun-lock them.
- With the debug overlay open, each enemy's live state and health float above it.

### Event bus
A typed publish/subscribe bus. Event names and payloads are checked at compile time. Example: combat publishes `damage:dealt`; UI shows damage numbers and audio plays a hit sound without either knowing about combat.

### Object pools
`ObjectPool` reuses objects instead of allocating them, to avoid garbage-collection pauses during combat. Damage numbers use it today: a whole fight creates only as many number elements as are ever on screen at once, and the debug overlay reports live and created counts. Projectiles and particles will use it too. Effects that update every frame (the weapon trail) reuse their own buffers and allocate nothing after construction.

### Game feel
- **Hit-stop:** landing a blow pauses the simulation for 60 ms (110 ms for heavy hits) while rendering continues.
- **Camera shake:** trauma-based. Hits add trauma, which decays quickly, and the visible shake grows with its square, so small hits barely register and big ones punch.
- **Damage numbers** float over whoever was hit: gold for damage dealt, red for damage taken, larger for heavy hits.

### Saving
Save data is a versioned schema stored in IndexedDB. Each format change adds a migration, so older saves upgrade automatically.

### Audio
Built on the Web Audio API.
- **Music director:** a state machine (exploration, combat, boss) driven by event-bus events such as `combat:started` and `boss:entered`. Transitions crossfade between tracks on the beat.
- **Positional sound:** fire, enemies, and impacts are placed in 3D with HRTF panning relative to the listener, so they move between speakers as the player does.
- **Sound effects** are pooled voices with randomized pitch and volume to avoid repetition. Footsteps are triggered from animation events.

## Rendering

- **Baked lighting:** ambient sky light and bounced fire light are computed in Blender and stored in a lightmap, so corners and the areas behind pillars darken naturally. Characters get a matching image-based environment instead, so the level isn't lit twice.
- **Dynamic lights:** fires stay live on top of the bake, so they flicker and cast real-time shadows. Shadows are budgeted per quality preset and given to the fires nearest the player. The nearest redraws its shadow map every frame and the others every other frame; each point-light shadow redraws every caster six times, so this keeps fights at 60 FPS.
- **Shader warm-up:** every material compiles while the loading screen is up, so enemies appearing for the first time don't stall a frame.
- **PBR materials** using photo-scanned textures.
- **Post-processing:** ambient occlusion, bloom, filmic tone mapping, color grading, vignette, film grain.
- **Custom shaders** (`src/shaders/`):
  - Built: a procedural flame, a weapon trail, and a death dissolve.
  - Planned: upgrade glow (+7 to +9), rune glow, fog, liquids.
  - The trail is a ribbon between the blade's base and tip, sampled each frame and smoothed with Catmull-Rom splines.
  - The dissolve extends three.js's standard material through `onBeforeCompile`: noise discards pixels, and a glowing band runs along the burning edge. Corpses keep full lighting until gone, with no transparency sorting.
- **Shader warm-up** includes variants that only appear later, such as the dissolve, so nothing compiles mid-fight.
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

### Level pipeline
Each level is described once, in `data/levels/<name>.json`: pieces, materials, fires, spawn point, ambient light.

1. `npm run bake:level -- data/levels/<name>.json` runs `tools/blender/bake_level.py` in Blender. It builds the geometry with world-scaled texture coordinates, drops faces the fixed camera can never see, joins pieces into one mesh per material, unwraps a shared lightmap atlas, and bakes two Cycles passes (bounced fire light, then ambient sky light).
2. Output goes to `public/assets/levels/<name>/`: the geometry (`level.glb`), an 8-bit sRGB lightmap scaled to its full range, and the intensity that decodes it.
3. At runtime the game loads that geometry and lightmap for visuals, and reads the same layout file for colliders, fires, enemy spawns, and the player's spawn point. Visuals and physics can't drift apart.
4. Layouts can add collision-only shapes, invisible in the game, where collision should be simpler than what's drawn. The test room's dais has a ramp over its two 20 cm steps, because Rapier's step climbing fails for characters moving slower than about 2 m/s.

### Character pipeline
1. Raw Mixamo downloads go in `assets-src/mixamo/<name>/` (not committed): `<name>.fbx` with the skin and idle animation, plus one skinless FBX per extra animation.
2. `npm run convert:character -- assets-src/mixamo/<name> <name>` runs `tools/blender/convert_character.py`. It merges every animation onto one skeleton as named clips, resizes textures to 1024 px, and turns Mixamo's specular map into glTF metalness and roughness so armor reads as metal. It also measures each locomotion clip's ground speed: how fast a planted foot slides backward relative to the hips.
3. **Root-motion extraction:** for every other clip (attacks, hit reactions, deaths), the converter removes the hips' horizontal travel from the animation and records it as a curve. The game applies that curve through physics instead, so a 2 m attack lunge moves the collision body with it and stops at walls.
4. Output goes to `public/assets/characters/`: `<name>.glb`, and `<name>.json` with the measured speeds and root-motion curves.
5. At runtime, `LocomotionAnimator` picks idle, walk, or run from the speed the character actually achieves after collisions, crossfades between them, and plays each clip at movement speed ÷ ground speed so the feet don't slide.

### Weapons
`npm run build:weapons` runs `tools/blender/build_weapons.py`, which models the weapons procedurally (a diamond-section blade, a curved heater shield) and exports them to one file. Each weapon's origin is where it is held. In the game, `attachToBone` mounts them on hand bones using offsets in the bone's own frame, derived from the skeleton's knuckle positions.

## Folder Structure

```
src/
  core/        game loop, time, event bus, asset loader, object pools
  characters/  character loading, animation, equipment
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
data/          level layouts; class, skill, item, and enemy definitions
tools/blender/ level baking, character conversion, weapon modeling
public/assets/ models, textures, audio
tests/
```
