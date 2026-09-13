import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def create_pbr_textures(output_dir, tex_size=2048):
    os.makedirs(output_dir, exist_ok=True)
    w, h = tex_size, tex_size

    # 1. Base Albedo (RGBA)
    albedo = Image.new('RGBA', (w, h), (30, 136, 229, 255)) # Team India Blue background
    draw_alb = ImageDraw.Draw(albedo)

    # 2. Normal Map (RGB - 128, 128, 255 flat normal)
    normal = Image.new('RGB', (w, h), (128, 128, 255))
    draw_norm = ImageDraw.Draw(normal)

    # 3. Roughness Map (Grayscale)
    roughness = Image.new('L', (w, h), 170) # ~0.67 default
    draw_rough = ImageDraw.Draw(roughness)

    # 4. Metallic Map (Grayscale)
    metallic = Image.new('L', (w, h), 0) # 0.0 default
    draw_metal = ImageDraw.Draw(metallic)

    # 5. AO Map (Grayscale)
    ao = Image.new('L', (w, h), 255) # 1.0 (white) default
    draw_ao = ImageDraw.Draw(ao)

    # =========================================================================
    # UV LAYOUT MAPPING (Normalized 0..1 to pixel 0..w, 0..h)
    # Zone 1: HEAD, FACE, BEARD, HAIR, HEADBAND (Top-Left: [0.0..0.45] x [0.55..1.0])
    # Zone 2: JERSEY & COLLAR (Top-Right: [0.45..0.75] x [0.55..1.0])
    # Zone 3: CRICKET BAT (Far-Right: [0.75..1.0] x [0.50..1.0])
    # Zone 4: ARMS & GLOVES (Mid-Left: [0.0..0.45] x [0.25..0.55])
    # Zone 5: TROUSERS (Mid-Right: [0.45..0.75] x [0.25..0.55])
    # Zone 6: BATTING PADS (Bottom-Right: [0.50..1.0] x [0.0..0.28])
    # Zone 7: SHOES (Bottom-Left: [0.0..0.50] x [0.0..0.25])
    # =========================================================================

    def box(x0, y0, x1, y1):
        return [int(x0 * w), int((1.0 - y1) * h), int(x1 * w), int((1.0 - y0) * h)]

    # -------------------------------------------------------------------------
    # 1. HEAD & FACE & HAIR & HEADBAND
    # -------------------------------------------------------------------------
    # Skin base
    hb = box(0.02, 0.58, 0.42, 0.98)
    skin_color = (176, 122, 86, 255) # Medium-brown Indian skin tone
    skin_shadow = (145, 95, 65, 255)
    draw_alb.rectangle(hb, fill=skin_color)
    draw_rough.rectangle(hb, fill=135) # ~0.53

    # Cheeks & forehead warmth
    draw_alb.ellipse([hb[0] + 40, hb[1] + 120, hb[2] - 40, hb[3] - 100], fill=(188, 128, 92, 255))

    # Beard & Mustache (Jaw, chin, upper lip)
    beard_color = (24, 22, 20, 255)
    beard_box = [hb[0] + 50, hb[1] + 260, hb[2] - 50, hb[3] - 40]
    draw_alb.chord(beard_box, start=0, end=180, fill=beard_color)
    draw_rough.rectangle(beard_box, fill=220) # Beard diffuse roughness

    # Mustache
    draw_alb.chord([hb[0] + 100, hb[1] + 240, hb[2] - 100, hb[1] + 300], start=180, end=360, fill=beard_color)

    # Lips
    draw_alb.ellipse([hb[0] + 130, hb[1] + 270, hb[2] - 130, hb[1] + 295], fill=(168, 93, 88, 255))

    # Eyes & Eyebrows
    # Left & Right Eyebrows
    draw_alb.polygon([(hb[0] + 80, hb[1] + 150), (hb[0] + 170, hb[1] + 140), (hb[0] + 165, hb[1] + 155), (hb[0] + 85, hb[1] + 162)], fill=beard_color)
    draw_alb.polygon([(hb[2] - 80, hb[1] + 150), (hb[2] - 170, hb[1] + 140), (hb[2] - 165, hb[1] + 155), (hb[2] - 85, hb[1] + 162)], fill=beard_color)

    # Left & Right Eyes (White sclera + Almond dark iris + Pupil + Catchlight)
    draw_alb.ellipse([hb[0] + 90, hb[1] + 165, hb[0] + 165, hb[1] + 200], fill=(245, 245, 245, 255))
    draw_alb.ellipse([hb[2] - 165, hb[1] + 165, hb[2] - 90, hb[1] + 200], fill=(245, 245, 245, 255))
    draw_alb.ellipse([hb[0] + 115, hb[1] + 168, hb[0] + 150, hb[1] + 197], fill=(50, 30, 20, 255))
    draw_alb.ellipse([hb[2] - 150, hb[1] + 168, hb[2] - 115, hb[1] + 197], fill=(50, 30, 20, 255))
    draw_alb.ellipse([hb[0] + 125, hb[1] + 175, hb[0] + 140, hb[1] + 190], fill=(0, 0, 0, 255))
    draw_alb.ellipse([hb[2] - 140, hb[1] + 175, hb[2] - 125, hb[1] + 190], fill=(0, 0, 0, 255))
    # Catchlight
    draw_alb.ellipse([hb[0] + 133, hb[1] + 177, hb[0] + 138, hb[1] + 182], fill=(255, 255, 255, 255))
    draw_alb.ellipse([hb[2] - 132, hb[1] + 177, hb[2] - 127, hb[1] + 182], fill=(255, 255, 255, 255))

    # Nose shading
    draw_alb.polygon([(hb[0] + 195, hb[1] + 170), (hb[0] + 185, hb[1] + 240), (hb[0] + 225, hb[1] + 240), (hb[0] + 215, hb[1] + 170)], fill=skin_shadow)

    # Hair Top & Fade (Black textured hair)
    hair_box = [hb[0] - 10, hb[1] - 20, hb[2] + 10, hb[1] + 110]
    draw_alb.rectangle(hair_box, fill=(20, 18, 16, 255))
    draw_rough.rectangle(hair_box, fill=225)

    # Headband (Royal Blue sports headband with white border and center logo)
    band_box = [hb[0] + 20, hb[1] + 85, hb[2] - 20, hb[1] + 135]
    draw_alb.rectangle(band_box, fill=(2, 132, 199, 255)) # Sky/Royal Blue
    draw_alb.line([(band_box[0], band_box[1]), (band_box[2], band_box[1])], fill=(255, 255, 255, 255), width=4)
    draw_alb.line([(band_box[0], band_box[3]), (band_box[2], band_box[3])], fill=(255, 255, 255, 255), width=4)
    # Center white emblem
    draw_alb.ellipse([int((band_box[0]+band_box[2])/2 - 15), band_box[1] + 10, int((band_box[0]+band_box[2])/2 + 15), band_box[3] - 10], fill=(255, 255, 255, 255))

    # -------------------------------------------------------------------------
    # 2. TEAM INDIA JERSEY & COLLAR
    # -------------------------------------------------------------------------
    jb = box(0.44, 0.58, 0.74, 0.98)
    jersey_blue = (2, 132, 199, 255) # Team India Vibrant Royal Blue
    jersey_dark = (14, 116, 178, 255)
    orange_accent = (249, 115, 22, 255) # Saffron Orange
    orange_dark = (234, 88, 12, 255)

    draw_alb.rectangle(jb, fill=jersey_blue)
    draw_rough.rectangle(jb, fill=185) # ~0.72 matte fabric

    # Orange Collar Band
    draw_alb.rectangle([jb[0], jb[1], jb[2], jb[1] + 70], fill=orange_accent)
    draw_alb.line([(jb[0], jb[1] + 70), (jb[2], jb[1] + 70)], fill=(255, 255, 255, 255), width=5)

    # Orange Side Panels (Flanks)
    draw_alb.polygon([(jb[0], jb[1] + 80), (jb[0] + 70, jb[1] + 80), (jb[0] + 90, jb[3]), (jb[0], jb[3])], fill=orange_accent)
    draw_alb.polygon([(jb[2] - 70, jb[1] + 80), (jb[2], jb[1] + 80), (jb[2], jb[3]), (jb[2] - 90, jb[3])], fill=orange_accent)

    # White & Orange diagonal chest graphic stripes
    draw_alb.polygon([(jb[0] + 120, jb[1] + 180), (jb[0] + 190, jb[1] + 140), (jb[0] + 280, jb[1] + 320), (jb[0] + 210, jb[1] + 360)], fill=(14, 165, 233, 255))
    draw_alb.polygon([(jb[0] + 200, jb[1] + 150), (jb[0] + 240, jb[1] + 130), (jb[0] + 310, jb[1] + 280), (jb[0] + 270, jb[1] + 300)], fill=orange_accent)

    # India Crest on Left Chest
    draw_alb.ellipse([jb[0] + 100, jb[1] + 140, jb[0] + 150, jb[1] + 190], fill=(255, 215, 0, 255)) # Gold crest
    draw_alb.ellipse([jb[0] + 108, jb[1] + 148, jb[0] + 142, jb[1] + 182], fill=(2, 132, 199, 255))

    # -------------------------------------------------------------------------
    # 3. CRICKET BAT (English Willow wood + Blue grip + Carved Spine)
    # -------------------------------------------------------------------------
    bb = box(0.76, 0.52, 0.98, 0.98)
    bat_wood_light = (212, 175, 122, 255) # Light golden English willow
    bat_wood_grain = (185, 145, 95, 255)
    bat_wood_edge = (165, 125, 80, 255)
    grip_blue = (30, 58, 138, 255) # Deep navy/royal rubber grip

    # Bat blade base
    draw_alb.rectangle(bb, fill=bat_wood_light)
    draw_rough.rectangle(bb, fill=110) # ~0.43 smooth varnished willow

    # Horizontal wood grain fibers across the blade
    for gy in range(bb[1] + 140, bb[3], 12):
        shade = bat_wood_grain if (gy % 24 == 0) else (225, 190, 140, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=shade, width=2)

    # Bat Handle (Top portion with blue rubber chevron grip)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + 140]
    draw_alb.rectangle(handle_box, fill=grip_blue)
    draw_rough.rectangle(handle_box, fill=165) # ~0.65 rubber
    # Chevron grip pattern lines
    for hy in range(handle_box[1] + 8, handle_box[3], 10):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Red & Blue sponsor decal / brand bar on blade
    draw_alb.rectangle([bb[0] + 20, bb[1] + 180, bb[2] - 20, bb[1] + 260], fill=(220, 38, 38, 255))
    draw_alb.rectangle([bb[0] + 20, bb[1] + 260, bb[2] - 20, bb[1] + 320], fill=(30, 58, 138, 255))
    draw_alb.line([(bb[0] + 20, bb[1] + 180), (bb[2] - 20, bb[1] + 180)], fill=(255, 255, 255, 255), width=4)
    draw_alb.line([(bb[0] + 20, bb[1] + 320), (bb[2] - 20, bb[1] + 320)], fill=(255, 255, 255, 255), width=4)

    # -------------------------------------------------------------------------
    # 4. ARMS & BATTING GLOVES
    # -------------------------------------------------------------------------
    ab = box(0.02, 0.25, 0.42, 0.55)
    draw_alb.rectangle(ab, fill=skin_color) # Skin base
    draw_rough.rectangle(ab, fill=135)

    # Sleeve portions (Royal Blue with Orange Cuffs)
    draw_alb.rectangle([ab[0], ab[1], ab[0] + 160, ab[1] + 100], fill=jersey_blue)
    draw_alb.line([(ab[0], ab[1] + 100), (ab[0] + 160, ab[1] + 100)], fill=orange_accent, width=12)

    draw_alb.rectangle([ab[2] - 160, ab[1], ab[2], ab[1] + 100], fill=jersey_blue)
    draw_alb.line([(ab[2] - 160, ab[1] + 100), (ab[2], ab[1] + 100)], fill=orange_accent, width=12)

    # Pro Batting Gloves (White/Blue/Grey with padded sausage finger rolls)
    glove_white = (241, 245, 249, 255)
    glove_blue = (2, 132, 199, 255)
    glove_grey = (148, 163, 184, 255)

    # Left & Right Glove boxes
    glove1 = [ab[0] + 20, ab[1] + 180, ab[0] + 180, ab[3] - 20]
    glove2 = [ab[2] - 180, ab[1] + 180, ab[2] - 20, ab[3] - 20]

    for gb in [glove1, glove2]:
        draw_alb.rectangle(gb, fill=glove_white)
        draw_rough.rectangle(gb, fill=100) # ~0.39 leather
        # Segmented finger padding rolls in Royal Blue & Grey
        for fy in range(gb[1] + 20, gb[3] - 40, 32):
            draw_alb.rectangle([gb[0] + 15, fy, gb[2] - 15, fy + 22], fill=glove_blue)
            draw_alb.line([(gb[0] + 15, fy), (gb[2] - 15, fy)], fill=glove_grey, width=3)
        # Wrist strap band
        draw_alb.rectangle([gb[0], gb[3] - 35, gb[2], gb[3]], fill=(30, 58, 138, 255))
        draw_metal.rectangle([gb[0] + 20, gb[3] - 25, gb[0] + 60, gb[3] - 10], fill=220) # Buckle

    # Smartwatch on Left wrist
    draw_alb.rectangle([ab[0] + 30, ab[1] + 140, ab[0] + 120, ab[1] + 175], fill=(30, 30, 30, 255))
    draw_metal.rectangle([ab[0] + 30, ab[1] + 140, ab[0] + 120, ab[1] + 175], fill=200)

    # -------------------------------------------------------------------------
    # 5. TROUSERS (Pants with Orange Side Stripes)
    # -------------------------------------------------------------------------
    tb = box(0.44, 0.25, 0.74, 0.55)
    draw_alb.rectangle(tb, fill=jersey_blue)
    draw_rough.rectangle(tb, fill=185) # ~0.72 matte fabric

    # Orange vertical racing stripes down the outer sides
    draw_alb.rectangle([tb[0] + 10, tb[1], tb[0] + 50, tb[3]], fill=orange_accent)
    draw_alb.rectangle([tb[2] - 50, tb[1], tb[2] - 10, tb[3]], fill=orange_accent)
    # White piping edge
    draw_alb.line([(tb[0] + 50, tb[1]), (tb[0] + 50, tb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(tb[2] - 50, tb[1]), (tb[2] - 50, tb[3])], fill=(255, 255, 255, 255), width=3)

    # Waistband & drawstring stitching
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=(14, 116, 178, 255), width=6)

    # -------------------------------------------------------------------------
    # 6. BATTING PADS (Leg Guards with 7 vertical ribs & knee roll bolsters)
    # -------------------------------------------------------------------------
    pb = box(0.50, 0.02, 0.98, 0.28)
    pad_blue = (2, 132, 199, 255) # Royal Blue PU leather
    pad_highlight = (125, 211, 252, 255) # Sky blue rib center
    pad_white = (248, 250, 252, 255)

    draw_alb.rectangle(pb, fill=pad_blue)
    draw_rough.rectangle(pb, fill=95) # ~0.37 semi-gloss PU leather

    # Left and Right Pad partitions
    pad_w = (pb[2] - pb[0]) // 2
    for p_idx, px_start in enumerate([pb[0] + 15, pb[0] + pad_w + 15]):
        px_end = px_start + pad_w - 30
        # Knee roll horizontal bolsters at top of pad
        draw_alb.rectangle([px_start, pb[1] + 15, px_end, pb[1] + 80], fill=(14, 116, 178, 255))
        for ky in [pb[1] + 25, pb[1] + 45, pb[1] + 65]:
            draw_alb.line([(px_start, ky), (px_end, ky)], fill=pad_white, width=4)

        # 7 Vertical Cane Ribs
        rib_w = (px_end - px_start) // 7
        for r in range(7):
            rx0 = px_start + r * rib_w + 4
            rx1 = rx0 + rib_w - 8
            # Cane rib body
            draw_alb.rectangle([rx0, pb[1] + 90, rx1, pb[3] - 20], fill=pad_highlight)
            draw_alb.line([(rx0, pb[1] + 90), (rx0, pb[3] - 20)], fill=(14, 116, 178, 255), width=2)
            draw_alb.line([(rx1, pb[1] + 90), (rx1, pb[3] - 20)], fill=(14, 116, 178, 255), width=2)
            draw_alb.line([(int((rx0+rx1)/2), pb[1] + 90), (int((rx0+rx1)/2), pb[3] - 20)], fill=pad_white, width=3)

    # -------------------------------------------------------------------------
    # 7. CRICKET SHOES (White / Blue / Orange Pro Spikes)
    # -------------------------------------------------------------------------
    sb = box(0.02, 0.02, 0.48, 0.24)
    shoe_white = (248, 250, 252, 255)
    shoe_blue = (2, 132, 199, 255)
    shoe_sole = (30, 41, 59, 255)

    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    # Blue overlays and Orange Swoosh
    draw_alb.rectangle([sb[0] + 20, sb[1] + 20, sb[2] - 20, sb[1] + 100], fill=shoe_blue)
    draw_alb.polygon([(sb[0] + 50, sb[1] + 60), (sb[2] - 50, sb[1] + 40), (sb[2] - 70, sb[1] + 80), (sb[0] + 40, sb[1] + 90)], fill=orange_accent)

    # Cushioned White Midsole
    draw_alb.rectangle([sb[0], sb[3] - 50, sb[2], sb[3] - 20], fill=(255, 255, 255, 255))
    # Dark Rubber Outsole & Spikes
    draw_alb.rectangle([sb[0], sb[3] - 20, sb[2], sb[3]], fill=shoe_sole)
    for spx in range(sb[0] + 15, sb[2], 25):
        draw_alb.rectangle([spx, sb[3] - 12, spx + 10, sb[3]], fill=(15, 23, 42, 255))

    # =========================================================================
    # GENERATE PROCEDURAL NORMAL MAP FROM ALBEDO / HEIGHT DERIVATIVES
    # =========================================================================
    gray = albedo.convert('L')
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

    # Add cloth micro-weave noise to normal map
    noise = np.random.randint(-4, 5, (h, w), dtype=np.int16)
    normal_arr = np.array(normal, dtype=np.int16)
    normal_arr[:, :, 0] = np.clip(normal_arr[:, :, 0] + noise, 0, 255)
    normal_arr[:, :, 1] = np.clip(normal_arr[:, :, 1] + noise, 0, 255)
    normal = Image.fromarray(normal_arr.astype(np.uint8), 'RGB')

    # =========================================================================
    # AMBIENT OCCLUSION (AO) CREVICES & CONTACT SHADOWS
    # =========================================================================
    draw_ao.rectangle([jb[0], jb[1], jb[2], jb[1] + 25], fill=140) # Under collar
    draw_ao.rectangle([tb[0], tb[1], tb[2], tb[1] + 35], fill=160) # Waist seam
    draw_ao.rectangle([pb[0], pb[1] + 80, pb[2], pb[1] + 95], fill=150) # Pad knee junction
    ao = ao.filter(ImageFilter.GaussianBlur(radius=8))

    # Save all 5 textures
    albedo_path = os.path.join(output_dir, 'batsman_albedo.png')
    normal_path = os.path.join(output_dir, 'batsman_normal.png')
    roughness_path = os.path.join(output_dir, 'batsman_roughness.png')
    metallic_path = os.path.join(output_dir, 'batsman_metallic.png')
    ao_path = os.path.join(output_dir, 'batsman_ao.png')

    albedo.save(albedo_path, 'PNG')
    normal.save(normal_path, 'PNG')
    roughness.save(roughness_path, 'PNG')
    metallic.save(metallic_path, 'PNG')
    ao.save(ao_path, 'PNG')

    print(f'✅ All 5 PBR textures successfully created in {output_dir}:')
    print(f'   - Albedo: {albedo_path} ({w}x{h})')
    print(f'   - Normal: {normal_path}')
    print(f'   - Roughness: {roughness_path}')
    print(f'   - Metallic: {metallic_path}')
    print(f'   - AO: {ao_path}')

if __name__ == '__main__':
    out_dir = './backend/public/models/textures'
    create_pbr_textures(out_dir, tex_size=2048)
