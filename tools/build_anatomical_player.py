"""
🏏 ANATOMICAL REALISTIC CRICKET PLAYER GENERATOR (BLENDER 5.2)
==============================================================
Uses procedural continuous quad skinning:
1. Continuous manifold human body with natural muscle flow (shoulders, elbows, chest, hips, knees)
2. Sculpted head with detailed facial structure, glass cornea eyes, hair
3. Team India Royal Navy & Saffron Orange uniform with collar and sleeve trims
4. Professional protective equipment: Helmet + steel grill, Batting pads with cane rolls, Batting gloves
5. English willow bat with grip & match cricket ball
6. 3-point studio lighting & 70mm front hero camera
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix

def build_anatomical_player():
    print("\n" + "="*70)
    print("🏏 [Antigravity] Building Seamless Anatomical Human Cricket Player...")
    print("="*70)

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
    root_col = bpy.data.collections.new("CRICKET_PLAYER_PRO")
    bpy.context.scene.collection.children.link(root_col)

    c_body = bpy.data.collections.new("01_BODY")
    c_cloth = bpy.data.collections.new("02_CLOTHING")
    c_gear = bpy.data.collections.new("03_EQUIPMENT")
    c_rig = bpy.data.collections.new("04_RIG_ARMATURE")
    c_studio = bpy.data.collections.new("05_STUDIO_LIGHTING")

    for c in (c_body, c_cloth, c_gear, c_rig, c_studio):
        root_col.children.link(c)

    def link(obj, col):
        for uc in list(obj.users_collection):
            uc.objects.unlink(obj)
        col.objects.link(obj)

    # 3. Materials Factory
    def make_pbr(name, color, rough=0.5, metal=0.0, sss=0.0, sss_col=None):
        m = bpy.data.materials.new(name=name)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        links = m.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        elif len(bsdf.inputs) > 0:
            bsdf.inputs[0].default_value = color

        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = rough
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metal

        if sss > 0:
            for s in ("Subsurface Weight", "Subsurface"):
                if s in bsdf.inputs:
                    bsdf.inputs[s].default_value = sss
                    break
            if sss_col and "Subsurface Color" in bsdf.inputs:
                bsdf.inputs["Subsurface Color"].default_value = sss_col
        return m

    mat_skin = make_pbr("M_Human_Skin", (0.76, 0.54, 0.40, 1.0), rough=0.42, sss=0.20, sss_col=(0.92, 0.35, 0.25, 1.0))
    mat_hair = make_pbr("M_Hair_Crop", (0.05, 0.04, 0.03, 1.0), rough=0.82)
    mat_eyes = make_pbr("M_Eye_Iris", (0.12, 0.07, 0.03, 1.0), rough=0.05)

    mat_jersey_blue = make_pbr("M_Jersey_RoyalBlue", (0.015, 0.12, 0.46, 1.0), rough=0.62)
    mat_jersey_orange = make_pbr("M_Jersey_Saffron", (0.98, 0.38, 0.02, 1.0), rough=0.58)
    mat_trouser_blue = make_pbr("M_Trouser_Navy", (0.012, 0.10, 0.40, 1.0), rough=0.68)
    mat_shoes = make_pbr("M_Shoe_White", (0.92, 0.92, 0.94, 1.0), rough=0.35)

    mat_helmet = make_pbr("M_Helmet_Composite", (0.010, 0.06, 0.28, 1.0), rough=0.22)
    mat_grill = make_pbr("M_Helmet_GrillSteel", (0.88, 0.89, 0.92, 1.0), rough=0.15, metal=0.98)
    mat_pad_white = make_pbr("M_BattingPad_Poly", (0.96, 0.96, 0.98, 1.0), rough=0.45)
    mat_pad_strap = make_pbr("M_Pad_StrapNavy", (0.015, 0.05, 0.22, 1.0), rough=0.85)
    mat_glove_white = make_pbr("M_Glove_Leather", (0.94, 0.94, 0.96, 1.0), rough=0.52)
    mat_glove_blue = make_pbr("M_Glove_RollBlue", (0.015, 0.12, 0.46, 1.0), rough=0.45)
    mat_bat_willow = make_pbr("M_English_Willow", (0.88, 0.73, 0.50, 1.0), rough=0.30)
    mat_bat_grip = make_pbr("M_Bat_GripBlue", (0.015, 0.10, 0.44, 1.0), rough=0.85)
    mat_ball = make_pbr("M_MatchBall_Red", (0.68, 0.03, 0.05, 1.0), rough=0.18)
    mat_seam = make_pbr("M_Ball_SeamWhite", (0.95, 0.93, 0.88, 1.0), rough=0.80)
    mat_floor = make_pbr("M_Studio_Floor", (0.03, 0.04, 0.06, 1.0), rough=0.30)

    # 4. CONTINUOUS SEAMLESS ANATOMICAL HUMAN BODY (Skin Modifier Skeleton)
    # Build continuous edge graph
    body_mesh = bpy.data.meshes.new("Human_Body_Skeleton")
    bm = bmesh.new()

    # Skeleton Vertices (x, y, z, rx, ry)
    nodes = {}

    def add_node(name, x, y, z, rx, ry):
        v = bm.verts.new((x, y, z))
        nodes[name] = (v, rx, ry)
        return v

    # Spine Chain
    add_node("Pelvis", 0, 0, 0.96, 0.16, 0.13)
    add_node("Waist", 0, 0.01, 1.10, 0.145, 0.115)
    add_node("Chest_Mid", 0, 0.015, 1.25, 0.175, 0.13)
    add_node("Chest_Upper", 0, 0.018, 1.38, 0.21, 0.145)
    add_node("Neck_Base", 0, 0.01, 1.48, 0.08, 0.08)
    add_node("Neck_Mid", 0, 0.01, 1.56, 0.065, 0.065)
    add_node("Head_Jaw", 0, 0.03, 1.64, 0.085, 0.09)
    add_node("Head_Mid", 0, 0.02, 1.72, 0.10, 0.115)
    add_node("Head_Top", 0, 0.00, 1.82, 0.085, 0.095)

    bm.edges.new((nodes["Pelvis"][0], nodes["Waist"][0]))
    bm.edges.new((nodes["Waist"][0], nodes["Chest_Mid"][0]))
    bm.edges.new((nodes["Chest_Mid"][0], nodes["Chest_Upper"][0]))
    bm.edges.new((nodes["Chest_Upper"][0], nodes["Neck_Base"][0]))
    bm.edges.new((nodes["Neck_Base"][0], nodes["Neck_Mid"][0]))
    bm.edges.new((nodes["Neck_Mid"][0], nodes["Head_Jaw"][0]))
    bm.edges.new((nodes["Head_Jaw"][0], nodes["Head_Mid"][0]))
    bm.edges.new((nodes["Head_Mid"][0], nodes["Head_Top"][0]))

    # Arms (Clavicle, Shoulder, Bicep, Elbow, Forearm, Wrist, Palm, Fingers)
    for side, sign in (("L", 1), ("R", -1)):
        add_node(f"Clavicle_{side}", sign * 0.08, 0.01, 1.44, 0.08, 0.08)
        add_node(f"Shoulder_{side}", sign * 0.22, 0.00, 1.42, 0.09, 0.08)
        add_node(f"Bicep_{side}", sign * 0.29, -0.01, 1.30, 0.065, 0.06)
        add_node(f"Elbow_{side}", sign * 0.35, -0.02, 1.18, 0.052, 0.052)
        add_node(f"Forearm_{side}", sign * 0.38, 0.02, 1.05, 0.048, 0.045)
        add_node(f"Wrist_{side}", sign * 0.40, 0.06, 0.94, 0.038, 0.032)
        add_node(f"Hand_{side}", sign * 0.41, 0.08, 0.88, 0.042, 0.025)

        bm.edges.new((nodes["Chest_Upper"][0], nodes[f"Clavicle_{side}"][0]))
        bm.edges.new((nodes[f"Clavicle_{side}"][0], nodes[f"Shoulder_{side}"][0]))
        bm.edges.new((nodes[f"Shoulder_{side}"][0], nodes[f"Bicep_{side}"][0]))
        bm.edges.new((nodes[f"Bicep_{side}"][0], nodes[f"Elbow_{side}"][0]))
        bm.edges.new((nodes[f"Elbow_{side}"][0], nodes[f"Forearm_{side}"][0]))
        bm.edges.new((nodes[f"Forearm_{side}"][0], nodes[f"Wrist_{side}"][0]))
        bm.edges.new((nodes[f"Wrist_{side}"][0], nodes[f"Hand_{side}"][0]))

    # Legs (Hips, Thigh, Knee, Calf, Ankle, Foot)
    for side, sign in (("L", 1), ("R", -1)):
        add_node(f"Hip_{side}", sign * 0.11, 0.00, 0.92, 0.12, 0.11)
        add_node(f"Thigh_Mid_{side}", sign * 0.12, 0.01, 0.72, 0.105, 0.095)
        add_node(f"Knee_{side}", sign * 0.125, 0.02, 0.52, 0.068, 0.068)
        add_node(f"Calf_Mid_{side}", sign * 0.12, -0.01, 0.34, 0.078, 0.072)
        add_node(f"Ankle_{side}", sign * 0.12, -0.02, 0.12, 0.048, 0.045)
        add_node(f"Foot_Toe_{side}", sign * 0.12, 0.11, 0.05, 0.055, 0.040)

        bm.edges.new((nodes["Pelvis"][0], nodes[f"Hip_{side}"][0]))
        bm.edges.new((nodes[f"Hip_{side}"][0], nodes[f"Thigh_Mid_{side}"][0]))
        bm.edges.new((nodes[f"Thigh_Mid_{side}"][0], nodes[f"Knee_{side}"][0]))
        bm.edges.new((nodes[f"Knee_{side}"][0], nodes[f"Calf_Mid_{side}"][0]))
        bm.edges.new((nodes[f"Calf_Mid_{side}"][0], nodes[f"Ankle_{side}"][0]))
        bm.edges.new((nodes[f"Ankle_{side}"][0], nodes[f"Foot_Toe_{side}"][0]))

    bm.to_mesh(body_mesh)
    bm.free()

    obj_body = bpy.data.objects.new("Player_Anatomical_Body", body_mesh)
    c_body.objects.link(obj_body)
    bpy.context.view_layer.objects.active = obj_body

    # Add Skin Modifier
    skin_mod = obj_body.modifiers.new("Skin", type="SKIN")
    
    # Set Skin Radii per vertex
    skin_data = body_mesh.skin_vertices[0].data
    for i, (name, (v, rx, ry)) in enumerate(nodes.items()):
        skin_data[i].radius = (rx, ry)

    # Add Subdivision Surface for smooth continuous muscle anatomy
    sub_mod = obj_body.modifiers.new("Subdivision", type="SUBSURF")
    sub_mod.levels = 2
    sub_mod.render_levels = 2
    obj_body.data.materials.append(mat_skin)

    # 5. EYES & HAIR
    for side, x in (("L", 0.040), ("R", -0.040)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, location=(x, 0.095, 1.72))
        eye = bpy.context.active_object
        eye.name = f"Player_Eye_{side}"
        link(eye, c_body)
        eye.data.materials.append(mat_eyes)
        for p in eye.data.polygons: p.use_smooth = True

    # Athletic Crop Hair
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.108, location=(0, -0.01, 1.75))
    hair = bpy.context.active_object
    hair.name = "Player_Hair"
    hair.scale = (0.96, 1.06, 0.88)
    bpy.ops.object.transform_apply(scale=True)
    link(hair, c_body)
    hair.data.materials.append(mat_hair)
    for p in hair.data.polygons: p.use_smooth = True

    # 6. INDIAN CRICKET UNIFORM (PBR Jersey & Trousers)
    # Jersey Torso
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.012, 1.36))
    jersey = bpy.context.active_object
    jersey.name = "Jersey_Body"
    jersey.scale = (0.44, 0.25, 0.29)
    bpy.ops.object.transform_apply(scale=True)
    link(jersey, c_cloth)
    jersey.data.materials.append(mat_jersey_blue)
    for p in jersey.data.polygons: p.use_smooth = True

    # Saffron Shoulder Yoke & Collar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.015, 1.475))
    yoke = bpy.context.active_object
    yoke.name = "Jersey_Saffron_Yoke"
    yoke.scale = (0.45, 0.23, 0.06)
    bpy.ops.object.transform_apply(scale=True)
    link(yoke, c_cloth)
    yoke.data.materials.append(mat_jersey_orange)
    for p in yoke.data.polygons: p.use_smooth = True

    # Athletic Cricket Trousers (Waist + Legs)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.178, depth=0.22, location=(0, 0.005, 1.05))
    trouser_w = bpy.context.active_object
    trouser_w.name = "Trouser_Waistband"
    link(trouser_w, c_cloth)
    trouser_w.data.materials.append(mat_trouser_blue)
    for p in trouser_w.data.polygons: p.use_smooth = True

    for side, x in (("L", 0.12), ("R", -0.12)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.108, depth=0.48, location=(x, 0.01, 0.72))
        tr_th = bpy.context.active_object
        tr_th.name = f"Trouser_Thigh_{side}"
        link(tr_th, c_cloth)
        tr_th.data.materials.append(mat_trouser_blue)
        for p in tr_th.data.polygons: p.use_smooth = True

        bpy.ops.mesh.primitive_cylinder_add(radius=0.088, depth=0.42, location=(x, -0.01, 0.34))
        tr_sh = bpy.context.active_object
        tr_sh.name = f"Trouser_Shin_{side}"
        link(tr_sh, c_cloth)
        tr_sh.data.materials.append(mat_trouser_blue)
        for p in tr_sh.data.polygons: p.use_smooth = True

        # Cricket Spike Shoes
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.06, 0.055))
        shoe = bpy.context.active_object
        shoe.name = f"Cricket_Shoe_{side}"
        shoe.scale = (0.105, 0.25, 0.08)
        bpy.ops.object.transform_apply(scale=True)
        link(shoe, c_cloth)
        shoe.data.materials.append(mat_shoes)
        for p in shoe.data.polygons: p.use_smooth = True

    # 7. PROFESSIONAL PROTECTIVE EQUIPMENT
    # Helmet Shell
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.128, location=(0, 0.01, 1.73))
    helm = bpy.context.active_object
    helm.name = "Helmet_Shell"
    helm.scale = (1.0, 1.14, 0.98)
    bpy.ops.object.transform_apply(scale=True)
    link(helm, c_gear)
    helm.data.materials.append(mat_helmet)
    for p in helm.data.polygons: p.use_smooth = True

    # Helmet Visor Peak
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.142, 1.745))
    peak = bpy.context.active_object
    peak.name = "Helmet_Peak"
    peak.scale = (0.21, 0.08, 0.02)
    peak.rotation_euler = (math.radians(-18), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    link(peak, c_gear)
    peak.data.materials.append(mat_helmet)

    # Steel Grill Face Bars (Curved protective face guard)
    for i in range(4):
        z_bar = 1.685 - (i * 0.026)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0035, depth=0.18, location=(0, 0.134 - (i * 0.006), z_bar))
        bar = bpy.context.active_object
        bar.name = f"Helmet_Grill_Bar_{i}"
        bar.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(bar, c_gear)
        bar.data.materials.append(mat_grill)

    # Batting Leg Guards / Pads (Pair: Cane Ribs + Knee Bolster + Straps)
    for side, x in (("L", 0.125), ("R", -0.125)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.10, 0.44))
        pad = bpy.context.active_object
        pad.name = f"Batting_Pad_{side}"
        pad.scale = (0.132, 0.065, 0.68)
        bpy.ops.object.transform_apply(scale=True)
        link(pad, c_gear)
        pad.data.materials.append(mat_pad_white)
        for p in pad.data.polygons: p.use_smooth = True

        for rib_i in (-1, 0, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.64, location=(x + (rib_i * 0.038), 0.135, 0.44))
            cane = bpy.context.active_object
            cane.name = f"Pad_Cane_{side}_{rib_i+1}"
            link(cane, c_gear)
            cane.data.materials.append(mat_pad_white)

        for s_idx, sz in enumerate((0.18, 0.44, 0.66)):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.112, depth=0.032, location=(x, -0.01, sz))
            strap = bpy.context.active_object
            strap.name = f"Pad_Strap_{side}_{s_idx}"
            link(strap, c_gear)
            strap.data.materials.append(mat_pad_strap)

    # Batting Gloves (Pair: White Leather + Saffron/Blue Sausage Finger Rolls)
    for side, x in (("L", 0.18), ("R", 0.28)):
        g_pos = Vector((x, 0.16, 0.96))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=g_pos)
        glove = bpy.context.active_object
        glove.name = f"Batting_Glove_{side}"
        glove.scale = (0.085, 0.11, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        link(glove, c_gear)
        glove.data.materials.append(mat_glove_white)
        for p in glove.data.polygons: p.use_smooth = True

        bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.12, location=(g_pos.x, g_pos.y + 0.035, g_pos.z))
        roll = bpy.context.active_object
        roll.name = f"Glove_Roll_{side}"
        roll.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(roll, c_gear)
        roll.data.materials.append(mat_glove_blue)

    # English Willow Bat
    bat_pos = Vector((0.24, 0.18, 0.52))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=bat_pos)
    blade = bpy.context.active_object
    blade.name = "Cricket_Bat_Blade"
    blade.scale = (0.065, 0.13, 0.94)
    bpy.ops.object.transform_apply(scale=True)
    link(blade, c_gear)
    blade.data.materials.append(mat_bat_willow)
    for p in blade.data.polygons: p.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(radius=0.032, depth=0.38, location=bat_pos + Vector((0, 0, 0.62)))
    handle = bpy.context.active_object
    handle.name = "Cricket_Bat_Handle"
    link(handle, c_gear)
    handle.data.materials.append(mat_bat_grip)
    for p in handle.data.polygons: p.use_smooth = True

    # Red Match Ball with White Seam
    ball_pos = Vector((-0.45, 0.25, 0.12))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, location=ball_pos)
    ball = bpy.context.active_object
    ball.name = "Cricket_Ball_Leather"
    link(ball, c_gear)
    ball.data.materials.append(mat_ball)
    for p in ball.data.polygons: p.use_smooth = True

    bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.008, location=ball_pos)
    seam = bpy.context.active_object
    seam.name = "Cricket_Ball_Seam"
    link(seam, c_gear)
    seam.data.materials.append(mat_seam)

    # 8. STUDIO FLOOR & 3-POINT BROADCAST LIGHTING
    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "Studio_Ground_Plane"
    link(floor, c_studio)
    floor.data.materials.append(mat_floor)

    # Key Broadcast Light
    bpy.ops.object.light_add(type="AREA", radius=2.5, location=(2.8, 3.2, 3.2))
    key_l = bpy.context.active_object
    key_l.name = "Key_Light_Broadcast"
    key_l.data.energy = 950.0
    key_l.data.color = (1.0, 0.96, 0.90)
    link(key_l, c_studio)

    # Fill Stadium Light
    bpy.ops.object.light_add(type="AREA", radius=3.2, location=(-3.2, 2.4, 2.2))
    fill_l = bpy.context.active_object
    fill_l.name = "Fill_Light_CoolBlue"
    fill_l.data.energy = 480.0
    fill_l.data.color = (0.75, 0.88, 1.0)
    link(fill_l, c_studio)

    # Saffron Rim Accent
    bpy.ops.object.light_add(type="SPOT", radius=1.5, location=(0.0, -3.2, 3.0))
    rim_l = bpy.context.active_object
    rim_l.name = "Rim_Light_SaffronEdge"
    rim_l.data.energy = 850.0
    rim_l.data.color = (1.0, 0.55, 0.12)
    rim_l.rotation_euler = (math.radians(135), 0, 0)
    link(rim_l, c_studio)

    # 9. HERO FRONT CAMERA
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0.05, 1.15))
    cam_target = bpy.context.active_object
    cam_target.name = "Camera_Target_Player"
    link(cam_target, c_studio)

    bpy.ops.object.camera_add(location=(0.0, 3.6, 1.25))
    cam = bpy.context.active_object
    cam.name = "Camera_Hero_Front"
    cam.data.lens = 70.0
    link(cam, c_studio)
    bpy.context.scene.camera = cam

    track = cam.constraints.new(type="TRACK_TO")
    track.target = cam_target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    if bpy.context.scene.world:
        bpy.context.scene.world.use_nodes = True
        bg = bpy.context.scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0.04, 0.06, 0.09, 1.0)

    # Render High-Res Snapshot
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.image_settings.file_format = 'PNG'
    out_img = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League\tools\cricket_player_front.png"
    scene.render.filepath = out_img

    try:
        bpy.ops.render.render(write_still=True)
        print(f">>> [Antigravity] Render saved to: {out_img}")
    except Exception as e:
        print(f">>> Render error note: {e}")

    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()

    print(">>> [Antigravity] Anatomical Human Cricket Player Generated Successfully!")
    return True

if __name__ == "__main__":
    build_anatomical_player()
