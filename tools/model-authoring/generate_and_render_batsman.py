import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def generate_and_verify():
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

    # Load high-res crop textures
    tex_dir = './backend/public/models/textures'
    crop_head = Image.open(os.path.join(tex_dir, 'crop_head.png')).convert('RGBA')
    crop_pads = Image.open(os.path.join(tex_dir, 'crop_pads.png')).convert('RGBA')
    crop_jersey = Image.open(os.path.join(tex_dir, 'crop_jersey.png')).convert('RGBA')

    # Load hero reference
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')

    # 2. Build High-Resolution Front & Back Texture Atlas (2048 x 2048)
    # Left Half [0..1024, 0..2048]: Front View
    # Right Half [1024..2048, 0..2048]: Back View
    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255) # Team India Blue
    orange_saffron = (249, 115, 22, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)

    atlas = Image.new('RGBA', (w, h), jersey_royal)
    
    # -------------------------------------------------------------
    # FRONT HALF (0..1024)
    # -------------------------------------------------------------
    # In hero_IN.jpg (768 x 1376), crop the player tightly matching the 3D bounds:
    # Top of bat tip: y ~ 125, bottom of shoes: y ~ 1315
    # Left hand/bat: x ~ 105, right shoe/pad: x ~ 620
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    
    # Clean player_front image:
    # 1. Cleanly remove grass at bottom
    pf_arr = np.array(player_front)
    # Bottom 10% (below shoes): replace green grass with shoe sole and shadow
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    # Remove green turf near shoe edges
    is_grass = (pf_arr[:, :, 1] > 120) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 15) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 15)
    pf_arr[is_grass] = [2, 132, 199, 255]
    
    # 2. Cleanly cover "INDIA" text & sponsor logos on jersey
    # Chest text area: y: 44%..62%, x: 20%..80%
    clean_front_img = Image.fromarray(pf_arr)
    cf_draw = ImageDraw.Draw(clean_front_img)
    cf_draw.rectangle([int(pf_w * 0.18), int(pf_h * 0.45), int(pf_w * 0.78), int(pf_h * 0.62)], fill=jersey_royal)
    cf_draw.rectangle([int(pf_w * 0.20), int(pf_h * 0.28), int(pf_w * 0.40), int(pf_h * 0.38)], fill=jersey_royal)
    
    # Add dynamic cyan & orange chevron athletic stripes on chest
    cf_draw.polygon([
        (int(pf_w * 0.25), int(pf_h * 0.58)),
        (int(pf_w * 0.45), int(pf_h * 0.45)),
        (int(pf_w * 0.85), int(pf_h * 0.70)),
        (int(pf_w * 0.65), int(pf_h * 0.82))
    ], fill=(14, 165, 233, 255))
    cf_draw.polygon([
        (int(pf_w * 0.40), int(pf_h * 0.48)),
        (int(pf_w * 0.55), int(pf_h * 0.38)),
        (int(pf_w * 0.90), int(pf_h * 0.60)),
        (int(pf_w * 0.75), int(pf_h * 0.72))
    ], fill=orange_saffron)
    
    # Remove text on pads
    cf_draw.rectangle([int(pf_w * 0.08), int(pf_h * 0.78), int(pf_w * 0.38), int(pf_h * 0.88)], fill=jersey_royal)
    cf_draw.rectangle([int(pf_w * 0.62), int(pf_h * 0.78), int(pf_w * 0.92), int(pf_h * 0.88)], fill=jersey_royal)
    
    # Scale cleaned front player to fit front half (980 x 2000)
    front_scaled = clean_front_img.resize((980, 2000), Image.Resampling.LANCZOS)
    atlas.paste(front_scaled, (22, 24))
    
    # -------------------------------------------------------------
    # BACK HALF (1024..2048)
    # -------------------------------------------------------------
    back_img = Image.new('RGBA', (980, 2000), jersey_royal)
    b_draw = ImageDraw.Draw(back_img)
    
    # 1. Hair & Fade on back of head (y: 0..450)
    b_draw.rectangle([220, 80, 760, 480], fill=(20, 18, 16, 255))
    for fx in range(120):
        t = fx / 120.0
        c = (int(20*(1-t) + 180*t), int(18*(1-t) + 126*t), int(16*(1-t) + 90*t), 255)
        b_draw.line([(220 - fx, 200), (220 - fx, 480)], fill=c)
        b_draw.line([(760 + fx, 200), (760 + fx, 480)], fill=c)

    # Headband on back
    b_draw.rectangle([120, 320, 860, 390], fill=jersey_royal)
    b_draw.line([(120, 320), (860, 320)], fill=(255, 255, 255, 255), width=4)
    b_draw.line([(120, 390), (860, 390)], fill=(255, 255, 255, 255), width=4)

    # 2. Saffron Orange Collar & Jersey Back
    b_draw.rectangle([150, 480, 830, 560], fill=orange_saffron)
    b_draw.line([(150, 560), (830, 560)], fill=(255, 255, 255, 255), width=5)

    # Flanks orange
    b_draw.polygon([(150, 560), (250, 560), (280, 1050), (150, 1050)], fill=orange_saffron)
    b_draw.polygon([(830, 560), (730, 560), (700, 1050), (830, 1050)], fill=orange_saffron)

    # 3. Bat Back Wooden Spine (Left side of back view: x: 100..350, y: 150..950)
    b_draw.polygon([(120, 150), (320, 150), (380, 950), (180, 950)], fill=bat_wood)
    for gy in range(160, 950, 12):
        b_draw.line([(120, gy), (380, gy)], fill=bat_wood_dark, width=2)

    # 4. Trousers Back
    b_draw.rectangle([120, 1050, 860, 1850], fill=jersey_royal)
    b_draw.rectangle([120, 1050, 190, 1850], fill=orange_saffron)
    b_draw.rectangle([790, 1050, 860, 1850], fill=orange_saffron)

    # Pad Rear Straps with metal buckles
    for sy in [1420, 1580, 1740]:
        b_draw.rectangle([150, sy, 440, sy + 35], fill=grip_navy)
        b_draw.rectangle([540, sy, 830, sy + 35], fill=grip_navy)
        b_draw.line([(150, sy), (440, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.line([(540, sy), (830, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.rectangle([280, sy + 5, 320, sy + 30], fill=(220, 220, 220, 255))
        b_draw.rectangle([660, sy + 5, 700, sy + 30], fill=(220, 220, 220, 255))

    # Shoes Heel Back
    b_draw.rectangle([120, 1850, 440, 1960], fill=(248, 250, 252, 255))
    b_draw.rectangle([540, 1850, 860, 1960], fill=(248, 250, 252, 255))
    b_draw.rectangle([120, 1860, 440, 1910], fill=jersey_royal)
    b_draw.rectangle([540, 1860, 860, 1910], fill=jersey_royal)
    b_draw.rectangle([260, 1850, 290, 1930], fill=orange_saffron)
    b_draw.rectangle([680, 1850, 710, 1930], fill=orange_saffron)
    b_draw.rectangle([120, 1960, 440, 2000], fill=(30, 41, 59, 255))
    b_draw.rectangle([540, 1960, 860, 2000], fill=(30, 41, 59, 255))

    atlas.paste(back_img, (1046, 24))

    # Save textures
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
    roughness = Image.new('L', (w, h), 160)
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')

    # Metallic
    metallic = Image.new('L', (w, h), 0)
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')

    # AO
    ao = Image.new('L', (w, h), 255)
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')

    # 3. Compute Seamless Continuous UV Mapping
    uvs = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        u_norm = (x - x_min) / (x_max - x_min)
        v_norm = (y - y_min) / (y_max - y_min)

        # Front (z >= -0.04) vs Back (z < -0.04)
        if z >= -0.04:
            u = 0.01 + 0.47 * u_norm
        else:
            u = 0.51 + 0.47 * (1.0 - u_norm)

        # v=0 at bottom, v=1 at top
        v = 0.01 + 0.98 * v_norm
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # 4. Export GLB
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
        "asset": {"version": "2.0", "generator": "Cricket Strike Continuous PBR Engine"},
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

    print('GLB model generated!')

    # 5. Render 4 test angles to verify visually
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    
    angles = [0, 45, 90, 180]
    for ang in angles:
        rend = render_mesh_to_image(mesh, uvs, atlas, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'render_{ang}deg.png'), 'PNG')
        print(f'Rendered {ang} deg view!')

if __name__ == '__main__':
    generate_and_verify()
