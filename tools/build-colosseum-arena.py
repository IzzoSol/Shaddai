#!/usr/bin/env python3
"""
SHADDAI COLOSSEUM ARENA — BLENDER BUILD SCRIPT
===============================================
Creative Direction: TURTLE (opulent futurism aesthetic)
Technical Blueprint: NEXUS (120m diameter, 80m height, 3-tier structure)

Builds a production-ready 3D arena for the game with:
- Cyberpunk neon exterior (cyan/magenta lights)
- Warm golden interior
- Multi-level seating
- Optimized geometry for real-time rendering
- Export-ready GLB format

Run this script in Blender's scripting console or via command line:
  blender -P build-colosseum-arena.py
"""

import bpy
import bmesh
from mathutils import Vector
import math

# ════════════════════════════════════════════════════════════════════════════
# CONFIGURATION (NEXUS SPECS)
# ════════════════════════════════════════════════════════════════════════════

ARENA = {
    'floor_diameter': 120,      # 120m floor (matches game scale)
    'seating_diameter': 170,    # Seating ring outer
    'height': 80,               # Total height to seating rim
    'levels': 3,                # Floor, seating base, spectator rim
}

MATERIALS = {
    'neon_cyan': {
        'color': (0.0, 1.0, 1.0, 1.0),      # Cyan
        'emission': (0.0, 1.0, 1.0, 2.0),
        'metallic': 0.8,
        'roughness': 0.2,
    },
    'neon_magenta': {
        'color': (1.0, 0.2, 1.0, 1.0),      # Magenta/Pink
        'emission': (1.0, 0.2, 1.0, 2.0),
        'metallic': 0.8,
        'roughness': 0.2,
    },
    'neon_gold': {
        'color': (1.0, 0.85, 0.0, 1.0),     # Gold
        'emission': (1.0, 0.85, 0.0, 1.5),
        'metallic': 0.9,
        'roughness': 0.1,
    },
    'dark_steel': {
        'color': (0.2, 0.2, 0.2, 1.0),      # Dark gray/steel
        'emission': (0.0, 0.0, 0.0, 0.0),
        'metallic': 0.8,
        'roughness': 0.5,
    },
    'warm_gold': {
        'color': (1.0, 0.8, 0.4, 1.0),      # Warm gold (interior)
        'emission': (0.8, 0.6, 0.2, 0.5),
        'metallic': 0.7,
        'roughness': 0.3,
    },
}

# ════════════════════════════════════════════════════════════════════════════
# UTILITY: CREATE EMISSION MATERIAL
# ════════════════════════════════════════════════════════════════════════════

