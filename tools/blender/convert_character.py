"""
Converts a Mixamo character and its animations into one compressed glTF for the game.

Run from anywhere (paths resolve from this file):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/convert_character.py -- assets-src/mixamo/warrior warrior

Input folder:
  <name>.fbx   the character, downloaded "With Skin"; its animation becomes the "idle" clip
  *.fbx        other animations, downloaded "Without Skin"; each becomes a clip named after its file

Writes public/assets/characters/:
  <name>.glb   mesh, skeleton, every clip, textures resized to 1024 px
  <name>.json  height, and per clip: ground speed for walk/run (so the game can match playback
               to movement) or the root motion removed from it (see extract_root_motion)
"""

import argparse
import glob
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.path.join(ROOT, 'public', 'assets', 'characters')
TEXTURE_SIZE = 1024
FEET = ('mixamorig:LeftFoot', 'mixamorig:RightFoot')
HIPS = 'mixamorig:Hips'
# Looping clips whose travel the game drives itself; their playback rate follows movement speed.
LOCOMOTION = {'walk', 'run'}
# Mixamo characters face -Y in Blender, so their right-hand side is -X.
FORWARD = Vector((0, -1, 0))
RIGHT = Vector((-1, 0, 0))
# Clips whose hips travel less than this are treated as staying in place.
ROOT_MOTION_THRESHOLD = 0.05


def main():
    args = parse_args()
    source = args.source if os.path.isabs(args.source) else os.path.join(ROOT, args.source)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    armature = import_character(os.path.join(source, f'{args.name}.fbx'))
    clips = {'idle': take_action(armature, 'idle')}

    for path in sorted(glob.glob(os.path.join(source, '*.fbx'))):
        clip = os.path.splitext(os.path.basename(path))[0]
        if clip != args.name:
            clips[clip] = import_animation(path, clip)

    fps = bpy.context.scene.render.fps
    metadata = {'height': round(character_height(), 3), 'clips': {}}
    for clip, action in clips.items():
        info = {'duration': round((action.frame_range[1] - action.frame_range[0]) / fps, 4)}
        if clip in LOCOMOTION:
            info['groundSpeed'] = round(ground_speed(armature, action, fps), 3)
            if info['groundSpeed'] < 0:
                # Negative speed: the clip moves backward. The game still plays it correctly
                # (in reverse), but a forward version of the animation will look more natural.
                print(f'WARNING: clip "{clip}" moves backward (ground speed {info["groundSpeed"]} m/s)')
        elif clip != 'idle':
            motion = extract_root_motion(armature, action, fps)
            if motion:
                info['rootMotion'] = motion
        metadata['clips'][clip] = info

    push_to_nla(armature, clips)
    for material in bpy.data.materials:
        prepare_material(material)

    path = os.path.join(OUTPUT_DIR, f'{args.name}.glb')
    export_glb(path)
    with open(os.path.join(OUTPUT_DIR, f'{args.name}.json'), 'w') as f:
        json.dump(metadata, f, indent=2)
        f.write('\n')

    size_kb = os.path.getsize(path) / 1024
    print(f'Converted {args.name}: {len(clips)} clips, {size_kb:.0f} KB, {json.dumps(metadata)}')


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument('source', help='Folder with the Mixamo FBX files')
    parser.add_argument('name', help='Character name; <source>/<name>.fbx must exist')
    return parser.parse_args(argv)


# --- Import ------------------------------------------------------------------------------------

def import_character(path):
    bpy.ops.import_scene.fbx(filepath=path)
    return next(o for o in bpy.data.objects if o.type == 'ARMATURE')


