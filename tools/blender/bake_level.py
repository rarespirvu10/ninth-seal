"""
Builds a level from its layout JSON, bakes ambient and bounce lighting into a lightmap,
and exports the result for the game.

Run from anywhere (paths resolve from this file):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/bake_level.py -- data/levels/test-room.json [--size 1024] [--samples 256]

Writes public/assets/levels/<name>/:
  level.glb       geometry, one mesh per material, UV0 for textures and UV1 for the lightmap
  lightmap.png    sRGB-encoded irradiance, scaled to fill the 8-bit range
  lightmap.json   the intensity the game must apply to decode it

What gets baked: ambient sky light (direct and bounced, so it darkens in corners and behind
pillars) plus light from the fires after bouncing. Direct fire light stays dynamic in the game
so it can flicker and cast live shadows.
"""

import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEXTURE_DIR = os.path.join(ROOT, 'public', 'assets', 'textures')
OUTPUT_ROOT = os.path.join(ROOT, 'public', 'assets', 'levels')

CYLINDER_SEGMENTS = 24
FIRE_COLOR_LINEAR = (1.0, 0.254, 0.047)  # 0xff8a3d, the game's fire color, in linear RGB.

# Direction toward the game's fixed isometric camera (yaw 45 deg, pitch 55 deg), in Blender axes.
_YAW, _PITCH = math.radians(45), math.radians(55)
TOWARD_CAMERA = Vector((
    math.sin(_YAW) * math.cos(_PITCH),
    -math.cos(_YAW) * math.cos(_PITCH),
    math.sin(_PITCH),
))


def main():
    args = parse_args()
    with open(os.path.join(ROOT, args.layout) if not os.path.isabs(args.layout) else args.layout) as f:
        layout = json.load(f)

    out_dir = os.path.join(OUTPUT_ROOT, layout['name'])
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_cycles(args.samples)

    lightmap = bpy.data.images.new('Lightmap', args.size, args.size, alpha=False, float_buffer=True)
    materials = {mid: create_material(mid, spec, lightmap) for mid, spec in layout['materials'].items()}
    objects = build_geometry(layout, materials)
    unwrap_lightmap_uvs(objects)
    lights = add_fire_lights(layout['fires'])
    world = create_world(layout['ambient']['color'])

    # Pass 1: fire light after it bounces (direct fire light stays dynamic in the game).
    set_world_strength(world, 0.0)
    for light in lights:
        light.hide_render = False
    bounce = bake(objects, lightmap, {'INDIRECT'})

    # Pass 2: ambient sky light, direct and bounced.
    set_world_strength(world, 1.0)
    for light in lights:
        light.hide_render = True
    ambient = bake(objects, lightmap, {'DIRECT', 'INDIRECT'})

    intensity = save_lightmap(bounce + ambient, os.path.join(out_dir, 'lightmap.png'))
    export_glb(objects, os.path.join(out_dir, 'level.glb'))

    with open(os.path.join(out_dir, 'lightmap.json'), 'w') as f:
        json.dump({'lightMapIntensity': round(intensity, 4), 'size': args.size, 'samples': args.samples}, f, indent=2)
        f.write('\n')

    print(f'Baked {layout["name"]}: {len(objects)} meshes, lightmap {args.size}px, intensity {intensity:.3f}')


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument('layout', help='Path to the level layout JSON')
    parser.add_argument('--size', type=int, default=1024, help='Lightmap resolution')
    parser.add_argument('--samples', type=int, default=256, help='Cycles samples per bake pass')
    return parser.parse_args(argv)


# --- Coordinates -------------------------------------------------------------------------------

def to_blender(v):
    """Game coordinates (Y up) to Blender coordinates (Z up). The glTF exporter converts back."""
    x, y, z = v
    return Vector((x, -z, y))


def piece_bounds(piece):
    center = to_blender(piece['position'])
    if piece['shape'] == 'box':
        w, h, d = piece['size']
        half = Vector((w / 2, d / 2, h / 2))
    else:
        r = max(piece['radiusTop'], piece['radiusBottom'])
        half = Vector((r, r, piece['height'] / 2))
    return center - half, center + half


# --- Scene setup -------------------------------------------------------------------------------

