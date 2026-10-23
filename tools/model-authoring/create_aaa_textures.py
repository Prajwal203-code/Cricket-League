import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def create_aaa_textures(output_dir='./backend/public/models/textures', tex_size=2048):
    os.makedirs(output_dir, exist_ok=True)
    w, h = tex_size, tex_size

    # Load high-res crop textures
    crop_head_path = os.path.join(output_dir, 'crop_head.png')
    crop_pads_path = os.path.join(output_dir, 'crop_pads.png')
    crop_jersey_path = os.path.join(output_dir, 'crop_jersey.png')

    crop_head = Image.open(crop_head_path).convert('RGBA') if os.path.exists(crop_head_path) else None
    crop_pads = Image.open(crop_pads_path).convert('RGBA') if os.path.exists(crop_pads_path) else None
    crop_jersey = Image.open(crop_jersey_path).convert('RGBA') if os.path.exists(crop_jersey_path) else None

    # Base Albedo
    jersey_royal = (2, 132, 199, 255) # Team India Royal Blue (#0284c7)
    jersey_dark = (14, 116, 178, 255)
    orange_saffron = (249, 115, 22, 255) # Saffron Orange (#f97316)
    skin_med = (180, 126, 90, 255)
    hair_black = (20, 18, 16, 255)

    albedo = Image.new('RGBA', (w, h), jersey_royal)
    draw_alb = ImageDraw.Draw(albedo)

    roughness = Image.new('L', (w, h), 175)
    draw_rough = ImageDraw.Draw(roughness)

    metallic = Image.new('L', (w, h), 0)
    draw_metal = ImageDraw.Draw(metallic)

    ao = Image.new('L', (w, h), 255)
    draw_ao = ImageDraw.Draw(ao)

    def to_px(u0, v0, u1, v1):
        return [int(u0 * w), int((1.0 - v1) * h), int(u1 * w), int((1.0 - v0) * h)]

    # =========================================================================
    # 1. HEAD & FACE ISLAND (U: [0.04..0.42], V: [0.60..0.96])
    # =========================================================================
    hb = to_px(0.04, 0.60, 0.42, 0.96)
    draw_alb.rectangle(hb, fill=skin_med)
    draw_rough.rectangle(hb, fill=135)

    # Hair base
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.32)], fill=hair_black)
    draw_rough.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.32)], fill=225)

    # Side fade
    fade_w = int((hb[2] - hb[0]) * 0.26)
    for fx in range(fade_w):
        t = fx / fade_w
        col = (
            int(hair_black[0]*(1-t) + skin_med[0]*t),
            int(hair_black[1]*(1-t) + skin_med[1]*t),
            int(hair_black[2]*(1-t) + skin_med[2]*t),
            255
        )
        draw_alb.line([(hb[0] + fx, hb[1] + 50), (hb[0] + fx, hb[3] - 50)], fill=col)
        draw_alb.line([(hb[2] - fx, hb[1] + 50), (hb[2] - fx, hb[3] - 50)], fill=col)

    # Cutout of face, headband, hair, beard from crop_head without background sky/bat
    if crop_head:
        cw, ch = crop_head.size
        # Crop inner head (x from 15% to 85%, y from 10% to 95%)
        inner_head = crop_head.crop((int(cw * 0.15), int(ch * 0.08), int(cw * 0.88), int(ch * 0.96)))
        ih_w, ih_h = inner_head.size

        # Create precise alpha mask for head silhouette
        head_mask = Image.new('L', (ih_w, ih_h), 0)
        hm_draw = ImageDraw.Draw(head_mask)
        hm_draw.ellipse([5, 5, ih_w - 5, ih_h - 5], fill=255)
        head_mask = head_mask.filter(ImageFilter.GaussianBlur(radius=6))

        # Paste onto head island
        dest_w = int((hb[2] - hb[0]) * 0.65)
        dest_h = int((hb[3] - hb[1]) * 0.90)
        inner_head_resized = inner_head.resize((dest_w, dest_h), Image.Resampling.LANCZOS)
        head_mask_resized = head_mask.resize((dest_w, dest_h), Image.Resampling.LANCZOS)

        dest_x = hb[0] + int((hb[2] - hb[0] - dest_w) / 2)
        dest_y = hb[1] + int((hb[3] - hb[1] - dest_h) / 2)
        albedo.paste(inner_head_resized, (dest_x, dest_y), head_mask_resized)

    # =========================================================================
    # 2. JERSEY & TORSO ISLAND (U: [0.46..0.72], V: [0.60..0.96])
    # =========================================================================
    jb = to_px(0.46, 0.60, 0.72, 0.96)
    draw_alb.rectangle(jb, fill=jersey_royal)
    draw_rough.rectangle(jb, fill=185)

    if crop_jersey:
        jw, jh = crop_jersey.size
        # Clean crop of jersey front
        clean_jersey = crop_jersey.copy()
        cjd = ImageDraw.Draw(clean_jersey)
        # Cover any text (INDIA/MPL) with clean royal blue and athletic chevron graphic
        cjd.rectangle([int(jw * 0.15), int(jh * 0.44), int(jw * 0.75), int(jh * 0.65)], fill=jersey_royal)
        cjd.rectangle([int(jw * 0.15), int(jh * 0.25), int(jw * 0.40), int(jh * 0.38)], fill=jersey_royal)
        # Redraw clean dynamic chevron stripes across chest
        cjd.polygon([(int(jw*0.25), int(jh*0.62)), (int(jw*0.45), int(jh*0.45)), (int(jw*0.85), int(jh*0.75)), (int(jw*0.65), int(jh*0.92))], fill=(14, 165, 233, 255))
        cjd.polygon([(int(jw*0.40), int(jh*0.50)), (int(jw*0.55), int(jh*0.38)), (int(jw*0.90), int(jh*0.65)), (int(jw*0.75), int(jh*0.78))], fill=orange_saffron)

        dest_jw = jb[2] - jb[0]
        dest_jh = jb[3] - jb[1]
        jersey_resized = clean_jersey.resize((dest_jw, dest_jh), Image.Resampling.LANCZOS)
        albedo.paste(jersey_resized, (jb[0], jb[1]))

    # =========================================================================
    # 3. CRICKET BAT ISLAND (U: [0.76..0.98], V: [0.52..0.98])
    # =========================================================================
    bb = to_px(0.76, 0.52, 0.98, 0.98)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)

    draw_alb.rectangle(bb, fill=bat_wood)
    draw_rough.rectangle(bb, fill=110)

    # Horizontal English Willow Wood Grain Fibers
    for gy in range(bb[1] + 160, bb[3], 6):
        grain_col = bat_wood_dark if (gy % 18 == 0) else (234, 198, 150, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    # Handle Grip (Navy blue rubber chevron)
    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_navy)
    draw_rough.rectangle(handle_box, fill=165)
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    # Professional Red & Blue Decal Stripe (Clean without branding text)
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

    # =========================================================================
    # 6. BATTING PADS (U: [0.52..0.98], V: [0.04..0.28])
    # =========================================================================
    pb = to_px(0.52, 0.04, 0.98, 0.28)
    draw_alb.rectangle(pb, fill=jersey_royal)
    draw_rough.rectangle(pb, fill=95)

    if crop_pads:
        pw, ph = crop_pads.size
        # Crop out grass background
        clean_pads = crop_pads.crop((0, 0, pw, int(ph * 0.88)))
        cpd = ImageDraw.Draw(clean_pads)
        # Cover any text "INDIA" on the lower pad wings
        cpd.rectangle([int(pw * 0.05), int(ph * 0.72), int(pw * 0.40), int(ph * 0.88)], fill=jersey_royal)
        cpd.rectangle([int(pw * 0.65), int(ph * 0.72), int(pw * 0.95), int(ph * 0.88)], fill=jersey_royal)

        dest_pw = pb[2] - pb[0]
        dest_ph = pb[3] - pb[1]
        pads_resized = clean_pads.resize((dest_pw, dest_ph), Image.Resampling.LANCZOS)
        albedo.paste(pads_resized, (pb[0], pb[1]))

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
    # NORMAL MAP & AO
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

    # Save
    albedo.save(os.path.join(output_dir, 'batsman_albedo.png'), 'PNG')
    normal.save(os.path.join(output_dir, 'batsman_normal.png'), 'PNG')
    roughness.save(os.path.join(output_dir, 'batsman_roughness.png'), 'PNG')
    metallic.save(os.path.join(output_dir, 'batsman_metallic.png'), 'PNG')
    ao.save(os.path.join(output_dir, 'batsman_ao.png'), 'PNG')
    print('AAA PBR textures built successfully!')

if __name__ == '__main__':
    create_aaa_textures()
