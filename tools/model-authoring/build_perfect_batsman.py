import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def build_perfect_batsman():
    # 1. Load Original Mesh
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max()
    y_min, y_max = verts[:,1].min(), verts[:,1].max()
    z_min, z_max = verts[:,2].min(), verts[:,2].max()

    print(f'Mesh bounds: X:[{x_min:.3f}..{x_max:.3f}], Y:[{y_min:.3f}..{y_max:.3f}], Z:[{z_min:.3f}..{z_max:.3f}]')

    # 2. Compute Seamless Front/Back Projected UVs
    uvs = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        u_norm = (x - x_min) / (x_max - x_min)
        v_norm = (y - y_min) / (y_max - y_min)

        # Front view (z >= -0.04) vs Back view (z < -0.04)
        if z >= -0.04:
            # Front atlas: [0.01..0.49]
            u = 0.01 + 0.47 * u_norm
        else:
            # Back atlas: [0.51..0.99] (horizontally flipped so right is left on back)
            u = 0.51 + 0.47 * (1.0 - u_norm)

        # Invert v for WebGL UV coordinate convention (v=1 at top, v=0 at bottom)
        v = 0.01 + 0.98 * v_norm
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # 3. Create High-Res Master Textures
    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)

    img_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
    # Crop player tightly
    # In hero_IN.jpg (768 x 1376):
    player_box = (100, 115, 625, 1315)
    player_crop = img_front.crop(player_box)

    # 2048 x 2048 Texture Atlas
    atlas = Image.new('RGBA', (2048, 2048), (2, 132, 199, 255))
    front_tex = player_crop.resize((960, 2000), Image.Resampling.LANCZOS)
    atlas.paste(front_tex, (20, 24))

    # Back View
    back_tex = Image.new('RGBA', (960, 2000), (2, 132, 199, 255))
    b_draw = ImageDraw.Draw(back_tex)

    # Back hair
    b_draw.rectangle([200, 80, 760, 480], fill=(20, 18, 16, 255))
    for fx in range(120):
        t = fx / 120.0
        c = (int(20*(1-t) + 180*t), int(18*(1-t) + 126*t), int(16*(1-t) + 90*t), 255)
        b_draw.line([(200 - fx, 200), (200 - fx, 480)], fill=c)
        b_draw.line([(760 + fx, 200), (760 + fx, 480)], fill=c)

    # Headband back
    b_draw.rectangle([100, 320, 860, 390], fill=(2, 132, 199, 255))
    b_draw.line([(100, 320), (860, 320)], fill=(255, 255, 255, 255), width=4)
    b_draw.line([(100, 390), (860, 390)], fill=(255, 255, 255, 255), width=4)

    # Collar & Jersey back
    b_draw.rectangle([150, 480, 810, 560], fill=(249, 115, 22, 255))
    b_draw.line([(150, 560), (810, 560)], fill=(255, 255, 255, 255), width=5)

    # Flanks orange
    b_draw.polygon([(150, 560), (250, 560), (270, 1050), (150, 1050)], fill=(249, 115, 22, 255))
    b_draw.polygon([(810, 560), (710, 560), (690, 1050), (810, 1050)], fill=(249, 115, 22, 255))

    # Bat back spine
    b_draw.polygon([(120, 150), (300, 150), (380, 950), (200, 950)], fill=(222, 186, 136, 255))
    for gy in range(160, 950, 12):
        b_draw.line([(120, gy), (380, gy)], fill=(188, 148, 98, 255), width=2)

    # Trousers back
    b_draw.rectangle([100, 1050, 860, 1850], fill=(2, 132, 199, 255))
    b_draw.rectangle([100, 1050, 170, 1850], fill=(249, 115, 22, 255))
    b_draw.rectangle([790, 1050, 860, 1850], fill=(249, 115, 22, 255))

    # Pad rear straps
    for sy in [1420, 1580, 1740]:
        b_draw.rectangle([140, sy, 440, sy + 35], fill=(30, 58, 138, 255))
        b_draw.rectangle([520, sy, 820, sy + 35], fill=(30, 58, 138, 255))
        b_draw.line([(140, sy), (440, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.line([(520, sy), (820, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.rectangle([270, sy + 5, 310, sy + 30], fill=(220, 220, 220, 255))
        b_draw.rectangle([650, sy + 5, 690, sy + 30], fill=(220, 220, 220, 255))

    # Shoes back
    b_draw.rectangle([120, 1850, 440, 1960], fill=(248, 250, 252, 255))
    b_draw.rectangle([520, 1850, 840, 1960], fill=(248, 250, 252, 255))
    b_draw.rectangle([120, 1860, 440, 1910], fill=(2, 132, 199, 255))
    b_draw.rectangle([520, 1860, 840, 1910], fill=(2, 132, 199, 255))
    b_draw.rectangle([260, 1850, 290, 1930], fill=(249, 115, 22, 255))
    b_draw.rectangle([660, 1850, 690, 1930], fill=(249, 115, 22, 255))
    b_draw.rectangle([120, 1960, 440, 2000], fill=(30, 41, 59, 255))
    b_draw.rectangle([520, 1960, 840, 2000], fill=(30, 41, 59, 255))

    atlas.paste(back_tex, (1048, 24))
    atlas.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Normal map
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
    roughness = Image.new('L', (2048, 2048), 165)
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')

    # Metallic
    metallic = Image.new('L', (2048, 2048), 0)
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')

    # AO
    ao = Image.new('L', (2048, 2048), 255)
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')

    # 4. Build GLB
    indices_bytes = faces.flatten().tobytes()
    pos_bytes = verts.flatten().tobytes()
    norm_bytes = normals.flatten().tobytes()
    uv_bytes = uvs.flatten().tobytes()

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
        "asset": {
            "version": "2.0",
            "generator": "Cricket Strike Seamless PBR Engine"
        },
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
                "count": len(faces) * 3,
                "type": "SCALAR",
                "max": [int(verts.shape[0] - 1)],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(verts),
                "type": "VEC3",
                "max": verts.max(axis=0).tolist(),
                "min": verts.min(axis=0).tolist()
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(normals),
                "type": "VEC3",
                "max": normals.max(axis=0).tolist(),
                "min": normals.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126,
                "count": len(uvs),
                "type": "VEC2",
                "max": uvs.max(axis=0).tolist(),
                "min": uvs.min(axis=0).tolist()
            }
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": offset0,
                "byteLength": len0,
                "target": 34963
            },
            {
                "buffer": 0,
                "byteOffset": offset1,
                "byteLength": len1,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": offset2,
                "byteLength": len2,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": offset3,
                "byteLength": len3,
                "target": 34962
            }
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

    print('Built perfect seamless batsman GLB model!')

if __name__ == '__main__':
    build_perfect_batsman()