def configure_cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for device_type in ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = device_type
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == device_type for d in prefs.devices):
            for device in prefs.devices:
                device.use = True
            scene.cycles.device = 'GPU'
            print(f'Baking on GPU ({device_type})')
            break
    else:
        print('No GPU backend available, baking on CPU')
    scene.cycles.samples = samples
    # Small bright lights produce "fireflies" (isolated hot pixels) in bounced light; clamp them.
    scene.cycles.sample_clamp_indirect = 1.0
    scene.render.bake.margin = 8
    scene.render.bake.target = 'IMAGE_TEXTURES'


def srgb_hex_to_linear(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)


def create_material(material_id, spec, lightmap):
    material = bpy.data.materials.new(material_id)  # Node-based by default since Blender 5.
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    if 'texture' in spec:
        # Real albedo so bounced light picks up the stone's color. (The game's tint is minor
        # and omitted here.)
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        albedo = nodes.new('ShaderNodeTexImage')
        albedo.image = bpy.data.images.load(os.path.join(TEXTURE_DIR, spec['texture'], 'diff.jpg'), check_existing=True)
        links.new(uv.outputs['UV'], albedo.inputs['Vector'])
        links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*srgb_hex_to_linear(spec['color']), 1.0)
        bsdf.inputs['Metallic'].default_value = spec.get('metalness', 0.0)
        bsdf.inputs['Roughness'].default_value = spec.get('roughness', 0.5)

    # The bake writes into the active image node; it is not connected to the shader.
    target = nodes.new('ShaderNodeTexImage')
    target.image = lightmap
    nodes.active = target
    return material


def create_world(color):
    world = bpy.data.worlds.new('Ambient')
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (*color, 1.0)
    bpy.context.scene.world = world
    return world


def set_world_strength(world, strength):
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Strength'].default_value = strength


def add_fire_lights(fires):
    lights = []
    for i, fire in enumerate(fires):
        data = bpy.data.lights.new(f'fire_{i}', 'POINT')
        # The game uses candela; a Cycles point light of P watts gives P / (4 pi) per steradian.
        data.energy = fire['intensity'] * 4 * math.pi
        data.color = FIRE_COLOR_LINEAR
        data.shadow_soft_size = 0.3
        obj = bpy.data.objects.new(data.name, data)
        # Same offset as the game's Fire: the light sits halfway up the flame.
        obj.location = to_blender(fire['position']) + Vector((0, 0, fire['size'] * 0.5))
        bpy.context.scene.collection.objects.link(obj)
        lights.append(obj)
    return lights


# --- Geometry ----------------------------------------------------------------------------------

def build_geometry(layout, materials):
    """Builds every piece, then joins pieces into one mesh per (material, casts shadow) group."""
    lows, highs = zip(*(piece_bounds(p) for p in layout['pieces']))
    level_min = Vector(tuple(min(v[i] for v in lows) for i in range(3)))
    level_max = Vector(tuple(max(v[i] for v in highs) for i in range(3)))

    groups = {}
    for index, piece in enumerate(layout['pieces']):
        obj = build_piece(piece, index, level_min, level_max)
        key = (piece['material'], piece.get('castShadow', True))
        groups.setdefault(key, []).append(obj)

    joined = []
    for (material_id, casts_shadow), pieces in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in pieces:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        # The game reads the "__noshadow" suffix to turn off shadow casting.
        obj.name = obj.data.name = material_id if casts_shadow else f'{material_id}__noshadow'
        obj.data.materials.clear()
        obj.data.materials.append(materials[material_id])
        joined.append(obj)
    return joined


def build_piece(piece, index, level_min, level_max):
    bm = bmesh.new()
    if piece['shape'] == 'box':
        w, h, d = piece['size']
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    else:
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=CYLINDER_SEGMENTS,
            radius1=piece['radiusBottom'],
            radius2=piece['radiusTop'],
            depth=piece['height'],
        )
    center = to_blender(piece['position'])
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    remove_hidden_faces(bm, level_min, level_max)

    uv = bm.loops.layers.uv.new('UVMap')
    tile = piece.get('tile', 1.0)
    for face in bm.faces:
        map_face_uvs(face, uv, tile, piece, center)

    mesh = bpy.data.meshes.new(f'piece_{index}')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def remove_hidden_faces(bm, level_min, level_max):
    """
    Drops faces the fixed camera can never see, so they don't waste lightmap space:
    faces pointing down, and outward faces on the level's outer boundary that face away from the camera.
    """
    eps = 1e-3
    hidden = []
    for face in bm.faces:
        n = face.normal
        c = face.calc_center_median()
        if n.z < -0.99:
            hidden.append(face)
            continue
        on_boundary = any(
            (n[i] < -0.99 and abs(c[i] - level_min[i]) < eps) or (n[i] > 0.99 and abs(c[i] - level_max[i]) < eps)
            for i in range(3)
        )
        if on_boundary and n.dot(TOWARD_CAMERA) < 0:
            hidden.append(face)
    bmesh.ops.delete(bm, geom=hidden, context='FACES_ONLY')


