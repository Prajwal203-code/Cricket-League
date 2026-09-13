import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh
from test_rasterizer import render_mesh_to_image

def test_cylindrical():
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max()
    y_min, y_max = verts[:,1].min(), verts[:,1].max()
    z_min, z_max = verts[:,2].min(), verts[:,2].max()

    # Load hero reference
    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')

    # Create 2048 x 2048 Cylindrical Panorama Texture
    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255)
    orange_saffron = (249, 115, 22, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)

    pano = Image.new('RGBA', (w, h), jersey_royal)
    draw_pano = ImageDraw.Draw(pano)

    # 1. Background / Back Details across full width [0..2048]
    # Back Hair (y: 0..480)
    draw_pano.rectangle([0, 80, 500, 480], fill=(20, 18, 16, 255))
    draw_pano.rectangle([1548, 80, 2048, 480], fill=(20, 18, 16, 255))
    # Headband back
    draw_pano.rectangle([0, 320, 500, 390], fill=jersey_royal)
    draw_pano.rectangle([1548, 320, 2048, 390], fill=jersey_royal)
    draw_pano.line([(0, 320), (500, 320)], fill=(255, 255, 255, 255), width=4)
    draw_pano.line([(0, 390), (500, 390)], fill=(255, 255, 255, 255), width=4)
    draw_pano.line([(1548, 320), (2048, 320)], fill=(255, 255, 255, 255), width=4)
    draw_pano.line([(1548, 390), (2048, 390)], fill=(255, 255, 255, 255), width=4)

    # Collar back
    draw_pano.rectangle([0, 480, 480, 560], fill=orange_saffron)
    draw_pano.rectangle([1568, 480, 2048, 560], fill=orange_saffron)

    # Trousers Back & Pad Straps
    draw_pano.rectangle([0, 1050, 480, 1850], fill=jersey_royal)
    draw_pano.rectangle([1568, 1050, 2048, 1850], fill=jersey_royal)
    for sy in [1420, 1580, 1740]:
        draw_pano.rectangle([0, sy, 450, sy + 35], fill=grip_navy)
        draw_pano.rectangle([1600, sy, 2048, sy + 35], fill=grip_navy)
        draw_pano.rectangle([200, sy + 5, 240, sy + 30], fill=(220, 220, 220, 255))
        draw_pano.rectangle([1800, sy + 5, 1840, sy + 30], fill=(220, 220, 220, 255))

    # Shoes Heel Back
    draw_pano.rectangle([0, 1850, 450, 1960], fill=(248, 250, 252, 255))
    draw_pano.rectangle([1600, 1850, 2048, 1960], fill=(248, 250, 252, 255))
    draw_pano.rectangle([0, 1960, 450, 2000], fill=(30, 41, 59, 255))
    draw_pano.rectangle([1600, 1960, 2048, 2000], fill=(30, 41, 59, 255))

    # 2. Front View in the Center: [512..1536] (1024 px wide x 2000 px tall)
    # Crop hero front cleanly
    player_front = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = player_front.size
    
    pf_arr = np.array(player_front)
    # Remove grass below shoes
    pf_arr[int(pf_h * 0.91):, :, :3] = [30, 41, 59]
    is_grass = (pf_arr[:, :, 1] > 120) & (pf_arr[:, :, 1] > pf_arr[:, :, 0] + 15) & (pf_arr[:, :, 1] > pf_arr[:, :, 2] + 15)
    pf_arr[is_grass] = [2, 132, 199, 255]
    
    clean_front_img = Image.fromarray(pf_arr)
    cf_draw = ImageDraw.Draw(clean_front_img)
    # Clean text
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
    
    # Pad text cleanup
    cf_draw.rectangle([int(pf_w * 0.08), int(pf_h * 0.78), int(pf_w * 0.38), int(pf_h * 0.88)], fill=jersey_royal)
    cf_draw.rectangle([int(pf_w * 0.62), int(pf_h * 0.78), int(pf_w * 0.92), int(pf_h * 0.88)], fill=jersey_royal)

    # Soft alpha edge blend
    front_res = clean_front_img.resize((1024, 2000), Image.Resampling.LANCZOS)
    f_mask = Image.new('L', (1024, 2000), 255)
    fmd = ImageDraw.Draw(f_mask)
    for bx in range(80):
        alpha = int(255 * (bx / 80.0))
        fmd.line([(bx, 0), (bx, 2000)], fill=alpha)
        fmd.line([(1023 - bx, 0), (1023 - bx, 2000)], fill=alpha)

    pano.paste(front_res, (512, 24), f_mask)

    # Save textures
    tex_dir = './backend/public/models/textures'
    pano.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')

    # Compute Continuous Cylindrical UV coordinates
    uvs = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        # Angle around Y axis: 0 is front (+Z), -pi to +pi
        # atan2(x, z): front is 0, right is +pi/2, left is -pi/2, back is +/- pi
        theta = math.atan2(x, z)
        # Map theta from [-pi, +pi] to [0.0, 1.0]:
        # theta = 0 -> u = 0.50 (Center of front texture!)
        # theta = -pi -> u = 0.0, theta = +pi -> u = 1.0 (Back seam!)
        u = 0.5 + (theta / (2.0 * math.pi))
        
        # Vertical height mapping
        v = (y - y_min) / (y_max - y_min)
        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # Render verification views
    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)
    for ang in [0, 45, 90, 180]:
        rend = render_mesh_to_image(mesh, uvs, pano, width=400, height=700, rot_y_deg=ang)
        rend.save(os.path.join(out_dir, f'cyl_render_{ang}deg.png'), 'PNG')
        print(f'Rendered cylindrical {ang} deg!')

if __name__ == '__main__':
    test_cylindrical()
