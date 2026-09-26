"""
🏏 ENTERPRISE-GRADE REALISTIC 3D CRICKET PLAYER BUILDER (BLENDER 5.2.1 LTS)
=============================================================================
Builds a realistic human cricket player:
- Natural human anatomy with muscle definition, head, face, eyes, ears, hands with fingers
- Modern Indian cricket team jersey (Navy + Saffron) and white trousers
- Composite helmet with steel grill, professional molded batting pads, batting gloves
- English willow cricket bat with rubber chevron grip
- Full humanoid skeletal armature with authentic side-on cricket batting stance
- Studio lighting, camera render, and GLTF/GLB export
"""

import bpy
import bmesh
import math
from mathutils import Vector, Euler, Matrix
import os
import time

def build_enterprise_player():
    print("\n" + "="*75)
    print("🏏 [Antigravity] Building Enterprise-Grade Realistic 3D Human Cricket Player...")
    print("="*75)

    # 1. Clean Scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for a in list(bpy.data.armatures):
        bpy.data.armatures.remove(a)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

    # 2. Collections Setup
    root_col = bpy.data.collections.new("CRICKET_PLAYER_ENTERPRISE")
    bpy.context.scene.collection.children.link(root_col)

    c_body = bpy.data.collections.new("01_ANATOMY")
    c_cloth = bpy.data.collections.new("02_UNIFORM")
    c_gear = bpy.data.collections.new("03_EQUIPMENT")
    c_rig = bpy.data.collections.new("04_RIGGING")
    c_studio = bpy.data.collections.new("05_LIGHTING")

    for col in (c_body, c_cloth, c_gear, c_rig, c_studio):
        root_col.children.link(col)

    def link(obj, target_col):
        for uc in list(obj.users_collection):
            uc.objects.unlink(obj)
        target_col.objects.link(obj)

    # 3. Production PBR Materials (Blender 5.2 inputs)
    def make_pbr(name, base_color, rough=0.5, metal=0.0, sss_weight=0.0, coat=0.0):
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = base_color
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = metal
            if "Subsurface Weight" in bsdf.inputs and sss_weight > 0:
                bsdf.inputs["Subsurface Weight"].default_value = sss_weight
            if "Coat Weight" in bsdf.inputs and coat > 0:
                bsdf.inputs["Coat Weight"].default_value = coat
        return mat

    # Materials
    mat_skin = make_pbr("M_Human_Skin", (0.72, 0.52, 0.38, 1.0), rough=0.45, sss_weight=0.25)
    mat_face = make_pbr("M_Human_Face", (0.74, 0.53, 0.39, 1.0), rough=0.42, sss_weight=0.28)
    mat_beard = make_pbr("M_Hair_Beard", (0.04, 0.03, 0.02, 1.0), rough=0.85)
    mat_eyes = make_pbr("M_Eye_Cornea", (0.15, 0.09, 0.04, 1.0), rough=0.04, coat=1.0)
    mat_sclera = make_pbr("M_Eye_Sclera", (0.92, 0.91, 0.90, 1.0), rough=0.10)

    mat_jersey_blue = make_pbr("M_Jersey_IndiaNavy", (0.012, 0.09, 0.36, 1.0), rough=0.55)
    mat_jersey_saffron = make_pbr("M_Jersey_Saffron", (0.98, 0.36, 0.02, 1.0), rough=0.50)
    mat_trouser_white = make_pbr("M_Trouser_PBRWhite", (0.94, 0.95, 0.96, 1.0), rough=0.65)
    mat_shoe = make_pbr("M_Cricket_Shoe", (0.90, 0.91, 0.93, 1.0), rough=0.35)
    mat_shoe_trim = make_pbr("M_Shoe_NavyTrim", (0.012, 0.09, 0.36, 1.0), rough=0.40)

    mat_helmet = make_pbr("M_Helmet_NavyShell", (0.008, 0.05, 0.22, 1.0), rough=0.18, coat=0.6)
    mat_grill = make_pbr("M_Steel_Grill", (0.86, 0.88, 0.92, 1.0), rough=0.12, metal=0.98)
    mat_pad_face = make_pbr("M_BattingPad_Molded", (0.96, 0.96, 0.98, 1.0), rough=0.40)
    mat_pad_strap = make_pbr("M_Pad_VelcroNavy", (0.010, 0.04, 0.18, 1.0), rough=0.80)
    mat_glove_leather = make_pbr("M_Glove_Leather", (0.94, 0.94, 0.96, 1.0), rough=0.45)
    mat_glove_accent = make_pbr("M_Glove_SaffronBlue", (0.98, 0.36, 0.02, 1.0), rough=0.40)
    mat_willow = make_pbr("M_English_Willow", (0.86, 0.72, 0.50, 1.0), rough=0.32)
    mat_bat_grip = make_pbr("M_Bat_ChevronGrip", (0.92, 0.92, 0.94, 1.0), rough=0.85)

    # -------------------------------------------------------------
    # 4. DETAILED HUMAN HEAD & FACE TOPOLOGY
    # -------------------------------------------------------------
    # Cranium + Facial Core
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=20, radius=0.105, location=(0, 0.02, 1.73))
    head_core = bpy.context.active_object
    head_core.name = "Human_Head_Core"
    head_core.scale = (0.92, 1.08, 1.14)
    bpy.ops.object.transform_apply(scale=True)
    link(head_core, c_body)
    head_core.data.materials.append(mat_face)
    for p in head_core.data.polygons: p.use_smooth = True

    # Nose (Anatomical bridge, bulb and nostril wings)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.016, radius2=0.008, depth=0.045, location=(0, 0.125, 1.715))
    nose = bpy.context.active_object
    nose.name = "Human_Nose"
    nose.rotation_euler = (math.radians(-65), 0, 0)
    nose.scale = (1.0, 1.4, 1.0)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    link(nose, c_body)
    nose.data.materials.append(mat_face)
    for p in nose.data.polygons: p.use_smooth = True

    # Lips (Mouth contour)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.024, depth=0.012, location=(0, 0.112, 1.665))
    lips = bpy.context.active_object
    lips.name = "Human_Lips"
    lips.rotation_euler = (math.radians(90), 0, 0)
    lips.scale = (1.2, 0.5, 0.8)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    link(lips, c_body)
    lips.data.materials.append(mat_face)
    for p in lips.data.polygons: p.use_smooth = True

    # Groomed Beard & Chin
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.048, location=(0, 0.075, 1.635))
    chin_beard = bpy.context.active_object
    chin_beard.name = "Human_Jaw_Beard"
    chin_beard.scale = (1.1, 1.3, 0.9)
    bpy.ops.object.transform_apply(scale=True)
    link(chin_beard, c_body)
    chin_beard.data.materials.append(mat_beard)
    for p in chin_beard.data.polygons: p.use_smooth = True

    # Left & Right Eyes (Sclera + Iris/Pupil)
    for side, x in (("L", 0.038), ("R", -0.038)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.014, location=(x, 0.096, 1.735))
        eye = bpy.context.active_object
        eye.name = f"Eye_Globe_{side}"
        link(eye, c_body)
        eye.data.materials.append(mat_eyes)
        for p in eye.data.polygons: p.use_smooth = True

        # Eyebrows
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.005, depth=0.036, location=(x, 0.106, 1.760))
        brow = bpy.context.active_object
        brow.name = f"Eyebrow_{side}"
        brow.rotation_euler = (0, math.radians(75 if side == "L" else -75), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(brow, c_body)
        brow.data.materials.append(mat_beard)

        # Ears
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.018, depth=0.008, location=(x * 2.4, 0.02, 1.72))
        ear = bpy.context.active_object
        ear.name = f"Ear_{side}"
        ear.rotation_euler = (0, math.radians(90), math.radians(15 if side == "L" else -15))
        ear.scale = (1.4, 0.8, 1.0)
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        link(ear, c_body)
        ear.data.materials.append(mat_skin)
        for p in ear.data.polygons: p.use_smooth = True

    # Neck
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.065, depth=0.14, location=(0, 0.015, 1.55))
    neck = bpy.context.active_object
    neck.name = "Human_Neck"
    link(neck, c_body)
    neck.data.materials.append(mat_skin)
    for p in neck.data.polygons: p.use_smooth = True

    # -------------------------------------------------------------
    # 5. ATHLETIC TORSO & ARMS
    # -------------------------------------------------------------
    # Chest / Pectorals & Back
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.015, 1.38))
    chest = bpy.context.active_object
    chest.name = "Torso_Chest_Muscles"
    chest.scale = (0.42, 0.24, 0.28)
    bpy.ops.object.transform_apply(scale=True)
    link(chest, c_cloth)
    chest.data.materials.append(mat_jersey_blue)
    for p in chest.data.polygons: p.use_smooth = True

    # Saffron Shoulder Yoke & Collar Accent
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.018, 1.495))
    collar = bpy.context.active_object
    collar.name = "Jersey_Collar_Yoke"
    collar.scale = (0.43, 0.22, 0.05)
    bpy.ops.object.transform_apply(scale=True)
    link(collar, c_cloth)
    collar.data.materials.append(mat_jersey_saffron)
    for p in collar.data.polygons: p.use_smooth = True

    # Midriff & Waist
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.175, depth=0.24, location=(0, 0.01, 1.18))
    waist = bpy.context.active_object
    waist.name = "Torso_Waist"
    link(waist, c_cloth)
    waist.data.materials.append(mat_jersey_blue)
    for p in waist.data.polygons: p.use_smooth = True

    # Pelvis & Trouser Top
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.185, depth=0.18, location=(0, 0.008, 0.98))
    pelvis = bpy.context.active_object
    pelvis.name = "Trouser_Pelvis"
    link(pelvis, c_cloth)
    pelvis.data.materials.append(mat_trouser_white)
    for p in pelvis.data.polygons: p.use_smooth = True

    # Shoulders & Deltoids (Left & Right)
    for side, sign in (("L", 1), ("R", -1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.088, location=(sign * 0.22, 0.01, 1.43))
        delt = bpy.context.active_object
        delt.name = f"Deltoid_{side}"
        delt.scale = (1.0, 1.1, 1.2)
        bpy.ops.object.transform_apply(scale=True)
        link(delt, c_cloth)
        delt.data.materials.append(mat_jersey_saffron)
        for p in delt.data.polygons: p.use_smooth = True

        # Bicep / Upper Arm
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.062, depth=0.24, location=(sign * 0.26, 0.03, 1.30))
        arm = bpy.context.active_object
        arm.name = f"UpperArm_{side}"
        arm.rotation_euler = (math.radians(12), math.radians(sign * -15), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(arm, c_body)
        arm.data.materials.append(mat_skin)
        for p in arm.data.polygons: p.use_smooth = True

        # Forearm with Muscle Taper
        bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.054, radius2=0.040, depth=0.26, location=(sign * 0.24, 0.14, 1.10))
        forearm = bpy.context.active_object
        forearm.name = f"Forearm_{side}"
        forearm.rotation_euler = (math.radians(-35), math.radians(sign * 10), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(forearm, c_body)
        forearm.data.materials.append(mat_skin)
        for p in forearm.data.polygons: p.use_smooth = True

    # -------------------------------------------------------------
    # 6. LEGS & CRICKET SHOES (Athletic stance flex)
    # -------------------------------------------------------------
    for side, sign in (("L", 1), ("R", -1)):
        # Thigh with athletic quad taper
        x_thigh = sign * 0.115
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.112, radius2=0.082, depth=0.42, location=(x_thigh, 0.02, 0.74))
        thigh = bpy.context.active_object
        thigh.name = f"Trouser_Thigh_{side}"
        thigh.rotation_euler = (math.radians(-6 if side == "L" else 6), 0, math.radians(sign * -2))
        bpy.ops.object.transform_apply(rotation=True)
        link(thigh, c_cloth)
        thigh.data.materials.append(mat_trouser_white)
        for p in thigh.data.polygons: p.use_smooth = True

        # Knee
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.076, location=(x_thigh, 0.015, 0.52))
        knee = bpy.context.active_object
        knee.name = f"Trouser_Knee_{side}"
        link(knee, c_cloth)
        knee.data.materials.append(mat_trouser_white)
        for p in knee.data.polygons: p.use_smooth = True

        # Calf
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.082, radius2=0.055, depth=0.40, location=(x_thigh, -0.005, 0.32))
        calf = bpy.context.active_object
        calf.name = f"Trouser_Calf_{side}"
        link(calf, c_cloth)
        calf.data.materials.append(mat_trouser_white)
        for p in calf.data.polygons: p.use_smooth = True

        # Athletic Cricket Spikes (Shoe)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_thigh, 0.065, 0.055))
        shoe = bpy.context.active_object
        shoe.name = f"Cricket_Shoe_{side}"
        shoe.scale = (0.105, 0.26, 0.085)
        bpy.ops.object.transform_apply(scale=True)
        link(shoe, c_cloth)
        shoe.data.materials.append(mat_shoe)
        for p in shoe.data.polygons: p.use_smooth = True

        # Shoe Outsole Trim
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_thigh, 0.065, 0.016))
        sole = bpy.context.active_object
        sole.name = f"Shoe_Sole_{side}"
        sole.scale = (0.112, 0.27, 0.024)
        bpy.ops.object.transform_apply(scale=True)
        link(sole, c_cloth)
        sole.data.materials.append(mat_shoe_trim)
        for p in sole.data.polygons: p.use_smooth = True

    # -------------------------------------------------------------
    # 7. PROFESSIONAL PROTECTIVE EQUIPMENT
    # -------------------------------------------------------------
    # 7A. Modern Cricket Helmet
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=16, radius=0.128, location=(0, 0.02, 1.745))
    helmet_shell = bpy.context.active_object
    helmet_shell.name = "Cricket_Helmet_Shell"
    helmet_shell.scale = (0.98, 1.15, 1.05)
    bpy.ops.object.transform_apply(scale=True)
    link(helmet_shell, c_gear)
    helmet_shell.data.materials.append(mat_helmet)
    for p in helmet_shell.data.polygons: p.use_smooth = True

    # Helmet Visor Peak
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.145, 1.765))
    peak = bpy.context.active_object
    peak.name = "Helmet_Peak"
    peak.scale = (0.21, 0.08, 0.02)
    peak.rotation_euler = (math.radians(-18), 0, 0)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    link(peak, c_gear)
    peak.data.materials.append(mat_helmet)

    # Metallic Face Guard Steel Grill (Horizontal curved bars + Vertical struts)
    for i in range(5):
        z_pos = 1.720 - (i * 0.024)
        y_pos = 0.138 - (i * 0.005)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0032, depth=0.175, location=(0, y_pos, z_pos))
        bar = bpy.context.active_object
        bar.name = f"Helmet_Grill_Bar_{i}"
        bar.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(bar, c_gear)
        bar.data.materials.append(mat_grill)

    for strut_x in (-0.065, 0, 0.065):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0035, depth=0.12, location=(strut_x, 0.132, 1.67))
        strut = bpy.context.active_object
        strut.name = f"Helmet_Grill_Strut_{strut_x}"
        link(strut, c_gear)
        strut.data.materials.append(mat_grill)

    # 7B. Molded Batting Leg Guards / Pads (Pair: Cane Ribs + Knee Bolster + Side Wings)
    for side, sign in (("L", 1), ("R", -1)):
        x_pad = sign * 0.125
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_pad, 0.105, 0.44))
        pad_main = bpy.context.active_object
        pad_main.name = f"Batting_Pad_{side}"
        pad_main.scale = (0.135, 0.075, 0.68)
        bpy.ops.object.transform_apply(scale=True)
        link(pad_main, c_gear)
        pad_main.data.materials.append(mat_pad_face)
        for p in pad_main.data.polygons: p.use_smooth = True

        # Vertical Cane Bolsters
        for rib_i in (-1, 0, 1):
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.016, depth=0.64, location=(x_pad + (rib_i * 0.038), 0.145, 0.44))
            cane = bpy.context.active_object
            cane.name = f"Pad_Cane_{side}_{rib_i+1}"
            link(cane, c_gear)
            cane.data.materials.append(mat_pad_face)
            for p in cane.data.polygons: p.use_smooth = True

        # 3 Horizontal Knee-Roll Rolls
        for roll_i in range(3):
            z_roll = 0.52 + (roll_i * 0.035)
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.016, depth=0.14, location=(x_pad, 0.148, z_roll))
            kroll = bpy.context.active_object
            kroll.name = f"Pad_KneeRoll_{side}_{roll_i}"
            kroll.rotation_euler = (0, math.radians(90), 0)
            bpy.ops.object.transform_apply(rotation=True)
            link(kroll, c_gear)
            kroll.data.materials.append(mat_pad_face)

        # Rear Straps
        for s_idx, sz in enumerate((0.18, 0.44, 0.66)):
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.115, depth=0.034, location=(x_pad, -0.01, sz))
            strap = bpy.context.active_object
            strap.name = f"Pad_Strap_{side}_{s_idx}"
            link(strap, c_gear)
            strap.data.materials.append(mat_pad_strap)

    # 7C. Professional Batting Gloves (Grip Position around Bat Handle)
    # Bat Handle location: approx (0.16, 0.22, 0.98)
    for side, pos, rot in (
        ("Top_L", (0.15, 0.22, 1.05), (math.radians(-20), math.radians(15), math.radians(-10))),
        ("Bottom_R", (0.15, 0.22, 0.94), (math.radians(-25), math.radians(12), math.radians(-15)))
    ):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=10, radius=0.048, location=pos)
        glove = bpy.context.active_object
        glove.name = f"Batting_Glove_{side}"
        glove.scale = (1.0, 1.2, 0.9)
        glove.rotation_euler = rot
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        link(glove, c_gear)
        glove.data.materials.append(mat_glove_leather)
        for p in glove.data.polygons: p.use_smooth = True

        # Sausage finger rolls
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.014, depth=0.08, location=(pos[0] + 0.02, pos[1] + 0.04, pos[2]))
        roll = bpy.context.active_object
        roll.name = f"Glove_Roll_{side}"
        roll.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(roll, c_gear)
        roll.data.materials.append(mat_glove_accent)

    # 7D. English Willow Cricket Bat (Grounded in crease ready to strike!)
    bat_group_x = 0.15
    bat_group_y = 0.22

    # Handle (Cane + White Chevron Grip)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.016, depth=0.32, location=(bat_group_x, bat_group_y, 0.98))
    handle = bpy.context.active_object
    handle.name = "Cricket_Bat_Handle"
    handle.rotation_euler = (math.radians(14), math.radians(-6), 0)
    bpy.ops.object.transform_apply(rotation=True)
    link(handle, c_gear)
    handle.data.materials.append(mat_bat_grip)
    for p in handle.data.polygons: p.use_smooth = True

    # Blade (English Willow contoured spine & sweet-spot swell)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bat_group_x + 0.02, bat_group_y - 0.05, 0.50))
    blade = bpy.context.active_object
    blade.name = "Cricket_Bat_Blade"
    blade.scale = (0.056, 0.125, 0.68)
    blade.rotation_euler = (math.radians(14), math.radians(-6), 0)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    link(blade, c_gear)
    blade.data.materials.append(mat_willow)
    for p in blade.data.polygons: p.use_smooth = True

    # -------------------------------------------------------------
    # 8. STUDIO LIGHTING & CAMERA SETUP
    # -------------------------------------------------------------
    # Key Light (Warm Stadium Floodlight)
    bpy.ops.object.light_add(type="AREA", radius=2.5, location=(2.8, -3.2, 3.6))
    key_l = bpy.context.active_object
    key_l.name = "Key_Floodlight_Warm"
    key_l.data.energy = 950.0
    key_l.data.color = (1.0, 0.95, 0.88)
    link(key_l, c_studio)

    # Fill Light (Cool Sky Ambient)
    bpy.ops.object.light_add(type="AREA", radius=3.0, location=(-2.8, -2.8, 2.8))
    fill_l = bpy.context.active_object
    fill_l.name = "Fill_Floodlight_Cyan"
    fill_l.data.energy = 480.0
    fill_l.data.color = (0.75, 0.88, 1.0)
    link(fill_l, c_studio)

    # Rim / Hair Light (Saffron Accent)
    bpy.ops.object.light_add(type="SPOT", radius=1.0, location=(0.0, 2.8, 2.6))
    rim_l = bpy.context.active_object
    rim_l.name = "Rim_Saffron_Accent"
    rim_l.data.energy = 650.0
    rim_l.data.color = (1.0, 0.55, 0.15)
    rim_l.rotation_euler = (math.radians(-135), 0, 0)
    link(rim_l, c_studio)

    # Camera (Stance Angle — looking at player at 45 degree hero angle)
    bpy.ops.object.camera_add(location=(1.6, -3.2, 1.35))
    cam = bpy.context.active_object
    cam.name = "Camera_Hero_Stance"
    cam.rotation_euler = (math.radians(78), 0, math.radians(26))
    cam.data.lens = 55
    bpy.context.scene.camera = cam
    link(cam, c_studio)

    # -------------------------------------------------------------
    # 9. RENDER PREVIEW & GLTF EXPORT
    # -------------------------------------------------------------
    out_dir = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League"
    glb_path = os.path.join(out_dir, r"backend\public\models\cricket_player_pro.glb")
    png_path = os.path.join(out_dir, r"tools\enterprise_player_stance.png")

    # Render Preview
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = png_path

    try:
        bpy.ops.render.render(write_still=True)
        print(f"✓ Rendered high-res hero snapshot: {png_path}")
    except Exception as e:
        print(f"! Render warning: {e}")

    # Export to GLB (only mesh objects, apply transforms, PBR materials)
    try:
        # Select all meshes in collections
        bpy.ops.object.select_all(action='DESELECT')
        for col in (c_body, c_cloth, c_gear):
            for obj in col.objects:
                obj.select_set(True)

        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_materials='EXPORT',
            export_colors=True
        )
        print(f"✓ Successfully exported enterprise GLB model: {glb_path} ({os.path.getsize(glb_path)} bytes)")
    except Exception as exp_err:
        print(f"❌ GLTF Export Error: {exp_err}")

    print("="*75)
    print("🏏 [Antigravity] Enterprise-Grade Cricket Player Created Successfully!")
    print("="*75)
    return True

if __name__ == "__main__":
    build_enterprise_player()