def map_face_uvs(face, uv, tile, piece, center):
    """World-scaled UVs: a texture repeat is `tile` meters on every face, whatever the piece size."""
    n = face.normal
    if piece['shape'] == 'cylinder' and abs(n.z) < 0.5:
        # Wrap around the side of the cylinder.
        radius = (piece['radiusTop'] + piece['radiusBottom']) / 2
        angles = [math.atan2(l.vert.co.y - center.y, l.vert.co.x - center.x) for l in face.loops]
        if max(angles) - min(angles) > math.pi:  # Face straddles the seam: keep its angles contiguous.
            angles = [a + 2 * math.pi if a < 0 else a for a in angles]
        for loop, angle in zip(face.loops, angles):
            loop[uv].uv = (angle * radius / tile, loop.vert.co.z / tile)
        return

    # Planar projection along the face's dominant axis.
    axis = max(range(3), key=lambda i: abs(n[i]))
    for loop in face.loops:
        co = loop.vert.co
        u, v = {0: (co.y, co.z), 1: (co.x, co.z), 2: (co.x, co.y)}[axis]
        loop[uv].uv = (u / tile, v / tile)


def unwrap_lightmap_uvs(objects):
    """Second UV set shared across all meshes, packed into one lightmap atlas."""
    for obj in objects:
        layer = obj.data.uv_layers.new(name='Lightmap')
        obj.data.uv_layers.active = layer

    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


# --- Baking and output -------------------------------------------------------------------------

def bake(objects, image, pass_filter):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    print(f'Baking {sorted(pass_filter)} ...')
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=pass_filter, use_clear=True, margin=8)
    size = image.size[0]
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(size, size, 4)[:, :, :3].copy()


def gaussian_blur(rgb, sigma):
    """Separable blur to smooth leftover sampling noise; lighting this soft loses no detail."""
    radius = int(math.ceil(sigma * 3))
    x = np.arange(-radius, radius + 1)
    kernel = np.exp(-(x ** 2) / (2 * sigma ** 2))
    kernel /= kernel.sum()
    padded = np.pad(rgb, ((radius, radius), (0, 0), (0, 0)), mode='edge')
    rgb = sum(kernel[i] * padded[i:i + rgb.shape[0]] for i in range(len(kernel)))
    padded = np.pad(rgb, ((0, 0), (radius, radius), (0, 0)), mode='edge')
    return sum(kernel[i] * padded[:, i:i + rgb.shape[1]] for i in range(len(kernel)))


def save_lightmap(rgb, path):
    """
    Encodes linear irradiance into an 8-bit sRGB PNG. Values are scaled so the brightest texels
    use the full range; the returned intensity undoes that scale in the game. sRGB encoding spends
    more precision on dark values, where this dungeon lives, and a little dither hides banding.
    """
    rgb = gaussian_blur(rgb, sigma=1.0)
    peak = float(np.percentile(rgb.max(axis=2), 99.5)) or 1.0
    scaled = np.clip(rgb / peak, 0.0, 1.0)
    encoded = np.where(scaled <= 0.0031308, scaled * 12.92, 1.055 * np.power(scaled, 1 / 2.4) - 0.055)
    rng = np.random.default_rng(9)
    encoded = np.clip(encoded + (rng.random(encoded.shape) - 0.5) / 255, 0.0, 1.0)

    size = rgb.shape[0]
    rgba = np.concatenate([encoded, np.ones((size, size, 1))], axis=2).astype(np.float32)
    image = bpy.data.images.new('lightmap_out', size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = 'Non-Color'  # Already encoded; save the values as they are.
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()

    # three.js lightmaps hold irradiance; Cycles diffuse light passes hold irradiance / pi.
    return math.pi * peak


def export_glb(objects, path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',  # Names only: the game assigns its own textured materials.
        export_image_format='NONE',
        export_lights=False,
        export_cameras=False,
        export_apply=True,
        export_yup=True,
    )


if __name__ == '__main__':
    main()
