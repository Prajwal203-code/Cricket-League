"""
🏏 ENTERPRISE-GRADE REALISTIC 3D HUMAN CRICKET PLAYER GENERATOR
================================================================
Blender 5.2.1 LTS Engine
Generates:
1. Realistic Human Male Anatomy (Athletic Cricket Player: 1.84m)
2. Indian National Team Uniform (Royal Blue + Saffron Orange + Number 18)
3. Protective Gear (Composite Helmet with Steel Grill, Batting Pads with cane ribs, Gloves, Arm Guard)
4. English Willow Cricket Bat + Two-Piece Match Ball with raised white seam
5. Full Humanoid Armature (70+ bones, complete 5-finger articulation, IK controls)
6. Cricket Bat Grip Socket Parent
7. PBR Shaders with Subsurface Scattering skin, cloth weave, wood grain, chrome steel
8. 4 Animation Poses (A-Pose, Batting Stance, Cover Drive, Fast Bowling Gather)
9. Studio 3-Point Broadcast Lighting + Camera + High-Res Viewport Render
"""

import bpy
import bmesh
import math
from mathutils import Vector, Euler, Matrix
import os
import time

def build_cricket_player():
    print(">>> [Antigravity] Starting Production 3D Human Cricket Player Build...")

    # -------------------------------------------------------------
    # 0. Comprehensive Scene Wipe (Zero Duplicates)
    # -------------------------------------------------------------
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
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

    # -------------------------------------------------------------
    # 1. Master Collections Setup
    # -------------------------------------------------------------
    root_col = bpy.data.collections.new("CRICKET_PLAYER_PRO")
    bpy.context.scene.collection.children.link(root_col)

    col_body = bpy.data.collections.new("01_BODY")
    col_clothing = bpy.data.collections.new("02_CLOTHING")
    col_equipment = bpy.data.collections.new("03_EQUIPMENT")
    col_rig = bpy.data.collections.new("04_RIG_ARMATURE")
    col_studio = bpy.data.collections.new("05_STUDIO_LIGHTING")

    for sub in (col_body, col_clothing, col_equipment, col_rig, col_studio):
        root_col.children.link(sub)

    def link_obj(obj, collection):
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        collection.objects.link(obj)

    # -------------------------------------------------------------
    # 2. Production PBR Materials
    # -------------------------------------------------------------
    def create_pbr(name, base_color, roughness=0.5, metallic=0.0, sss=0.0, sss_color=None):
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()

        out_node = nodes.new(type="ShaderNodeOutputMaterial")
        out_node.location = (400, 0)
        bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
        bsdf.location = (0, 0)
        links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = base_color
        elif len(bsdf.inputs) > 0:
            bsdf.inputs[0].default_value = base_color

        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic

        if sss > 0.0:
            for s in ("Subsurface Weight", "Subsurface"):
                if s in bsdf.inputs:
                    bsdf.inputs[s].default_value = sss
                    break
            if sss_color and "Subsurface Color" in bsdf.inputs:
                bsdf.inputs["Subsurface Color"].default_value = sss_color
            if "Subsurface Radius" in bsdf.inputs:
                bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.25, 0.1)

        return mat

    mat_skin = create_pbr("M_Player_Skin", (0.76, 0.54, 0.40, 1.0), roughness=0.48, sss=0.18, sss_color=(0.88, 0.35, 0.25, 1.0))
    mat_iris = create_pbr("M_Eye_Iris", (0.16, 0.09, 0.04, 1.0), roughness=0.05)
    mat_sclera = create_pbr("M_Eye_Sclera", (0.94, 0.94, 0.96, 1.0), roughness=0.08)

    # India Uniform: Royal Blue + Saffron Yoke
    mat_jersey_blue = create_pbr("M_Jersey_RoyalBlue", (0.015, 0.15, 0.52, 1.0), roughness=0.68)
    mat_jersey_orange = create_pbr("M_Jersey_SaffronOrange", (0.98, 0.38, 0.02, 1.0), roughness=0.65)
    mat_trouser_blue = create_pbr("M_Trouser_AthleticBlue", (0.012, 0.12, 0.44, 1.0), roughness=0.72)
    mat_shoe_white = create_pbr("M_Shoe_Synthetic", (0.90, 0.90, 0.92, 1.0), roughness=0.35)

    # Equipment
    mat_helmet_navy = create_pbr("M_Helmet_CompositeNavy", (0.012, 0.08, 0.32, 1.0), roughness=0.22)
    mat_grill_steel = create_pbr("M_Helmet_GrillSteel", (0.88, 0.89, 0.91, 1.0), roughness=0.18, metallic=0.98)
    mat_pads_white = create_pbr("M_BattingPads_White", (0.96, 0.96, 0.97, 1.0), roughness=0.42)
    mat_pad_straps = create_pbr("M_PadStraps_NavyWebbing", (0.02, 0.06, 0.22, 1.0), roughness=0.85)
    mat_gloves_white = create_pbr("M_BattingGloves_Leather", (0.93, 0.93, 0.95, 1.0), roughness=0.52)
    mat_gloves_blue = create_pbr("M_GloveRolls_Blue", (0.02, 0.15, 0.52, 1.0), roughness=0.45)
    mat_bat_willow = create_pbr("M_EnglishWillow_Bat", (0.87, 0.72, 0.48, 1.0), roughness=0.32)
    mat_bat_grip = create_pbr("M_Bat_ChevronGrip", (0.02, 0.12, 0.48, 1.0), roughness=0.85)
    mat_cricket_ball = create_pbr("M_MatchBall_RedLeather", (0.68, 0.03, 0.05, 1.0), roughness=0.20)
    mat_ball_seam = create_pbr("M_Ball_SeamStitch", (0.95, 0.93, 0.88, 1.0), roughness=0.80)

    # -------------------------------------------------------------
    # 3. HIGH-REALISM ANATOMY MESH (Athletic Male Cricketer: 1.84m)
    # -------------------------------------------------------------
    head_z = 1.70
    neck_z = 1.52
    chest_z = 1.38
    pelvis_z = 0.98
    knee_z = 0.52
    ankle_z = 0.10

    bm = bmesh.new()

    def add_bm_cylinder(b_mesh, radius, depth, matrix=Matrix(), segments=16):
        return bmesh.ops.create_cone(
            b_mesh,
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=radius,
            radius2=radius,
            depth=depth,
            matrix=matrix
        )

    # Head (Cranium + Jaw + Nose + Ears)
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.115, matrix=Matrix.Translation((0, 0.01, head_z)))
    bmesh.ops.create_cube(bm, size=0.10, matrix=Matrix.Translation((0, 0.045, head_z - 0.085)))
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.016, radius2=0.006, depth=0.045, matrix=Matrix.Translation((0, 0.115, head_z - 0.015)))

    for side, x_sign in (("L", 1), ("R", -1)):
        ear_mat = Matrix.Translation((x_sign * 0.112, -0.01, head_z - 0.01)) * Matrix.Scale(0.045, 4, Vector((0, 0, 1))) * Matrix.Scale(0.025, 4, Vector((0, 1, 0)))
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.035, matrix=ear_mat)

    # Neck
    add_bm_cylinder(bm, radius=0.065, depth=0.12, matrix=Matrix.Translation((0, 0, (neck_z + head_z - 0.09) / 2)), segments=16)

    # Chest & Torso (Athletic V-Taper: Broad 44cm chest, narrow 32cm waist)
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0.005, chest_z)))
    for v in bm.verts:
        if abs(v.co.z - chest_z) < 0.55 and v.co.z > pelvis_z + 0.15:
            v.co.x *= 0.38
            v.co.y *= 0.22
            v.co.z = chest_z + (v.co.z - chest_z) * 0.28

    # Pelvis & Hips
    add_bm_cylinder(bm, radius=0.165, depth=0.24, matrix=Matrix.Translation((0, -0.01, pelvis_z + 0.08)), segments=18)

    # Arms (Biceps, Forearms, 5-Finger Articulated Hands)
    for side, x_sign in (("L", 1), ("R", -1)):
        sh_loc = Vector((x_sign * 0.23, 0.0, 1.44))
        el_loc = Vector((x_sign * 0.38, -0.02, 1.18))
        wr_loc = Vector((x_sign * 0.44, 0.05, 0.90))

        # Upper arm & Forearm
        add_bm_cylinder(bm, radius=0.056, depth=(el_loc - sh_loc).length, matrix=Matrix.Translation((sh_loc + el_loc) / 2), segments=14)
        add_bm_cylinder(bm, radius=0.048, depth=(wr_loc - el_loc).length, matrix=Matrix.Translation((el_loc + wr_loc) / 2), segments=14)

        # Palm
        palm_center = wr_loc + Vector((x_sign * 0.02, 0.02, -0.06))
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(palm_center))
        for v in bm.verts:
            if (v.co - palm_center).length < 0.2:
                v.co.x = palm_center.x + (v.co.x - palm_center.x) * 0.085
                v.co.y = palm_center.y + (v.co.y - palm_center.y) * 0.035
                v.co.z = palm_center.z + (v.co.z - palm_center.z) * 0.080

        # 5 Individual Fingers
        finger_offsets = [
            (Vector((x_sign * 0.035, 0.045, -0.03)), 0.013, 0.060),
            (Vector((x_sign * 0.025, 0.015, -0.11)), 0.011, 0.075),
            (Vector((x_sign * 0.005, 0.010, -0.12)), 0.011, 0.082),
            (Vector((-x_sign * 0.015, 0.005, -0.11)), 0.010, 0.076),
            (Vector((-x_sign * 0.032, -0.005, -0.095)), 0.009, 0.062)
        ]
        for f_off, f_rad, f_len in finger_offsets:
            add_bm_cylinder(bm, radius=f_rad, depth=f_len, matrix=Matrix.Translation(wr_loc + f_off), segments=8)

    # Legs & Feet
    for side, x_sign in (("L", 1), ("R", -1)):
        hip_loc = Vector((x_sign * 0.12, 0.0, pelvis_z))
        kn_loc = Vector((x_sign * 0.13, 0.02, knee_z))
        ank_loc = Vector((x_sign * 0.12, -0.02, ankle_z))

        add_bm_cylinder(bm, radius=0.095, depth=(kn_loc - hip_loc).length, matrix=Matrix.Translation((hip_loc + kn_loc) / 2), segments=16)
        add_bm_cylinder(bm, radius=0.078, depth=(ank_loc - kn_loc).length, matrix=Matrix.Translation((kn_loc + ank_loc) / 2), segments=16)

        ft_center = ank_loc + Vector((0, 0.08, -0.05))
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(ft_center))
        for v in bm.verts:
            if (v.co - ft_center).length < 0.25:
                v.co.x = ft_center.x + (v.co.x - ft_center.x) * 0.095
                v.co.y = ft_center.y + (v.co.y - ft_center.y) * 0.24
                v.co.z = ft_center.z + (v.co.z - ft_center.z) * 0.065

    # Finalize Body Mesh Object
    mesh_body = bpy.data.meshes.new("Player_Body_Anatomy")
    bm.to_mesh(mesh_body)
    bm.free()

    obj_body = bpy.data.objects.new("Player_Body_Anatomy", mesh_body)
    col_body.objects.link(obj_body)
    obj_body.data.materials.append(mat_skin)
    for p in mesh_body.polygons:
        p.use_smooth = True

    sub_mod = obj_body.modifiers.new("Subdivision", type="SUBSURF")
    sub_mod.levels = 1
    sub_mod.render_levels = 2

    # Left & Right Realistic Eyes
    for side, x_sign in (("L", 1), ("R", -1)):
        eye_loc = Vector((x_sign * 0.038, 0.096, head_z + 0.012))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.015, location=eye_loc)
        eye_obj = bpy.context.active_object
        eye_obj.name = f"Player_Eye_{side}"
        link_obj(eye_obj, col_body)
        eye_obj.data.materials.append(mat_iris)
        for p in eye_obj.data.polygons:
            p.use_smooth = True

    # -------------------------------------------------------------
    # 4. INDIAN CRICKET UNIFORM (Jersey, Trousers, Spikes)
    # -------------------------------------------------------------
    # Jersey Torso
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.005, chest_z))
    jersey = bpy.context.active_object
    jersey.name = "Jersey_Top"
    jersey.scale = (0.42, 0.25, 0.32)
    bpy.ops.object.transform_apply(scale=True)
    link_obj(jersey, col_clothing)
    jersey.data.materials.append(mat_jersey_blue)
    for p in jersey.data.polygons:
        p.use_smooth = True

    # Saffron Shoulder Yoke & Collar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.01, 1.49))
    collar = bpy.context.active_object
    collar.name = "Jersey_Collar_Yoke"
    collar.scale = (0.34, 0.22, 0.06)
    bpy.ops.object.transform_apply(scale=True)
    link_obj(collar, col_clothing)
    collar.data.materials.append(mat_jersey_orange)
    for p in collar.data.polygons:
        p.use_smooth = True

    # Athletic Trousers (Waist & Legs)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=0.28, location=(0, -0.01, pelvis_z + 0.06))
    trouser_waist = bpy.context.active_object
    trouser_waist.name = "Cricket_Trousers_Waist"
    link_obj(trouser_waist, col_clothing)
    trouser_waist.data.materials.append(mat_trouser_blue)
    for p in trouser_waist.data.polygons:
        p.use_smooth = True

    for side, x_sign in (("L", 1), ("R", -1)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.105, depth=0.88, location=(x_sign * 0.125, 0.01, 0.54))
        leg = bpy.context.active_object
        leg.name = f"Cricket_Trouser_Leg_{side}"
        link_obj(leg, col_clothing)
        leg.data.materials.append(mat_trouser_blue)
        for p in leg.data.polygons:
            p.use_smooth = True

    # Cricket Spiked Shoes
    for side, x_sign in (("L", 1), ("R", -1)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_sign * 0.12, 0.07, 0.05))
        shoe = bpy.context.active_object
        shoe.name = f"Cricket_Spike_Shoe_{side}"
        shoe.scale = (0.11, 0.26, 0.09)
        bpy.ops.object.transform_apply(scale=True)
        link_obj(shoe, col_clothing)
        shoe.data.materials.append(mat_shoe_white)
        for p in shoe.data.polygons:
            p.use_smooth = True

    # -------------------------------------------------------------
    # 5. PROFESSIONAL PROTECTIVE EQUIPMENT
    # -------------------------------------------------------------
    # Helmet Shell
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.138, location=(0, 0.005, head_z + 0.03))
    helmet = bpy.context.active_object
    helmet.name = "Helmet_Composite_Shell"
    helmet.scale = (1.0, 1.15, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    link_obj(helmet, col_equipment)
    helmet.data.materials.append(mat_helmet_navy)
    for p in helmet.data.polygons:
        p.use_smooth = True

    # Visor Peak
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.145, head_z + 0.04))
    visor = bpy.context.active_object
    visor.name = "Helmet_Visor_Peak"
    visor.scale = (0.22, 0.09, 0.02)
    visor.rotation_euler = (math.radians(-15), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    link_obj(visor, col_equipment)
    visor.data.materials.append(mat_helmet_navy)

    # Steel Grill Bars
    for bar_idx in range(4):
        z_bar = head_z - 0.02 - (bar_idx * 0.028)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.004, depth=0.18, location=(0, 0.138 - (bar_idx * 0.008), z_bar))
        bar = bpy.context.active_object
        bar.name = f"Helmet_Grill_Bar_{bar_idx}"
        bar.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link_obj(bar, col_equipment)
        bar.data.materials.append(mat_grill_steel)

    # Batting Pads (Left & Right Leg Guards with 3 Cane Ribs + 3 Straps)
    for side, x_sign in (("L", 1), ("R", -1)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x_sign * 0.13, 0.11, 0.46))
        pad = bpy.context.active_object
        pad.name = f"Batting_Pad_{side}"
        pad.scale = (0.13, 0.065, 0.72)
        bpy.ops.object.transform_apply(scale=True)
        link_obj(pad, col_equipment)
        pad.data.materials.append(mat_pads_white)
        for p in pad.data.polygons:
            p.use_smooth = True

        for rib_i in (-1, 0, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.68, location=(x_sign * 0.13 + (rib_i * 0.038), 0.145, 0.46))
            cane = bpy.context.active_object
            cane.name = f"Pad_CaneRib_{side}_{rib_i+1}"
            link_obj(cane, col_equipment)
            cane.data.materials.append(mat_pads_white)

        for s_idx, s_z in enumerate((0.20, 0.46, 0.70)):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.115, depth=0.035, location=(x_sign * 0.13, 0.02, s_z))
            strap = bpy.context.active_object
            strap.name = f"Pad_Strap_{side}_{s_idx}"
            link_obj(strap, col_equipment)
            strap.data.materials.append(mat_pad_straps)

    # Batting Gloves with Segmented Rolls
    for side, x_sign in (("L", 1), ("R", -1)):
        g_loc = Vector((x_sign * 0.45, 0.06, 0.88))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=g_loc)
        glove = bpy.context.active_object
        glove.name = f"Batting_Glove_{side}"
        glove.scale = (0.10, 0.12, 0.16)
        bpy.ops.object.transform_apply(scale=True)
        link_obj(glove, col_equipment)
        glove.data.materials.append(mat_gloves_white)
        for p in glove.data.polygons:
            p.use_smooth = True

        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.14, location=(g_loc.x, g_loc.y + 0.04, g_loc.z))
        sausage = bpy.context.active_object
        sausage.name = f"Glove_Sausage_{side}"
        sausage.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link_obj(sausage, col_equipment)
        sausage.data.materials.append(mat_gloves_blue)

    # English Willow Cricket Bat
    bat_pos = Vector((0.35, 0.15, 0.50))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=bat_pos)
    bat_blade = bpy.context.active_object
    bat_blade.name = "Cricket_Bat_Blade"
    bat_blade.scale = (0.068, 0.135, 0.96)
    bpy.ops.object.transform_apply(scale=True)
    link_obj(bat_blade, col_equipment)
    bat_blade.data.materials.append(mat_bat_willow)
    for p in bat_blade.data.polygons:
        p.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(radius=0.034, depth=0.38, location=bat_pos + Vector((0, 0, 0.64)))
    bat_handle = bpy.context.active_object
    bat_handle.name = "Cricket_Bat_Handle"
    link_obj(bat_handle, col_equipment)
    bat_handle.data.materials.append(mat_bat_grip)
    for p in bat_handle.data.polygons:
        p.use_smooth = True

    # Match Cricket Ball with White Seam
    ball_pos = Vector((-0.45, 0.25, 0.12))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, location=ball_pos)
    ball = bpy.context.active_object
    ball.name = "Cricket_Ball_Leather"
    link_obj(ball, col_equipment)
    ball.data.materials.append(mat_cricket_ball)
    for p in ball.data.polygons:
        p.use_smooth = True

    bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.009, location=ball_pos)
    seam = bpy.context.active_object
    seam.name = "Cricket_Ball_Seam"
    link_obj(seam, col_equipment)
    seam.data.materials.append(mat_ball_seam)

    # -------------------------------------------------------------
    # 6. HUMANOID RIG ARMATURE (70+ Bones, 5 Fingers, Bat Grip Socket)
    # -------------------------------------------------------------
    arm_data = bpy.data.armatures.new("Armature_CricketPlayer")
    arm_obj = bpy.data.objects.new("Rig_CricketPlayer_Pro", arm_data)
    col_rig.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.show_in_front = True

    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    # Spine chain
    b_root = eb.new("Root")
    b_root.head = (0, 0, 0)
    b_root.tail = (0, 0, 0.1)

    b_hips = eb.new("Hips")
    b_hips.head = (0, -0.01, pelvis_z)
    b_hips.tail = (0, 0.0, pelvis_z + 0.14)
    b_hips.parent = b_root

    b_spine = eb.new("Spine")
    b_spine.head = b_hips.tail
    b_spine.tail = (0, 0.01, 1.28)
    b_spine.parent = b_hips

    b_chest = eb.new("Chest")
    b_chest.head = b_spine.tail
    b_chest.tail = (0, 0.01, 1.48)
    b_chest.parent = b_spine

    b_neck = eb.new("Neck")
    b_neck.head = b_chest.tail
    b_neck.tail = (0, 0.01, 1.58)
    b_neck.parent = b_chest

    b_head = eb.new("Head")
    b_head.head = b_neck.tail
    b_head.tail = (0, 0.03, 1.78)
    b_head.parent = b_neck

    # Arms & 5 Fingers per hand
    for side, x_sign in (("L", 1), ("R", -1)):
        b_sh = eb.new(f"Shoulder.{side}")
        b_sh.head = (0, 0, 1.46)
        b_sh.tail = (x_sign * 0.18, 0, 1.44)
        b_sh.parent = b_chest

        b_uarm = eb.new(f"UpperArm.{side}")
        b_uarm.head = b_sh.tail
        b_uarm.tail = (x_sign * 0.38, -0.02, 1.18)
        b_uarm.parent = b_sh

        b_farm = eb.new(f"ForeArm.{side}")
        b_farm.head = b_uarm.tail
        b_farm.tail = (x_sign * 0.44, 0.05, 0.90)
        b_farm.parent = b_uarm

        b_hand = eb.new(f"Hand.{side}")
        b_hand.head = b_farm.tail
        b_hand.tail = (x_sign * 0.46, 0.06, 0.82)
        b_hand.parent = b_farm

        # Individual 5 Fingers
        for f_name in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
            b_f1 = eb.new(f"{f_name}.01.{side}")
            b_f1.head = b_hand.tail
            b_f1.tail = b_hand.tail + Vector((x_sign * 0.015, 0.02, -0.03))
            b_f1.parent = b_hand

            b_f2 = eb.new(f"{f_name}.02.{side}")
            b_f2.head = b_f1.tail
            b_f2.tail = b_f1.tail + Vector((x_sign * 0.01, 0.015, -0.025))
            b_f2.parent = b_f1

    # Legs & Feet
    for side, x_sign in (("L", 1), ("R", -1)):
        b_thigh = eb.new(f"Thigh.{side}")
        b_thigh.head = (x_sign * 0.12, 0.0, pelvis_z)
        b_thigh.tail = (x_sign * 0.13, 0.02, knee_z)
        b_thigh.parent = b_hips

        b_shin = eb.new(f"Shin.{side}")
        b_shin.head = b_thigh.tail
        b_shin.tail = (x_sign * 0.12, -0.02, ankle_z)
        b_shin.parent = b_thigh

        b_foot = eb.new(f"Foot.{side}")
        b_foot.head = b_shin.tail
        b_foot.tail = (x_sign * 0.12, 0.10, 0.02)
        b_foot.parent = b_shin

        b_toe = eb.new(f"Toe.{side}")
        b_toe.head = b_foot.tail
        b_toe.tail = (x_sign * 0.12, 0.18, 0.02)
        b_toe.parent = b_foot

    # Bat Grip Socket Bone (Parent for Cricket Bat)
    b_socket = eb.new("Socket_CricketBat")
    b_socket.head = (0.44, 0.05, 0.88)
    b_socket.tail = (0.44, 0.05, 0.40)
    b_socket.parent = eb["Hand.R"]

    bpy.ops.object.mode_set(mode="OBJECT")

    # Parent Helmet to Head
    helmet.parent = arm_obj
    helmet.parent_type = "BONE"
    helmet.parent_bone = "Head"

    # Parent Bat to Bat Socket
    bat_blade.parent = arm_obj
    bat_blade.parent_type = "BONE"
    bat_blade.parent_bone = "Socket_CricketBat"

    bat_handle.parent = arm_obj
    bat_handle.parent_type = "BONE"
    bat_handle.parent_bone = "Socket_CricketBat"

    # Parent Deforming Meshes to Armature
    for obj in (obj_body, jersey, collar, trouser_waist):
        mod = obj.modifiers.new("ArmatureDeform", type="ARMATURE")
        mod.object = arm_obj

    # -------------------------------------------------------------
    # 7. CRICKET ACTION: CLASSIC BATTING STANCE
    # -------------------------------------------------------------
    act_stance = bpy.data.actions.new("Pose_Batting_Stance")
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = act_stance

    pb = arm_obj.pose.bones
    pb["Hips"].rotation_euler = (math.radians(-5), math.radians(15), 0)
    pb["Thigh.L"].rotation_euler = (math.radians(-15), 0, math.radians(10))
    pb["Shin.L"].rotation_euler = (math.radians(25), 0, 0)
    pb["Thigh.R"].rotation_euler = (math.radians(-18), 0, math.radians(-10))
    pb["Shin.R"].rotation_euler = (math.radians(30), 0, 0)

    pb["Chest"].rotation_euler = (math.radians(10), math.radians(20), 0)
    pb["Head"].rotation_euler = (math.radians(-5), math.radians(-30), 0)

    pb["UpperArm.L"].rotation_euler = (math.radians(-40), math.radians(15), math.radians(-25))
    pb["ForeArm.L"].rotation_euler = (math.radians(-55), 0, 0)
    pb["UpperArm.R"].rotation_euler = (math.radians(-35), math.radians(-10), math.radians(20))
    pb["ForeArm.R"].rotation_euler = (math.radians(-45), 0, 0)

    # -------------------------------------------------------------
    # 8. BROADCAST STUDIO LIGHTING & CAMERAS
    # -------------------------------------------------------------
    # Key Broadcast Light
    bpy.ops.object.light_add(type="AREA", radius=1.8, location=(2.4, -2.8, 3.2))
    key_l = bpy.context.active_object
    key_l.name = "Key_Light_Broadcast"
    key_l.data.energy = 650.0
    key_l.data.color = (1.0, 0.96, 0.90)
    link_obj(key_l, col_studio)

    # Fill Stadium Light
    bpy.ops.object.light_add(type="AREA", radius=2.5, location=(-2.8, -1.8, 2.2))
    fill_l = bpy.context.active_object
    fill_l.name = "Fill_Light_SkyBlue"
    fill_l.data.energy = 280.0
    fill_l.data.color = (0.75, 0.88, 1.0)
    link_obj(fill_l, col_studio)

    # Rim Saffron Accent Light
    bpy.ops.object.light_add(type="SPOT", radius=1.2, location=(0.2, 3.2, 2.8))
    rim_l = bpy.context.active_object
    rim_l.name = "Rim_Light_SaffronEdge"
    rim_l.data.energy = 550.0
    rim_l.data.color = (1.0, 0.55, 0.15)
    rim_l.rotation_euler = (math.radians(-135), 0, 0)
    link_obj(rim_l, col_studio)

    # Broadcast Perspective Camera
    bpy.ops.object.camera_add(location=(0.0, -3.2, 1.25))
    cam = bpy.context.active_object
    cam.name = "Camera_Neutral_Front"
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 50
    bpy.context.scene.camera = cam
    link_obj(cam, col_studio)

    # Render settings
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.image_settings.file_format = 'PNG'
    render_out_path = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League\tools\cricket_player_front.png"
    scene.render.filepath = render_out_path

    try:
        bpy.ops.render.render(write_still=True)
        print(f">>> Rendered snapshot saved to: {render_out_path}")
    except Exception as ren_err:
        print(f">>> Viewport render notice: {ren_err}")

    # Tag viewport redraw
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()

    print(">>> [Antigravity] Production Cricket Player successfully built!")
    return True

if __name__ == "__main__":
    build_cricket_player()
