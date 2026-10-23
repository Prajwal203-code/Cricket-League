import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_single_atlas_360_batsman():
    # -------------------------------------------------------------
    # 1. Load Clean Base Mesh & Weld to exact unique vertices
    # -------------------------------------------------------------
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    mesh.merge_vertices()

    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = float(verts[:,0].min()), float(verts[:,0].max())
    y_min, y_max = float(verts[:,1].min()), float(verts[:,1].max())
    z_min, z_max = float(verts[:,2].min()), float(verts[:,2].max())

    print(f'Base Mesh: {len(faces)} faces, {N} vertices.')

    # -------------------------------------------------------------
    # 2. Master 2048x2048 Atlas: Left=Front (1024x2048), Right=Back (1024x2048)
    # -------------------------------------------------------------
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
    hero_back = Image.open('./backend/public/images/players/hero_IN_back.jpg').convert('RGBA')

    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255) # Team India Royal Blue

    atlas = Image.new('RGBA', (w, h), jersey_royal)

    # A. FRONT VIEW (Left Half: 0..1024)
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    pf_arr = np.array(player_front)

    # Clean grass below shoes (bottom 10%)
    grass_y_f = int(pf_h * 0.90)
    pf_arr[int(pf_h * 0.94):, :, :3] = [30, 41, 59]
    is_grass_f = (pf_arr[grass_y_f:, :, 1] > 115) & (pf_arr[grass_y_f:, :, 1] > pf_arr[grass_y_f:, :, 0] + 15) & (pf_arr[grass_y_f:, :, 1] > pf_arr[grass_y_f:, :, 2] + 15)
    pf_arr[grass_y_f:][is_grass_f] = [2, 132, 199, 255]

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

    for px0, px1 in [(int(pf_w * 0.08), int(pf_w * 0.18)), (int(pf_w * 0.82), int(pf_w * 0.92))]:
        py0, py1 = int(pf_h * 0.84), int(pf_h * 0.88)
        for y in range(py0, py1):
            for x in range(px0, px1):
                r, g, b = pf_arr[y, x, :3]
                if r > 180 and g > 180 and b > 180:
                    pf_arr[y, x, :3] = pf_arr[py0 - 8, x, :3]

    clean_front = Image.fromarray(pf_arr)
    front_1k = clean_front.resize((980, 2000), Image.Resampling.LANCZOS)
    atlas.paste(front_1k, (22, 24))

    # B. BACK VIEW (Right Half: 1024..2048)
    hb_w, hb_h = hero_back.size
    player_back = hero_back.crop((int(hb_w * 0.19), int(hb_h * 0.08), int(hb_w * 0.83), int(hb_h * 0.95)))
    pb_w, pb_h = player_back.size
    pb_arr = np.array(player_back)

    # Clean grass on back
    grass_y_b = int(pb_h * 0.90)
    pb_arr[int(pb_h * 0.94):, :, :3] = [30, 41, 59]
    is_grass_b = (pb_arr[grass_y_b:, :, 1] > 115) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 0] + 15) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 2] + 15)
    pb_arr[grass_y_b:][is_grass_b] = [2, 132, 199, 255]

    clean_back = Image.fromarray(pb_arr)
    back_1k = clean_back.resize((980, 2000), Image.Resampling.LANCZOS)

    # Bat spine overlay on back view
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    b_draw = ImageDraw.Draw(back_1k)
    b_draw.polygon([(60, 80), (220, 80), (280, 650), (120, 650)], fill=bat_wood)
    for gy in range(90, 650, 12):
        b_draw.line([(60, gy), (280, gy)], fill=bat_wood_dark, width=3)
    b_draw.rectangle([(70, 80), (150, 220)], fill=(30, 58, 138, 255))

    atlas.paste(back_1k, (1046, 24))

    # Save Atlas
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
    bump_strength = 1.5
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
    # 3. Assign UVs for Single-Primitive Model
    # -------------------------------------------------------------
    uvs = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        nx, ny, nz = normals[i]

        u_norm = (x - x_min) / (x_max - x_min)
        v_norm = (y - y_min) / (y_max - y_min)

        # If vertex faces front (nz >= -0.15 or z > 0.04):
        # Maps to Left Half of Atlas [0.012 .. 0.488]
        if nz >= -0.15 or z > 0.04:
            u = 0.012 + 0.476 * u_norm
        else:
            # Back half [0.512 .. 0.988]
            u = 0.512 + 0.476 * (1.0 - u_norm)

        v = 0.012 + 0.976 * v_norm
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # -------------------------------------------------------------
    # 4. Pack Single-Primitive 100% Valid GLB
    # -------------------------------------------------------------
    indices_bytes = faces.flatten().tobytes()
    pos_bytes = verts.flatten().tobytes()
    norm_bytes = normals.flatten().tobytes()
    uv_bytes = uvs.flatten().tobytes()

    bin_data = indices_bytes + pos_bytes + norm_bytes + uv_bytes
    pad = (4 - (len(bin_data) % 4)) % 4
    bin_data += b'\x00' * pad

    off0 = 0
    l0 = len(indices_bytes)
    off1 = off0 + l0
    l1 = len(pos_bytes)
    off2 = off1 + l1
    l2 = len(norm_bytes)
    off3 = off2 + l2
    l3 = len(uv_bytes)

    gltf_json = {
        "asset": {"version": "2.0", "generator": "Cricket Strike Single-Atlas 360 Engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Batsman_PBR", "mesh": 0}],
        "meshes": [
            {
                "name": "Batsman_Mesh",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": 1,
                            "NORMAL": 2,
                            "TEXCOORD_0": 3
                        },
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
                    "roughnessFactor": 0.7
                },
                "doubleSided": True
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5125,
                "count": len(faces) * 3,
                "type": "SCALAR",
                "max": [int(faces.max())],
                "min": [int(faces.min())]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC3",
                "max": verts.max(axis=0).tolist(),
                "min": verts.min(axis=0).tolist()
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC3",
                "max": normals.max(axis=0).tolist(),
                "min": normals.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC2",
                "max": uvs.max(axis=0).tolist(),
                "min": uvs.min(axis=0).tolist()
            }
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off0, "byteLength": l0, "target": 34963},
            {"buffer": 0, "byteOffset": off1, "byteLength": l1, "target": 34962},
            {"buffer": 0, "byteOffset": off2, "byteLength": l2, "target": 34962},
            {"buffer": 0, "byteOffset": off3, "byteLength": l3, "target": 34962}
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

    print('Single-Atlas GLB model generated successfully!')

    # -------------------------------------------------------------
    # 5. Render Front and Back Views to Verify
    # -------------------------------------------------------------
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)

    full_mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals, process=False)
    
    rend_front = render_mesh_to_image(full_mesh, uvs, atlas, width=400, height=700, rot_y_deg=0)
    rend_front.save(os.path.join(out_dir, 'atlas_render_front_0deg.png'), 'PNG')
    print('Rendered atlas front 0 deg view!')

    rend_back = render_mesh_to_image(full_mesh, uvs, atlas, width=400, height=700, rot_y_deg=180)
    rend_back.save(os.path.join(out_dir, 'atlas_render_back_180deg.png'), 'PNG')
    print('Rendered atlas back 180 deg view!')

if __name__ == '__main__':
    build_single_atlas_360_batsman()
