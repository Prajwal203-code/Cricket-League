import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def build_perfect_360_cylindrical_batsman():
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
    jersey_royal = (2, 132, 199, 255) # #0284c7 Team India Blue
    orange_saffron = (249, 115, 22, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)
    skin_med = (180, 126, 90, 255)
    hair_black = (20, 18, 16, 255)
    shoe_white = (248, 250, 252, 255)
    shoe_sole = (30, 41, 59, 255)

    # -------------------------------------------------------------
    # 2. Master 360° Panorama Texture Map (2048 x 2048)
    # -------------------------------------------------------------
    # Panoramic coordinates along X (0..2048):
    # U=0.00 (x=0)    : Back Seam (-Z)
    # U=0.25 (x=512)  : Right Side (-X)
    # U=0.50 (x=1024) : Front Center (+Z)
    # U=0.75 (x=1536) : Left Side (+X)
    # U=1.00 (x=2048) : Back Seam (-Z)
    
    pano = Image.new('RGBA', (w, h), jersey_royal)
    draw_pano = ImageDraw.Draw(pano)

    # A. Base Background & Back Texture across 360°
    # 1. Back of Head & Hair (y: 0..480 on edges x: 0..500 and 1548..2048)
    draw_pano.rectangle([0, 80, 520, 480], fill=hair_black)
    draw_pano.rectangle([1528, 80, 2048, 480], fill=hair_black)
    for fx in range(120):
        t = fx / 120.0
        c = (int(hair_black[0]*(1-t) + skin_med[0]*t), int(hair_black[1]*(1-t) + skin_med[1]*t), int(hair_black[2]*(1-t) + skin_med[2]*t), 255)
        draw_pano.line([(520 - fx, 120), (520 - fx, 480)], fill=c)
        draw_pano.line([(1528 + fx, 120), (1528 + fx, 480)], fill=c)

    # Headband wrapping 360° around full width
    draw_pano.rectangle([0, 320, 2048, 385], fill=jersey_royal)
    draw_pano.line([(0, 320), (2048, 320)], fill=(255, 255, 255, 255), width=4)
    draw_pano.line([(0, 385), (2048, 385)], fill=(255, 255, 255, 255), width=4)

    # 2. Saffron Orange Polo Collar Band wrapping 360° (y: 480..560)
    draw_pano.rectangle([0, 480, 2048, 550], fill=orange_saffron)
    draw_pano.line([(0, 550), (2048, 550)], fill=(255, 255, 255, 255), width=5)

    # 3. Saffron Orange Side Stripes down flanks & trousers
    # Right side flank/trouser stripe: centered around x = 512
    draw_pano.rectangle([460, 550, 560, 1850], fill=orange_saffron)
    draw_pano.line([(460, 550), (460, 1850)], fill=(255, 255, 255, 255), width=3)
    draw_pano.line([(560, 550), (560, 1850)], fill=(255, 255, 255, 255), width=3)

    # Left side flank/trouser stripe: centered around x = 1536
    draw_pano.rectangle([1486, 550, 1586, 1850], fill=orange_saffron)
    draw_pano.line([(1486, 550), (1486, 1850)], fill=(255, 255, 255, 255), width=3)
    draw_pano.line([(1586, 550), (1586, 1850)], fill=(255, 255, 255, 255), width=3)

    # 4. Bat Back Wooden Spine (Left side of back: x: 120..360, y: 150..950)
    draw_pano.polygon([(140, 150), (320, 150), (380, 950), (200, 950)], fill=bat_wood)
    for gy in range(160, 950, 10):
        draw_pano.line([(140, gy), (380, gy)], fill=bat_wood_dark, width=2)

    # 5. Pad Rear Straps with metal buckles on Back (x: 0..460 and 1588..2048, y: 1400..1800)
    for sy in [1420, 1580, 1740]:
        draw_pano.rectangle([0, sy, 420, sy + 30], fill=grip_navy)
        draw_pano.rectangle([1628, sy, 2048, sy + 30], fill=grip_navy)
        draw_pano.rectangle([180, sy + 4, 220, sy + 26], fill=(220, 220, 220, 255))
        draw_pano.rectangle([1828, sy + 4, 1868, sy + 26], fill=(220, 220, 220, 255))

    # 6. Shoes Heel Back (y: 1850..2000)
    draw_pano.rectangle([0, 1850, 420, 1960], fill=shoe_white)
    draw_pano.rectangle([1628, 1850, 2048, 1960], fill=shoe_white)
    draw_pano.rectangle([0, 1860, 420, 1910], fill=jersey_royal)
    draw_pano.rectangle([1628, 1860, 2048, 1910], fill=jersey_royal)
    draw_pano.rectangle([180, 1850, 210, 1930], fill=orange_saffron)
    draw_pano.rectangle([1838, 1850, 1868, 1930], fill=orange_saffron)
    draw_pano.rectangle([0, 1960, 420, 2000], fill=shoe_sole)
    draw_pano.rectangle([1628, 1960, 2048, 2000], fill=shoe_sole)

    # B. Front View in the Center: [512..1536] (1024 px wide x 2000 px tall)
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    pf_arr = np.array(player_front)

    # Remove grass below shoes
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    is_grass = (pf_arr[:, :, 1] > 115) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 10) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 10)
    pf_arr[is_grass] = [2, 132, 199, 255]

    # Clean inpainting of text
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

    clean_front_img = Image.fromarray(pf_arr)

    # Soft alpha blend on left and right edges of front paste
    front_res = clean_front_img.resize((1024, 2000), Image.Resampling.LANCZOS)
    f_mask = Image.new('L', (1024, 2000), 255)
    fmd = ImageDraw.Draw(f_mask)
    for bx in range(60):
        alpha = int(255 * (bx / 60.0))
        fmd.line([(bx, 0), (bx, 2000)], fill=alpha)
        fmd.line([(1023 - bx, 0), (1023 - bx, 2000)], fill=alpha)

    pano.paste(front_res, (512, 24), f_mask)

    # Save Master Textures
    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)
    pano.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Normal Map
    gray = pano.convert('L')
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
    # 3. Smooth Seamless Cylindrical UV Mapping
    # -------------------------------------------------------------
    # To ensure the back seam (-pi/+pi) doesn't stretch triangles,
    # we duplicate vertices for faces that cross the seam.
    
    # Calculate cylindrical UVs for each vertex
    raw_u = np.zeros(N, dtype=np.float32)
    raw_v = np.zeros(N, dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        # Angle around character center (facing +Z at theta=0)
        theta = math.atan2(x, z) # -pi to +pi
        # theta = 0 -> u = 0.50 (Front center)
        # theta = -pi -> u = 0.00, theta = +pi -> u = 1.00 (Back seam)
        u = 0.5 + (theta / (2.0 * math.pi))
        v = (y - y_min) / (y_max - y_min)
        raw_u[i] = u
        raw_v[i] = v

    # Check for seam-crossing triangles (where one vertex has u ~ 0.05 and another has u ~ 0.95)
    # and adjust UVs cleanly
    final_verts = []
    final_norms = []
    final_uvs = []
    final_faces = []

    for fi in range(len(faces)):
        f = faces[fi]
        v0, v1, v2 = f
        u0, u1, u2 = raw_u[v0], raw_u[v1], raw_u[v2]
        v_0, v_1, v_2 = raw_v[v0], raw_v[v1], raw_v[v2]

        # Check if triangle crosses the seam (u range > 0.5)
        u_vals = [u0, u1, u2]
        if max(u_vals) - min(u_vals) > 0.5:
            # Wrap vertices with u < 0.5 to u + 1.0, or u > 0.5 to u - 1.0
            if min(u_vals) < 0.2:
                u_vals_fixed = [u if u >= 0.5 else u + 1.0 for u in u_vals]
            else:
                u_vals_fixed = [u if u <= 0.5 else u - 1.0 for u in u_vals]
            u0, u1, u2 = u_vals_fixed

        idx_start = len(final_verts)
        for vi, u_val, v_val in [(v0, u0, v_0), (v1, u1, v_1), (v2, u2, v_2)]:
            final_verts.append(verts[vi])
            final_norms.append(normals[vi])
            final_uvs.append([float(np.clip(u_val, 0.001, 0.999)), float(np.clip(v_val, 0.001, 0.999))])
        final_faces.append([idx_start, idx_start + 1, idx_start + 2])

    final_verts = np.array(final_verts, dtype=np.float32)
    final_norms = np.array(final_norms, dtype=np.float32)
    final_uvs = np.array(final_uvs, dtype=np.float32)
    final_faces = np.array(final_faces, dtype=np.uint32)

    # 4. Pack GLB
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
        "asset": {"version": "2.0", "generator": "Cricket Strike 360 Seamless Cylindrical Engine"},
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

    # 5. Render All 8 Angles to Verify 360° Perfection
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    
    seamless_mesh = trimesh.Trimesh(vertices=final_verts, faces=final_faces, vertex_normals=final_norms)
    
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for ang in angles:
        rend = render_mesh_to_image(seamless_mesh, final_uvs, pano, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'cyl360_{ang}deg.png'), 'PNG')
        print(f'Rendered 360 view {ang} deg!')

if __name__ == '__main__':
    build_perfect_360_cylindrical_batsman()