def create_material(name, color, emission_color, metallic, roughness, use_nodes=True):
    """Create a PBR material with emission for neon effects."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = use_nodes

    if use_nodes:
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Emission'].default_value = emission_color
        bsdf.inputs['Emission Strength'].default_value = 2.0
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness

    return mat

# ════════════════════════════════════════════════════════════════════════════
# BUILD: ARENA FLOOR (Sand + Performance Layer)
# ════════════════════════════════════════════════════════════════════════════

def build_arena_floor(scene):
    """Build the circular arena floor with sand texture material."""

    # Create floor geometry
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=ARENA['floor_diameter']/2,
        location=(0, 0, 0)
    )
    floor = bpy.context.active_object
    floor.name = 'COLOSSEUM_FLOOR'
    floor.scale = (1, 1, 0.05)  # Flatten to disc

    # Deselect and rotate to correct orientation
    bpy.ops.object.transform_apply(scale=True)

    # Material: Sand/Earth
    sand_mat = bpy.data.materials.new('MAT_Sand')
    sand_mat.use_nodes = True
    bsdf = sand_mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.76, 0.70, 0.50, 1.0)  # Sandy
    bsdf.inputs['Roughness'].default_value = 0.9
    floor.data.materials.append(sand_mat)

    return floor

# ════════════════════════════════════════════════════════════════════════════
# BUILD: SEATING STRUCTURE (3-Tier Circular)
# ════════════════════════════════════════════════════════════════════════════

def build_seating_tiers(scene):
    """Build 3-tier seating structure with neon accents."""

    seating_group = bpy.data.objects.new('COLOSSEUM_SEATING', None)
    bpy.context.collection.objects.link(seating_group)

    # Tier 1: Lower seating (warm gold)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=ARENA['seating_diameter']/2,
        minor_radius=8,
        location=(0, 0, 5)
    )
    tier1 = bpy.context.active_object
    tier1.name = 'SEATING_TIER1_LOWER'
    mat_warm = create_material(
        'MAT_WarmGold',
        (1.0, 0.8, 0.4, 1.0),      # Warm gold
        (0.8, 0.6, 0.2, 0.5),      # Emission
        0.7, 0.3
    )
    tier1.data.materials.append(mat_warm)
    tier1.parent = seating_group

    # Tier 2: Mid seating (dark steel with cyan accent)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=ARENA['seating_diameter']/2,
        minor_radius=6,
        location=(0, 0, 25)
    )
    tier2 = bpy.context.active_object
    tier2.name = 'SEATING_TIER2_MID'
    mat_dark = create_material(
        'MAT_DarkSteel',
        (0.2, 0.2, 0.2, 1.0),      # Dark
        (0.0, 0.0, 0.0, 0.0),
        0.8, 0.5
    )
    tier2.data.materials.append(mat_dark)
    tier2.parent = seating_group

    # Tier 3: Upper spectator rim (cyan neon)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=ARENA['seating_diameter']/2,
        minor_radius=4,
        location=(0, 0, 55)
    )
    tier3 = bpy.context.active_object
    tier3.name = 'SEATING_TIER3_SPECTATOR'
    mat_cyan = create_material(
        'MAT_NeonCyan',
        (0.0, 1.0, 1.0, 1.0),      # Cyan
        (0.0, 1.0, 1.0, 2.0),      # Strong emission
        0.8, 0.2
    )
    tier3.data.materials.append(mat_cyan)
    tier3.parent = seating_group

    return seating_group, [tier1, tier2, tier3]

# ════════════════════════════════════════════════════════════════════════════
# BUILD: NEON ACCENT RINGS
# ════════════════════════════════════════════════════════════════════════════

def build_neon_accents(scene):
    """Build glowing neon accent rings (magenta + cyan)."""

    neon_group = bpy.data.objects.new('COLOSSEUM_NEON', None)
    bpy.context.collection.objects.link(neon_group)

    # Magenta ring at mid-height
    bpy.ops.mesh.primitive_torus_add(
        major_radius=ARENA['seating_diameter']/2 + 5,
        minor_radius=0.5,
        location=(0, 0, 30)
    )
    mag_ring = bpy.context.active_object
    mag_ring.name = 'NEON_MAGENTA_RING'
    mat_mag = create_material(
        'MAT_NeonMagenta',
        (1.0, 0.2, 1.0, 1.0),
        (1.0, 0.2, 1.0, 3.0),
        0.9, 0.1
    )
    mag_ring.data.materials.append(mat_mag)
    mag_ring.parent = neon_group

    # Cyan ring lower
    bpy.ops.mesh.primitive_torus_add(
        major_radius=ARENA['seating_diameter']/2 + 10,
        minor_radius=0.5,
        location=(0, 0, 15)
    )
    cyan_ring = bpy.context.active_object
    cyan_ring.name = 'NEON_CYAN_RING'
    mat_cyan = create_material(
        'MAT_NeonCyan',
        (0.0, 1.0, 1.0, 1.0),
        (0.0, 1.0, 1.0, 3.0),
        0.9, 0.1
    )
    cyan_ring.data.materials.append(mat_cyan)
    cyan_ring.parent = neon_group

    return neon_group, [mag_ring, cyan_ring]

# ════════════════════════════════════════════════════════════════════════════
# BUILD: ENTRANCE GATE (Gold Portal)
# ════════════════════════════════════════════════════════════════════════════

def build_entrance_gate(scene):
    """Build a gold-accented entrance gate at ground level."""

    # Gate frame (box)
    bpy.ops.mesh.primitive_cube_add(
        size=15,
        location=(ARENA['seating_diameter']/2 - 10, 0, 7.5)
    )
    gate = bpy.context.active_object
    gate.name = 'ENTRANCE_GATE'
    gate.scale = (0.5, 1.5, 1.5)
    bpy.ops.object.transform_apply(scale=True)

    # Gold material
    mat_gold = create_material(
        'MAT_EntranceGold',
        (1.0, 0.85, 0.0, 1.0),
        (1.0, 0.85, 0.0, 1.5),
        0.95, 0.05
    )
    gate.data.materials.append(mat_gold)

    return gate

# ════════════════════════════════════════════════════════════════════════════
# BUILD: OVERHEAD DOME (Retractable effect)
# ════════════════════════════════════════════════════════════════════════════

def build_overhead_dome(scene):
    """Build a geometric dome overhead (can show/hide for "retractable" effect)."""

    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=ARENA['seating_diameter']/2 + 20,
        location=(0, 0, ARENA['height'])
    )
    dome = bpy.context.active_object
    dome.name = 'DOME_OVERHEAD'
    dome.scale = (1, 1, 0.4)  # Make it a dome cap
    bpy.ops.object.transform_apply(scale=True)

    # Delete bottom half (keep only top)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0, 0, 50), plane_no=(0, 0, 1), clear_inner=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Dark semi-transparent material
    mat_dome = bpy.data.materials.new('MAT_Dome')
    mat_dome.use_nodes = True
    bsdf = mat_dome.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.15, 0.15, 0.2, 0.5)
    bsdf.inputs['Transmission'].default_value = 0.3
    bsdf.inputs['Alpha'].default_value = 0.6
    dome.data.materials.append(mat_dome)

    return dome

# ════════════════════════════════════════════════════════════════════════════
# BUILD: LIGHTING
# ════════════════════════════════════════════════════════════════════════════

def setup_lighting(scene):
    """Set up scene lighting with neon accent lights."""

    # Key light (warm golden)
    bpy.ops.object.light_add(type='SUN', location=(50, 50, 80))
    sun = bpy.context.active_object
    sun.data.energy = 2.0
    sun.data.color = (1.0, 0.8, 0.6)
    sun.name = 'LIGHT_SUN_WARM'

    # Cyan accent light
    bpy.ops.object.light_add(type='POINT', location=(-80, 0, 40))
    cyan_light = bpy.context.active_object
    cyan_light.data.energy = 50.0
    cyan_light.data.color = (0.0, 1.0, 1.0)
    cyan_light.name = 'LIGHT_CYAN_ACCENT'

    # Magenta accent light
    bpy.ops.object.light_add(type='POINT', location=(80, 80, 40))
    mag_light = bpy.context.active_object
    mag_light.data.energy = 50.0
    mag_light.data.color = (1.0, 0.2, 1.0)
    mag_light.name = 'LIGHT_MAGENTA_ACCENT'

# ════════════════════════════════════════════════════════════════════════════
# MAIN BUILD SEQUENCE
# ════════════════════════════════════════════════════════════════════════════

def build_colosseum():
    """Main build sequence: constructs the complete colosseum arena."""

    print("═" * 60)
    print("SHADDAI COLOSSEUM ARENA BUILD")
    print("═" * 60)

    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene

    # Build in order
    print("\n[1/5] Building arena floor...")
    floor = build_arena_floor(scene)

    print("[2/5] Building seating tiers...")
    seating, tiers = build_seating_tiers(scene)

    print("[3/5] Building neon accents...")
    neon, rings = build_neon_accents(scene)

    print("[4/5] Building entrance gate...")
    gate = build_entrance_gate(scene)

    print("[5/5] Setting up lighting...")
    setup_lighting(scene)

    # Optional: Build dome (commented out for now)
    # dome = build_overhead_dome(scene)

    print("\n" + "═" * 60)
    print("✓ COLOSSEUM ARENA COMPLETE")
    print("═" * 60)
    print("\nScene summary:")
    print(f"  • Arena floor diameter: {ARENA['floor_diameter']}m")
    print(f"  • Seating diameter: {ARENA['seating_diameter']}m")
    print(f"  • Height: {ARENA['height']}m")
    print(f"  • Levels: {ARENA['levels']}-tier structure")
    print(f"\nNext steps:")
    print("  1. Save: File → Save As → colosseum-arena.blend")
    print("  2. Export: File → Export → Export glTF 2.0 (.glb)")
    print("  3. Path: C:\\Users\\Brittany\\Shaddai\\public\\models\\")
    print("  4. Integrate into game via world-colosseum.js")
    print("\n")

# ════════════════════════════════════════════════════════════════════════════
# RUN
# ════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    build_colosseum()
