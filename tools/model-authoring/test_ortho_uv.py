import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def test_front_ortho():
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
    jersey_royal = (2, 132, 199, 255)
    orange_saffron = (249, 115, 22, 255)

    # 1. Clean Front Player Image
    # Crop hero tightly matching the 3D bounds:
    # Top of bat tip: y ~ 125, bottom of shoes: y ~ 1315
    # Leftmost hand: x ~ 105, rightmost shoe/pad: x ~ 620
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size

    pf_arr = np.array(player_front)
    # Remove grass below shoes
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    is_grass = (pf_arr[:, :, 1] > 115) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 10) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 10)
    pf_arr[is_grass] = [2, 132, 199, 255]

    clean_front = Image.fromarray(pf_arr)
    cf_draw = ImageDraw.Draw(clean_front)

    # Clean text (INDIA/MPL)
    cf_draw.rectangle([int(pf_w * 0.18), int(pf_h * 0.45), int(pf_w * 0.78), int(pf_h * 0.62)], fill=jersey_royal)
    cf_draw.rectangle([int(pf_w * 0.20), int(pf_h * 0.28), int(pf_w * 0.40), int(pf_h * 0.38)], fill=jersey_royal)

    # Dynamic chest stripes
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

    # Clean pad text
    cf_draw.rectangle([int(pf_w * 0.08), int(pf_h * 0.78), int(pf_w * 0.38), int(pf_h * 0.88)], fill=jersey_royal)
    cf_draw.rectangle([int(pf_w * 0.62), int(pf_h * 0.78), int(pf_w * 0.92), int(pf_h * 0.88)], fill=jersey_royal)

    # 2. Master Full-Resolution Texture (2048 x 2048)
    tex = Image.new('RGBA', (w, h), jersey_royal)
    front_res = clean_front.resize((2000, 2000), Image.Resampling.LANCZOS)
    tex.paste(front_res, (24, 24))

    tex_dir = './backend/public/models/textures'
    tex.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Normal map
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

    # 3. Continuous Orthographic UV coordinates
    uvs = np.zeros((N, 2), dtype=np.float32)
    for i in range(N):
        x, y, z = verts[i]
        u = 0.012 + 0.976 * ((x - x_min) / (x_max - x_min))
        v = 0.012 + 0.976 * ((y - y_min) / (y_max - y_min))
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # 4. Render verification views
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    for ang in [0, 45, 90, 180]:
        rend = render_mesh_to_image(mesh, uvs, tex, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'ortho_render_{ang}deg.png'), 'PNG')
        print(f'Rendered ortho {ang} deg!')

if __name__ == '__main__':
    test_front_ortho()
