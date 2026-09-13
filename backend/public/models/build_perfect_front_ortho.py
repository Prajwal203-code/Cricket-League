import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_perfect_front_ortho():
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max()
    y_min, y_max = verts[:,1].min(), verts[:,1].max()
    z_min, z_max = verts[:,2].min(), verts[:,2].max()

    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')

    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255) # Team India Royal Blue
    jersey_dark = (14, 116, 178, 255)
    orange_saffron = (249, 115, 22, 255) # Saffron Orange
    pad_highlight = (125, 211, 252, 255)

    # 1. Clean Front Player Image
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size

    pf_arr = np.array(player_front)
    # Remove grass below shoes
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    is_grass = (pf_arr[:, :, 1] > 115) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 10) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 10)
    pf_arr[is_grass] = [2, 132, 199, 255]

    clean_front = Image.fromarray(pf_arr)
    cf_draw = ImageDraw.Draw(clean_front)

    # Clean text (INDIA & MPL) seamlessly with jersey fabric color
    # Chest area (y: 44%..62%, x: 20%..78%)
    chest_box = [int(pf_w * 0.19), int(pf_h * 0.44), int(pf_w * 0.79), int(pf_h * 0.62)]
    cf_draw.rectangle(chest_box, fill=jersey_royal)
    # MPL logo
    cf_draw.rectangle([int(pf_w * 0.20), int(pf_h * 0.27), int(pf_w * 0.40), int(pf_h * 0.38)], fill=jersey_royal)

    # Subtle jersey fabric weave on chest
    for cy in range(chest_box[1], chest_box[3], 4):
        cf_draw.line([(chest_box[0], cy), (chest_box[2], cy)], fill=(10, 140, 208, 255), width=1)

    # Clean Team India Crest on left chest
    crest_x = int(pf_w * 0.65)
    crest_y = int(pf_h * 0.33)
    cf_draw.ellipse([crest_x - 18, crest_y - 18, crest_x + 18, crest_y + 18], fill=(255, 215, 0, 255))
    cf_draw.ellipse([crest_x - 12, crest_y - 12, crest_x + 12, crest_y + 12], fill=jersey_royal)
    cf_draw.ellipse([crest_x - 4, crest_y - 4, crest_x + 4, crest_y + 4], fill=(255, 215, 0, 255))

    # Dynamic Saffron & Cyan Chevron Athletic Graphic on Chest (Centered, sleek)
    cf_draw.polygon([
        (int(pf_w * 0.26), int(pf_h * 0.58)),
        (int(pf_w * 0.45), int(pf_h * 0.46)),
        (int(pf_w * 0.72), int(pf_h * 0.64)),
        (int(pf_w * 0.53), int(pf_h * 0.76))
    ], fill=(14, 165, 233, 255))
    cf_draw.polygon([
        (int(pf_w * 0.38), int(pf_h * 0.50)),
        (int(pf_w * 0.54), int(pf_h * 0.40)),
        (int(pf_w * 0.78), int(pf_h * 0.56)),
        (int(pf_w * 0.62), int(pf_h * 0.66))
    ], fill=orange_saffron)

    # Clean Trousers (y: 62%..78%): Smooth royal blue with orange side stripes
    trousers_box = [int(pf_w * 0.16), int(pf_h * 0.62), int(pf_w * 0.82), int(pf_h * 0.76)]
    cf_draw.rectangle(trousers_box, fill=jersey_royal)
    # Trousers orange side stripes
    cf_draw.rectangle([int(pf_w * 0.16), int(pf_h * 0.62), int(pf_w * 0.22), int(pf_h * 0.76)], fill=orange_saffron)
    cf_draw.rectangle([int(pf_w * 0.76), int(pf_h * 0.62), int(pf_w * 0.82), int(pf_h * 0.76)], fill=orange_saffron)
    # Trousers crease shadow
    cf_draw.line([(int(pf_w * 0.49), int(pf_h * 0.64)), (int(pf_w * 0.49), int(pf_h * 0.76))], fill=jersey_dark, width=3)

    # Clean Pads text (y: 78%..88%) with vertical cane ribs
    for pad_l, pad_r in [(int(pf_w * 0.08), int(pf_w * 0.38)), (int(pf_w * 0.60), int(pf_w * 0.90))]:
        cf_draw.rectangle([pad_l, int(pf_h * 0.78), pad_r, int(pf_h * 0.88)], fill=jersey_royal)
        rib_w = (pad_r - pad_l) // 5
        for r in range(5):
            rx = pad_l + r * rib_w + rib_w // 2
            cf_draw.line([(rx, int(pf_h * 0.78)), (rx, int(pf_h * 0.88))], fill=pad_highlight, width=3)
            cf_draw.line([(rx, int(pf_h * 0.78)), (rx, int(pf_h * 0.88))], fill=(255, 255, 255, 255), width=1)

    # Shoes (y: 88%..100%): Clean white athletic body with royal blue overlays & orange accents
    shoes_box = [0, int(pf_h * 0.89), pf_w, pf_h]
    # Shoe soles
    cf_draw.rectangle([int(pf_w * 0.05), int(pf_h * 0.94), int(pf_w * 0.45), int(pf_h * 0.98)], fill=(30, 41, 59, 255))
    cf_draw.rectangle([int(pf_w * 0.55), int(pf_h * 0.94), int(pf_w * 0.95), int(pf_h * 0.98)], fill=(30, 41, 59, 255))
    # Midsole
    cf_draw.rectangle([int(pf_w * 0.05), int(pf_h * 0.92), int(pf_w * 0.45), int(pf_h * 0.94)], fill=(248, 250, 252, 255))
    cf_draw.rectangle([int(pf_w * 0.55), int(pf_h * 0.92), int(pf_w * 0.95), int(pf_h * 0.94)], fill=(248, 250, 252, 255))

    # 2. Master 2048 x 2048 Texture
    tex = Image.new('RGBA', (w, h), jersey_royal)
    front_res = clean_front.resize((2000, 2000), Image.Resampling.LANCZOS)
    tex.paste(front_res, (24, 24))

    tex_dir = './backend/public/models/textures'
    tex.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Normal Map
    gray = tex.convert('L')
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

    # 3. Continuous Orthographic UV coordinates
    uvs = np.zeros((N, 2), dtype=np.float32)
    for i in range(N):
        x, y, z = verts[i]
        u = 0.012 + 0.976 * ((x - x_min) / (x_max - x_min))
        v = 0.012 + 0.976 * ((y - y_min) / (y_max - y_min))
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # 4. Pack GLB
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
        "asset": {"version": "2.0", "generator": "Cricket Strike Continuous Ortho PBR Engine"},
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

    # 5. Render verification views
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    for ang in [0, 45, 90, 180]:
        rend = render_mesh_to_image(mesh, uvs, tex, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'final_render_{ang}deg.png'), 'PNG')
        print(f'Rendered final {ang} deg view!')

if __name__ == '__main__':
    build_perfect_front_ortho()
