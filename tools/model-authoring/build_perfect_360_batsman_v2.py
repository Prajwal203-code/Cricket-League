import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_perfect_360_v2():
    # 1. Load Original Mesh
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max() # -0.422 .. 0.407
    y_min, y_max = verts[:,1].min(), verts[:,1].max() # -1.003 .. 1.001
    z_min, z_max = verts[:,2].min(), verts[:,2].max() # -0.349 .. 0.362

    # Load hero reference
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')

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

    # -------------------------------------------------------------
    # FRONT HALF: 0..1024
    # -------------------------------------------------------------
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
    front_res = clean_front.resize((980, 2000), Image.Resampling.LANCZOS)
    atlas.paste(front_res, (22, 24))

    # -------------------------------------------------------------
    # BACK HALF: 1024..2048
    # -------------------------------------------------------------
    back_img = Image.new('RGBA', (980, 2000), jersey_royal)
    b_draw = ImageDraw.Draw(back_img)

    # Hair back
    b_draw.rectangle([220, 80, 760, 480], fill=hair_black)
    for fx in range(120):
        t = fx / 120.0
        c = (int(hair_black[0]*(1-t) + skin_med[0]*t), int(hair_black[1]*(1-t) + skin_med[1]*t), int(hair_black[2]*(1-t) + skin_med[2]*t), 255)
        b_draw.line([(220 - fx, 120), (220 - fx, 480)], fill=c)
        b_draw.line([(760 + fx, 120), (760 + fx, 480)], fill=c)

    # Headband back
    b_draw.rectangle([120, 320, 860, 390], fill=jersey_royal)
    b_draw.line([(120, 320), (860, 320)], fill=(255, 255, 255, 255), width=4)
    b_draw.line([(120, 390), (860, 390)], fill=(255, 255, 255, 255), width=4)

    # Collar back
    b_draw.rectangle([150, 480, 830, 560], fill=orange_saffron)
    b_draw.line([(150, 560), (830, 560)], fill=(255, 255, 255, 255), width=5)

    # Flanks orange
    b_draw.polygon([(150, 560), (250, 560), (280, 1050), (150, 1050)], fill=orange_saffron)
    b_draw.polygon([(830, 560), (730, 560), (700, 1050), (830, 1050)], fill=orange_saffron)

    # Bat back spine
    b_draw.polygon([(120, 150), (320, 150), (380, 950), (180, 950)], fill=bat_wood)
    for gy in range(160, 950, 12):
        b_draw.line([(120, gy), (380, gy)], fill=bat_wood_dark, width=2)

    # Trousers back
    b_draw.rectangle([120, 1050, 860, 1850], fill=jersey_royal)
    b_draw.rectangle([120, 1050, 190, 1850], fill=orange_saffron)
    b_draw.rectangle([790, 1050, 860, 1850], fill=orange_saffron)

    # Pad rear straps
    for sy in [1420, 1580, 1740]:
        b_draw.rectangle([150, sy, 440, sy + 35], fill=grip_navy)
        b_draw.rectangle([540, sy, 830, sy + 35], fill=grip_navy)
        b_draw.line([(150, sy), (440, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.line([(540, sy), (830, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.rectangle([280, sy + 5, 320, sy + 30], fill=(220, 220, 220, 255))
        b_draw.rectangle([660, sy + 5, 700, sy + 30], fill=(220, 220, 220, 255))

    # Shoes back
    b_draw.rectangle([120, 1850, 440, 1960], fill=shoe_white)
    b_draw.rectangle([540, 1850, 860, 1960], fill=shoe_white)
    b_draw.rectangle([120, 1860, 440, 1910], fill=jersey_royal)
    b_draw.rectangle([540, 1860, 860, 1910], fill=jersey_royal)
    b_draw.rectangle([260, 1850, 290, 1930], fill=orange_saffron)
    b_draw.rectangle([680, 1850, 710, 1930], fill=orange_saffron)
    b_draw.rectangle([120, 1960, 440, 2000], fill=shoe_sole)
    b_draw.rectangle([540, 1960, 860, 2000], fill=shoe_sole)

    atlas.paste(back_img, (1046, 24))

    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)
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
    # 2. Assign Continuous UVs per-face to eliminate seam jumps
    # -------------------------------------------------------------
    # We keep the 5,203 base mesh geometry 100% intact,
    # but for faces where dominant normal is BACK, we map to back half.
    # For faces where dominant normal is FRONT, we map to front half.
    
    num_faces = len(faces)
    final_verts = np.zeros((num_faces * 3, 3), dtype=np.float32)
    final_norms = np.zeros((num_faces * 3, 3), dtype=np.float32)
    final_uvs = np.zeros((num_faces * 3, 2), dtype=np.float32)
    final_faces = np.arange(num_faces * 3, dtype=np.uint32).reshape((num_faces, 3))

    for fi in range(num_faces):
        f = faces[fi]
        v0, v1, v2 = f
        p0, p1, p2 = verts[v0], verts[v1], verts[v2]
        
        # Face normal
        fn = np.cross(p1 - p0, p2 - p0)
        fn_len = np.linalg.norm(fn)
        if fn_len > 0:
            fn /= fn_len
        else:
            fn = np.array([0, 0, 1], dtype=np.float32)

        # Centroid of face
        centroid_z = (p0[2] + p1[2] + p2[2]) / 3.0
        
        # A face belongs to FRONT if its surface normal points forward (fn_z >= -0.2)
        # OR if its centroid is in front (centroid_z > 0.08)
        is_front = (fn[2] >= -0.1) or (centroid_z > 0.05)

        for corner_i, vi in enumerate([v0, v1, v2]):
            out_idx = fi * 3 + corner_i
            final_verts[out_idx] = verts[vi]
            final_norms[out_idx] = normals[vi]

            x, y, z = verts[vi]
            u_norm = (x - x_min) / (x_max - x_min)
            v_norm = (y - y_min) / (y_max - y_min)

            if is_front:
                # Front half: [0.012..0.488]
                u = 0.012 + 0.476 * u_norm
            else:
                # Back half: [0.512..0.988]
                u = 0.512 + 0.476 * (1.0 - u_norm)

            v = 0.012 + 0.976 * v_norm
            final_uvs[out_idx] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # 3. Pack GLB
    indices_bytes = final_faces.flatten().tobytes()
    pos_bytes = final_verts.flatten().tobytes()
    norm_bytes = final_norms.flatten().tobytes()
    uv_bytes = final_uvs.flatten().tobytes()

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
        "asset": {"version": "2.0", "generator": "Cricket Strike 360 Verified PBR Engine"},
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
                "count": len(final_faces) * 3,
                "type": "SCALAR",
                "max": [int(final_verts.shape[0] - 1)],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(final_verts),
                "type": "VEC3",
                "max": final_verts.max(axis=0).tolist(),
                "min": final_verts.min(axis=0).tolist()
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(final_norms),
                "type": "VEC3",
                "max": final_norms.max(axis=0).tolist(),
                "min": final_norms.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(final_uvs),
                "type": "VEC2",
                "max": final_uvs.max(axis=0).tolist(),
                "min": final_uvs.min(axis=0).tolist()
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

    print('GLB model generated successfully!')

    # 4. Render All 8 Angles to Verify 360° Perfection
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    
    seamless_mesh = trimesh.Trimesh(vertices=final_verts, faces=final_faces, vertex_normals=final_norms)
    
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for ang in angles:
        rend = render_mesh_to_image(seamless_mesh, final_uvs, atlas, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'perfect360_{ang}deg.png'), 'PNG')
        print(f'Rendered perfect 360 view {ang} deg!')

if __name__ == '__main__':
    build_perfect_360_v2()
