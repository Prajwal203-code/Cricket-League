import os
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageDraw
import trimesh

def process_side_texture():
    tex_dir = './backend/public/models/textures'
    w, h = 2048, 2048
    jersey_royal = (2, 90, 160, 255)

    src_side = './backend/public/images/players/hero_IN_side.jpg'
    side_img = Image.open(src_side).convert('RGBA')
    sw, sh = side_img.size

    # Crop player from side image
    ps = side_img.crop((int(sw * 0.15), int(sh * 0.08), int(sw * 0.78), int(sh * 0.95)))
    ps_w, ps_h = ps.size
    ps_arr = np.array(ps)

    # Clean background grass and stadium from side image
    y_indices = np.arange(ps_h)[:, None]
    is_grass_ground = (y_indices > int(ps_h * 0.50)) & (
        ((ps_arr[:, :, 1] > 110) & (ps_arr[:, :, 1] > ps_arr[:, :, 2] + 10)) | 
        ((ps_arr[:, :, 0] > 140) & (ps_arr[:, :, 1] > 130) & (ps_arr[:, :, 2] < 120)) |
        ((ps_arr[:, :, 0] > 180) & (ps_arr[:, :, 1] > 180) & (ps_arr[:, :, 2] > 160))
    )
    is_stadium_crowd = (y_indices > int(ps_h * 0.18)) & (y_indices < int(ps_h * 0.45)) & ((ps_arr[:, :, 0] > 120) & (ps_arr[:, :, 1] > 80) & (ps_arr[:, :, 2] < 120))

    ps_arr[is_grass_ground] = [2, 90, 160, 255]
    ps_arr[is_stadium_crowd] = [2, 90, 160, 255]

    # Clean grass below shoe sole
    ps_arr[int(ps_h * 0.94):, :, :3] = [25, 35, 50]

    clean_s_img = Image.fromarray(ps_arr)

    side_tex = Image.new('RGBA', (w, h), jersey_royal)
    side_res = clean_s_img.resize((1980, 1980), Image.Resampling.LANCZOS)
    side_tex.paste(side_res, (34, 34))

    # Enhance saturation & contrast
    enh_col = ImageEnhance.Color(side_tex)
    side_tex = enh_col.enhance(1.3)
    enh_con = ImageEnhance.Contrast(side_tex)
    side_tex = enh_con.enhance(1.15)
    enh_bri = ImageEnhance.Brightness(side_tex)
    side_tex = enh_bri.enhance(0.95)

    side_tex.save(os.path.join(tex_dir, 'batsman_side.png'), 'PNG')
    print('Pristine batsman_side.png saved!')

if __name__ == '__main__':
    process_side_texture()
