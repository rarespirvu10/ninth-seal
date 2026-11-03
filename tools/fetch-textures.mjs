// Downloads CC0 PBR textures from Poly Haven (https://polyhaven.com) into public/assets/textures.
// Usage: node tools/fetch-textures.mjs [resolution]   (default: 1k)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEXTURES = ['monastery_stone_floor', 'castle_wall_slates', 'old_stone_wall_02'];

// Poly Haven map name -> local file suffix.
const MAPS = { Diffuse: 'diff', nor_gl: 'normal', arm: 'arm' };

const resolution = process.argv[2] ?? '1k';
const outRoot = join(import.meta.dirname, '..', 'public', 'assets', 'textures');

for (const id of TEXTURES) {
  const response = await fetch(`https://api.polyhaven.com/files/${id}`);
  if (!response.ok) throw new Error(`Poly Haven lookup failed for ${id}: ${response.status}`);
  const files = await response.json();

  const dir = join(outRoot, id);
  await mkdir(dir, { recursive: true });

  for (const [map, suffix] of Object.entries(MAPS)) {
    const url = files[map]?.[resolution]?.jpg?.url;
    if (!url) throw new Error(`${id} has no ${resolution} jpg for ${map}`);

    const image = await fetch(url);
    if (!image.ok) throw new Error(`Download failed: ${url}`);
    await writeFile(join(dir, `${suffix}.jpg`), Buffer.from(await image.arrayBuffer()));
    console.log(`${id}/${suffix}.jpg`);
  }
}
