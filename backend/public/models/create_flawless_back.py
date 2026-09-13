import os
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageDraw

def create_flawless_back():
    tex_dir = './backend/public/models/textures'
    w, h = 2048, 2048
    jersey_royal = (2, 90, 160, 255) # Deep Royal Blue
    
    hero_back = Image.open('./backend/public/images/players/hero_IN_back.jpg').convert('RGBA')
    
    # 1. Horizontally mirror hero_back so the right shoulder / bat aligns with the 3D stance
    hero_back_mirrored = hero_back.transpose(Image.FLIP_LEFT_RIGHT)
    
    hb_w, hb_h = hero_back_mirrored.size
    # Crop player
    pb = hero_back_mirrored.crop((int(hb_w * 0.17), int(hb_h * 0.07), int(hb_w * 0.81), int(hb_h * 0.94)))
    pb_w, pb_h = pb.size
    pb_arr = np.array(pb)

    # Clean all background grass and ground:
    y_indices = np.arange(pb_h)[:, None]
    is_grass_ground = (y_indices > int(pb_h * 0.50)) & (
        ((pb_arr[:, :, 1] > 110) & (pb_arr[:, :, 1] > pb_arr[:, :, 2] + 10)) | 
        ((pb_arr[:, :, 0] > 140) & (pb_arr[:, :, 1] > 130) & (pb_arr[:, :, 2] < 120)) |
        ((pb_arr[:, :, 0] > 180) & (pb_arr[:, :, 1] > 180) & (pb_arr[:, :, 2] > 160))
    )
    pb_arr[is_grass_ground] = [2, 90, 160, 255]

    # Shoes sole dark turf
    pb_arr[int(pb_h * 0.92):] = [25, 35, 50, 255]

    clean_b_img = Image.fromarray(pb_arr)
    
    # 2. Master 2048x2048 Back Texture
    back_tex = Image.new('RGBA', (w, h), jersey_royal)
    back_res = clean_b_img.resize((1980, 1980), Image.Resampling.LANCZOS)
    back_tex.paste(back_res, (34, 34))

    # Enhance Saturation & Contrast
    enh_col = ImageEnhance.Color(back_tex)
    back_tex = enh_col.enhance(1.3)
    enh_con = ImageEnhance.Contrast(back_tex)
    back_tex = enh_con.enhance(1.15)
    enh_bri = ImageEnhance.Brightness(back_tex)
    back_tex = enh_bri.enhance(0.95)
    
    back_tex.save(os.path.join(tex_dir, 'batsman_back.png'), 'PNG')
    print('Flawless back texture saved!')

if __name__ == '__main__':
    create_flawless_back()
