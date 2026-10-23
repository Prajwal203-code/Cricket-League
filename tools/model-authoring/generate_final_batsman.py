import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def create_master_textures(output_dir, tex_size=2048):
    os.makedirs(output_dir, exist_ok=True)
    w, h = tex_size, tex_size

    # Load high-res crop textures for sampling
    crop_head_path = os.path.join(output_dir, 'crop_head.png')
    crop_pads_path = os.path.join(output_dir, 'crop_pads.png')
    crop_jersey_path = os.path.join(output_dir, 'crop_jersey.png')

    crop_head = Image.open(crop_head_path).convert('RGBA') if os.path.exists(crop_head_path) else None
    crop_pads = Image.open(crop_pads_path).convert('RGBA') if os.path.exists(crop_pads_path) else None
    crop_jersey = Image.open(crop_jersey_path).convert('RGBA') if os.path.exists(crop_jersey_path) else None

    # Base Albedo
    jersey_royal = (2, 132, 199, 255) # #0284c7 Vibrant Team India Royal Blue
    jersey_dark = (14, 116, 178, 255)
    orange_saffron = (249, 115, 22, 255) # #f97316 Saffron Orange
    orange_rich = (234, 88, 12, 255)
    skin_med = (176, 122, 86, 255) # Medium-brown Indian skin tone
    skin_dark = (145, 95, 65, 255)

    albedo = Image.new('RGBA', (w, h), jersey_royal)
    draw_alb = ImageDraw.Draw(albedo)

    roughness = Image.new('L', (w, h), 175) # 0.68 matte fabric
    draw_rough = ImageDraw.Draw(roughness)

    metallic = Image.new('L', (w, h), 0)
    draw_metal = ImageDraw.Draw(metallic)

    ao = Image.new('L', (w, h), 255)
    draw_ao = ImageDraw.Draw(ao)

    def to_px(u0, v0, u1, v1):
        px0 = int(u0 * w)
        px1 = int(u1 * w)
        py0 = int((1.0 - v1) * h)
        py1 = int((1.0 - v0) * h)
        return [px0, py0, px1, py1]

    # =========================================================================
    # 1. HEAD & FACE & HAIR & HEADBAND (U: [0.04..0.42], V: [0.60..0.96])
    # =========================================================================
    hb = to_px(0.04, 0.60, 0.42, 0.96)
    draw_alb.rectangle(hb, fill=skin_med)
    draw_rough.rectangle(hb, fill=135)

    # Hair top & back
    hair_black = (20, 18, 16, 255)
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.30)], fill=hair_black)
    draw_rough.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.30)], fill=220)

    # Side fade
    fade_w = int((hb[2] - hb[0]) * 0.28)
    for fx in range(fade_w):
        t = fx / fade_w
        col = (
            int(hair_black[0]*(1-t) + skin_med[0]*t),
            int(hair_black[1]*(1-t) + skin_med[1]*t),
            int(hair_black[2]*(1-t) + skin_med[2]*t),
            255
        )
        draw_alb.line([(hb[0] + fx, hb[1] + int((hb[3]-hb[1])*0.18)), (hb[0] + fx, hb[3] - int((hb[3]-hb[1])*0.20))], fill=col)
        draw_alb.line([(hb[2] - fx, hb[1] + int((hb[3]-hb[1])*0.18)), (hb[2] - fx, hb[3] - int((hb[3]-hb[1])*0.20))], fill=col)

    # Paste high-res reference face seamlessly in center
    if crop_head:
        fc_w = int((hb[2] - hb[0]) * 0.58)
        fc_h = int((hb[3] - hb[1]) * 0.88)
        ch_resized = crop_head.resize((fc_w, fc_h), Image.Resampling.LANCZOS)
        fc_x = hb[0] + int((hb[2] - hb[0]) * 0.21)
        fc_y = hb[1] + int((hb[3] - hb[1]) * 0.08)

        # Soft oval mask
        f_mask = Image.new('L', (fc_w, fc_h), 0)
        dm = ImageDraw.Draw(f_mask)
        dm.ellipse([10, 10, fc_w - 10, fc_h - 10], fill=255)
        f_mask = f_mask.filter(ImageFilter.GaussianBlur(radius=8))

        albedo.paste(ch_resized, (fc_x, fc_y), f_mask)

    # Headband wrapping across full width
    band_y0 = hb[1] + int((hb[3] - hb[1]) * 0.22)
    band_y1 = band_y0 + int((hb[3] - hb[1]) * 0.11)
    band_box = [hb[0], band_y0, hb[2], band_y1]
    draw_alb.rectangle(band_box, fill=jersey_royal)
    draw_alb.line([(band_box[0], band_box[1]), (band_box[2], band_box[1])], fill=(255, 255, 255, 255), width=4)
    draw_alb.line([(band_box[0], band_box[3]), (band_box[2], band_box[3])], fill=(255, 255, 255, 255), width=4)
    # Center white sports emblem
    cx = int((band_box[0] + band_box[2]) / 2)
    draw_alb.ellipse([cx - 16, band_box[1] + 10, cx + 16, band_box[3] - 10], fill=(255, 255, 255, 255))
    draw_rough.rectangle(band_box, fill=190)

    # =========================================================================
    # 2. JERSEY & TORSO (U: [0.46..0.72], V: [0.60..0.96])
    # =========================================================================
    jb = to_px(0.46, 0.60, 0.72, 0.96)
    draw_alb.rectangle(jb, fill=jersey_royal)
    draw_rough.rectangle(jb, fill=185)

    # Orange Polo Collar
    collar_h = int((jb[3] - jb[1]) * 0.16)
    draw_alb.rectangle([jb[0], jb[1], jb[2], jb[1] + collar_h], fill=orange_saffron)
    draw_alb.line([(jb[0], jb[1] + collar_h), (jb[2], jb[1] + collar_h)], fill=(255, 255, 255, 255), width=5)

    # Placket
    jc_x = int((jb[0] + jb[2]) / 2)
    draw_alb.rectangle([jc_x - 14, jb[1] + collar_h, jc_x + 14, jb[1] + collar_h + 80], fill=orange_saffron)
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 20, jc_x + 4, jb[1] + collar_h + 28], fill=(255, 255, 255, 255))
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 55, jc_x + 4, jb[1] + collar_h + 63], fill=(255, 255, 255, 255))

    # Orange Flank Side Panels
    side_w = int((jb[2] - jb[0]) * 0.18)
    draw_alb.polygon([(jb[0], jb[1] + collar_h + 20), (jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3]), (jb[0], jb[3])], fill=orange_saffron)
    draw_alb.polygon([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2], jb[1] + collar_h + 20), (jb[2], jb[3]), (jb[2] - side_w - 20, jb[3])], fill=orange_saffron)
    draw_alb.line([(jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2] - side_w - 20, jb[3])], fill=(255, 255, 255, 255), width=3)

    # Dynamic Saffron & Cyan Chevron Athletic Stripes
    ch_y = jb[1] + collar_h + 80
    draw_alb.polygon([(jc_x - 140, ch_y + 60), (jc_x - 50, ch_y), (jc_x + 120, ch_y + 180), (jc_x + 30, ch_y + 240)], fill=(14, 165, 233, 255))
    draw_alb.polygon([(jc_x - 40, ch_y + 20), (jc_x + 20, ch_y - 20), (jc_x + 160, ch_y + 140), (jc_x + 100, ch_y + 180)], fill=orange_saffron)

    # Clean Team Crest on Left Chest (Gold wheel star)
    crest_x = jc_x - 90
    crest_y = jb[1] + collar_h + 70
    draw_alb.ellipse([crest_x - 25, crest_y - 25, crest_x + 25, crest_y + 25], fill=(255, 215, 0, 255))
    draw_alb.ellipse([crest_x - 18, crest_y - 18, crest_x + 18, crest_y + 18], fill=jersey_royal)
    draw_alb.ellipse([crest_x - 6, crest_y - 6, crest_x + 6, crest_y + 6], fill=(255, 215, 0, 255))

    # =========================================================================
    # 3. CRICKET BAT (U: [0.76..0.98], V: [0.52..0.98])
    # =========================================================================
    bb = to_px(0.76, 0.52, 0.98, 0.98)
    bat_wood_light = (218, 182, 132, 255)
    bat_wood_grain = (185, 145, 95, 255)
    grip_blue = (30, 58, 138, 255)

    draw_alb.rectangle(bb, fill=bat_wood_light)
    draw_rough.rectangle(bb, fill=110) # 0.43 smooth willow

    # Willow wood grain lines
    for gy in range(bb[1] + 160, bb[3], 8):
        grain_col = bat_wood_grain if (gy % 24 == 0) else (230, 196, 148, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    # Handle with blue rubber grip
    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_blue)
    draw_rough.rectangle(handle_box, fill=165)
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Stylized Pro Bat Color Band (No text)
    decal_y0 = bb[1] + handle_h + 30
    decal_y1 = decal_y0 + 130
    draw_alb.rectangle([bb[0] + 25, decal_y0, bb[2] - 25, decal_y0 + 65], fill=(220, 38, 38, 255))
    draw_alb.rectangle([bb[0] + 25, decal_y0 + 65, bb[2] - 25, decal_y1], fill=grip_blue)
    draw_alb.line([(bb[0] + 25, decal_y0), (bb[2] - 25, decal_y0)], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(bb[0] + 25, decal_y1), (bb[2] - 25, decal_y1)], fill=(255, 255, 255, 255), width=5)

    # =========================================================================
    # 4. ARMS & BATTING GLOVES (U: [0.04..0.42], V: [0.27..0.54])
    # =========================================================================
    ab = to_px(0.04, 0.27, 0.42, 0.54)
    draw_alb.rectangle(ab, fill=skin_med)
    draw_rough.rectangle(ab, fill=135)

    # Sleeves with orange cuffs
    sleeve_h = int((ab[3] - ab[1]) * 0.30)
    draw_alb.rectangle([ab[0], ab[1], ab[0] + 180, ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[0], ab[1] + sleeve_h - 15, ab[0] + 180, ab[1] + sleeve_h], fill=orange_saffron)

    draw_alb.rectangle([ab[2] - 180, ab[1], ab[2], ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[2] - 180, ab[1] + sleeve_h - 15, ab[2], ab[1] + sleeve_h], fill=orange_saffron)

    # Batting Gloves (White/Blue/Grey)
    glove_white = (241, 245, 249, 255)
    glove_blue = (2, 132, 199, 255)
    glove_grey = (148, 163, 184, 255)

    glove_left = [ab[0] + 15, ab[1] + int((ab[3]-ab[1])*0.48), ab[0] + 200, ab[3] - 15]
    glove_right = [ab[2] - 200, ab[1] + int((ab[3]-ab[1])*0.48), ab[2] - 15, ab[3] - 15]

    for gb in [glove_left, glove_right]:
        draw_alb.rectangle(gb, fill=glove_white)
        draw_rough.rectangle(gb, fill=100)
        # Padded sausage finger rolls
        for fy in range(gb[1] + 15, gb[3] - 35, 28):
            draw_alb.rectangle([gb[0] + 12, fy, gb[2] - 12, fy + 18], fill=glove_blue)
            draw_alb.line([(gb[0] + 12, fy), (gb[2] - 12, fy)], fill=glove_grey, width=3)
        # Wrist Cuff Strap
        draw_alb.rectangle([gb[0], gb[3] - 30, gb[2], gb[3]], fill=grip_blue)
        draw_metal.rectangle([gb[0] + 25, gb[3] - 22, gb[0] + 65, gb[3] - 8], fill=220)

    # Smartwatch on Left Wrist
    draw_alb.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.34), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.46)], fill=(30, 30, 30, 255))
    draw_metal.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.34), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.46)], fill=200)

    # =========================================================================
    # 5. TROUSERS (U: [0.46..0.72], V: [0.26..0.54])
    # =========================================================================
    tb = to_px(0.46, 0.26, 0.72, 0.54)
    draw_alb.rectangle(tb, fill=jersey_royal)
    draw_rough.rectangle(tb, fill=185)

    stripe_w = int((tb[2] - tb[0]) * 0.12)
    draw_alb.rectangle([tb[0] + 8, tb[1], tb[0] + 8 + stripe_w, tb[3]], fill=orange_saffron)
    draw_alb.rectangle([tb[2] - 8 - stripe_w, tb[1], tb[2] - 8, tb[3]], fill=orange_saffron)
    draw_alb.line([(tb[0] + 8 + stripe_w, tb[1]), (tb[0] + 8 + stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(tb[2] - 8 - stripe_w, tb[1]), (tb[2] - 8 - stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)

    # Waistband stitching
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=jersey_dark, width=6)

    # =========================================================================
    # 6. BATTING PADS (U: [0.52..0.98], V: [0.04..0.28])
    # =========================================================================
    pb = to_px(0.52, 0.04, 0.98, 0.28)
    draw_alb.rectangle(pb, fill=jersey_royal)
    draw_rough.rectangle(pb, fill=95) # 0.37 semi-gloss PU pad

    # If reference crop_pads available, sample rich shading
    pad_w = (pb[2] - pb[0]) // 2
    if crop_pads:
        # Sample left and right pads
        cp_resized = crop_pads.resize((pb[2]-pb[0], pb[3]-pb[1]), Image.Resampling.LANCZOS)
        # Remove any text from bottom by overlaying pure blue pad finish
        draw_cp = ImageDraw.Draw(cp_resized)
        draw_cp.rectangle([0, int((pb[3]-pb[1])*0.75), pb[2]-pb[0], pb[3]-pb[1]], fill=jersey_royal)
        albedo.paste(cp_resized, (pb[0], pb[1]))
    else:
        for p_idx, px_start in enumerate([pb[0] + 15, pb[0] + pad_w + 15]):
            px_end = px_start + pad_w - 30
            kr_h = int((pb[3] - pb[1]) * 0.28)
            draw_alb.rectangle([px_start, pb[1] + 10, px_end, pb[1] + kr_h], fill=jersey_dark)
            for ky in [pb[1] + 20, pb[1] + int(kr_h*0.55), pb[1] + kr_h - 10]:
                draw_alb.line([(px_start, ky), (px_end, ky)], fill=(255, 255, 255, 255), width=4)

            rib_w = (px_end - px_start) // 7
            for r in range(7):
                rx0 = px_start + r * rib_w + 4
                rx1 = rx0 + rib_w - 8
                draw_alb.rectangle([rx0, pb[1] + kr_h + 10, rx1, pb[3] - 15], fill=(125, 211, 252, 255))
                draw_alb.line([(rx0, pb[1] + kr_h + 10), (rx0, pb[3] - 15)], fill=jersey_dark, width=2)
                draw_alb.line([(rx1, pb[1] + kr_h + 10), (rx1, pb[3] - 15)], fill=jersey_dark, width=2)
                draw_alb.line([(int((rx0+rx1)/2), pb[1] + kr_h + 10), (int((rx0+rx1)/2), pb[3] - 15)], fill=(255, 255, 255, 255), width=3)

    # =========================================================================
    # 7. CRICKET SHOES (U: [0.04..0.46], V: [0.04..0.22])
    # =========================================================================
    sb = to_px(0.04, 0.04, 0.46, 0.22)
    shoe_white = (248, 250, 252, 255)
    shoe_sole = (30, 41, 59, 255)

    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    draw_alb.rectangle([sb[0] + 15, sb[1] + 15, sb[2] - 15, sb[1] + int((sb[3]-sb[1])*0.50)], fill=jersey_royal)
    draw_alb.polygon([
        (sb[0] + 40, sb[1] + 45),
        (sb[2] - 40, sb[1] + 30),
        (sb[2] - 60, sb[1] + 65),
        (sb[0] + 30, sb[1] + 75)
    ], fill=orange_saffron)

    # Midsole
    ms_y0 = sb[3] - int((sb[3]-sb[1])*0.32)
    ms_y1 = sb[3] - int((sb[3]-sb[1])*0.12)
    draw_alb.rectangle([sb[0], ms_y0, sb[2], ms_y1], fill=(255, 255, 255, 255))

    # Outsole & Spikes
    draw_alb.rectangle([sb[0], ms_y1, sb[2], sb[3]], fill=shoe_sole)
    for spx in range(sb[0] + 15, sb[2], 25):
        draw_alb.rectangle([spx, sb[3] - 10, spx + 12, sb[3]], fill=(15, 23, 42, 255))

    # =========================================================================
    # HIGH-FREQUENCY NORMAL MAP
    # =========================================================================
    gray = albedo.convert('L')
    gray_np = np.array(gray, dtype=np.float32)

    gx = np.zeros_like(gray_np)
    gy = np.zeros_like(gray_np)

    gx[:, 1:-1] = (gray_np[:, 2:] - gray_np[:, :-2]) * 0.5
    gy[1:-1, :] = (gray_np[2:, :] - gray_np[:-2, :]) * 0.5

    bump_strength = 2.4
    nx = -gx * bump_strength
    ny = -gy * bump_strength
    nz = 255.0

    len_n = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx_norm = (nx / len_n * 127.5 + 127.5).astype(np.uint8)
    ny_norm = (ny / len_n * 127.5 + 127.5).astype(np.uint8)
    nz_norm = (nz / len_n * 127.5 + 127.5).astype(np.uint8)

    normal_np = np.stack([nx_norm, ny_norm, nz_norm], axis=-1)
    normal = Image.fromarray(normal_np, 'RGB')

    # Add cloth weave noise
    noise = np.random.randint(-4, 5, (h, w), dtype=np.int16)
    normal_arr = np.array(normal, dtype=np.int16)
    normal_arr[:, :, 0] = np.clip(normal_arr[:, :, 0] + noise, 0, 255)
    normal_arr[:, :, 1] = np.clip(normal_arr[:, :, 1] + noise, 0, 255)
    normal = Image.fromarray(normal_arr.astype(np.uint8), 'RGB')

    # =========================================================================
    # AO MAP
    # =========================================================================
    draw_ao.rectangle([jb[0], jb[1], jb[2], jb[1] + 25], fill=140)
    draw_ao.rectangle([tb[0], tb[1], tb[2], tb[1] + 35], fill=160)
    draw_ao.rectangle([pb[0], pb[1] + 60, pb[2], pb[1] + 75], fill=150)
    ao = ao.filter(ImageFilter.GaussianBlur(radius=8))

    # Save textures
    albedo.save(os.path.join(output_dir, 'batsman_albedo.png'), 'PNG')
    normal.save(os.path.join(output_dir, 'batsman_normal.png'), 'PNG')
    roughness.save(os.path.join(output_dir, 'batsman_roughness.png'), 'PNG')
    metallic.save(os.path.join(output_dir, 'batsman_metallic.png'), 'PNG')
    ao.save(os.path.join(output_dir, 'batsman_ao.png'), 'PNG')
    print('Generated master PBR textures successfully!')

def compute_uvs(mesh):
    verts = mesh.vertices
    N = len(verts)
    uvs = np.zeros((N, 2), dtype=np.float32)
    head_center_z = 0.04

    for i in range(N):
        x, y, z = verts[i]
        if y <= -0.85: # Shoes
            u_rel = (x + 0.35) / 0.70
            v_rel = (y + 1.02) / 0.18
            u = 0.04 + np.clip(u_rel, 0.0, 1.0) * 0.42
            v = 0.04 + np.clip(v_rel, 0.0, 1.0) * 0.18
        elif y <= -0.30: # Pads & Trousers Lower
            if z >= -0.04:
                if x < 0:
                    u_pad = (x + 0.25) / 0.25
                    u = 0.52 + np.clip(u_pad, 0.0, 1.0) * 0.21
                else:
                    u_pad = x / 0.25
                    u = 0.75 + np.clip(u_pad, 0.0, 1.0) * 0.21
                v_pad = (y + 0.85) / 0.55
                v = 0.04 + np.clip(v_pad, 0.0, 1.0) * 0.22
            else:
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.85) / 0.55
                u = 0.46 + np.clip(u_tr, 0.0, 1.0) * 0.26
                v = 0.26 + np.clip(v_tr, 0.0, 1.0) * 0.14
        elif y <= 0.10: # Trousers Upper & Left Glove
            if x < -0.22 and y <= 0.05:
                u_gl = (x + 0.42) / 0.20
                v_gl = (y + 0.25) / 0.30
                u = 0.04 + np.clip(u_gl, 0.0, 1.0) * 0.18
                v = 0.27 + np.clip(v_gl, 0.0, 1.0) * 0.18
            else:
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.30) / 0.40
                u = 0.46 + np.clip(u_tr, 0.0, 1.0) * 0.26
                v = 0.38 + np.clip(v_tr, 0.0, 1.0) * 0.15
        elif y <= 0.55: # Jersey, Arms, Bat Lower
            if x > 0.14 and z < 0.05 and y > 0.32:
                v_bat = (y - 0.32) / 0.70
                u_bat = (x - 0.14) / 0.28
                u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
                v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44
            elif x > 0.14:
                u_arm = (x - 0.14) / 0.26
                v_arm = (y - 0.10) / 0.45
                u = 0.24 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.27 + np.clip(v_arm, 0.0, 1.0) * 0.25
            elif x < -0.20:
                u_arm = (x + 0.42) / 0.22
                v_arm = (y - 0.10) / 0.45
                u = 0.04 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.35 + np.clip(v_arm, 0.0, 1.0) * 0.18
            else:
                u_j = (x + 0.20) / 0.40
                v_j = (y - 0.10) / 0.45
                u = 0.46 + np.clip(u_j, 0.0, 1.0) * 0.26
                v = 0.60 + np.clip(v_j, 0.0, 1.0) * 0.36
        elif y <= 0.88: # Head & Bat Blade
            if x > 0.08 and z < 0.05:
                v_bat = (y - 0.32) / 0.70
                u_bat = (x - 0.08) / 0.32
                u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
                v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44
            else:
                angle = math.atan2(x, z - head_center_z)
                u_head = (angle + math.pi) / (2 * math.pi)
                v_head = (y - 0.55) / 0.33
                u = 0.04 + np.clip(u_head, 0.0, 1.0) * 0.38
                v = 0.60 + np.clip(v_head, 0.0, 1.0) * 0.36
        else: # Bat Tip
            v_bat = (y - 0.32) / 0.70
            u_bat = (x - 0.05) / 0.35
            u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
            v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44

        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    return uvs

