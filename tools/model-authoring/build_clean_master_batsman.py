import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def generate_clean_master():
    # -------------------------------------------------------------
    # 1. Load Original Base Mesh
    # -------------------------------------------------------------
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    print(f'Base mesh loaded: {N} vertices, {len(faces)} faces')

    # Bounding box
    x_min, x_max = verts[:,0].min(), verts[:,0].max() # -0.422 .. 0.407
    y_min, y_max = verts[:,1].min(), verts[:,1].max() # -1.003 .. 1.001
    z_min, z_max = verts[:,2].min(), verts[:,2].max() # -0.349 .. 0.362

    # -------------------------------------------------------------
    # 2. Master 2048 x 2048 Texture Atlas Creation
    # -------------------------------------------------------------
    tex_dir = './backend/public/models/textures'
    os.makedirs(tex_dir, exist_ok=True)
    w, h = 2048, 2048

    jersey_royal = (2, 132, 199, 255) # #0284c7 Team India Blue
    jersey_dark = (14, 116, 178, 255)
    orange_saffron = (249, 115, 22, 255) # #f97316 Saffron Orange
    orange_dark = (234, 88, 12, 255)
    skin_med = (180, 126, 90, 255)
    hair_black = (20, 18, 16, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)
    pad_blue = (2, 132, 199, 255)
    pad_highlight = (125, 211, 252, 255)
    pad_white = (248, 250, 252, 255)
    shoe_white = (248, 250, 252, 255)
    shoe_sole = (30, 41, 59, 255)

    albedo = Image.new('RGBA', (w, h), jersey_royal)
    draw_alb = ImageDraw.Draw(albedo)

    roughness = Image.new('L', (w, h), 175)
    draw_rough = ImageDraw.Draw(roughness)

    metallic = Image.new('L', (w, h), 0)
    draw_metal = ImageDraw.Draw(metallic)

    ao = Image.new('L', (w, h), 255)
    draw_ao = ImageDraw.Draw(ao)

    def to_px(u0, v0, u1, v1):
        # WebGL texture coords: v=1 is top, v=0 is bottom
        px0 = int(u0 * w)
        px1 = int(u1 * w)
        py0 = int((1.0 - v1) * h)
        py1 = int((1.0 - v0) * h)
        return [px0, py0, px1, py1]

    # =========================================================================
    # ZONE 1: HEAD, FACE, HAIR, BEARD, HEADBAND (Top-Left: U:[0.02..0.48], V:[0.52..0.98])
    # =========================================================================
    hb = to_px(0.02, 0.52, 0.48, 0.98)
    draw_alb.rectangle(hb, fill=skin_med)
    draw_rough.rectangle(hb, fill=135)

    # Hair (Top & Back)
    hair_h = int((hb[3] - hb[1]) * 0.32)
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + hair_h], fill=hair_black)
    draw_rough.rectangle([hb[0], hb[1], hb[2], hb[1] + hair_h], fill=225)

    # Hair side fade (temples)
    fade_w = int((hb[2] - hb[0]) * 0.28)
    for fx in range(fade_w):
        t = fx / fade_w
        c = (
            int(hair_black[0]*(1-t) + skin_med[0]*t),
            int(hair_black[1]*(1-t) + skin_med[1]*t),
            int(hair_black[2]*(1-t) + skin_med[2]*t),
            255
        )
        draw_alb.line([(hb[0] + fx, hb[1] + int(hair_h*0.5)), (hb[0] + fx, hb[3] - 40)], fill=c)
        draw_alb.line([(hb[2] - fx, hb[1] + int(hair_h*0.5)), (hb[2] - fx, hb[3] - 40)], fill=c)

    # Clean Headband wrapping across full width
    band_y0 = hb[1] + int((hb[3] - hb[1]) * 0.22)
    band_y1 = band_y0 + int((hb[3] - hb[1]) * 0.11)
    band_box = [hb[0], band_y0, hb[2], band_y1]
    draw_alb.rectangle(band_box, fill=jersey_royal)
    draw_alb.line([(band_box[0], band_box[1]), (band_box[2], band_box[1])], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(band_box[0], band_box[3]), (band_box[2], band_box[3])], fill=(255, 255, 255, 255), width=5)

    # Center white emblem on headband
    hc_x = int((hb[0] + hb[2]) / 2)
    draw_alb.ellipse([hc_x - 18, band_y0 + 10, hc_x + 18, band_y1 - 10], fill=(255, 255, 255, 255))
    draw_rough.rectangle(band_box, fill=190)

    # Clean Indian Cricketer Facial Features (Center of Head Island)
    # Eyebrows (Strong, defined, athletic)
    eb_y = band_y1 + 35
    draw_alb.polygon([(hc_x - 110, eb_y + 12), (hc_x - 25, eb_y), (hc_x - 22, eb_y + 20), (hc_x - 105, eb_y + 26)], fill=hair_black)
    draw_alb.polygon([(hc_x + 110, eb_y + 12), (hc_x + 25, eb_y), (hc_x + 22, eb_y + 20), (hc_x + 105, eb_y + 26)], fill=hair_black)

    # Eyes (Confident almond shape, realistic dark brown iris, pupil, catchlight)
    eye_y = eb_y + 25
    for ex in [hc_x - 65, hc_x + 65]:
        draw_alb.ellipse([ex - 35, eye_y, ex + 35, eye_y + 36], fill=(245, 245, 245, 255))
        draw_alb.ellipse([ex - 20, eye_y + 2, ex + 20, eye_y + 34], fill=(62, 38, 24, 255))
        draw_alb.ellipse([ex - 10, eye_y + 9, ex + 10, eye_y + 27], fill=(0, 0, 0, 255))
        draw_alb.ellipse([ex - 7, eye_y + 10, ex - 2, eye_y + 15], fill=(255, 255, 255, 255))
        draw_alb.line([(ex - 36, eye_y - 2), (ex + 36, eye_y - 2)], fill=(140, 90, 60, 255), width=3)

    # Nose Bridge & Contours
    nose_y = eye_y + 35
    draw_alb.polygon([(hc_x - 16, nose_y), (hc_x - 24, nose_y + 70), (hc_x + 24, nose_y + 70), (hc_x + 16, nose_y)], fill=(155, 102, 70, 255))
    draw_alb.ellipse([hc_x - 24, nose_y + 60, hc_x - 8, nose_y + 74], fill=(95, 52, 34, 255))
    draw_alb.ellipse([hc_x + 8, nose_y + 60, hc_x + 24, nose_y + 74], fill=(95, 52, 34, 255))

    # Beard & Mustache (Thick groomed black beard across jaw, chin, cheeks)
    beard_y = nose_y + 68
    beard_box = [hc_x - 170, beard_y - 10, hc_x + 170, hb[3] - 15]
    draw_alb.chord(beard_box, start=0, end=180, fill=hair_black)
    # Mustache
    draw_alb.chord([hc_x - 75, beard_y - 12, hc_x + 75, beard_y + 42], start=180, end=360, fill=hair_black)
    # Natural Lips
    draw_alb.ellipse([hc_x - 40, beard_y + 20, hc_x + 40, beard_y + 46], fill=(168, 93, 88, 255))
    draw_rough.rectangle(beard_box, fill=220)

    # =========================================================================
    # ZONE 2: JERSEY & TORSO (Top-Right: U:[0.52..0.98], V:[0.52..0.98])
    # =========================================================================
    jb = to_px(0.52, 0.52, 0.98, 0.98)
    draw_alb.rectangle(jb, fill=jersey_royal)
    draw_rough.rectangle(jb, fill=185)

    # Micro-mesh sports fabric weave
    for py in range(jb[1], jb[3], 6):
        draw_alb.line([(jb[0], py), (jb[2], py)], fill=(10, 140, 208, 255), width=1)

    # Saffron Orange Polo Collar Band
    collar_h = int((jb[3] - jb[1]) * 0.16)
    draw_alb.rectangle([jb[0], jb[1], jb[2], jb[1] + collar_h], fill=orange_saffron)
    draw_alb.line([(jb[0], jb[1] + collar_h), (jb[2], jb[1] + collar_h)], fill=(255, 255, 255, 255), width=5)

    # Button Placket (Clean)
    jc_x = int((jb[0] + jb[2]) / 2)
    draw_alb.rectangle([jc_x - 15, jb[1] + collar_h, jc_x + 15, jb[1] + collar_h + 90], fill=orange_saffron)
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 22, jc_x + 4, jb[1] + collar_h + 30], fill=(255, 255, 255, 255))
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 60, jc_x + 4, jb[1] + collar_h + 68], fill=(255, 255, 255, 255))

    # Saffron Orange Flank Side Panels
    side_w = int((jb[2] - jb[0]) * 0.18)
    draw_alb.polygon([(jb[0], jb[1] + collar_h + 20), (jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 25, jb[3]), (jb[0], jb[3])], fill=orange_saffron)
    draw_alb.polygon([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2], jb[1] + collar_h + 20), (jb[2], jb[3]), (jb[2] - side_w - 25, jb[3])], fill=orange_saffron)
    draw_alb.line([(jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 25, jb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2] - side_w - 25, jb[3])], fill=(255, 255, 255, 255), width=3)

    # Dynamic Saffron & Cyan Chevron Athletic Graphics on Chest (No text)
    ch_y = jb[1] + collar_h + 80
    draw_alb.polygon([(jc_x - 180, ch_y + 80), (jc_x - 60, ch_y), (jc_x + 160, ch_y + 220), (jc_x + 40, ch_y + 300)], fill=(14, 165, 233, 255))
    draw_alb.polygon([(jc_x - 50, ch_y + 25), (jc_x + 30, ch_y - 25), (jc_x + 210, ch_y + 175), (jc_x + 130, ch_y + 225)], fill=orange_saffron)

    # Clean Golden Team Crest on Left Chest
    crest_x = jc_x - 110
    crest_y = jb[1] + collar_h + 75
    draw_alb.ellipse([crest_x - 26, crest_y - 26, crest_x + 26, crest_y + 26], fill=(255, 215, 0, 255))
    draw_alb.ellipse([crest_x - 18, crest_y - 18, crest_x + 18, crest_y + 18], fill=jersey_royal)
    draw_alb.ellipse([crest_x - 6, crest_y - 6, crest_x + 6, crest_y + 6], fill=(255, 215, 0, 255))

    # =========================================================================
    # ZONE 3: CRICKET BAT (U:[0.78..0.98], V:[0.02..0.48])
    # =========================================================================
    bb = to_px(0.78, 0.02, 0.98, 0.48)
    draw_alb.rectangle(bb, fill=bat_wood)
    draw_rough.rectangle(bb, fill=110) # 0.43 smooth willow

    # Horizontal English Willow Wood Grain Fibers
    for gy in range(bb[1] + 160, bb[3], 6):
        grain_col = bat_wood_dark if (gy % 18 == 0) else (234, 198, 150, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    # Handle Grip (Navy blue chevron rubber)
    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_navy)
    draw_rough.rectangle(handle_box, fill=165)
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Pro Decal Stripe (Clean Red & Blue band without branding text)
    decal_y0 = bb[1] + handle_h + 30
    decal_y1 = decal_y0 + 130
    draw_alb.rectangle([bb[0] + 20, decal_y0, bb[2] - 20, decal_y0 + 65], fill=(220, 38, 38, 255))
    draw_alb.rectangle([bb[0] + 20, decal_y0 + 65, bb[2] - 20, decal_y1], fill=grip_navy)
    draw_alb.line([(bb[0] + 20, decal_y0), (bb[2] - 20, decal_y0)], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(bb[0] + 20, decal_y1), (bb[2] - 20, decal_y1)], fill=(255, 255, 255, 255), width=5)

    # =========================================================================
    # ZONE 4: ARMS & BATTING GLOVES (U:[0.02..0.38], V:[0.26..0.50])
    # =========================================================================
    ab = to_px(0.02, 0.26, 0.38, 0.50)
    draw_alb.rectangle(ab, fill=skin_med)
    draw_rough.rectangle(ab, fill=135)

    # Sleeves with orange cuffs
    sleeve_h = int((ab[3] - ab[1]) * 0.30)
    draw_alb.rectangle([ab[0], ab[1], ab[0] + 180, ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[0], ab[1] + sleeve_h - 15, ab[0] + 180, ab[1] + sleeve_h], fill=orange_saffron)

    draw_alb.rectangle([ab[2] - 180, ab[1], ab[2], ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[2] - 180, ab[1] + sleeve_h - 15, ab[2], ab[1] + sleeve_h], fill=orange_saffron)

    # Batting Gloves (White/Blue/Grey with padded sausage finger rolls)
    glove_white = (241, 245, 249, 255)
    glove_blue = (2, 132, 199, 255)
    glove_grey = (148, 163, 184, 255)

    glove_left = [ab[0] + 15, ab[1] + int((ab[3]-ab[1])*0.48), ab[0] + 200, ab[3] - 15]
    glove_right = [ab[2] - 200, ab[1] + int((ab[3]-ab[1])*0.48), ab[2] - 15, ab[3] - 15]

    for gb in [glove_left, glove_right]:
        draw_alb.rectangle(gb, fill=glove_white)
        draw_rough.rectangle(gb, fill=100)
        for fy in range(gb[1] + 15, gb[3] - 35, 28):
            draw_alb.rectangle([gb[0] + 12, fy, gb[2] - 12, fy + 18], fill=glove_blue)
            draw_alb.line([(gb[0] + 12, fy), (gb[2] - 12, fy)], fill=glove_grey, width=3)
        draw_alb.rectangle([gb[0], gb[3] - 30, gb[2], gb[3]], fill=grip_navy)
        draw_metal.rectangle([gb[0] + 25, gb[3] - 22, gb[0] + 65, gb[3] - 8], fill=220)

    # Smartwatch on Left Wrist
    draw_alb.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.34), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.46)], fill=(30, 30, 30, 255))
    draw_metal.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.34), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.46)], fill=200)

    # =========================================================================
    # ZONE 5: TROUSERS (U:[0.38..0.76], V:[0.26..0.50])
    # =========================================================================
    tb = to_px(0.38, 0.26, 0.76, 0.50)
    draw_alb.rectangle(tb, fill=jersey_royal)
    draw_rough.rectangle(tb, fill=185)

    stripe_w = int((tb[2] - tb[0]) * 0.10)
    draw_alb.rectangle([tb[0] + 8, tb[1], tb[0] + 8 + stripe_w, tb[3]], fill=orange_saffron)
    draw_alb.rectangle([tb[2] - 8 - stripe_w, tb[1], tb[2] - 8, tb[3]], fill=orange_saffron)
    draw_alb.line([(tb[0] + 8 + stripe_w, tb[1]), (tb[0] + 8 + stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(tb[2] - 8 - stripe_w, tb[1]), (tb[2] - 8 - stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=jersey_dark, width=6)

    # =========================================================================
    # ZONE 6: BATTING PADS (U:[0.38..0.76], V:[0.02..0.24])
    # =========================================================================
    pb = to_px(0.38, 0.02, 0.76, 0.24)
    draw_alb.rectangle(pb, fill=jersey_royal)
    draw_rough.rectangle(pb, fill=95) # 0.37 semi-gloss PU leather

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
            # Padded cane contour gradient (Pure royal blue with sky-blue center, NO grass, NO text)
            draw_alb.rectangle([rx0, pb[1] + kr_h + 10, rx1, pb[3] - 15], fill=pad_highlight)
            draw_alb.line([(rx0, pb[1] + kr_h + 10), (rx0, pb[3] - 15)], fill=jersey_dark, width=2)
            draw_alb.line([(rx1, pb[1] + kr_h + 10), (rx1, pb[3] - 15)], fill=jersey_dark, width=2)
            draw_alb.line([(int((rx0+rx1)/2), pb[1] + kr_h + 10), (int((rx0+rx1)/2), pb[3] - 15)], fill=pad_white, width=3)

    # =========================================================================
    # ZONE 7: CRICKET SHOES (U:[0.02..0.38], V:[0.02..0.24])
    # =========================================================================
    sb = to_px(0.02, 0.02, 0.38, 0.24)
    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    # Blue Panels & Orange Swoosh (Clean, NO grass)
    draw_alb.rectangle([sb[0] + 15, sb[1] + 15, sb[2] - 15, sb[1] + int((sb[3]-sb[1])*0.50)], fill=jersey_royal)
    draw_alb.polygon([
        (sb[0] + 40, sb[1] + 45),
        (sb[2] - 40, sb[1] + 30),
        (sb[2] - 60, sb[1] + 65),
        (sb[0] + 30, sb[1] + 75)
    ], fill=orange_saffron)

    # White Midsole
    ms_y0 = sb[3] - int((sb[3]-sb[1])*0.32)
    ms_y1 = sb[3] - int((sb[3]-sb[1])*0.12)
    draw_alb.rectangle([sb[0], ms_y0, sb[2], ms_y1], fill=(255, 255, 255, 255))

    # Dark Outsole & Turf Cleats
    draw_alb.rectangle([sb[0], ms_y1, sb[2], sb[3]], fill=shoe_sole)
    for spx in range(sb[0] + 15, sb[2], 25):
        draw_alb.rectangle([spx, sb[3] - 10, spx + 12, sb[3]], fill=(15, 23, 42, 255))

    # =========================================================================
    # NORMAL MAP & AO MAP
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

    draw_ao.rectangle([jb[0], jb[1], jb[2], jb[1] + 25], fill=140)
    draw_ao.rectangle([tb[0], tb[1], tb[2], tb[1] + 35], fill=160)
    draw_ao.rectangle([pb[0], pb[1] + 60, pb[2], pb[1] + 75], fill=150)
    ao = ao.filter(ImageFilter.GaussianBlur(radius=8))

    # Save textures
    albedo.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    normal.save(os.path.join(tex_dir, 'batsman_normal.png'), 'PNG')
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')
    print('Clean master textures saved!')

    # -------------------------------------------------------------
    # 3. High-Precision UV Mapping per Anatomical Part
    # -------------------------------------------------------------
    uvs = np.zeros((N, 2), dtype=np.float32)

    head_cx = 0.04
    head_cz = 0.04

    for i in range(N):
        x, y, z = verts[i]

        # ---------------------------------------------------------
        # Part A: BAT (Blade & Handle)
        # Bat blade is at top right: Y > 0.35, X > 0.08, Z < 0.05
        # ---------------------------------------------------------
        is_bat = (y > 0.65 and x > 0.08 and z < 0.05) or (y > 0.88) or (y > 0.35 and y <= 0.65 and x > 0.14 and z < 0.02)
        if is_bat:
            # Zone 3: [0.78..0.98] x [0.02..0.48]
            u_bat = (x - 0.08) / 0.34
            v_bat = (y - 0.35) / 0.65
            u = 0.78 + np.clip(u_bat, 0.0, 1.0) * 0.20
            v = 0.02 + np.clip(v_bat, 0.0, 1.0) * 0.46

        # ---------------------------------------------------------
        # Part B: HEAD, FACE, HAIR, BEARD, HEADBAND
        # Y in [0.55, 0.88], not bat
        # ---------------------------------------------------------
        elif y > 0.55:
            # Zone 1: [0.02..0.48] x [0.52..0.98]
            # Cylindrical angle around head center
            angle = math.atan2(x - head_cx, z - head_cz) # -pi to +pi
            # Map angle: 0 (front face) -> center of island (0.25)
            # -pi/2 (left) -> 0.12, +pi/2 (right) -> 0.38, pi/-pi (back) -> edges
            u_head = 0.5 + (angle / (2.0 * math.pi))
            v_head = (y - 0.55) / 0.33
            u = 0.02 + np.clip(u_head, 0.0, 1.0) * 0.46
            v = 0.52 + np.clip(v_head, 0.0, 1.0) * 0.46

        # ---------------------------------------------------------
        # Part C: SHOES
        # Y <= -0.85
        # ---------------------------------------------------------
        elif y <= -0.85:
            # Zone 7: [0.02..0.38] x [0.02..0.24]
            u_shoe = (x + 0.35) / 0.70
            v_shoe = (y + 1.02) / 0.18
            u = 0.02 + np.clip(u_shoe, 0.0, 1.0) * 0.36
            v = 0.02 + np.clip(v_shoe, 0.0, 1.0) * 0.22

        # ---------------------------------------------------------
        # Part D: BATTING PADS & LOWER TROUSERS
        # -0.85 < Y <= -0.30
        # ---------------------------------------------------------
        elif y <= -0.30:
            if z >= -0.04:
                # Zone 6: [0.38..0.76] x [0.02..0.24] (Pads Front)
                u_pad = (x + 0.25) / 0.50
                v_pad = (y + 0.85) / 0.55
                u = 0.38 + np.clip(u_pad, 0.0, 1.0) * 0.38
                v = 0.02 + np.clip(v_pad, 0.0, 1.0) * 0.22
            else:
                # Zone 5: [0.38..0.76] x [0.26..0.50] (Trousers Lower Back)
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.85) / 0.55
                u = 0.38 + np.clip(u_tr, 0.0, 1.0) * 0.38
                v = 0.26 + np.clip(v_tr, 0.0, 1.0) * 0.12

        # ---------------------------------------------------------
        # Part E: UPPER TROUSERS & LEFT GLOVE
        # -0.30 < Y <= 0.10
        # ---------------------------------------------------------
        elif y <= 0.10:
            if x > 0.20 and y <= 0.05: # Left glove (hanging hand at positive X)
                # Zone 4: [0.02..0.38] x [0.26..0.50]
                u_gl = (x - 0.20) / 0.22
                v_gl = (y + 0.25) / 0.30
                u = 0.02 + np.clip(u_gl, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_gl, 0.0, 1.0) * 0.24
            else:
                # Zone 5: [0.38..0.76] x [0.26..0.50] (Trousers Upper)
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.30) / 0.40
                u = 0.38 + np.clip(u_tr, 0.0, 1.0) * 0.38
                v = 0.38 + np.clip(v_tr, 0.0, 1.0) * 0.12

        # ---------------------------------------------------------
        # Part F: JERSEY TORSO, ARMS, RIGHT GLOVE
        # 0.10 < Y <= 0.55
        # ---------------------------------------------------------
        else:
            if x < -0.15 and y > 0.30: # Right hand / glove holding bat
                # Zone 4: [0.02..0.38] x [0.26..0.50]
                u_arm = (x + 0.42) / 0.27
                v_arm = (y - 0.10) / 0.45
                u = 0.20 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_arm, 0.0, 1.0) * 0.24
            elif x > 0.18: # Left forearm / sleeve
                u_arm = (x - 0.18) / 0.24
                v_arm = (y - 0.10) / 0.45
                u = 0.02 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_arm, 0.0, 1.0) * 0.24
            else: # Jersey Torso
                # Zone 2: [0.52..0.98] x [0.52..0.98]
                u_j = (x + 0.18) / 0.36
                v_j = (y - 0.10) / 0.45
                u = 0.52 + np.clip(u_j, 0.0, 1.0) * 0.46
                v = 0.52 + np.clip(v_j, 0.0, 1.0) * 0.46

        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    # -------------------------------------------------------------
    # 4. Export Clean GLB
    # -------------------------------------------------------------
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
        "asset": {
            "version": "2.0",
            "generator": "Cricket Strike Clean PBR Engine"
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Batsman_PBR", "mesh": 0}],
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
            {
                "buffer": 0,
                "byteOffset": offset0,
                "byteLength": len0,
                "target": 34963
            },
            {
                "buffer": 0,
                "byteOffset": offset1,
                "byteLength": len1,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": offset2,
                "byteLength": len2,
                "target": 34962
            },
            {
                "buffer": 0,
                "byteOffset": offset3,
                "byteLength": len3,
                "target": 34962
            }
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

    print('Successfully generated clean master batsman with exact UV mapping!')

if __name__ == '__main__':
    generate_clean_master()
