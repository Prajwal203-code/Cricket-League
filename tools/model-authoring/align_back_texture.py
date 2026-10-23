import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw
import trimesh
from test_rasterizer import render_mesh_to_image

def perfect_align_back():
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    mesh.merge_vertices()
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max()
    y_min, y_max = verts[:,1].min(), verts[:,1].max()

    hero_back = Image.open('./backend/public/images/players/hero_IN_back.jpg').convert('RGBA')
    hb_w, hb_h = hero_back.size

    # Crop player from back image
    # Player bounding box in hero_IN_back.jpg: x: 18%..84%, y: 7%..95%
    player_back = hero_back.crop((int(hb_w * 0.19), int(hb_h * 0.08), int(hb_w * 0.83), int(hb_h * 0.95)))
    pb_w, pb_h = player_back.size
    pb_arr = np.array(player_back)

    # Clean grass at bottom
    grass_y_b = int(pb_h * 0.90)
    pb_arr[int(pb_h * 0.94):, :, :3] = [30, 41, 59]
    is_grass_b = (pb_arr[grass_y_b:, :, 1] > 115) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 0] + 15) & (pb_arr[grass_y_b:, :, 1] > pb_arr[grass_y_b:, :, 2] + 15)
    pb_arr[grass_y_b:][is_grass_b] = [2, 132, 199, 255]

    clean_back = Image.fromarray(pb_arr)
    
    # 2048 x 2048 Master Back Texture
    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)

    back_tex = Image.new('RGBA', (w, h), jersey_royal)
    back_res = clean_back.resize((1980, 1980), Image.Resampling.LANCZOS)
    back_tex.paste(back_res, (34, 34))

    b_draw = ImageDraw.Draw(back_tex)
    
    # Bat back wooden spine over right shoulder (x: 100..450, y: 80..650)
    b_draw.polygon([(120, 80), (380, 80), (450, 650), (220, 650)], fill=bat_wood)
    for gy in range(90, 650, 12):
        b_draw.line([(120, gy), (450, gy)], fill=bat_wood_dark, width=3)
    b_draw.rectangle([130, 80, 240, 220], fill=(30, 58, 138, 255)) # grip

    tex_dir = './backend/public/models/textures'
    back_tex.save(os.path.join(tex_dir, 'batsman_back.png'), 'PNG')

    # Front Texture
    front_tex = Image.open(os.path.join(tex_dir, 'batsman_albedo.png')).convert('RGBA')

    uvs_front = np.zeros((N, 2), dtype=np.float32)
    uvs_back = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        u_f = 0.012 + 0.976 * ((x - x_min) / (x_max - x_min))
        u_b = 0.012 + 0.976 * ((x_max - x) / (x_max - x_min))
        v = 0.012 + 0.976 * ((y - y_min) / (y_max - y_min))
        uvs_front[i] = [float(np.clip(u_f, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]
        uvs_back[i] = [float(np.clip(u_b, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    out_dir = './backend/public/models/verification_renders'
    full_mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals, process=False)

    rend_front = render_mesh_to_image(full_mesh, uvs_front, front_tex, width=400, height=700, rot_y_deg=0)
    rend_front.save(os.path.join(out_dir, 'real_render_front_0deg.png'), 'PNG')

    rend_back = render_mesh_to_image(full_mesh, uvs_back, back_tex, width=400, height=700, rot_y_deg=180)
    rend_back.save(os.path.join(out_dir, 'real_render_back_180deg.png'), 'PNG')

    print('Rendered aligned front and back views!')

if __name__ == '__main__':
    perfect_align_back()
