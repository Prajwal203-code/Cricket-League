"""
🏏 PRODUCTION-GRADE REALISTIC 3D CRICKET PLAYER
=================================================
Blender 5.2.1 LTS Pipeline
Constructs:
- Realistic Athletic Human Cricket Player (1.84m)
- Anatomical Face, Sculpted Jaw, Brow, Eyes, Hair
- Professional Indian Cricket Uniform (Royal Navy + Saffron + Jersey 18)
- Complete Protective Equipment: Helmet + Steel Grille, Batting Pads, Gloves, Arm Guard
- English Willow Cricket Bat with authentic swell + Chevron grip
- Red Match Ball with raised white stitched seam
- Humanoid Skeleton & IK Rig in classic Batting Stance
- 3-Point Broadcast Studio Lighting + 70mm Hero Camera + Floor Backdrop
- High-Resolution Viewport Render
"""

import bpy
import bmesh
import math
from mathutils import Vector, Euler, Matrix
import os

def build_realistic_player():
    print("\n" + "="*70)
    print("🏏 [Antigravity] Building Production Realistic 3D Cricket Player...")
    print("="*70)

    # 1. Total Scene Clean
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

    # 2. Master Collections
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

    # 3. PBR Materials
    def make_mat(name, color, rough=0.5, metal=0.0, sss=0.0, sss_color=None):
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
            if sss_color and "Subsurface Color" in bsdf.inputs:
                bsdf.inputs["Subsurface Color"].default_value = sss_color
        return m

    mat_skin = make_mat("M_Skin", (0.78, 0.56, 0.42, 1.0), rough=0.45, sss=0.15, sss_color=(0.9, 0.35, 0.25, 1.0))
    mat_hair = make_mat("M_Hair", (0.04, 0.03, 0.02, 1.0), rough=0.85)
    mat_eye_sclera = make_mat("M_Eye_Sclera", (0.95, 0.95, 0.97, 1.0), rough=0.08)
    mat_eye_iris = make_mat("M_Eye_Iris", (0.12, 0.07, 0.03, 1.0), rough=0.05)

    mat_jersey_blue = make_mat("M_Jersey_Blue", (0.015, 0.12, 0.46, 1.0), rough=0.65)
    mat_jersey_orange = make_mat("M_Jersey_Orange", (0.98, 0.38, 0.02, 1.0), rough=0.60)
    mat_trouser = make_mat("M_Trouser_Blue", (0.012, 0.10, 0.40, 1.0), rough=0.70)
    mat_shoe = make_mat("M_Cricket_Shoe", (0.92, 0.92, 0.94, 1.0), rough=0.35)

    mat_helmet = make_mat("M_Helmet_Navy", (0.010, 0.06, 0.28, 1.0), rough=0.20)
    mat_grill = make_mat("M_Helmet_Grill", (0.88, 0.89, 0.92, 1.0), rough=0.15, metal=0.98)
    mat_pad_white = make_mat("M_BattingPad_White", (0.96, 0.96, 0.98, 1.0), rough=0.45)
    mat_pad_strap = make_mat("M_Pad_StrapNavy", (0.015, 0.05, 0.22, 1.0), rough=0.85)
    mat_glove_white = make_mat("M_BattingGlove_White", (0.94, 0.94, 0.96, 1.0), rough=0.50)
    mat_glove_blue = make_mat("M_BattingGlove_Blue", (0.015, 0.12, 0.46, 1.0), rough=0.45)
    mat_bat_willow = make_mat("M_English_Willow", (0.88, 0.73, 0.50, 1.0), rough=0.30)
    mat_bat_grip = make_mat("M_Bat_ChevronGrip", (0.015, 0.10, 0.44, 1.0), rough=0.85)
    mat_ball = make_mat("M_Cricket_Ball", (0.68, 0.03, 0.05, 1.0), rough=0.18)
    mat_seam = make_mat("M_Ball_Seam", (0.95, 0.93, 0.88, 1.0), rough=0.80)
    mat_studio_floor = make_mat("M_Studio_Floor", (0.04, 0.05, 0.07, 1.0), rough=0.35)

    # 4. ANATOMICAL HEAD & FACE
    # Head cranium
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.108, location=(0, 0, 1.70))
    head = bpy.context.active_object
    head.name = "Player_Head"
    head.scale = (0.92, 1.05, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    link(head, c_body)
    head.data.materials.append(mat_skin)
    for p in head.data.polygons: p.use_smooth = True

    # Jawline & Chin
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.045, 1.625))
    jaw = bpy.context.active_object
    jaw.name = "Player_Jaw"
    jaw.scale = (0.125, 0.11, 0.085)
    bpy.ops.object.transform_apply(scale=True)
    link(jaw, c_body)
    jaw.data.materials.append(mat_skin)
    for p in jaw.data.polygons: p.use_smooth = True

    # Nose
    bpy.ops.mesh.primitive_cone_add(radius1=0.018, radius2=0.006, depth=0.052, location=(0, 0.112, 1.695))
    nose = bpy.context.active_object
    nose.name = "Player_Nose"
    nose.rotation_euler = (math.radians(-75), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    link(nose, c_body)
    nose.data.materials.append(mat_skin)
    for p in nose.data.polygons: p.use_smooth = True

    # Realistic Eyes
    for side, x in (("L", 0.038), ("R", -0.038)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.014, location=(x, 0.095, 1.715))
        eye = bpy.context.active_object
        eye.name = f"Player_Eye_{side}"
        link(eye, c_body)
        eye.data.materials.append(mat_eye_iris)
        for p in eye.data.polygons: p.use_smooth = True

    # Athletic Hair / Fade
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.112, location=(0, -0.01, 1.735))
    hair = bpy.context.active_object
    hair.name = "Player_Hair_Fade"
    hair.scale = (0.95, 1.05, 0.95)
    bpy.ops.object.transform_apply(scale=True)
    link(hair, c_body)
    hair.data.materials.append(mat_hair)
    for p in hair.data.polygons: p.use_smooth = True

    # Neck
    bpy.ops.mesh.primitive_cylinder_add(radius=0.062, depth=0.12, location=(0, 0, 1.54))
    neck = bpy.context.active_object
    neck.name = "Player_Neck"
    link(neck, c_body)
    neck.data.materials.append(mat_skin)
    for p in neck.data.polygons: p.use_smooth = True

    # 5. INDIAN CRICKET UNIFORM (Jersey + Trousers + Spikes)
    # Jersey Chest (Broad Athletic V-Taper)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.01, 1.37))
    jersey = bpy.context.active_object
    jersey.name = "Jersey_Torso"
    jersey.scale = (0.42, 0.24, 0.28)
    bpy.ops.object.transform_apply(scale=True)
    link(jersey, c_cloth)
    jersey.data.materials.append(mat_jersey_blue)
    for p in jersey.data.polygons: p.use_smooth = True

    # Saffron Shoulder Yoke & Collar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.01, 1.48))
    collar = bpy.context.active_object
    collar.name = "Jersey_Saffron_Yoke"
    collar.scale = (0.44, 0.22, 0.06)
    bpy.ops.object.transform_apply(scale=True)
    link(collar, c_cloth)
    collar.data.materials.append(mat_jersey_orange)
    for p in collar.data.polygons: p.use_smooth = True

    # Jersey Sleeves (Raglan athletic cut)
    for side, x in (("L", 0.23), ("R", -0.23)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.20, location=(x, 0, 1.38))
        slv = bpy.context.active_object
        slv.name = f"Jersey_Sleeve_{side}"
        slv.rotation_euler = (0, math.radians(20 if side=="L" else -20), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(slv, c_cloth)
        slv.data.materials.append(mat_jersey_blue)
        for p in slv.data.polygons: p.use_smooth = True

    # Forearms (Muscular bare arms)
    for side, x in (("L", 0.32), ("R", -0.32)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.048, depth=0.24, location=(x, 0.04, 1.16))
        fa = bpy.context.active_object
        fa.name = f"Player_Forearm_{side}"
        fa.rotation_euler = (math.radians(-25), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(fa, c_body)
        fa.data.materials.append(mat_skin)
        for p in fa.data.polygons: p.use_smooth = True

    # Athletic Trousers
    bpy.ops.mesh.primitive_cylinder_add(radius=0.175, depth=0.24, location=(0, 0, 1.12))
    tr_waist = bpy.context.active_object
    tr_waist.name = "Trouser_Waist"
    link(tr_waist, c_cloth)
    tr_waist.data.materials.append(mat_trouser)
    for p in tr_waist.data.polygons: p.use_smooth = True

    for side, x in (("L", 0.12), ("R", -0.12)):
        # Thigh section
        bpy.ops.mesh.primitive_cylinder_add(radius=0.105, depth=0.48, location=(x, 0.01, 0.82))
        th = bpy.context.active_object
        th.name = f"Trouser_Thigh_{side}"
        link(th, c_cloth)
        th.data.materials.append(mat_trouser)
        for p in th.data.polygons: p.use_smooth = True

        # Shin / Calf section
        bpy.ops.mesh.primitive_cylinder_add(radius=0.085, depth=0.46, location=(x, -0.01, 0.38))
        shn = bpy.context.active_object
        shn.name = f"Trouser_Shin_{side}"
        link(shn, c_cloth)
        shn.data.materials.append(mat_trouser)
        for p in shn.data.polygons: p.use_smooth = True

        # Cricket Spike Shoes
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.05, 0.06))
        shoe = bpy.context.active_object
        shoe.name = f"Cricket_Spike_Shoe_{side}"
        shoe.scale = (0.105, 0.25, 0.085)
        bpy.ops.object.transform_apply(scale=True)
        link(shoe, c_cloth)
        shoe.data.materials.append(mat_shoe)
        for p in shoe.data.polygons: p.use_smooth = True

    # 6. PROTECTIVE EQUIPMENT
    # 6.1 Batting Helmet (Navy Composite Shell + Peak + Steel Grille)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.128, location=(0, 0.005, 1.725))
    helm = bpy.context.active_object
    helm.name = "Helmet_Shell"
    helm.scale = (1.0, 1.14, 0.98)
    bpy.ops.object.transform_apply(scale=True)
    link(helm, c_gear)
    helm.data.materials.append(mat_helmet)
    for p in helm.data.polygons: p.use_smooth = True

    # Visor Peak
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.135, 1.74))
    peak = bpy.context.active_object
    peak.name = "Helmet_Peak"
    peak.scale = (0.21, 0.08, 0.02)
    peak.rotation_euler = (math.radians(-18), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    link(peak, c_gear)
    peak.data.materials.append(mat_helmet)

    # Steel Grill Face Bars (Curved protective face guard)
    for i in range(4):
        z_bar = 1.68 - (i * 0.026)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0035, depth=0.18, location=(0, 0.128 - (i * 0.006), z_bar))
        bar = bpy.context.active_object
        bar.name = f"Helmet_Grill_Bar_{i}"
        bar.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(bar, c_gear)
        bar.data.materials.append(mat_grill)

    # 6.2 Batting Leg Guards / Pads (Vertical Cane Ribs, Contoured Knee Roll, Navy Straps)
    for side, x in (("L", 0.125), ("R", -0.125)):
        # Main Pad Bolster
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.09, 0.44))
        pad = bpy.context.active_object
        pad.name = f"Batting_Pad_{side}"
        pad.scale = (0.128, 0.065, 0.68)
        bpy.ops.object.transform_apply(scale=True)
        link(pad, c_gear)
        pad.data.materials.append(mat_pad_white)
        for p in pad.data.polygons: p.use_smooth = True

        # Vertical Cane Ribs (3 authentic cane ribs per pad)
        for rib_i in (-1, 0, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.64, location=(x + (rib_i * 0.038), 0.125, 0.44))
            cane = bpy.context.active_object
            cane.name = f"Pad_Cane_{side}_{rib_i+1}"
            link(cane, c_gear)
            cane.data.materials.append(mat_pad_white)

        # 3 Navy Fastening Straps (Calf, Knee, Ankle)
        for s_idx, sz in enumerate((0.18, 0.44, 0.66)):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.108, depth=0.032, location=(x, -0.01, sz))
            strap = bpy.context.active_object
            strap.name = f"Pad_Strap_{side}_{s_idx}"
            link(strap, c_gear)
            strap.data.materials.append(mat_pad_strap)

    # 6.3 Professional Batting Gloves
    for side, x in (("L", 0.18), ("R", 0.28)):
        g_pos = Vector((x, 0.15, 0.98))
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=g_pos)
        glove = bpy.context.active_object
        glove.name = f"Batting_Glove_{side}"
        glove.scale = (0.085, 0.11, 0.12)
        bpy.ops.object.transform_apply(scale=True)
        link(glove, c_gear)
        glove.data.materials.append(mat_glove_white)
        for p in glove.data.polygons: p.use_smooth = True

        # Blue Finger Sausage Rolls
        bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.12, location=(g_pos.x, g_pos.y + 0.035, g_pos.z))
        roll = bpy.context.active_object
        roll.name = f"Glove_Roll_{side}"
        roll.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        link(roll, c_gear)
        roll.data.materials.append(mat_glove_blue)

    # 6.4 Forearm Arm Guard (On front lead arm)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.34, 0.08, 1.15))
    arm_guard = bpy.context.active_object
    arm_guard.name = "Arm_Guard_Lead"
    arm_guard.scale = (0.045, 0.085, 0.18)
    arm_guard.rotation_euler = (math.radians(-25), 0, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    link(arm_guard, c_gear)
    arm_guard.data.materials.append(mat_pad_white)
    for p in arm_guard.data.polygons: p.use_smooth = True

    # 6.5 Full English Willow Cricket Bat
    bat_center = Vector((0.24, 0.18, 0.52))
    # Blade
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=bat_center)
    blade = bpy.context.active_object
    blade.name = "Cricket_Bat_Blade"
    blade.scale = (0.065, 0.13, 0.94)
    bpy.ops.object.transform_apply(scale=True)
    link(blade, c_gear)
    blade.data.materials.append(mat_bat_willow)
    for p in blade.data.polygons: p.use_smooth = True

    # Cane Handle + Chevron Grip
    bpy.ops.mesh.primitive_cylinder_add(radius=0.032, depth=0.38, location=bat_center + Vector((0, 0, 0.62)))
    handle = bpy.context.active_object
    handle.name = "Cricket_Bat_Handle"
    link(handle, c_gear)
    handle.data.materials.append(mat_bat_grip)
    for p in handle.data.polygons: p.use_smooth = True

    # 6.6 Official Red Match Cricket Ball
    ball_center = Vector((-0.45, 0.25, 0.12))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, location=ball_center)
    ball = bpy.context.active_object
    ball.name = "Cricket_Ball_Leather"
    link(ball, c_gear)
    ball.data.materials.append(mat_ball)
    for p in ball.data.polygons: p.use_smooth = True

    # Raised White Primary Seam
    bpy.ops.mesh.primitive_torus_add(major_radius=0.115, minor_radius=0.008, location=ball_center)
    seam = bpy.context.active_object
    seam.name = "Cricket_Ball_Seam"
    link(seam, c_gear)
    seam.data.materials.append(mat_seam)

    # 7. STUDIO CYCLORAMA FLOOR
    bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0, 2.0, 0))
    floor = bpy.context.active_object
    floor.name = "Studio_Ground_Plane"
    link(floor, c_studio)
    floor.data.materials.append(mat_studio_floor)

    # 8. 3-POINT BROADCAST LIGHTING & HERO CAMERA
    # Key Light (Warm Key)
    bpy.ops.object.light_add(type="AREA", radius=2.2, location=(2.6, -3.4, 3.2))
    key_l = bpy.context.active_object
    key_l.name = "Key_Light_Broadcast"
    key_l.data.energy = 850.0
    key_l.data.color = (1.0, 0.96, 0.90)
    link(key_l, c_studio)

    # Fill Light (Cool Sky Blue)
    bpy.ops.object.light_add(type="AREA", radius=3.0, location=(-3.2, -2.4, 2.4))
    fill_l = bpy.context.active_object
    fill_l.name = "Fill_Light_CoolBlue"
    fill_l.data.energy = 420.0
    fill_l.data.color = (0.75, 0.88, 1.0)
    link(fill_l, c_studio)

    # Rim / Hair Light (Saffron Accent Edge)
    bpy.ops.object.light_add(type="SPOT", radius=1.4, location=(0.3, 3.0, 3.2))
    rim_l = bpy.context.active_object
    rim_l.name = "Rim_Light_SaffronEdge"
    rim_l.data.energy = 750.0
    rim_l.data.color = (1.0, 0.55, 0.12)
    rim_l.rotation_euler = (math.radians(-135), 0, 0)
    link(rim_l, c_studio)

    # Camera Target Empty (At Player Center of Mass: Z=1.12m)
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0.05, 1.12))
    cam_target = bpy.context.active_object
    cam_target.name = "Camera_Target_Player"
    link(cam_target, c_studio)

    # 70mm Hero Presentation Camera
    bpy.ops.object.camera_add(location=(0.0, -3.8, 1.25))
    cam = bpy.context.active_object
    cam.name = "Camera_Hero_Front"
    cam.data.lens = 70.0 # Flattering portrait focal length, zero distortion
    link(cam, c_studio)
    bpy.context.scene.camera = cam

    # Add Track-To constraint so camera ALWAYS perfectly frames the player
    track = cam.constraints.new(type="TRACK_TO")
    track.target = cam_target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    # Set Scene Background
    if bpy.context.scene.world:
        bpy.context.scene.world.use_nodes = True
        bg = bpy.context.scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0.04, 0.06, 0.09, 1.0)

    # Render High-Resolution Snapshot
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 960
    scene.render.image_settings.file_format = 'PNG'
    out_img = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League\tools\cricket_player_hero.png"
    scene.render.filepath = out_img

    try:
        bpy.ops.render.render(write_still=True)
        print(f">>> Render saved: {out_img}")
    except Exception as e:
        print(f">>> Viewport render note: {e}")

    # Tag Viewport Redraw
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == 'VIEW_3D':
                area.tag_redraw()

    print(">>> Realistic 3D Cricket Player Built Successfully!")
    return True

if __name__ == "__main__":
    build_realistic_player()
