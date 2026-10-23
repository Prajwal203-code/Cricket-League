import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def build_pro_textures(tex_dir='./backend/public/models/textures', tex_size=2048):
    os.makedirs(tex_dir, exist_ok=True)
    w, h = tex_size, tex_size

    # Colors
    jersey_royal = (2, 132, 199, 255) # Team India Royal Blue (#0284c7)
    jersey_dark = (14, 116, 178, 255)
    jersey_light = (56, 189, 248, 255)
    orange_saffron = (249, 115, 22, 255) # Saffron Orange (#f97316)
    orange_dark = (234, 88, 12, 255)
    skin_med = (180, 126, 90, 255) # Medium-brown Indian skin tone
    skin_shadow = (148, 98, 68, 255)
    skin_warm = (192, 134, 98, 255)
    hair_black = (20, 18, 16, 255)
    beard_black = (22, 20, 18, 255)
    bat_wood = (222, 186, 136, 255) # English Willow
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255) # Handle Grip
    pad_blue = (2, 132, 199, 255) # Batting Pads
    pad_highlight = (125, 211, 252, 255)
    shoe_white = (248, 250, 252, 255)
    shoe_sole = (30, 41, 59, 255)

    albedo = Image.new('RGBA', (w, h), jersey_royal)
    draw_alb = ImageDraw.Draw(albedo)

    roughness = Image.new('L', (w, h), 175) # 0.68
    draw_rough = ImageDraw.Draw(roughness)

    metallic = Image.new('L', (w, h), 0)
    draw_metal = ImageDraw.Draw(metallic)

    ao = Image.new('L', (w, h), 255)
    draw_ao = ImageDraw.Draw(ao)

    def to_px(u0, v0, u1, v1):
        return [int(u0 * w), int((1.0 - v1) * h), int(u1 * w), int((1.0 - v0) * h)]

    # =========================================================================
    # 1. HEAD, FACE, HAIR, BEARD, HEADBAND (U: [0.04..0.42], V: [0.60..0.96])
    # =========================================================================
    hb = to_px(0.04, 0.60, 0.42, 0.96)
    draw_alb.rectangle(hb, fill=skin_med)
    draw_rough.rectangle(hb, fill=135)

    # Hair Top and Crown
    hair_h = int((hb[3] - hb[1]) * 0.32)
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + hair_h], fill=hair_black)
    draw_rough.rectangle([hb[0], hb[1], hb[2], hb[1] + hair_h], fill=225)

    # Side Fade Haircut (Left and Right margins)
    fade_w = int((hb[2] - hb[0]) * 0.26)
    for fx in range(fade_w):
        t = fx / fade_w
        col = (
            int(hair_black[0]*(1-t) + skin_med[0]*t),
            int(hair_black[1]*(1-t) + skin_med[1]*t),
            int(hair_black[2]*(1-t) + skin_med[2]*t),
            255
        )
        draw_alb.line([(hb[0] + fx, hb[1] + int(hair_h*0.6)), (hb[0] + fx, hb[3] - int((hb[3]-hb[1])*0.15))], fill=col)
        draw_alb.line([(hb[2] - fx, hb[1] + int(hair_h*0.6)), (hb[2] - fx, hb[3] - int((hb[3]-hb[1])*0.15))], fill=col)

    # Headband (Royal Blue with white border lines and clean center emblem)
    band_y0 = hb[1] + int((hb[3] - hb[1]) * 0.22)
    band_y1 = band_y0 + int((hb[3] - hb[1]) * 0.12)
    band_box = [hb[0], band_y0, hb[2], band_y1]
    draw_alb.rectangle(band_box, fill=jersey_royal)
    draw_alb.line([(band_box[0], band_box[1]), (band_box[2], band_box[1])], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(band_box[0], band_box[3]), (band_box[2], band_box[3])], fill=(255, 255, 255, 255), width=5)
    # Center white sports emblem
    cx = int((band_box[0] + band_box[2]) / 2)
    draw_alb.ellipse([cx - 18, band_box[1] + 10, cx + 18, band_box[3] - 10], fill=(255, 255, 255, 255))
    draw_rough.rectangle(band_box, fill=190)

    # Stylized Facial Features (Center of Head)
    fc_cx = cx
    fc_y_base = band_y1 + 10

    # Eyebrows (Strong, defined, athletic)
    eb_y = fc_y_base + 35
    draw_alb.polygon([(fc_cx - 95, eb_y + 12), (fc_cx - 22, eb_y), (fc_cx - 20, eb_y + 18), (fc_cx - 90, eb_y + 24)], fill=beard_black)
    draw_alb.polygon([(fc_cx + 95, eb_y + 12), (fc_cx + 22, eb_y), (fc_cx + 20, eb_y + 18), (fc_cx + 90, eb_y + 24)], fill=beard_black)

    # Eyes (Confident almond shape, realistic sclera, brown iris, catchlight)
    eye_y = eb_y + 24
    for ex in [fc_cx - 55, fc_cx + 55]:
        # Sclera
        draw_alb.ellipse([ex - 28, eye_y, ex + 28, eye_y + 32], fill=(245, 245, 245, 255))
        # Dark brown Iris
        draw_alb.ellipse([ex - 16, eye_y + 2, ex + 16, eye_y + 30], fill=(62, 38, 24, 255))
        # Black Pupil
        draw_alb.ellipse([ex - 9, eye_y + 8, ex + 9, eye_y + 24], fill=(0, 0, 0, 255))
        # Catchlight
        draw_alb.ellipse([ex - 6, eye_y + 9, ex - 1, eye_y + 14], fill=(255, 255, 255, 255))
        # Eyelid crease
        draw_alb.line([(ex - 30, eye_y - 2), (ex + 30, eye_y - 2)], fill=skin_shadow, width=2)

    # Nose Bridge & Contours
    nose_y = eye_y + 32
    draw_alb.polygon([(fc_cx - 14, nose_y), (fc_cx - 20, nose_y + 65), (fc_cx + 20, nose_y + 65), (fc_cx + 14, nose_y)], fill=skin_shadow)
    draw_alb.ellipse([fc_cx - 20, nose_y + 55, fc_cx - 6, nose_y + 68], fill=(90, 50, 32, 255))
    draw_alb.ellipse([fc_cx + 6, nose_y + 55, fc_cx + 20, nose_y + 68], fill=(90, 50, 32, 255))

    # Beard & Mustache (Thick groomed black beard across jaw, chin, cheeks)
    beard_y = nose_y + 65
    beard_box = [fc_cx - 150, beard_y - 10, fc_cx + 150, hb[3] - 15]
    draw_alb.chord(beard_box, start=0, end=180, fill=beard_black)
    # Mustache
    draw_alb.chord([fc_cx - 65, beard_y - 12, fc_cx + 65, beard_y + 40], start=180, end=360, fill=beard_black)
    # Lips
    draw_alb.ellipse([fc_cx - 35, beard_y + 18, fc_cx + 35, beard_y + 42], fill=(168, 93, 88, 255))
    draw_rough.rectangle(beard_box, fill=220)

    # =========================================================================
    # 2. TEAM INDIA JERSEY & TORSO (U: [0.46..0.72], V: [0.60..0.96])
    # =========================================================================
    jb = to_px(0.46, 0.60, 0.72, 0.96)
    draw_alb.rectangle(jb, fill=jersey_royal)
    draw_rough.rectangle(jb, fill=185)

    # Breathable micro-mesh fabric texture pattern
    for py in range(jb[1], jb[3], 6):
        draw_alb.line([(jb[0], py), (jb[2], py)], fill=(10, 140, 208, 255), width=1)

    # Orange Polo Collar
    collar_h = int((jb[3] - jb[1]) * 0.16)
    draw_alb.rectangle([jb[0], jb[1], jb[2], jb[1] + collar_h], fill=orange_saffron)
    draw_alb.line([(jb[0], jb[1] + collar_h), (jb[2], jb[1] + collar_h)], fill=(255, 255, 255, 255), width=5)

    # Button Placket
    jc_x = int((jb[0] + jb[2]) / 2)
    draw_alb.rectangle([jc_x - 15, jb[1] + collar_h, jc_x + 15, jb[1] + collar_h + 85], fill=orange_saffron)
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 20, jc_x + 4, jb[1] + collar_h + 28], fill=(255, 255, 255, 255))
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 55, jc_x + 4, jb[1] + collar_h + 63], fill=(255, 255, 255, 255))

    # Orange Side Panels (Flanks)
    side_w = int((jb[2] - jb[0]) * 0.18)
    draw_alb.polygon([(jb[0], jb[1] + collar_h + 20), (jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3]), (jb[0], jb[3])], fill=orange_saffron)
    draw_alb.polygon([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2], jb[1] + collar_h + 20), (jb[2], jb[3]), (jb[2] - side_w - 20, jb[3])], fill=orange_saffron)
    draw_alb.line([(jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2] - side_w - 20, jb[3])], fill=(255, 255, 255, 255), width=3)

    # Dynamic Saffron & Cyan Chevron Athletic Graphics on Chest
    ch_y = jb[1] + collar_h + 80
    draw_alb.polygon([(jc_x - 140, ch_y + 60), (jc_x - 50, ch_y), (jc_x + 120, ch_y + 180), (jc_x + 30, ch_y + 240)], fill=(14, 165, 233, 255))
    draw_alb.polygon([(jc_x - 40, ch_y + 20), (jc_x + 20, ch_y - 20), (jc_x + 160, ch_y + 140), (jc_x + 100, ch_y + 180)], fill=orange_saffron)

    # Clean Golden Emblem on Left Chest
    crest_x = jc_x - 90
    crest_y = jb[1] + collar_h + 70
    draw_alb.ellipse([crest_x - 24, crest_y - 24, crest_x + 24, crest_y + 24], fill=(255, 215, 0, 255))
    draw_alb.ellipse([crest_x - 17, crest_y - 17, crest_x + 17, crest_y + 17], fill=jersey_royal)
    draw_alb.ellipse([crest_x - 6, crest_y - 6, crest_x + 6, crest_y + 6], fill=(255, 215, 0, 255))

    # =========================================================================
    # 3. CRICKET BAT (U: [0.76..0.98], V: [0.52..0.98])
    # =========================================================================
    bb = to_px(0.76, 0.52, 0.98, 0.98)
    draw_alb.rectangle(bb, fill=bat_wood)
    draw_rough.rectangle(bb, fill=110) # Smooth varnished wood

    # Horizontal English Willow Wood Grain Fibers
    for gy in range(bb[1] + 160, bb[3], 6):
        grain_col = bat_wood_dark if (gy % 18 == 0) else (234, 198, 150, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    # Bat Handle (Top portion with blue rubber chevron grip wrap)
    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_navy)
    draw_rough.rectangle(handle_box, fill=165)
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Professional Red & Blue Decal Stripe
    decal_y0 = bb[1] + handle_h + 30
    decal_y1 = decal_y0 + 130
    draw_alb.rectangle([bb[0] + 25, decal_y0, bb[2] - 25, decal_y0 + 65], fill=(220, 38, 38, 255))
    draw_alb.rectangle([bb[0] + 25, decal_y0 + 65, bb[2] - 25, decal_y1], fill=grip_navy)
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

    # Batting Gloves (White leather with Royal Blue padded sausage finger rolls)
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
        # Wrist Strap
        draw_alb.rectangle([gb[0], gb[3] - 30, gb[2], gb[3]], fill=grip_navy)
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
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=jersey_dark, width=6)

    # =========================================================================
    # 6. BATTING PADS (U: [0.52..0.98], V: [0.04..0.28])
    # =========================================================================
    pb = to_px(0.52, 0.04, 0.98, 0.28)
    draw_alb.rectangle(pb, fill=jersey_royal)
    draw_rough.rectangle(pb, fill=95) # Semi-gloss PU leather

    pad_w = (pb[2] - pb[0]) // 2
    for p_idx, px_start in enumerate([pb[0] + 15, pb[0] + pad_w + 15]):
        px_end = px_start + pad_w - 30
        kr_h = int((pb[3] - pb[1]) * 0.28)
        # Knee rolls at top
        draw_alb.rectangle([px_start, pb[1] + 10, px_end, pb[1] + kr_h], fill=jersey_dark)
        for ky in [pb[1] + 20, pb[1] + int(kr_h*0.55), pb[1] + kr_h - 10]:
            draw_alb.line([(px_start, ky), (px_end, ky)], fill=(255, 255, 255, 255), width=4)

        # 7 Vertical Cane Padded Ribs
        rib_w = (px_end - px_start) // 7
        for r in range(7):
            rx0 = px_start + r * rib_w + 4
            rx1 = rx0 + rib_w - 8
            # Padded cane contour gradient
            draw_alb.rectangle([rx0, pb[1] + kr_h + 10, rx1, pb[3] - 15], fill=pad_highlight)
            draw_alb.line([(rx0, pb[1] + kr_h + 10), (rx0, pb[3] - 15)], fill=jersey_dark, width=2)
            draw_alb.line([(rx1, pb[1] + kr_h + 10), (rx1, pb[3] - 15)], fill=jersey_dark, width=2)
            draw_alb.line([(int((rx0+rx1)/2), pb[1] + kr_h + 10), (int((rx0+rx1)/2), pb[3] - 15)], fill=(255, 255, 255, 255), width=3)

    # =========================================================================
    # 7. CRICKET SHOES (U: [0.04..0.46], V: [0.04..0.22])
    # =========================================================================
    sb = to_px(0.04, 0.04, 0.46, 0.22)
    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    # Blue Panels & Orange Swoosh
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

    # Save
    albedo.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    normal.save(os.path.join(tex_dir, 'batsman_normal.png'), 'PNG')
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')
    print('Pro textures built successfully!')

if __name__ == '__main__':
    build_pro_textures()
