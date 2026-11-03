"""
Builds the weapon models procedurally and exports them for the game.

Run from anywhere (paths resolve from this file):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/build_weapons.py

Writes public/assets/weapons/weapons.glb with one node per weapon, named after it.
Each weapon's origin is where it is held (the middle of a sword's grip, the strap on a shield's
back), so the game can attach it straight to a hand bone.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT = os.path.join(ROOT, 'public', 'assets', 'weapons', 'weapons.glb')


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = {
        'steel': material('steel', (0.56, 0.57, 0.6), metallic=1.0, roughness=0.28),
        'dark_steel': material('dark_steel', (0.22, 0.22, 0.24), metallic=1.0, roughness=0.4),
        'gold': material('gold', (0.78, 0.56, 0.24), metallic=1.0, roughness=0.32),
        'leather': material('leather', (0.09, 0.05, 0.03), metallic=0.0, roughness=0.75),
        'paint': material('paint', (0.03, 0.045, 0.13), metallic=0.0, roughness=0.6),
    }
    weapons = [build_sword(materials), build_shield(materials)]

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in weapons:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_lights=False,
        export_cameras=False,
    )
    print(f'Built {", ".join(o.name for o in weapons)} -> {OUTPUT} ({os.path.getsize(OUTPUT) / 1024:.0f} KB)')


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


class MeshBuilder:
    """Accumulates parts with different materials into one mesh."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []

    def slot(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def add(self, part_bm, mat, smooth=False):
        index = self.slot(mat)
        for face in part_bm.faces:
            face.material_index = index
            face.smooth = smooth
        mesh = bpy.data.meshes.new('part')
        part_bm.to_mesh(mesh)
        part_bm.free()
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)

    def build(self):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in self.materials:
            mesh.materials.append(mat)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def cylinder(radius_bottom, radius_top, z0, z1, segments=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius_bottom, radius2=radius_top, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=Vector((0, 0, (z0 + z1) / 2)), verts=bm.verts)
    return bm


def box(size, center):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm


# --- Sword -------------------------------------------------------------------------------------

def build_sword(m):
    """One-handed arming sword, 0.93 m. Blade along +Z, origin in the middle of the grip."""
    sword = MeshBuilder('sword')

    # Blade: diamond cross-section (sharp edges catch light), tapering to a point.
    blade = bmesh.new()
    stations = [(0.075, 0.052, 0.009), (0.45, 0.046, 0.008), (0.72, 0.034, 0.007), (0.82, 0.012, 0.004)]
    rings = []
    for z, width, thickness in stations:
        rings.append([
            blade.verts.new((width / 2, 0, z)),
            blade.verts.new((0, thickness / 2, z)),
            blade.verts.new((-width / 2, 0, z)),
            blade.verts.new((0, -thickness / 2, z)),
        ])
    tip = blade.verts.new((0, 0, 0.87))
    for lower, upper in zip(rings, rings[1:]):
        for i in range(4):
            blade.faces.new((lower[i], lower[(i + 1) % 4], upper[(i + 1) % 4], upper[i]))
    for i in range(4):
        blade.faces.new((rings[-1][i], rings[-1][(i + 1) % 4], tip))
    blade.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(blade, faces=blade.faces)
    sword.add(blade, m['steel'])

    # Fuller: a darker groove down the middle of each face.
    for side in (1, -1):
        sword.add(box((0.012, 0.001, 0.5), (0, side * 0.0045, 0.33)), m['dark_steel'])

    sword.add(box((0.22, 0.028, 0.026), (0, 0, 0.062)), m['gold'])  # Crossguard.
    sword.add(cylinder(0.016, 0.015, -0.062, 0.049), m['leather'], smooth=True)  # Grip.
    pommel = bmesh.new()
    bmesh.ops.create_uvsphere(pommel, u_segments=16, v_segments=10, radius=0.026)
    bmesh.ops.scale(pommel, vec=Vector((1, 0.7, 1)), verts=pommel.verts)
    bmesh.ops.translate(pommel, vec=Vector((0, 0, -0.08)), verts=pommel.verts)
    sword.add(pommel, m['gold'], smooth=True)
    return sword.build()


# --- Shield ------------------------------------------------------------------------------------

def heater_outline(width, height, points=48):
    """Classic heater shield: flat top, straight upper sides, curving to a point at the bottom."""
    half = width / 2
    top = height * 0.45
    shoulder = height * 0.1
    bottom = -height * 0.55
    outline = [(-half, top), (half, top), (half, shoulder)]
    # Right side bows out, then sweeps in to a point; mirrored up the left side.
    for i in range(1, points // 2):
        t = i / (points // 2)
        x = half * (1 - t ** 1.6)
        z = shoulder + (bottom - shoulder) * t
        outline.append((x, z))
    outline.append((0.0, bottom))
    outline += [(-x, z) for x, z in reversed(outline[3:-1])]
    outline.append((-half, shoulder))
    return outline


def curve(y, x, amount=0.35):
    """Bends the shield around its vertical axis: edges sweep back toward the wearer."""
    return y + amount * x * x


def shield_slab(outline, front_y, back_y):
    bm = bmesh.new()
    front = [bm.verts.new((x, curve(front_y, x), z)) for x, z in outline]
    back = [bm.verts.new((x, curve(back_y, x), z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_shield(m):
    """Heater shield, 0.54 x 0.68 m. Front faces -Y (away from the wearer), origin behind its center."""
    shield = MeshBuilder('shield')
    width, height = 0.54, 0.68
    outline = heater_outline(width, height)
    inner = [(x * 0.9, z * 0.91 - 0.005) for x, z in outline]

    # Painted wooden body, set slightly back so the steel rim stands proud of it.
    shield.add(shield_slab(inner, -0.02, 0.0), m['paint'])

    # Steel rim: a band between the outer and inner outlines.
    rim = bmesh.new()
    n = len(outline)
    rings = []
    for (y, shape) in ((-0.028, outline), (-0.028, inner), (0.006, inner), (0.006, outline)):
        rings.append([rim.verts.new((x, curve(y, x), z)) for x, z in shape])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            rim.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(rim, faces=rim.faces)
    shield.add(rim, m['steel'])

    # Gold cross on the face, following the curve.
    cross_y = -0.026
    shield.add(box((0.045, 0.008, 0.52), (0, cross_y, 0.02)), m['gold'])
    shield.add(box((0.36, 0.008, 0.045), (0, curve(cross_y, 0.09), 0.17)), m['gold'])

    # Central boss.
    boss = bmesh.new()
    bmesh.ops.create_uvsphere(boss, u_segments=20, v_segments=12, radius=0.07)
    bmesh.ops.scale(boss, vec=Vector((1, 0.45, 1)), verts=boss.verts)
    bmesh.ops.translate(boss, vec=Vector((0, -0.03, 0.08)), verts=boss.verts)
    shield.add(boss, m['dark_steel'], smooth=True)

    # Strap on the back, where the forearm goes; the origin sits here.
    shield.add(box((0.05, 0.02, 0.24), (0, 0.035, 0.0)), m['leather'])
    obj = shield.build()
    return obj


if __name__ == '__main__':
    main()
