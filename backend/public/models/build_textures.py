import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def generate_textures(tex_size=2048):
    out_dir = './backend/public/models/textures'
    os.makedirs(out_dir, exist_ok=True)
    w, h = tex_size, tex_size

    # Load reference images if available for sampling
    ref_face_path = './backend/public/images/cricketer_face.jpg'
    ref_hair_path = './backend/public/images/virat_side_haircut.png'

    ref_face = None
    if os.path.exists(ref_face_path):
        ref_face = Image.open(ref_face_path).convert('RGBA')

    ref_hair = None
    if os.path.exists(ref_hair_path):
        ref_hair = Image.open(ref_hair_path).convert('RGBA')

    # 1. Base Albedo (RGBA)
    albedo = Image.new('RGBA', (w, h), (2, 132, 199, 255)) # Team India Blue background
    draw_alb = ImageDraw.Draw(albedo)

    # 2. Roughness Map (Grayscale)
    roughness = Image.new('L', (w, h), 175) # ~0.68 default matte
    draw_rough = ImageDraw.Draw(roughness)

    # 3. Metallic Map (Grayscale)
    metallic = Image.new('L', (w, h), 0) # 0.0 default non-metal
    draw_metal = ImageDraw.Draw(metallic)

    # 4. AO Map (Grayscale)
    ao = Image.new('L', (w, h), 255) # 1.0 white default
    draw_ao = ImageDraw.Draw(ao)

    def to_px(u0, v0, u1, v1):
        # In texture space: u goes 0..1 (x: 0..w), v goes 0..1 (y: (1-v)*h down to (1-v0)*h)
        px0 = int(u0 * w)
        px1 = int(u1 * w)
        py0 = int((1.0 - v1) * h)
        py1 = int((1.0 - v0) * h)
        return [px0, py0, px1, py1]

    # =========================================================================
    # 1. HEAD & FACE & HAIR & HEADBAND (U: [0.04..0.42], V: [0.60..0.96])
    # =========================================================================
    hb = to_px(0.04, 0.60, 0.42, 0.96)
    skin_color = (176, 122, 86, 255) # Medium-brown Indian skin tone
    skin_shadow = (145, 95, 65, 255)
    skin_warm = (188, 128, 92, 255)
    hair_black = (22, 20, 18, 255)
    beard_black = (24, 22, 20, 255)

    # Base skin rectangle
    draw_alb.rectangle(hb, fill=skin_color)
    draw_rough.rectangle(hb, fill=135) # ~0.53

    # Hair (Top and Sides)
    # Top hair
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.28)], fill=hair_black)
    draw_rough.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.28)], fill=220)

    # Side Fade Haircut (Left and Right margins of head island)
    fade_w = int((hb[2] - hb[0]) * 0.28)
    for fx in range(fade_w):
        alpha_t = fx / fade_w # 0 at edge (black) to 1 inside (skin)
        fade_col = (
            int(hair_black[0]*(1-alpha_t) + skin_color[0]*alpha_t),
            int(hair_black[1]*(1-alpha_t) + skin_color[1]*alpha_t),
            int(hair_black[2]*(1-alpha_t) + skin_color[2]*alpha_t),
            255
        )
        draw_alb.line([(hb[0] + fx, hb[1] + int((hb[3]-hb[1])*0.20)), (hb[0] + fx, hb[3] - int((hb[3]-hb[1])*0.25))], fill=fade_col)
        draw_alb.line([(hb[2] - fx, hb[1] + int((hb[3]-hb[1])*0.20)), (hb[2] - fx, hb[3] - int((hb[3]-hb[1])*0.25))], fill=fade_col)

    # Headband (Royal Blue with white border and center logo)
    band_y0 = hb[1] + int((hb[3] - hb[1]) * 0.22)
    band_y1 = band_y0 + int((hb[3] - hb[1]) * 0.12)
    band_box = [hb[0] + 20, band_y0, hb[2] - 20, band_y1]
    draw_alb.rectangle(band_box, fill=(2, 132, 199, 255))
    draw_alb.line([(band_box[0], band_box[1]), (band_box[2], band_box[1])], fill=(255, 255, 255, 255), width=4)
    draw_alb.line([(band_box[0], band_box[3]), (band_box[2], band_box[3])], fill=(255, 255, 255, 255), width=4)
    # Center white emblem
    emblem_cx = int((band_box[0] + band_box[2]) / 2)
    draw_alb.ellipse([emblem_cx - 16, band_box[1] + 10, emblem_cx + 16, band_box[3] - 10], fill=(255, 255, 255, 255))
    draw_rough.rectangle(band_box, fill=190)

    # Frontal Face Features (Center of head island)
    fc_x0 = hb[0] + int((hb[2] - hb[0]) * 0.28)
    fc_x1 = hb[2] - int((hb[2] - hb[0]) * 0.28)
    fc_w = fc_x1 - fc_x0
    fc_cx = int((fc_x0 + fc_x1) / 2)

    # If reference face is available, blend stylized high-res face features
    if ref_face:
        # Resize ref face to fit face region
        ref_face_resized = ref_face.resize((fc_w, int((hb[3]-band_y1)*0.95)), Image.Resampling.LANCZOS)
        # Create a soft alpha mask for face blending
        face_mask = Image.new('L', ref_face_resized.size, 0)
        dm = ImageDraw.Draw(face_mask)
        dm.ellipse([10, 10, ref_face_resized.size[0]-10, ref_face_resized.size[1]-10], fill=220)
        face_mask = face_mask.filter(ImageFilter.GaussianBlur(radius=15))
        albedo.paste(ref_face_resized, (fc_x0, band_y1 + 5), face_mask)

    # Overlay sharp stylized vector features for crisp gaming aesthetic
    # Eyebrows
    eb_y = band_y1 + int((hb[3]-band_y1) * 0.12)
    draw_alb.polygon([(fc_cx - 85, eb_y + 8), (fc_cx - 20, eb_y), (fc_cx - 18, eb_y + 16), (fc_cx - 80, eb_y + 20)], fill=beard_black)
    draw_alb.polygon([(fc_cx + 85, eb_y + 8), (fc_cx + 20, eb_y), (fc_cx + 18, eb_y + 16), (fc_cx + 80, eb_y + 20)], fill=beard_black)

    # Eyes (Sclera + Almond Iris + Pupil + Specular Catchlight)
    eye_y0 = eb_y + 20
    eye_y1 = eye_y0 + 32
    draw_alb.ellipse([fc_cx - 80, eye_y0, fc_cx - 25, eye_y1], fill=(245, 245, 245, 255))
    draw_alb.ellipse([fc_cx + 25, eye_y0, fc_cx + 80, eye_y1], fill=(245, 245, 245, 255))
    # Dark brown Iris
    draw_alb.ellipse([fc_cx - 62, eye_y0 + 2, fc_cx - 38, eye_y1 - 2], fill=(50, 30, 20, 255))
    draw_alb.ellipse([fc_cx + 38, eye_y0 + 2, fc_cx + 62, eye_y1 - 2], fill=(50, 30, 20, 255))
    # Black Pupil
    draw_alb.ellipse([fc_cx - 55, eye_y0 + 7, fc_cx - 45, eye_y1 - 7], fill=(0, 0, 0, 255))
    draw_alb.ellipse([fc_cx + 45, eye_y0 + 7, fc_cx + 55, eye_y1 - 7], fill=(0, 0, 0, 255))
    # Specular White Catchlight
    draw_alb.ellipse([fc_cx - 52, eye_y0 + 8, fc_cx - 48, eye_y0 + 13], fill=(255, 255, 255, 255))
    draw_alb.ellipse([fc_cx + 48, eye_y0 + 8, fc_cx + 52, eye_y0 + 13], fill=(255, 255, 255, 255))

    # Nose Bridge & Nostrils
    nose_y0 = eye_y1 + 5
    nose_y1 = nose_y0 + 55
    draw_alb.polygon([(fc_cx - 12, nose_y0), (fc_cx - 18, nose_y1), (fc_cx + 18, nose_y1), (fc_cx + 12, nose_y0)], fill=skin_shadow)
    draw_alb.ellipse([fc_cx - 18, nose_y1 - 8, fc_cx - 6, nose_y1 + 4], fill=(80, 45, 30, 255))
    draw_alb.ellipse([fc_cx + 6, nose_y1 - 8, fc_cx + 18, nose_y1 + 4], fill=(80, 45, 30, 255))

    # Beard & Mustache (Jaw, Chin, Cheeks)
    beard_y0 = nose_y1 + 8
    beard_box = [fc_x0 - 20, beard_y0, fc_x1 + 20, hb[3] - 15]
    draw_alb.chord(beard_box, start=0, end=180, fill=beard_black)
    # Mustache
    draw_alb.chord([fc_cx - 55, beard_y0 - 15, fc_cx + 55, beard_y0 + 35], start=180, end=360, fill=beard_black)
    # Natural Lips
    draw_alb.ellipse([fc_cx - 32, beard_y0 + 15, fc_cx + 32, beard_y0 + 38], fill=(168, 93, 88, 255))
    draw_rough.rectangle(beard_box, fill=220)

    # =========================================================================
    # 2. TEAM INDIA JERSEY & COLLAR (U: [0.46..0.72], V: [0.60..0.96])
    # =========================================================================
    jb = to_px(0.46, 0.60, 0.72, 0.96)
    jersey_blue = (2, 132, 199, 255) # Royal Blue
    jersey_dark = (14, 116, 178, 255)
    orange_accent = (249, 115, 22, 255) # Saffron Orange

    draw_alb.rectangle(jb, fill=jersey_blue)
    draw_rough.rectangle(jb, fill=185) # ~0.72

    # Saffron Orange Polo Collar
    collar_h = int((jb[3] - jb[1]) * 0.16)
    draw_alb.rectangle([jb[0], jb[1], jb[2], jb[1] + collar_h], fill=orange_accent)
    draw_alb.line([(jb[0], jb[1] + collar_h), (jb[2], jb[1] + collar_h)], fill=(255, 255, 255, 255), width=5)

    # Button Placket
    jc_x = int((jb[0] + jb[2]) / 2)
    draw_alb.rectangle([jc_x - 14, jb[1] + collar_h, jc_x + 14, jb[1] + collar_h + 80], fill=orange_accent)
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 20, jc_x + 4, jb[1] + collar_h + 28], fill=(255, 255, 255, 255))
    draw_alb.ellipse([jc_x - 4, jb[1] + collar_h + 55, jc_x + 4, jb[1] + collar_h + 63], fill=(255, 255, 255, 255))

    # Saffron Orange Flank Side Panels
    side_w = int((jb[2] - jb[0]) * 0.18)
    draw_alb.polygon([(jb[0], jb[1] + collar_h + 20), (jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3]), (jb[0], jb[3])], fill=orange_accent)
    draw_alb.polygon([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2], jb[1] + collar_h + 20), (jb[2], jb[3]), (jb[2] - side_w - 20, jb[3])], fill=orange_accent)
    # White piping along side panels
    draw_alb.line([(jb[0] + side_w, jb[1] + collar_h + 20), (jb[0] + side_w + 20, jb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(jb[2] - side_w, jb[1] + collar_h + 20), (jb[2] - side_w - 20, jb[3])], fill=(255, 255, 255, 255), width=3)

    # Dynamic Saffron & Cyan Chevron Athletic Graphics on Chest
    ch_y = jb[1] + collar_h + 80
    draw_alb.polygon([(jc_x - 140, ch_y + 60), (jc_x - 50, ch_y), (jc_x + 120, ch_y + 180), (jc_x + 30, ch_y + 240)], fill=(14, 165, 233, 255))
    draw_alb.polygon([(jc_x - 40, ch_y + 20), (jc_x + 20, ch_y - 20), (jc_x + 160, ch_y + 140), (jc_x + 100, ch_y + 180)], fill=orange_accent)

    # India Crest on Left Chest (Golden Star + Blue wheel)
    crest_x = jc_x - 90
    crest_y = jb[1] + collar_h + 70
    draw_alb.ellipse([crest_x - 25, crest_y - 25, crest_x + 25, crest_y + 25], fill=(255, 215, 0, 255))
    draw_alb.ellipse([crest_x - 18, crest_y - 18, crest_x + 18, crest_y + 18], fill=(2, 132, 199, 255))
    draw_alb.ellipse([crest_x - 6, crest_y - 6, crest_x + 6, crest_y + 6], fill=(255, 215, 0, 255))

    # =========================================================================
    # 3. CRICKET BAT (U: [0.76..0.98], V: [0.52..0.98])
    # =========================================================================
    bb = to_px(0.76, 0.52, 0.98, 0.98)
    bat_wood_light = (218, 182, 132, 255) # English willow light golden-brown
    bat_wood_grain = (185, 145, 95, 255)
    grip_blue = (30, 58, 138, 255) # Deep navy/royal rubber

    draw_alb.rectangle(bb, fill=bat_wood_light)
    draw_rough.rectangle(bb, fill=110) # ~0.43 smooth varnished willow

    # Authentic horizontal willow grain fibers
    for gy in range(bb[1] + 160, bb[3], 10):
        grain_col = bat_wood_grain if (gy % 20 == 0) else (230, 196, 148, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    # Bat Handle (Top portion with blue rubber chevron grip wrap)
    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_blue)
    draw_rough.rectangle(handle_box, fill=165) # ~0.65 rubber
    # Chevron grip texture pattern
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Pro Bat Decal (Red & Blue brand badge)
    decal_y0 = bb[1] + handle_h + 30
    decal_y1 = decal_y0 + 150
    draw_alb.rectangle([bb[0] + 25, decal_y0, bb[2] - 25, decal_y0 + 75], fill=(220, 38, 38, 255)) # Red
    draw_alb.rectangle([bb[0] + 25, decal_y0 + 75, bb[2] - 25, decal_y1], fill=(30, 58, 138, 255)) # Navy Blue
    draw_alb.line([(bb[0] + 25, decal_y0), (bb[2] - 25, decal_y0)], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(bb[0] + 25, decal_y1), (bb[2] - 25, decal_y1)], fill=(255, 255, 255, 255), width=5)

    # =========================================================================
    # 4. ARMS & BATTING GLOVES (U: [0.04..0.42], V: [0.27..0.54])
    # =========================================================================
    ab = to_px(0.04, 0.27, 0.42, 0.54)
    draw_alb.rectangle(ab, fill=skin_color)
    draw_rough.rectangle(ab, fill=135)

    # Jersey Sleeve with Orange Cuffs (Left & Right arm bases)
    sleeve_h = int((ab[3] - ab[1]) * 0.30)
    draw_alb.rectangle([ab[0], ab[1], ab[0] + 180, ab[1] + sleeve_h], fill=jersey_blue)
    draw_alb.rectangle([ab[0], ab[1] + sleeve_h - 15, ab[0] + 180, ab[1] + sleeve_h], fill=orange_accent)

    draw_alb.rectangle([ab[2] - 180, ab[1], ab[2], ab[1] + sleeve_h], fill=jersey_blue)
    draw_alb.rectangle([ab[2] - 180, ab[1] + sleeve_h - 15, ab[2], ab[1] + sleeve_h], fill=orange_accent)

    # Pro Batting Gloves (White/Blue/Grey with padded sausage finger rolls)
    glove_white = (241, 245, 249, 255)
    glove_blue = (2, 132, 199, 255)
    glove_grey = (148, 163, 184, 255)

    glove_left = [ab[0] + 15, ab[1] + int((ab[3]-ab[1])*0.50), ab[0] + 200, ab[3] - 15]
    glove_right = [ab[2] - 200, ab[1] + int((ab[3]-ab[1])*0.50), ab[2] - 15, ab[3] - 15]

    for gb in [glove_left, glove_right]:
        draw_alb.rectangle(gb, fill=glove_white)
        draw_rough.rectangle(gb, fill=100) # ~0.39
        # Segmented padded finger sausage rolls in Royal Blue
        for fy in range(gb[1] + 15, gb[3] - 40, 30):
            draw_alb.rectangle([gb[0] + 12, fy, gb[2] - 12, fy + 20], fill=glove_blue)
            draw_alb.line([(gb[0] + 12, fy), (gb[2] - 12, fy)], fill=glove_grey, width=3)
        # Wrist Cuff Strap
        draw_alb.rectangle([gb[0], gb[3] - 35, gb[2], gb[3]], fill=(30, 58, 138, 255))
        draw_metal.rectangle([gb[0] + 25, gb[3] - 25, gb[0] + 65, gb[3] - 10], fill=220)

    # Sports Smartwatch on Left Wrist
    draw_alb.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.36), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.48)], fill=(30, 30, 30, 255))
    draw_metal.rectangle([ab[0] + 30, ab[1] + int((ab[3]-ab[1])*0.36), ab[0] + 130, ab[1] + int((ab[3]-ab[1])*0.48)], fill=200)

    # =========================================================================
    # 5. TROUSERS (U: [0.46..0.72], V: [0.26..0.54])
    # =========================================================================
    tb = to_px(0.46, 0.26, 0.72, 0.54)
    draw_alb.rectangle(tb, fill=jersey_blue)
    draw_rough.rectangle(tb, fill=185)

    # Orange vertical racing stripes on outer leg seams
    stripe_w = int((tb[2] - tb[0]) * 0.12)
    draw_alb.rectangle([tb[0] + 8, tb[1], tb[0] + 8 + stripe_w, tb[3]], fill=orange_accent)
    draw_alb.rectangle([tb[2] - 8 - stripe_w, tb[1], tb[2] - 8, tb[3]], fill=orange_accent)
    # White piping edge
    draw_alb.line([(tb[0] + 8 + stripe_w, tb[1]), (tb[0] + 8 + stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(tb[2] - 8 - stripe_w, tb[1]), (tb[2] - 8 - stripe_w, tb[3])], fill=(255, 255, 255, 255), width=3)

    # Waistband & drawstring stitching
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=(14, 116, 178, 255), width=6)

    # =========================================================================
    # 6. BATTING PADS (U: [0.52..0.98], V: [0.04..0.28])
    # =========================================================================
    pb = to_px(0.52, 0.04, 0.98, 0.28)
    pad_blue = (2, 132, 199, 255)
    pad_highlight = (125, 211, 252, 255)
    pad_white = (248, 250, 252, 255)

    draw_alb.rectangle(pb, fill=pad_blue)
    draw_rough.rectangle(pb, fill=95) # ~0.37 semi-gloss PU leather

    pad_w = (pb[2] - pb[0]) // 2
    for p_idx, px_start in enumerate([pb[0] + 15, pb[0] + pad_w + 15]):
        px_end = px_start + pad_w - 30
        # Knee Roll Horizontal Bolsters at top of pad
        kr_h = int((pb[3] - pb[1]) * 0.28)
        draw_alb.rectangle([px_start, pb[1] + 10, px_end, pb[1] + kr_h], fill=(14, 116, 178, 255))
        for ky in [pb[1] + 20, pb[1] + int(kr_h*0.55), pb[1] + kr_h - 10]:
            draw_alb.line([(px_start, ky), (px_end, ky)], fill=pad_white, width=4)

        # 7 Vertical Cane Padded Ribs
        rib_w = (px_end - px_start) // 7
        for r in range(7):
            rx0 = px_start + r * rib_w + 4
            rx1 = rx0 + rib_w - 8
            # Cane rib contour
            draw_alb.rectangle([rx0, pb[1] + kr_h + 10, rx1, pb[3] - 15], fill=pad_highlight)
            draw_alb.line([(rx0, pb[1] + kr_h + 10), (rx0, pb[3] - 15)], fill=(14, 116, 178, 255), width=2)
            draw_alb.line([(rx1, pb[1] + kr_h + 10), (rx1, pb[3] - 15)], fill=(14, 116, 178, 255), width=2)
            draw_alb.line([(int((rx0+rx1)/2), pb[1] + kr_h + 10), (int((rx0+rx1)/2), pb[3] - 15)], fill=pad_white, width=3)

    # =========================================================================
    # 7. CRICKET SHOES (U: [0.04..0.46], V: [0.04..0.22])
    # =========================================================================
    sb = to_px(0.04, 0.04, 0.46, 0.22)
    shoe_white = (248, 250, 252, 255)
    shoe_blue = (2, 132, 199, 255)
    shoe_sole = (30, 41, 59, 255)

    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    # Blue synthetic leather panels and Orange swoosh
    draw_alb.rectangle([sb[0] + 15, sb[1] + 15, sb[2] - 15, sb[1] + int((sb[3]-sb[1])*0.50)], fill=shoe_blue)
    draw_alb.polygon([
        (sb[0] + 40, sb[1] + 45),
        (sb[2] - 40, sb[1] + 30),
        (sb[2] - 60, sb[1] + 65),
        (sb[0] + 30, sb[1] + 75)
    ], fill=orange_accent)

    # Cushioned White Midsole
    ms_y0 = sb[3] - int((sb[3]-sb[1])*0.32)
    ms_y1 = sb[3] - int((sb[3]-sb[1])*0.12)
    draw_alb.rectangle([sb[0], ms_y0, sb[2], ms_y1], fill=(255, 255, 255, 255))

    # Dark Rubber Outsole & Spikes
    draw_alb.rectangle([sb[0], ms_y1, sb[2], sb[3]], fill=shoe_sole)
    for spx in range(sb[0] + 15, sb[2], 25):
        draw_alb.rectangle([spx, sb[3] - 10, spx + 12, sb[3]], fill=(15, 23, 42, 255))

    # =========================================================================
    # HIGH-FREQUENCY TANGENT-SPACE NORMAL MAP CALCULATION
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
    draw_ao.rectangle([pb[0], pb[1] + kr_h, pb[2], pb[1] + kr_h + 15], fill=150) # Pad knee junction
    ao = ao.filter(ImageFilter.GaussianBlur(radius=8))

    # Save all 5 textures
    albedo_path = os.path.join(out_dir, 'batsman_albedo.png')
    normal_path = os.path.join(out_dir, 'batsman_normal.png')
    roughness_path = os.path.join(out_dir, 'batsman_roughness.png')
    metallic_path = os.path.join(out_dir, 'batsman_metallic.png')
    ao_path = os.path.join(out_dir, 'batsman_ao.png')

    albedo.save(albedo_path, 'PNG')
    normal.save(normal_path, 'PNG')
    roughness.save(roughness_path, 'PNG')
    metallic.save(metallic_path, 'PNG')
    ao.save(ao_path, 'PNG')

    print(f'Successfully created 5 PBR textures in {out_dir}')
    print(f'  Albedo: {albedo_path} ({w}x{h})')
    print(f'  Normal: {normal_path}')
    print(f'  Roughness: {roughness_path}')
    print(f'  Metallic: {metallic_path}')
    print(f'  AO: {ao_path}')

if __name__ == '__main__':
    generate_textures(tex_size=2048)
