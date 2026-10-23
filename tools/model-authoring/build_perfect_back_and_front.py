import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import trimesh
from test_rasterizer import render_mesh_to_image

def create_pristine_textures():
    w, h = 2048, 2048
    jersey_royal = (2, 90, 160, 255) # Deep Rich Royal Blue #025aa0
    orange_saffron = (249, 115, 22, 255) # #f97316
    bat_wood = (215, 175, 125, 255)
    bat_wood_dark = (165, 125, 75, 255)
    grip_navy = (20, 45, 110, 255)
    hair_black = (18, 16, 14, 255)
    skin_med = (175, 120, 85, 255)
    shoe_white = (245, 248, 252, 255)
    shoe_sole = (25, 35, 50, 255)

    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)

    hero_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
    hero_back = Image.open('./backend/public/images/players/hero_IN_back.jpg').convert('RGBA')

    # =========================================================================
    # 1. PRISTINE FRONT TEXTURE (batsman_albedo.png)
    # =========================================================================
    pf = hero_front.crop((105, 120, 620, 1315))
    pf_w, pf_h = pf.size
    pf_arr = np.array(pf)

    # Inpaint text
    tx0, tx1 = int(pf_w * 0.35), int(pf_w * 0.68)
    ty0, ty1 = int(pf_h * 0.29), int(pf_h * 0.36)
    for y in range(ty0, ty1):
        for x in range(tx0, tx1):
            r, g, b = pf_arr[y, x, :3]
            if (r > 180 and g > 70 and b < 90) or (r > 200 and g > 200 and b > 200) or (r > 150 and g > 100 and b < 100):
                pf_arr[y, x, :3] = pf_arr[min(pf_h - 1, ty1 + 10), x, :3]

    mx0, mx1 = int(pf_w * 0.25), int(pf_w * 0.37)
    my0, my1 = int(pf_h * 0.24), int(pf_h * 0.28)
    for y in range(my0, my1):
        for x in range(mx0, mx1):
            r, g, b = pf_arr[y, x, :3]
            if (r > 190 and g > 190 and b > 190) or (r > 170 and g < 70 and b < 70):
                pf_arr[y, x, :3] = pf_arr[my1 + 6, x, :3]

    # Clean bottom grass/pitch lines
    grass_mask_f = (pf_arr[int(pf_h * 0.88):, :, 1] > 110) | (pf_arr[int(pf_h * 0.88):, :, 0] > 190)
    pf_arr[int(pf_h * 0.88):, :, :3][grass_mask_f] = [25, 35, 50]

    clean_f_img = Image.fromarray(pf_arr)
    front_tex = Image.new('RGBA', (w, h), jersey_royal)
    front_res = clean_f_img.resize((1980, 1980), Image.Resampling.LANCZOS)
    front_tex.paste(front_res, (34, 34))

    # Enhance front saturation & rich contrast
    enh_col = ImageEnhance.Color(front_tex)
    front_tex = enh_col.enhance(1.3)
    enh_con = ImageEnhance.Contrast(front_tex)
    front_tex = enh_con.enhance(1.15)
    enh_bri = ImageEnhance.Brightness(front_tex)
    front_tex = enh_bri.enhance(0.95)
    front_tex.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    print('Pristine front texture saved!')

    # =========================================================================
    # 2. PRISTINE BACK TEXTURE (batsman_back.png)
    # =========================================================================
    # Construct seamless back texture using the back photo elements:
    # Background is 100% pure royal blue fabric to eliminate any green grass or white bleed!
    back_tex = Image.new('RGBA', (w, h), jersey_royal)
    b_draw = ImageDraw.Draw(back_tex)

    hb_w, hb_h = hero_back.size
    # Crop player torso and head from back image
    pb = hero_back.crop((int(hb_w * 0.20), int(hb_h * 0.08), int(hb_w * 0.82), int(hb_h * 0.95)))
    pb_w, pb_h = pb.size
    pb_arr = np.array(pb)

    # In back image, mask out green grass and white pitch lines completely
    is_pitch_grass = (pb_arr[:, :, 1] > 100) & (pb_arr[:, :, 1] > pb_arr[:, :, 0] + 5) & (pb_arr[:, :, 1] > pb_arr[:, :, 2] + 5)
    is_pitch_white = (pb_arr[:, :, 0] > 190) & (pb_arr[:, :, 1] > 190) & (pb_arr[:, :, 2] > 170) & (np.arange(pb_h)[:, None] > int(pb_h * 0.45))
    is_stadium_bg = (np.arange(pb_h)[:, None] > int(pb_h * 0.25)) & (np.arange(pb_h)[:, None] < int(pb_h * 0.45)) & (pb_arr[:, :, 0] > 150) & (pb_arr[:, :, 2] > 150)

    # Replace with clean jersey royal blue
    pb_arr[is_pitch_grass] = [2, 90, 160, 255]
    pb_arr[is_pitch_white] = [2, 90, 160, 255]
    pb_arr[is_stadium_bg] = [2, 90, 160, 255]

    # Shoes sole at very bottom
    pb_arr[int(pb_h * 0.93):] = [25, 35, 50, 255]

    clean_b_img = Image.fromarray(pb_arr)
    back_res = clean_b_img.resize((1980, 1980), Image.Resampling.LANCZOS)
    back_tex.paste(back_res, (34, 34))

    # Draw sharp, clean bat wooden spine over the left shoulder (x: 100..450, y: 80..700)
    b_draw.polygon([(140, 80), (360, 80), (430, 680), (220, 680)], fill=bat_wood)
    for gy in range(90, 680, 14):
        b_draw.line([(140, gy), (430, gy)], fill=bat_wood_dark, width=3)
    b_draw.rectangle([150, 80, 260, 220], fill=grip_navy)
    for gy in range(90, 220, 10):
        b_draw.line([(150, gy), (260, gy)], fill=(40, 75, 160, 255), width=2)

    # Orange racing stripes on side of trousers
    b_draw.rectangle([100, 1100, 220, 1850], fill=orange_saffron)
    b_draw.rectangle([1780, 1100, 1900, 1850], fill=orange_saffron)

    # Pad rear straps with silver buckles
    for sy in [1420, 1580, 1740]:
        b_draw.rectangle([250, sy, 800, sy + 35], fill=grip_navy)
        b_draw.rectangle([1200, sy, 1750, sy + 35], fill=grip_navy)
        b_draw.line([(250, sy), (800, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.line([(1200, sy), (1750, sy)], fill=(255, 255, 255, 255), width=2)
        b_draw.rectangle([500, sy + 5, 570, sy + 30], fill=(220, 220, 220, 255))
        b_draw.rectangle([1400, sy + 5, 1470, sy + 30], fill=(220, 220, 220, 255))

    # Shoes heel back
    b_draw.rectangle([250, 1850, 800, 1960], fill=shoe_white)
    b_draw.rectangle([1200, 1850, 1750, 1960], fill=shoe_white)
    b_draw.rectangle([250, 1860, 800, 1910], fill=jersey_royal)
    b_draw.rectangle([1200, 1860, 1750, 1910], fill=jersey_royal)
    b_draw.rectangle([480, 1850, 540, 1930], fill=orange_saffron)
    b_draw.rectangle([1430, 1850, 1490, 1930], fill=orange_saffron)
    b_draw.rectangle([250, 1960, 800, 2000], fill=shoe_sole)
    b_draw.rectangle([1200, 1960, 1750, 2000], fill=shoe_sole)

    enh_col_b = ImageEnhance.Color(back_tex)
    back_tex = enh_col_b.enhance(1.3)
    enh_con_b = ImageEnhance.Contrast(back_tex)
    back_tex = enh_con_b.enhance(1.15)
    enh_bri_b = ImageEnhance.Brightness(back_tex)
    back_tex = enh_bri_b.enhance(0.95)
    back_tex.save(os.path.join(tex_dir, 'batsman_back.png'), 'PNG')
    print('Pristine back texture saved!')

if __name__ == '__main__':
    create_pristine_textures()
