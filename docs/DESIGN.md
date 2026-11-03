# Beneath the Ninth Seal — Game Design

> Living document. Numbers marked *(tuning)* are starting values and will change during balancing.

## 1. Pitch

A short, dark action RPG played in the browser. Pick a class, gear up, and fight your way through a ruined temple to the creature sealed beneath it. One polished dungeon, 15–20 minutes long, with the feel of Diablo and the class/upgrade systems of Metin2.

**Goals**
- Polished vertical slice over breadth: everything that ships should feel finished.
- Impressive in the first 60 seconds: fast load, strong visuals, immediate control.
- Completable in one sitting, with saves for anyone who wants to come back.

## 2. Platform & Controls

- Desktop browsers, keyboard and mouse. Mobile shows a "play on desktop" notice.
- Isometric camera, Diablo-style: fixed angle, follows the player.

| Input | Action |
|---|---|
| WASD | Move (runs by default) |
| Shift (hold) | Walk |
| Mouse | Aim |
| Left click | Basic attack |
| 1–4 | Skills |
| Q | Health potion |
| E | Interact (NPCs, chests, doors) |
| I | Inventory / character sheet |
| Esc | Pause menu |
| F3 or ` | Debug overlay |

## 3. Story

Centuries ago, an order of rune-smiths sealed something beneath their temple with nine runic seals. Eight have since shattered. The ninth is cracking, and the temple is filling with the dead.

A small camp has formed at the temple entrance. The blacksmith there forges with **seal shards**, fragments of the broken seals that still hold their power. Gear upgraded with enough shards begins to glow; a +9 item carries the power of all nine seals.

The player descends to the ninth seal to stop whatever is breaking through.

## 4. Character Creation

1. Choose a class (3D preview of the character).
2. Enter a character name.
3. Choose a starting weapon and armor from items that fit the class (rotating 3D preview).

## 5. Classes

| Class | Main stat | Weapons | Playstyle |
|---|---|---|---|
| Warrior | STR | Sword, Two-handed sword | Tanky melee, area damage |
| Assassin | DEX | Daggers, Bow, Sword | Fast melee with daggers, or ranged with a bow |
| Sorcerer | INT | Staff, Sword | Spells, area control |

All classes use **mana** (100, regenerating 6 per second) for skills on keys 1–4. Each class has a basic attack and four skills.

**Warrior** *(implemented)*

| Skill | Mana | Cooldown | Effect |
|---|---|---|---|
| Cleave | 12 | 2.5 s | 220° sweep: 26 damage and a slight shove |
| Charge | 18 | 6 s | Dash up to 7 m toward the cursor, stopping at the first enemy or wall, then a shield bash: 22 damage, 0.8 s stun, hard knockback |
| War Cry | 20 | 15 s | Draws enemies within 10 m and raises damage by 50% for 8 s |
| Earthshatter | 35 | 10 s | Leap and slam: 34 damage within 3.2 m of the impact, 1.6 s stun |

**Assassin** *(draft)*: Shadowstep (a long forward dive), Smoke Bomb (enemies lose track of you), Blade Flurry (rapid combo), Fan of Knives (a channeled spin hurling knives at every enemy nearby, in the style of Katarina's Death Lotus). Bow skills (Piercing Shot, Volley) arrive with the bow in M3.

**Sorcerer** *(draft)*: Firebolt (projectile), Frost Nova (area slow), Blink (a quick sidestep toward the cursor), Meteor (a warning circle, then a large impact).

Skills can't be interrupted by flinching, and a skill can cut a basic-attack combo short.

## 6. Stats & Leveling

| Stat | Effect |
|---|---|
| STR | Warrior damage |
| DEX | Assassin damage |
| INT | Sorcerer damage, max mana |
| VIT | Max health |

- The player levels from 1 to about 10 over the dungeon.
- Each level grants stat points to spend freely *(tuning: 3 per level)*.

## 7. Items

### Equipment slots
Weapon, Armor, Helmet, Gloves, Boots, Necklace.

Weapon and armor are chosen at character creation. The other slots are filled by drops from enemies, chests, and the boss.

### Weapon types

| Weapon | Classes |
|---|---|
| Sword | Warrior, Assassin, Sorcerer |
| Two-handed sword | Warrior |
| Daggers | Assassin |
| Bow | Assassin |
| Staff | Sorcerer |

Armor and helmets are class-specific (plate, leather, robes). Gloves, boots, and necklaces fit every class.

### Bonuses
Items roll 0–3 random bonuses from a pool: +HP, +mana, +damage, +STR/DEX/INT/VIT, +attack speed, +movement speed, +critical chance.

## 8. Upgrades (+0 to +9)

- Done at the blacksmith for **gold + seal shards**.
- Each level increases the item's base values *(tuning)*.
- Success chance drops at higher levels *(tuning: 100% up to +3, falling to ~30% at +9)*.
- **Failure is forgiving:** it consumes the gold and shards but never destroys or downgrades the item.
- Reaching +9 on at least one item must be possible in a normal playthrough.

| Level | Visual |
|---|---|
| +0 to +6 | Normal |
| +7 | Subtle shimmer |
| +8 | Stronger glow |
| +9 | Bright glow and sparkle particles |

Applies to weapons and armor.

## 9. Dungeon

| # | Area | Contents |
|---|---|---|
| 1 | Entrance camp | Elder (story, warnings), Merchant (buy/sell, potions), Blacksmith (upgrades). Doubles as the tutorial. |
| 2 | Hall of Bones | Skeleton warriors, first chest. |
| 3 | Rune Gallery | Ranged skeleton archers, glowing rune puzzle that opens the way forward. |
| 4 | Antechamber | Wounded adventurer (warns about the boss), an elite enemy, a chest. |
| 5 | Chamber of the Ninth Seal | Boss fight in two phases. |

The camp is a safe zone; the player can return to it to shop and upgrade.

## 10. NPCs & Dialogue

- Dialogue is shown as text boxes, always.
- Each NPC has a few short voiced lines (greeting, key warnings). Voices are recorded by hand and processed into character voices.
- Voice is a polish step; the game is complete without it.

## 11. Audio

### Adaptive music
The soundtrack follows what is happening, crossfading between three states:

| State | When | Mood |
|---|---|---|
| Exploration | Default | Atmospheric, sparse, low drones |
| Combat | Enemies have noticed the player | Driving percussion, tension |
| Boss | Inside the Chamber of the Ninth Seal | Epic, choir and full orchestration |

Combat music starts when the first enemy notices the player and fades back to exploration a few seconds after the last one dies or loses track of them.

### Positional sound
- Torches and braziers play a looping crackle from their position: it pans between speakers and gets louder as the player approaches.
- Enemy sounds come from where the enemy is.

### Sound effects
- Footsteps synced to the animation, different for walking and running, with slight random pitch variation.
- Sword swings and hits, bow draw and release, spell casts and impacts, per skill.
- UI sounds: menus, equipping, upgrade success and failure.

Browsers only allow audio after the player interacts with the page, so the game opens on a title screen with an Enter button.

## 12. Saving

- Automatic saves at checkpoints (entering each area, after the boss) plus manual save in the pause menu.
- Stored locally in the browser. No account required.

## 13. Visual Target

Diablo IV / Path of Exile 2: dark, realistic, atmospheric. Achieved through baked lighting, photo-based PBR materials, post-processing, fog, and particles. Must hold 60 FPS, with quality presets for weaker hardware. See [ARCHITECTURE.md](ARCHITECTURE.md#rendering).

## 14. Out of Scope

Multiplayer, PvP, crafting, open world, more than three classes, mounts.

## 15. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Look test | One lit dungeon room with an animated character, post-processing, and quality presets, live on GitHub Pages at 60 FPS. |
| M1 | Core gameplay | Player movement, camera, basic attack, one enemy with AI, health and death. |
| M2 | Classes & skills | All three classes with their skills. |
| M3 | Items & progression | Character creation, inventory, equipment, drops, leveling, upgrades. |
| M4 | Dungeon & story | All five areas, NPCs, dialogue, rune puzzle, boss. |
| M5 | Polish | VFX, adaptive music, sound effects, voice lines, menus, saving, balancing. |
| M6 | Release | Performance pass, README media, final testing. |
