# Beneath the Ninth Seal

A dark 3D action RPG that runs in the browser. Choose a class, gear up, and fight through a ruined temple to the creature sealed beneath it.

> **Status: early development.** The current build is a combat test: a warrior fighting skeletons in one torch-lit room.
>
> **[Play in the browser](https://rarespirvu10.github.io/ninth-seal/)** (desktop, keyboard). Press F3 or ` for the debug overlay.

## Planned Features

- Three classes (Warrior, Assassin, Sorcerer) with their own stats, weapons, and skills
- Equipment with random bonuses and +0 to +9 upgrades; gear glows from +7
- A five-area dungeon with NPCs, a rune puzzle, and a two-phase boss
- Diablo-style isometric camera with realistic lighting and custom shaders
- Offline saves, no account or install required

## Tech Stack

TypeScript · Three.js (WebGL2) · GLSL · Rapier physics · Web Audio API · IndexedDB · Vite · Vitest · GitHub Actions

## Engineering Focus

- **Component-based entities** instead of deep inheritance
- **Finite state machines** for player, enemy, and boss behavior
- **Typed event bus** decoupling gameplay, UI, and audio
- **Object pooling** to keep combat at a steady 60 FPS
- **Data-driven content:** classes, skills, and items defined as typed data
- **Versioned save system** with automatic migrations
- **Adaptive graphics:** quality presets and dynamic resolution
- **Scripted lighting pipeline:** Blender bakes lightmaps from the same level data the game uses for physics
- **Automated pipeline:** lint, type-check, tests, and deploy on every push

Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [Game design](docs/DESIGN.md): classes, items, upgrades, dungeon, story, milestones
- [Architecture](docs/ARCHITECTURE.md): systems, rendering, asset pipeline

## Author

Rares Pirvu

## License

© 2026 Rares Pirvu. All rights reserved. The source is published for viewing only; no permission is granted to copy, modify, or redistribute it.