def import_animation(path, clip):
    """Imports an animation-only FBX, keeps its action, and deletes the extra skeleton."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    imported = [o for o in bpy.data.objects if o not in before]
    armature = next(o for o in imported if o.type == 'ARMATURE')
    action = take_action(armature, clip)
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return action


def take_action(armature, name):
    action = armature.animation_data.action
    action.name = name
    action.use_fake_user = True
    return action


def assign(armature, action):
    armature.animation_data.action = action
    # Blender 4.4+ "slotted" actions must also be told which slot drives this object.
    if action is not None and hasattr(armature.animation_data, 'action_slot') and action.slots:
        armature.animation_data.action_slot = action.slots[0]


# --- Measurements ------------------------------------------------------------------------------

def character_height():
    top = max((o.matrix_world @ Vector(c)).z for o in bpy.data.objects if o.type == 'MESH' for c in o.bound_box)
    bottom = min((o.matrix_world @ Vector(c)).z for o in bpy.data.objects if o.type == 'MESH' for c in o.bound_box)
    return top - bottom


def ground_speed(armature, action, fps):
    """
    Speed at which the animation "travels", measured from the feet: while a foot is planted it
    slides backward relative to the hips at exactly the walking speed. Playing the clip at
    movement_speed / ground_speed keeps the feet from sliding on the floor.
    """
    assign(armature, action)
    start, end = (int(f) for f in action.frame_range)
    forward = Vector((0, -1, 0))  # Mixamo characters face -Y in Blender.
    speeds = []
    for bone in FEET:
        samples = []
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            foot = armature.matrix_world @ armature.pose.bones[bone].head
            hips = armature.matrix_world @ armature.pose.bones[HIPS].head
            samples.append(((foot - hips).dot(forward), foot.z))
        lowest = min(z for _, z in samples)
        for (a, za), (b, zb) in zip(samples, samples[1:]):
            if za < lowest + 0.03 and zb < lowest + 0.03:  # Planted on both frames.
                speeds.append((a - b) * fps)
    assign(armature, None)
    return float(np.median(speeds)) if speeds else 0.0


def hips_position(armature, frame):
    """World position of the hips at a (possibly fractional) frame."""
    whole = math.floor(frame)
    bpy.context.scene.frame_set(whole, subframe=frame - whole)
    return armature.matrix_world @ armature.pose.bones[HIPS].head


def fcurves_of(action):
    # Blender 5 removed Action.fcurves; curves live in the channelbag of the action's slot.
    return action.layers[0].strips[0].channelbag(action.slots[0]).fcurves


def extract_root_motion(armature, action, fps):
    """
    Moves the hips' horizontal travel out of a clip (attack lunges, falling back on death) and
    returns it as a curve. The game then moves the character by that curve through physics, so a
    lunge stays attached to the collision body and stops at walls instead of passing through them.

    Returns {fps, forward, right}: cumulative displacement in meters, one sample per frame,
    in the character's own frame of reference. Returns None if the clip barely moves.
    """
    assign(armature, action)
    start, end = action.frame_range
    origin = hips_position(armature, start)

    forward, right = [], []
    for frame in range(int(start), int(end) + 1):
        offset = hips_position(armature, frame) - origin
        forward.append(round(offset.dot(FORWARD), 3))
        right.append(round(offset.dot(RIGHT), 3))
    if max(math.hypot(f, r) for f, r in zip(forward, right)) < ROOT_MOTION_THRESHOLD:
        assign(armature, None)
        return None

    # Hips keys are in the hips' rest space; convert world-space corrections into it.
    to_local = (armature.matrix_world.to_3x3() @ armature.data.bones[HIPS].matrix_local.to_3x3()).inverted()
    curves = {fc.array_index: fc for fc in fcurves_of(action) if fc.data_path == f'pose.bones["{HIPS}"].location'}
    keyed_frames = sorted({key.co.x for curve in curves.values() for key in curve.keyframe_points})

    # Measure every correction before editing any key, so edits don't affect later measurements.
    corrections = {}
    for frame in keyed_frames:
        offset = hips_position(armature, frame) - origin
        corrections[frame] = to_local @ Vector((-offset.x, -offset.y, 0.0))
    for index, curve in curves.items():
        for key in curve.keyframe_points:
            delta = corrections[key.co.x][index]
            key.co.y += delta
            key.handle_left.y += delta
            key.handle_right.y += delta
        curve.update()

    assign(armature, None)
    return {'fps': fps, 'forward': forward, 'right': right}


# --- Animation and materials -------------------------------------------------------------------

def push_to_nla(armature, clips):
    """One NLA track per clip; the glTF exporter turns each track into a named animation."""
    assign(armature, None)
    for clip, action in clips.items():
        track = armature.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, int(action.frame_range[0]), action)
        if hasattr(strip, 'action_slot') and action.slots:
            strip.action_slot = action.slots[0]


def prepare_material(material):
    """
    Resizes textures and replaces Mixamo's specular map with metalness and roughness.
    The specular map is bright on armor plates and dark on cloth and skin, so it maps well to
    "how metallic and how polished": plates come out as reflective metal, cloth stays matte.
    """
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')

    for node in nodes:
        if node.type == 'TEX_IMAGE' and node.image and node.image.size[0] > TEXTURE_SIZE:
            node.image.scale(TEXTURE_SIZE, TEXTURE_SIZE)

    specular_link = next((l for l in bsdf.inputs['Specular IOR Level'].links), None)
    if specular_link is None:
        return
    specular_node = specular_link.from_node
    links.remove(specular_link)
    bsdf.inputs['Specular IOR Level'].default_value = 0.5  # glTF's default specular strength.

    size = specular_node.image.size[0]
    pixels = np.empty(size * size * 4, dtype=np.float32)
    specular_node.image.pixels.foreach_get(pixels)
    specular = pixels.reshape(-1, 4)[:, 0]

    metalness = np.clip((specular - 0.15) / 0.45, 0.0, 1.0)
    metalness = metalness * metalness * (3 - 2 * metalness)  # Smoothstep.
    roughness = 0.85 - 0.5 * specular

    # glTF packs roughness in green and metalness in blue of one texture.
    orm = np.stack([np.ones_like(specular), roughness, metalness, np.ones_like(specular)], axis=1)
    image = bpy.data.images.new(f'{material.name}_orm', size, size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(orm.astype(np.float32).ravel())
    image.pack()

    specular_node.image = image
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(specular_node.outputs['Color'], separate.inputs['Color'])
    links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_animation_mode='NLA_TRACKS',
        export_image_format='JPEG',
        export_jpeg_quality=88,
        export_def_bones=True,
        export_apply=True,
        export_yup=True,
        export_lights=False,
        export_cameras=False,
    )


if __name__ == '__main__':
    main()
