import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_real_front_back_batsman():
    # -------------------------------------------------------------
    # 1. Load Clean Base Mesh & Weld to exact unique vertices
    # -------------------------------------------------------------
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    mesh.merge_vertices() # Clean 5,203 unique vertices

    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max() # -0.422 .. 0.407
    y_min, y_max = verts[:,1].min(), verts[:,1].max() # -1.003 .. 1.001
    z_min, z_max = verts[:,2].min(), verts[:,2].max() # -0.349 .. 0.362

    print(f'Base Mesh: {len(faces)} faces, {N} unique vertices.')

    # -------------------------------------------------------------
    # 2. Process Real Front & Back Reference Images
    # -------------------------------------------------------------
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
    hero_back = Image.open('./backend/public/images/players/hero_IN_back.jpg').convert('RGBA')

    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255) # Team India Royal Blue

    # A. Clean Real Front Image
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    pf_arr = np.array(player_front)

    # Grass cleanup only below shoes (bottom 10%)
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
    front_tex = Image.new('RGBA', (w, h), jersey_royal)
    front_res = clean_front.resize((2000, 2000), Image.Resampling.LANCZOS)
    front_tex.paste(front_res, (24, 24))

    # B. Clean Real Back Image
    # Crop player from hero_IN_back.jpg (size 1024 x 1820)
    hb_w, hb_h = hero_back.size
    player_back = hero_back.crop((int(hb_w * 0.20), int(hb_h * 0.08), int(hb_w * 0.82), int(hb_h * 0.95)))
    pb_w, pb_h = player_back.size
    pb_arr = np.array(player_back)

    # Grass cleanup on back image (only bottom 10%)
    grass_y_b = int(pb_h * 0.90)
    pb_arr[int(pb_h * 0.94):, :, :3] = [30, 41, 59]
    is_grass_b = (pb_arr[grass_y_b:, :, 1] > 115) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 0] + 15) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 2] + 15)
    pb_arr[grass_y_b:][is_grass_b] = [2, 132, 199, 255]

    clean_back = Image.fromarray(pb_arr)
    back_tex = Image.new('RGBA', (w, h), jersey_royal)
    back_res = clean_back.resize((2000, 2000), Image.Resampling.LANCZOS)
    back_tex.paste(back_res, (24, 24))

    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)
    front_tex.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    back_tex.save(os.path.join(tex_dir, 'batsman_back.png'), 'PNG')

    # Save Normal Map for Front
    gray_f = front_tex.convert('L')
    gray_np = np.array(gray_f, dtype=np.float32)
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
    # 3. Partition Faces into Front and Back Primitives
    # -------------------------------------------------------------
    front_faces = []
    back_faces = []

    for fi in range(len(faces)):
        f = faces[fi]
        p0, p1, p2 = verts[f[0]], verts[f[1]], verts[f[2]]
        fn = np.cross(p1 - p0, p2 - p0)
        fn_len = np.linalg.norm(fn)
        if fn_len > 0:
            fn /= fn_len
        else:
            fn = np.array([0, 0, 1], dtype=np.float32)

        cz = (p0[2] + p1[2] + p2[2]) / 3.0
        
        # Front vs Back decision
        if fn[2] >= -0.15 or cz > 0.05:
            front_faces.append(f)
        else:
            back_faces.append(f)

    front_faces = np.array(front_faces, dtype=np.uint32)
    back_faces = np.array(back_faces, dtype=np.uint32)

    print(f'Clean Front faces: {len(front_faces)}, Clean Back faces: {len(back_faces)}')

    # Front UVs: (x - x_min)/(x_max - x_min), (y - y_min)/(y_max - y_min)
    # Back UVs: (x_max - x)/(x_max - x_min), (y - y_min)/(y_max - y_min)
    uvs_front = np.zeros((N, 2), dtype=np.float32)
    uvs_back = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        u_f = 0.012 + 0.976 * ((x - x_min) / (x_max - x_min))
        u_b = 0.012 + 0.976 * ((x_max - x) / (x_max - x_min))
        v = 0.012 + 0.976 * ((y - y_min) / (y_max - y_min))
        uvs_front[i] = [float(np.clip(u_f, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]
        uvs_back[i] = [float(np.clip(u_b, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # -------------------------------------------------------------
    # 4. Pack GLB with 2 Primitives
    # -------------------------------------------------------------
    front_indices_bytes = front_faces.flatten().tobytes()
    back_indices_bytes = back_faces.flatten().tobytes()
    pos_bytes = verts.flatten().tobytes()
    norm_bytes = normals.flatten().tobytes()
    uv_f_bytes = uvs_front.flatten().tobytes()
    uv_b_bytes = uvs_back.flatten().tobytes()

    bin_data = front_indices_bytes + back_indices_bytes + pos_bytes + norm_bytes + uv_f_bytes + uv_b_bytes
    pad = (4 - (len(bin_data) % 4)) % 4
    bin_data += b'\x00' * pad

    off0 = 0
    l0 = len(front_indices_bytes)

    off1 = off0 + l0
    l1 = len(back_indices_bytes)

    off2 = off1 + l1
    l2 = len(pos_bytes)

    off3 = off2 + l2
    l3 = len(norm_bytes)

    off4 = off3 + l3
    l4 = len(uv_f_bytes)

    off5 = off4 + l4
    l5 = len(uv_b_bytes)

    gltf_json = {
        "asset": {"version": "2.0", "generator": "Cricket Strike Real 360 Front Back Engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Batsman_PBR", "mesh": 0}],
        "meshes": [
            {
                "name": "Batsman_Mesh",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": 2,
                            "NORMAL": 3,
                            "TEXCOORD_0": 4
                        },
                        "indices": 0,
                        "material": 0,
                        "mode": 4
                    },
                    {
                        "attributes": {
                            "POSITION": 2,
                            "NORMAL": 3,
                            "TEXCOORD_0": 5
                        },
                        "indices": 1,
                        "material": 1,
                        "mode": 4
                    }
                ]
            }
        ],
        "materials": [
            {
                "name": "Batsman_Front_Material",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                    "metallicFactor": 0.05,
                    "roughnessFactor": 0.7
                },
                "doubleSided": True
            },
            {
                "name": "Batsman_Back_Material",
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
                "count": len(front_faces) * 3,
                "type": "SCALAR",
                "max": [int(N - 1)],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5125,
                "count": len(back_faces) * 3,
                "type": "SCALAR",
                "max": [int(N - 1)],
                "min": [0]
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC3",
                "max": verts.max(axis=0).tolist(),
                "min": verts.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC3",
                "max": normals.max(axis=0).tolist(),
                "min": normals.min(axis=0).tolist()
            },
            {
                "bufferView": 4,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC2",
                "max": uvs_front.max(axis=0).tolist(),
                "min": uvs_front.min(axis=0).tolist()
            },
            {
                "bufferView": 5,
                "byteOffset": 0,
                "componentType": 5126,
                "count": N,
                "type": "VEC2",
                "max": uvs_back.max(axis=0).tolist(),
                "min": uvs_back.min(axis=0).tolist()
            }
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off0, "byteLength": l0, "target": 34963},
            {"buffer": 0, "byteOffset": off1, "byteLength": l1, "target": 34963},
            {"buffer": 0, "byteOffset": off2, "byteLength": l2, "target": 34962},
            {"buffer": 0, "byteOffset": off3, "byteLength": l3, "target": 34962},
            {"buffer": 0, "byteOffset": off4, "byteLength": l4, "target": 34962},
            {"buffer": 0, "byteOffset": off5, "byteLength": l5, "target": 34962}
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

    print('Real Front & Back GLB model generated successfully!')

    # -------------------------------------------------------------
    # 5. Render Front & Back with Software Rasterizer
    # -------------------------------------------------------------
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    
    full_mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals, process=False)

    rend_front = render_mesh_to_image(full_mesh, uvs_front, front_tex, width=400, height=700, rot_y_deg=0)
    rend_front.save(os.path.join(out_dir, 'real_render_front_0deg.png'), 'PNG')
    print('Rendered real front 0 deg view!')

    rend_back = render_mesh_to_image(full_mesh, uvs_back, back_tex, width=400, height=700, rot_y_deg=180)
    rend_back.save(os.path.join(out_dir, 'real_render_back_180deg.png'), 'PNG')
    print('Rendered real back 180 deg view!')

if __name__ == '__main__':
    build_real_front_back_batsman()
