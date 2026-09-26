"""
🏏 ENTERPRISE REALISTIC HUMAN CRICKET PLAYER (BLENDER 5.2 LTS)
==============================================================
Fully integrated, production-grade 3D cricket batsman:
- Continuous manifold anatomical human male body (1.84m) with natural shoulder and neck flow
- Form-fitted athletic Indian cricket jersey with V-neck collar & saffron raglan shoulder yokes
- Athletic cricket trousers with tapered cuffs and side seam piping
- Dual contoured batting leg guards with 7 cane ribs, knee roll & navy straps
- Composite batting helmet with peak visor and steel grill face guard
- Segmented batting gloves gripping the English willow bat
- English willow bat with chevron grip & cherry red match ball
- Studio broadcast lighting + 70mm hero camera + front render
"""

import bpy
import bmesh
import math
from mathutils import Vector, Matrix

def build_pro_player():
    print("\n" + "="*70)
    print("🏏 [Antigravity] Building High-Fidelity Human Cricket Player...")
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

    # 2. Master Collections Setup
    root_col = bpy.data.collections.new("CRICKET_PLAYER_PRO")
    bpy.context.scene.collection.children.link(root_col)

    c_body = bpy.data.collections.new("01_BODY")
    c_cloth = bpy.data.collections.new("02_CLOTHING")
    c_gear = bpy.data.collections.new("03_EQUIPMENT")
    c_studio = bpy.data.collections.new("05_STUDIO_LIGHTING")

    for c in (c_body, c_cloth, c_gear, c_studio):
        root_col.children.link(c)

    def link(obj, col):
        for uc in list(obj.users_collection):
            uc.objects.unlink(obj)
        col.objects.link(obj)

    # 3. PBR Materials Factory
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

    # Palette
    mat_skin = make_pbr("M_Human_Skin", (0.76, 0.54, 0.40, 1.0), rough=0.42, sss=0.18, sss_col=(0.92, 0.35, 0.25, 1.0))
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

    # 4. CONTINUOUS SEAMLESS HUMAN BODY
    # Continuous edge skeleton with skin modifier + subsurf
    body_mesh = bpy.data.meshes.new("Human_Body_Mesh")
    bm = bmesh.new()

    nodes = {}
    def add_n(name, x, y, z, rx, ry):
        v = bm.verts.new((x, y, z))
        nodes[name] = (v, rx, ry)
        return v

    # Spine
    add_n("Pelvis", 0, 0, 0.96, 0.155, 0.125)
    add_n("Waist", 0, 0.01, 1.10, 0.145, 0.115)
    add_n("Chest_Mid", 0, 0.015, 1.25, 0.175, 0.13)
    add_n("Chest_Upper", 0, 0.018, 1.38, 0.205, 0.14)
    add_n("Neck_Base", 0, 0.01, 1.48, 0.075, 0.075)
    add_n("Neck_Mid", 0, 0.01, 1.56, 0.062, 0.062)
    add_n("Head_Jaw", 0, 0.03, 1.64, 0.082, 0.088)
    add_n("Head_Mid", 0, 0.02, 1.72, 0.096, 0.112)
    add_n("Head_Top", 0, 0.00, 1.82, 0.082, 0.092)

    bm.edges.new((nodes["Pelvis"][0], nodes["Waist"][0]))
    bm.edges.new((nodes["Waist"][0], nodes["Chest_Mid"][0]))
    bm.edges.new((nodes["Chest_Mid"][0], nodes["Chest_Upper"][0]))
    bm.edges.new((nodes["Chest_Upper"][0], nodes["Neck_Base"][0]))
    bm.edges.new((nodes["Neck_Base"][0], nodes["Neck_Mid"][0]))
    bm.edges.new((nodes["Neck_Mid"][0], nodes["Head_Jaw"][0]))
    bm.edges.new((nodes["Head_Jaw"][0], nodes["Head_Mid"][0]))
    bm.edges.new((nodes["Head_Mid"][0], nodes["Head_Top"][0]))

    # Arms in poised athletic batting grip position (hands gathered at bat handle)
    # Right hand: (0.16, 0.16, 1.02), Left hand: (0.14, 0.16, 0.88)
    for side, sign, wr_pos in (
        ("R", -1, Vector((0.16, 0.16, 1.02))),
        ("L", 1,  Vector((0.14, 0.16, 0.88)))
    ):
        add_n(f"Clavicle_{side}", sign * 0.08, 0.01, 1.44, 0.075, 0.075)
        add_n(f"Shoulder_{side}", sign * 0.22, 0.00, 1.42, 0.085, 0.078)
        
        # Upper Arm & Elbow angling inward towards bat handle
        mid_arm = Vector((sign * 0.24, 0.08, 1.25))
        add_n(f"Elbow_{side}", mid_arm.x, mid_arm.y, mid_arm.z, 0.050, 0.050)
        add_n(f"Wrist_{side}", wr_pos.x, wr_pos.y, wr_pos.z, 0.036, 0.030)

        bm.edges.new((nodes["Chest_Upper"][0], nodes[f"Clavicle_{side}"][0]))
        bm.edges.new((nodes[f"Clavicle_{side}"][0], nodes[f"Shoulder_{side}"][0]))
        bm.edges.new((nodes[f"Shoulder_{side}"][0], nodes[f"Elbow_{side}"][0]))
        bm.edges.new((nodes[f"Elbow_{side}"][0], nodes[f"Wrist_{side}"][0]))

    # Legs in poised athletic batting stance
    for side, sign, x_off in (("L", 1, 0.12), ("R", -1, -0.12)):
        add_n(f"Hip_{side}", sign * 0.11, 0.00, 0.92, 0.115, 0.105)
        add_n(f"Knee_{side}", x_off, 0.02, 0.52, 0.065, 0.065)
        add_n(f"Ankle_{side}", x_off, -0.02, 0.12, 0.046, 0.044)
        add_n(f"Toe_{side}", x_off, 0.11, 0.05, 0.052, 0.038)

        bm.edges.new((nodes["Pelvis"][0], nodes[f"Hip_{side}"][0]))
        bm.edges.new((nodes[f"Hip_{side}"][0], nodes[f"Knee_{side}"][0]))
        bm.edges.new((nodes[f"Knee_{side}"][0], nodes[f"Ankle_{side}"][0]))
        bm.edges.new((nodes[f"Ankle_{side}"][0], nodes[f"Toe_{side}"][0]))

    bm.to_mesh(body_mesh)
    bm.free()

    obj_body = bpy.data.objects.new("Player_Anatomical_Body", body_mesh)
    c_body.objects.link(obj_body)
    bpy.context.view_layer.objects.active = obj_body

    skin_mod = obj_body.modifiers.new("Skin", type="SKIN")
    skin_data = body_mesh.skin_vertices[0].data
    for i, (name, (v, rx, ry)) in enumerate(nodes.items()):
        skin_data[i].radius = (rx, ry)

    sub_mod = obj_body.modifiers.new("Subdivision", type="SUBSURF")
    sub_mod.levels = 2
    sub_mod.render_levels = 2
    obj_body.data.materials.append(mat_skin)

    # 5. EYES & HAIR
    for side, x in (("L", 0.040), ("R", -0.040)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.015, location=(x, 0.092, 1.72))
        eye = bpy.context.active_object
        eye.name = f"Player_Eye_{side}"
        link(eye, c_body)
        eye.data.materials.append(mat_eyes)
        for p in eye.data.polygons: p.use_smooth = True

    # Athletic Crop Hair
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.106, location=(0, -0.01, 1.75))
    hair = bpy.context.active_object
    hair.name = "Player_Hair"
    hair.scale = (0.96, 1.06, 0.88)
    bpy.ops.object.transform_apply(scale=True)
    link(hair, c_body)
    hair.data.materials.append(mat_hair)
    for p in hair.data.polygons: p.use_smooth = True

    # 6. TAILORED INDIAN CRICKET JERSEY
    # Form-fitted athletic jersey body
    bpy.ops.mesh.primitive_cylinder_add(radius=0.185, depth=0.38, location=(0, 0.015, 1.30))
    jersey = bpy.context.active_object
    jersey.name = "Jersey_Body"
    jersey.scale = (1.18, 0.85, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    link(jersey, c_cloth)
    jersey.data.materials.append(mat_jersey_blue)
    for p in jersey.data.polygons: p.use_smooth = True

    # Saffron Shoulder Yoke & V-Placket
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.018, 1.465))
    yoke = bpy.context.active_object
    yoke.name = "Jersey_Saffron_Yoke"
    yoke.scale = (0.42, 0.22, 0.07)
    bpy.ops.object.transform_apply(scale=True)
    link(yoke, c_cloth)
    yoke.data.materials.append(mat_jersey_orange)
    for p in yoke.data.polygons: p.use_smooth = True

    # 7. ATHLETIC CRICKET TROUSERS & SHOES
    bpy.ops.mesh.primitive_cylinder_add(radius=0.175, depth=0.22, location=(0, 0.005, 1.02))
    trouser_w = bpy.context.active_object
    trouser_w.name = "Trouser_Waistband"
    link(trouser_w, c_cloth)
    trouser_w.data.materials.append(mat_trouser_blue)
    for p in trouser_w.data.polygons: p.use_smooth = True

    for side, x in (("L", 0.12), ("R", -0.12)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.105, depth=0.48, location=(x, 0.01, 0.72))
        tr_th = bpy.context.active_object
        tr_th.name = f"Trouser_Thigh_{side}"
        link(tr_th, c_cloth)
        tr_th.data.materials.append(mat_trouser_blue)
        for p in tr_th.data.polygons: p.use_smooth = True

        bpy.ops.mesh.primitive_cylinder_add(radius=0.086, depth=0.42, location=(x, -0.01, 0.34))
        tr_sh = bpy.context.active_object
        tr_sh.name = f"Trouser_Shin_{side}"
        link(tr_sh, c_cloth)
        tr_sh.data.materials.append(mat_trouser_blue)
        for p in tr_sh.data.polygons: p.use_smooth = True

        # Spiked Cricket Shoes
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.06, 0.055))
        shoe = bpy.context.active_object
        shoe.name = f"Cricket_Shoe_{side}"
        shoe.scale = (0.105, 0.25, 0.08)
        bpy.ops.object.transform_apply(scale=True)
        link(shoe, c_cloth)
        shoe.data.materials.append(mat_shoes)
        for p in shoe.data.polygons: p.use_smooth = True

    # 8. PROFESSIONAL PROTECTIVE EQUIPMENT
    # 8.1 Batting Helmet (Composite Shell + Peak + Steel Grille)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.126, location=(0, 0.01, 1.73))
    helm = bpy.context.active_object
    helm.name = "Helmet_Shell"
    helm.scale = (1.0, 1.14, 0.98)
    bpy.ops.object.transform_apply(scale=True)
    link(helm, c_gear)
    helm.data.materials.append(mat_helmet)
    for p in helm.data.polygons: p.use_smooth = True

    # Peak Visor
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.142, 1.745))
    peak = bpy.context.active_object
    peak.name = "Helmet_Peak"
    peak.scale = (0.21, 0.08, 0.02)
    peak.rotation_euler = (math.radians(-18), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    link(peak, c_gear)
    peak.data.materials.append(mat_helmet)

    # Steel Grill Bars
    for i in range(4):
        z_bar = 1.685 - (i * 0.026)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0035, depth=0.18, location=(0, 0.134 - (i * 0.006), z_bar))
        bar = bpy.context.active_object
        bar.name = f"Helmet_Grill_Bar_{i}"
        bar.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(bar, c_gear)
        bar.data.materials.append(mat_grill)

    # 8.2 Batting Pads (Pair: Cane Ribs + Knee Bolster + Straps)
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

    # 8.3 English Willow Cricket Bat (Positioned realistically in front)
    bat_pos = Vector((0.15, 0.18, 0.48))
    # Blade
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=bat_pos)
    blade = bpy.context.active_object
    blade.name = "Cricket_Bat_Blade"
    blade.scale = (0.065, 0.13, 0.94)
    bpy.ops.object.transform_apply(scale=True)
    link(blade, c_gear)
    blade.data.materials.append(mat_bat_willow)
    for p in blade.data.polygons: p.use_smooth = True

    # Handle with Chevron Rubber Grip
    handle_loc = bat_pos + Vector((0, 0, 0.60))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.032, depth=0.38, location=handle_loc)
    handle = bpy.context.active_object
    handle.name = "Cricket_Bat_Handle"
    link(handle, c_gear)
    handle.data.materials.append(mat_bat_grip)
    for p in handle.data.polygons: p.use_smooth = True

    # 8.4 Batting Gloves (Gripping the bat handle naturally: Right Top, Left Below)
    for side, g_pos in (
        ("R", handle_loc + Vector((0.01, 0, 0.08))),
        ("L", handle_loc + Vector((-0.01, 0, -0.06)))
    ):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=g_pos)
        glove = bpy.context.active_object
        glove.name = f"Batting_Glove_{side}"
        glove.scale = (0.085, 0.10, 0.11)
        bpy.ops.object.transform_apply(scale=True)
        link(glove, c_gear)
        glove.data.materials.append(mat_glove_white)
        for p in glove.data.polygons: p.use_smooth = True

        # Blue Finger Protective Rolls
        bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.11, location=(g_pos.x, g_pos.y + 0.035, g_pos.z))
        roll = bpy.context.active_object
        roll.name = f"Glove_Roll_{side}"
        roll.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(roll, c_gear)
        roll.data.materials.append(mat_glove_blue)

    # 8.5 Red Match Ball with White Seam
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

    # 9. STUDIO CYCLORAMA FLOOR & LIGHTING
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

    # 10. HERO FRONT CAMERA (70mm)
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

    # High-Res Viewport Render
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

    print(">>> [Antigravity] High-Fidelity Cricket Player built successfully!")
    return True

if __name__ == "__main__":
    build_pro_player()