def build_pbr_glb(input_glb, output_glb, output_dir):
    print(f'Loading original base mesh: {input_glb}')
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)

    # Compute UVs
    uvs = compute_uvs(mesh)

    # Create Binary Buffer
    # BufferViews:
    # 0: Indices (uint32)
    # 1: Positions (vec3 float32)
    # 2: Normals (vec3 float32)
    # 3: TexCoords (vec2 float32)
    
    indices_bytes = faces.flatten().tobytes()
    pos_bytes = verts.flatten().tobytes()
    norm_bytes = normals.flatten().tobytes()
    uv_bytes = uvs.flatten().tobytes()

    bin_data = indices_bytes + pos_bytes + norm_bytes + uv_bytes
    # Pad to 4-byte boundary
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
            "generator": "Cricket Strike PBR Engine"
        },
        "scene": 0,
        "scenes": [
            {
                "nodes": [0]
            }
        ],
        "nodes": [
            {
                "name": "Batsman_PBR",
                "mesh": 0
            }
        ],
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
                    "metallicFactor": 0.1,
                    "roughnessFactor": 0.65
                },
                "doubleSided": True
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "byteOffset": 0,
                "componentType": 5125, # UNSIGNED_INT
                "count": len(faces) * 3,
                "type": "SCALAR",
                "max": [int(verts.shape[0] - 1)],
                "min": [0]
            },
            {
                "bufferView": 1,
                "byteOffset": 0,
                "componentType": 5126, # FLOAT
                "count": len(verts),
                "type": "VEC3",
                "max": verts.max(axis=0).tolist(),
                "min": verts.min(axis=0).tolist()
            },
            {
                "bufferView": 2,
                "byteOffset": 0,
                "componentType": 5126, # FLOAT
                "count": len(normals),
                "type": "VEC3",
                "max": normals.max(axis=0).tolist(),
                "min": normals.min(axis=0).tolist()
            },
            {
                "bufferView": 3,
                "byteOffset": 0,
                "componentType": 5126, # FLOAT
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
                "target": 34963 # ELEMENT_ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": offset1,
                "byteLength": len1,
                "target": 34962 # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": offset2,
                "byteLength": len2,
                "target": 34962 # ARRAY_BUFFER
            },
            {
                "buffer": 0,
                "byteOffset": offset3,
                "byteLength": len3,
                "target": 34962 # ARRAY_BUFFER
            }
        ],
        "buffers": [
            {
                "byteLength": len(bin_data)
            }
        ]
    }

    json_str = json.dumps(gltf_json)
    json_bytes = json_str.encode('utf-8')
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * json_pad

    # GLB Header: magic (4), version (4), length (4)
    glb_len = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
    header = struct.pack('<4sII', b'glTF', 2, glb_len)

    # Chunk 0: JSON
    chunk0_header = struct.pack('<II', len(json_bytes), 0x4E4F534A) # 'JSON'
    # Chunk 1: BIN
    chunk1_header = struct.pack('<II', len(bin_data), 0x004E4942) # 'BIN\0'

    with open(output_glb, 'wb') as f:
        f.write(header)
        f.write(chunk0_header)
        f.write(json_bytes)
        f.write(chunk1_header)
        f.write(bin_data)

    print(f'Successfully built PBR GLB model: {output_glb}')
    print(f'  Vertices: {len(verts)} (100% original base mesh preserved)')
    print(f'  Faces: {len(faces)}')
    print(f'  UV coordinates assigned: {len(uvs)}')
    print(f'  Normals computed: {len(normals)}')

if __name__ == '__main__':
    tex_dir = './backend/public/models/textures'
    create_master_textures(tex_dir, tex_size=2048)

    in_glb = './backend/public/models/batsman.glb'
    out_glb = './backend/public/models/batsman.glb'
    build_pbr_glb(in_glb, out_glb, tex_dir)
