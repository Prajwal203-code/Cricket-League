import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_4side_projected_batsman():
    # -------------------------------------------------------------
    # 1. Load Original Mesh
    # -------------------------------------------------------------
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)

    x_min, x_max = verts[:,0].min(), verts[:,0].max() # -0.422 .. 0.407
    y_min, y_max = verts[:,1].min(), verts[:,1].max() # -1.003 .. 1.001
    z_min, z_max = verts[:,2].min(), verts[:,2].max() # -0.349 .. 0.362

    # Load hero reference images
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
    
    # -------------------------------------------------------------
    # 2. Master 4-View Texture Atlas (2048 x 2048)
    # -------------------------------------------------------------
    # Layout (4 quadrants of 1024 x 1024):
    # Top-Left  [0..1024, 0..1024]     : FRONT VIEW (+Z)  (UV: [0.0..0.50] x [0.50..1.00])
    # Top-Right [1024..2048, 0..1024]  : BACK VIEW (-Z)   (UV: [0.50..1.00] x [0.50..1.00])
    # Bot-Left  [0..1024, 1024..2048]  : LEFT SIDE (+X)   (UV: [0.0..0.50] x [0.00..0.50])
    # Bot-Right [1024..2048, 1024..2048]: RIGHT SIDE (-X)  (UV: [0.50..1.00] x [0.00..0.50])
    
    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255) # Team India Blue
    orange_saffron = (249, 115, 22, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)
    skin_med = (180, 126, 90, 255)
    hair_black = (20, 18, 16, 255)
    shoe_white = (248, 250, 252, 255)
    shoe_sole = (30, 41, 59, 255)

    atlas = Image.new('RGBA', (w, h), jersey_royal)
    draw_atlas = ImageDraw.Draw(atlas)

    # =========================================================================
    # QUADRANT 1: FRONT VIEW (Top-Left: [0..1024, 0..1024])
    # =========================================================================
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    pf_arr = np.array(player_front)

    # Grass cleanup
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    is_grass = (pf_arr[:, :, 1] > 115) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 10) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 10)
    pf_arr[is_grass] = [2, 132, 199, 255]

    # Inpaint text
    tx0, tx1 = int(pf_w * 0.35), int(pf_w * 0.68)
    ty0, ty1 = int(pf_h * 0.29), int(pf_h * 0.36)
    for y in range(ty0, ty1):
        for x in range(tx0, tx1):
            r, g, b = pf_arr[y, x, :3]
            if (r > 190 and g > 75 and b < 80) or (r > 210 and g > 210 and b > 210) or (r > 160 and g > 110 and b < 100):
                pf_arr[y, x, :3] = pf_arr[min(pf_h - 1, ty1 + 10), x, :3]

    mx0, mx1 = int(pf_w * 0.25), int(pf_w * 0.37)
    my0, my1 = int(pf_h * 0.24), int(pf_h * 0.28)
    for y in range(my0, my1):
        for x in range(mx0, mx1):
            r, g, b = pf_arr[y, x, :3]
            if (r > 200 and g > 200 and b > 200) or (r > 180 and g < 60 and b < 60):
                pf_arr[y, x, :3] = pf_arr[my1 + 6, x, :3]

    clean_front = Image.fromarray(pf_arr)
    front_1k = clean_front.resize((1000, 1000), Image.Resampling.LANCZOS)
    atlas.paste(front_1k, (12, 12))

    # =========================================================================
    # QUADRANT 2: BACK VIEW (Top-Right: [1024..2048, 0..1024])
    # =========================================================================
    back_img = Image.new('RGBA', (1000, 1000), jersey_royal)
    b_draw = ImageDraw.Draw(back_img)

    # 1. Back Hair (y: 0..240)
    b_draw.rectangle([250, 40, 750, 240], fill=hair_black)
    for fx in range(100):
        t = fx / 100.0
        c = (int(hair_black[0]*(1-t) + skin_med[0]*t), int(hair_black[1]*(1-t) + skin_med[1]*t), int(hair_black[2]*(1-t) + skin_med[2]*t), 255)
        b_draw.line([(250 - fx, 100), (250 - fx, 240)], fill=c)
        b_draw.line([(750 + fx, 100), (750 + fx, 240)], fill=c)

    # Headband back
    b_draw.rectangle([150, 160, 850, 200], fill=jersey_royal)
    b_draw.line([(150, 160), (850, 160)], fill=(255, 255, 255, 255), width=3)
    b_draw.line([(150, 200), (850, 200)], fill=(255, 255, 255, 255), width=3)

    # 2. Saffron Orange Collar & Jersey Back (y: 240..540)
    b_draw.rectangle([180, 240, 820, 285], fill=orange_saffron)
    b_draw.line([(180, 285), (820, 285)], fill=(255, 255, 255, 255), width=3)

    # Flanks orange
    b_draw.polygon([(180, 285), (260, 285), (280, 540), (180, 540)], fill=orange_saffron)
    b_draw.polygon([(820, 285), (740, 285), (720, 540), (820, 540)], fill=orange_saffron)

    # 3. Bat Back Wooden Spine (Left side of back: x: 120..320, y: 80..500)
    b_draw.polygon([(120, 80), (300, 80), (360, 500), (180, 500)], fill=bat_wood)
    for gy in range(85, 500, 8):
        b_draw.line([(120, gy), (360, gy)], fill=bat_wood_dark, width=2)

    # 4. Trousers Back & Pad Straps (y: 540..920)
    b_draw.rectangle([150, 540, 850, 920], fill=jersey_royal)
    b_draw.rectangle([150, 540, 200, 920], fill=orange_saffron)
    b_draw.rectangle([800, 540, 850, 920], fill=orange_saffron)

    for sy in [710, 790, 870]:
        b_draw.rectangle([180, sy, 440, sy + 20], fill=grip_navy)
        b_draw.rectangle([560, sy, 820, sy + 20], fill=grip_navy)
        b_draw.rectangle([290, sy + 3, 320, sy + 17], fill=(220, 220, 220, 255))
        b_draw.rectangle([680, sy + 3, 710, sy + 17], fill=(220, 220, 220, 255))

    # 5. Shoes Heel Back (y: 920..1000)
    b_draw.rectangle([150, 920, 440, 975], fill=shoe_white)
    b_draw.rectangle([560, 920, 850, 975], fill=shoe_white)
    b_draw.rectangle([150, 925, 440, 950], fill=jersey_royal)
    b_draw.rectangle([560, 925, 850, 950], fill=jersey_royal)
    b_draw.rectangle([280, 920, 310, 960], fill=orange_saffron)
    b_draw.rectangle([690, 920, 720, 960], fill=orange_saffron)
    b_draw.rectangle([150, 975, 440, 1000], fill=shoe_sole)
    b_draw.rectangle([560, 975, 850, 1000], fill=shoe_sole)

    atlas.paste(back_img, (1036, 12))

    # =========================================================================
    # QUADRANT 3: LEFT SIDE VIEW (+X: [0..1024, 1024..2048])
    # =========================================================================
    left_img = Image.new('RGBA', (1000, 1000), jersey_royal)
    l_draw = ImageDraw.Draw(left_img)

    # Head left side (Hair, fade, headband, ear, side beard)
    l_draw.rectangle([350, 40, 650, 240], fill=skin_med)
    l_draw.rectangle([350, 40, 650, 140], fill=hair_black)
    # Headband side
    l_draw.rectangle([330, 150, 670, 190], fill=jersey_royal)
    l_draw.line([(330, 150), (670, 150)], fill=(255, 255, 255, 255), width=3)
    l_draw.line([(330, 190), (670, 190)], fill=(255, 255, 255, 255), width=3)
    # Ear
    l_draw.ellipse([460, 170, 520, 230], fill=(195, 138, 102, 255))
    # Side beard
    l_draw.polygon([(400, 180), (550, 180), (520, 240), (420, 240)], fill=hair_black)

    # Left Sleeve & Arm (Sleeve top: orange/blue, forearm: skin, smartwatch, glove)
    l_draw.rectangle([380, 240, 620, 360], fill=orange_saffron)
    l_draw.rectangle([380, 340, 620, 360], fill=jersey_royal)
    l_draw.rectangle([410, 360, 590, 500], fill=skin_med)
    # Smartwatch on wrist
    l_draw.rectangle([420, 470, 580, 500], fill=(30, 30, 30, 255))
    # Left Batting Glove
    l_draw.rectangle([400, 500, 600, 620], fill=shoe_white)
    for gy in range(515, 600, 20):
        l_draw.rectangle([410, gy, 590, gy + 12], fill=jersey_royal)

    # Left Trouser Leg with Orange Racing Stripe
    l_draw.rectangle([380, 600, 620, 920], fill=jersey_royal)
    l_draw.rectangle([475, 600, 525, 920], fill=orange_saffron)
    l_draw.line([(475, 600), (475, 920)], fill=(255, 255, 255, 255), width=2)
    l_draw.line([(525, 600), (525, 920)], fill=(255, 255, 255, 255), width=2)

    # Pad Side Profile & Straps
    for sy in [710, 790, 870]:
        l_draw.rectangle([380, sy, 475, sy + 18], fill=grip_navy)
    # Left Shoe Side
    l_draw.rectangle([380, 920, 620, 975], fill=shoe_white)
    l_draw.polygon([(390, 935), (610, 925), (590, 955), (410, 960)], fill=orange_saffron)
    l_draw.rectangle([380, 975, 620, 1000], fill=shoe_sole)

    atlas.paste(left_img, (12, 1036))

    # =========================================================================
    # QUADRANT 4: RIGHT SIDE VIEW (-X: [1024..2048, 1024..2048])
    # =========================================================================
    right_img = Image.new('RGBA', (1000, 1000), jersey_royal)
    r_draw = ImageDraw.Draw(right_img)

    # Head right side
    r_draw.rectangle([350, 40, 650, 240], fill=skin_med)
    r_draw.rectangle([350, 40, 650, 140], fill=hair_black)
    r_draw.rectangle([330, 150, 670, 190], fill=jersey_royal)
    r_draw.line([(330, 150), (670, 150)], fill=(255, 255, 255, 255), width=3)
    r_draw.line([(330, 190), (670, 190)], fill=(255, 255, 255, 255), width=3)
    r_draw.ellipse([480, 170, 540, 230], fill=(195, 138, 102, 255))
    r_draw.polygon([(450, 180), (600, 180), (580, 240), (480, 240)], fill=hair_black)

    # Right Bat Edge (English willow side profile with grip)
    r_draw.rectangle([550, 60, 660, 520], fill=bat_wood)
    for gy in range(65, 520, 8):
        r_draw.line([(550, gy), (660, gy)], fill=bat_wood_dark, width=2)
    # Bat rubber grip at top
    r_draw.rectangle([560, 60, 650, 180], fill=grip_navy)

    # Right Arm & Glove holding bat
    r_draw.rectangle([380, 240, 560, 360], fill=orange_saffron)
    r_draw.rectangle([400, 360, 540, 480], fill=skin_med)
    r_draw.rectangle([410, 440, 580, 540], fill=shoe_white)
    for gy in range(455, 530, 18):
        r_draw.rectangle([420, gy, 570, gy + 10], fill=jersey_royal)

    # Right Trouser Leg & Side Stripe
    r_draw.rectangle([380, 600, 620, 920], fill=jersey_royal)
    r_draw.rectangle([475, 600, 525, 920], fill=orange_saffron)
    r_draw.line([(475, 600), (475, 920)], fill=(255, 255, 255, 255), width=2)
    r_draw.line([(525, 600), (525, 920)], fill=(255, 255, 255, 255), width=2)

    for sy in [710, 790, 870]:
        r_draw.rectangle([525, sy, 620, sy + 18], fill=grip_navy)

    # Right Shoe Side
    r_draw.rectangle([380, 920, 620, 975], fill=shoe_white)
    r_draw.polygon([(390, 925), (610, 935), (590, 960), (410, 955)], fill=orange_saffron)
    r_draw.rectangle([380, 975, 620, 1000], fill=shoe_sole)

    atlas.paste(right_img, (1036, 1036))

    # Save textures
    tex_dir = './backend/public/models/textures'
    atlas.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Normal Map
    gray = atlas.convert('L')
    gray_np = np.array(gray, dtype=np.float32)
    gx = np.zeros_like(gray_np)
    gy = np.zeros_like(gray_np)
    gx[:, 1:-1] = (gray_np[:, 2:] - gray_np[:, :-2]) * 0.5
    gy[1:-1, :] = (gray_np[2:, :] - gray_np[:-2, :]) * 0.5
    bump_strength = 2.0
    nx = -gx * bump_strength
    ny = -gy * bump_strength
    nz = 255.0
    len_n = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx_norm = (nx / len_n * 127.5 + 127.5).astype(np.uint8)
    ny_norm = (ny / len_n * 127.5 + 127.5).astype(np.uint8)
    nz_norm = (nz / len_n * 127.5 + 127.5).astype(np.uint8)
    normal_np = np.stack([nx_norm, ny_norm, nz_norm], axis=-1)
    normal = Image.fromarray(normal_np, 'RGB')
    normal.save(os.path.join(tex_dir, 'batsman_normal.png'), 'PNG')

    # Roughness
    roughness = Image.new('L', (w, h), 160)
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')

    # Metallic
    metallic = Image.new('L', (w, h), 0)
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')

    # AO
    ao = Image.new('L', (w, h), 255)
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')

    # -------------------------------------------------------------
    # 3. Non-Overlapping Per-Triangle Quadrant UV Unwrap
    # -------------------------------------------------------------
    # To prevent ANY triangle stretching across quadrants, we unwrap per-face:
    num_faces = len(faces)
    unwrapped_verts = np.zeros((num_faces * 3, 3), dtype=np.float32)
    unwrapped_norms = np.zeros((num_faces * 3, 3), dtype=np.float32)
    unwrapped_uvs = np.zeros((num_faces * 3, 2), dtype=np.float32)
    unwrapped_faces = np.arange(num_faces * 3, dtype=np.uint32).reshape((num_faces, 3))

    z_depth_max = max(abs(z_min), abs(z_max)) # depth scale for side views

    for fi in range(num_faces):
        f = faces[fi]
        v_idx0, v_idx1, v_idx2 = f[0], f[1], f[2]
        p0, p1, p2 = verts[v_idx0], verts[v_idx1], verts[v_idx2]
        n0, n1, n2 = normals[v_idx0], normals[v_idx1], normals[v_idx2]

        # Triangle Normal
        fn = np.cross(p1 - p0, p2 - p0)
        fn_len = np.linalg.norm(fn)
        if fn_len > 0:
            fn /= fn_len
        else:
            fn = np.array([0, 0, 1], dtype=np.float32)

        # Decide which quadrant this triangle belongs to based on dominant normal direction
        # |fn_z| vs |fn_x|
        if abs(fn[2]) >= abs(fn[0]):
            if fn[2] >= 0:
                # Quadrant 1: FRONT (+Z) -> UV: [0.006..0.494] x [0.506..0.994]
                quad_type = 'FRONT'
            else:
                # Quadrant 2: BACK (-Z) -> UV: [0.506..0.994] x [0.506..0.994]
                quad_type = 'BACK'
        else:
            if fn[0] >= 0:
                # Quadrant 3: LEFT SIDE (+X) -> UV: [0.006..0.494] x [0.006..0.494]
                quad_type = 'LEFT'
            else:
                # Quadrant 4: RIGHT SIDE (-X) -> UV: [0.506..0.994] x [0.006..0.494]
                quad_type = 'RIGHT'

        # Compute UV for each of the 3 vertices
        for corner_i, vi in enumerate([v_idx0, v_idx1, v_idx2]):
            out_idx = fi * 3 + corner_i
            unwrapped_verts[out_idx] = verts[vi]
            unwrapped_norms[out_idx] = normals[vi]

            x, y, z = verts[vi]
            v_norm = (y - y_min) / (y_max - y_min)

            if quad_type == 'FRONT':
                u_norm = (x - x_min) / (x_max - x_min)
                u = 0.006 + 0.488 * u_norm
                v = 0.506 + 0.488 * v_norm
            elif quad_type == 'BACK':
                u_norm = (x_max - x) / (x_max - x_min)
                u = 0.506 + 0.488 * u_norm
                v = 0.506 + 0.488 * v_norm
            elif quad_type == 'LEFT':
                # Left view: mapped along Z axis (-Z to +Z)
                z_norm = (z - z_min) / (z_max - z_min)
                u = 0.006 + 0.488 * z_norm
                v = 0.006 + 0.488 * v_norm
            else: # RIGHT
                # Right view: mapped along Z axis (+Z to -Z)
                z_norm = (z_max - z) / (z_max - z_min)
                u = 0.506 + 0.488 * z_norm
                v = 0.006 + 0.488 * v_norm

            unwrapped_uvs[out_idx] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # -------------------------------------------------------------
    # 4. Pack GLB
    # -------------------------------------------------------------
    unwrapped_mesh = trimesh.Trimesh(vertices=unwrapped_verts, faces=unwrapped_faces, vertex_normals=unwrapped_norms)
    
    indices_bytes = unwrapped_faces.flatten().tobytes()
    pos_bytes = unwrapped_verts.flatten().tobytes()
    norm_bytes = unwrapped_norms.flatten().tobytes()
    uv_bytes = unwrapped_uvs.flatten().tobytes()

    bin_data = indices_bytes + pos_bytes + norm_bytes + uv_bytes
    pad = (4 - (len(bin_data) % 4)) % 4
    bin_data += b'\x00' * pad

    offset0 = 0
    len0 = len(indices_bytes)
    offset1 = len0
    len1 = len(pos_bytes)
    offset2 = offset1 + len1
    len2 = len(norm_bytes)
    offset3 = offset2 + len2
    len3 = len(uv_bytes)

    gltf_json = {
        "asset": {"version": "2.0", "generator": "Cricket Strike 4-Side Master PBR Engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Batsman_PBR", "mesh": 0}],
        "meshes": [
            {
                "name": "Batsman_Mesh",
                "primitives": [
                    {
                        "attributes": {"POSITION": 1, "NORMAL": 2, "TEXCOORD_0": 3},
                        "indices": 0,
                        "material": 0,
                        "mode": 4
                    }
                ]
            }
        ],
        "materials": [
            {
                "name": "Batsman_PBR_Material",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.05,
                    "roughnessFactor": 0.65
                },
                "doubleSided": True
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5125,
                "count": len(unwrapped_faces) * 3,
                "type": "SCALAR",
                "max": [int(unwrapped_verts.shape[0] - 1)],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(unwrapped_verts),
                "type": "VEC3",
                "max": unwrapped_verts.max(axis=0).tolist(),
                "min": unwrapped_verts.min(axis=0).tolist()
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(unwrapped_norms),
                "type": "VEC3",
                "max": unwrapped_norms.max(axis=0).tolist(),
                "min": unwrapped_norms.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(unwrapped_uvs),
                "type": "VEC2",
                "max": unwrapped_uvs.max(axis=0).tolist(),
                "min": unwrapped_uvs.min(axis=0).tolist()
            }
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": offset0, "byteLength": len0, "target": 34963},
            {"buffer": 0, "byteOffset": offset1, "byteLength": len1, "target": 34962},
            {"buffer": 0, "byteOffset": offset2, "byteLength": len2, "target": 34962},
            {"buffer": 0, "byteOffset": offset3, "byteLength": len3, "target": 34962}
        ],
        "buffers": [{"byteLength": len(bin_data)}]
    }

    json_str = json.dumps(gltf_json)
    json_bytes = json_str.encode('utf-8')
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * json_pad

    glb_len = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
    header = struct.pack('<4sII', b'glTF', 2, glb_len)
    chunk0_header = struct.pack('<II', len(json_bytes), 0x4E4F534A)
    chunk1_header = struct.pack('<II', len(bin_data), 0x004E4942)

    with open(input_glb, 'wb') as f:
        f.write(header)
        f.write(chunk0_header)
        f.write(json_bytes)
        f.write(chunk1_header)
        f.write(bin_data)

    print('GLB model generated successfully with 4-side non-overlapping UV mapping!')

    # -------------------------------------------------------------
    # 5. Render All 8 Angles to Verify 360° Perfection
    # -------------------------------------------------------------
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for ang in angles:
        rend = render_mesh_to_image(unwrapped_mesh, unwrapped_uvs, atlas, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'view_{ang}deg.png'), 'PNG')
        print(f'Rendered {ang} deg view!')

if __name__ == '__main__':
    build_4side_projected_batsman()
