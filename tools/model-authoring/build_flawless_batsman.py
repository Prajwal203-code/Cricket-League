import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def build_flawless():
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = verts[:,0].min(), verts[:,0].max()
    y_min, y_max = verts[:,1].min(), verts[:,1].max()
    z_min, z_max = verts[:,2].min(), verts[:,2].max()

    tex_dir = './backend/public/models/textures'
    crop_head = Image.open(os.path.join(tex_dir, 'crop_head.png')).convert('RGBA')
    crop_pads = Image.open(os.path.join(tex_dir, 'crop_pads.png')).convert('RGBA')
    crop_jersey = Image.open(os.path.join(tex_dir, 'crop_jersey.png')).convert('RGBA')

    w, h = 2048, 2048
    jersey_royal = (2, 132, 199, 255)
    orange_saffron = (249, 115, 22, 255)
    skin_med = (180, 126, 90, 255)
    hair_black = (20, 18, 16, 255)
    bat_wood = (222, 186, 136, 255)
    bat_wood_dark = (188, 148, 98, 255)
    grip_navy = (30, 58, 138, 255)
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
        return [int(u0 * w), int((1.0 - v1) * h), int(u1 * w), int((1.0 - v0) * h)]

    # =========================================================================
    # ZONE 1: HEAD (U:[0.02..0.48], V:[0.52..0.98])
    # =========================================================================
    hb = to_px(0.02, 0.52, 0.48, 0.98)
    draw_alb.rectangle(hb, fill=skin_med)
    draw_rough.rectangle(hb, fill=135)

    # Hair top & fade
    draw_alb.rectangle([hb[0], hb[1], hb[2], hb[1] + int((hb[3]-hb[1])*0.32)], fill=hair_black)
    fade_w = int((hb[2] - hb[0]) * 0.28)
    for fx in range(fade_w):
        t = fx / fade_w
        c = (int(hair_black[0]*(1-t) + skin_med[0]*t), int(hair_black[1]*(1-t) + skin_med[1]*t), int(hair_black[2]*(1-t) + skin_med[2]*t), 255)
        draw_alb.line([(hb[0] + fx, hb[1] + 50), (hb[0] + fx, hb[3] - 40)], fill=c)
        draw_alb.line([(hb[2] - fx, hb[1] + 50), (hb[2] - fx, hb[3] - 40)], fill=c)

    # Paste face cleanly
    cw, ch = crop_head.size
    clean_head = crop_head.crop((int(cw * 0.20), int(ch * 0.08), int(cw * 0.82), int(ch * 0.94)))
    chw, chh = clean_head.size
    h_mask = Image.new('L', (chw, chh), 0)
    hmd = ImageDraw.Draw(h_mask)
    hmd.ellipse([15, 10, chw - 15, chh - 10], fill=255)
    h_mask = h_mask.filter(ImageFilter.GaussianBlur(radius=8))

    dest_w = int((hb[2] - hb[0]) * 0.70)
    dest_h = int((hb[3] - hb[1]) * 0.92)
    head_res = clean_head.resize((dest_w, dest_h), Image.Resampling.LANCZOS)
    mask_res = h_mask.resize((dest_w, dest_h), Image.Resampling.LANCZOS)

    dest_x = hb[0] + int((hb[2] - hb[0] - dest_w) / 2)
    dest_y = hb[1] + int((hb[3] - hb[1] - dest_h) / 2)
    albedo.paste(head_res, (dest_x, dest_y), mask_res)

    # Seamless headband sides to complete 360 wrap without crossing the face
    band_y0 = dest_y + int(dest_h * 0.20)
    band_y1 = band_y0 + int(dest_h * 0.12)
    draw_alb.rectangle([hb[0], band_y0, dest_x, band_y1], fill=jersey_royal)
    draw_alb.rectangle([dest_x + dest_w, band_y0, hb[2], band_y1], fill=jersey_royal)
    draw_alb.line([(hb[0], band_y0), (dest_x, band_y0)], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(hb[0], band_y1), (dest_x, band_y1)], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(dest_x + dest_w, band_y0), (hb[2], band_y0)], fill=(255, 255, 255, 255), width=3)
    draw_alb.line([(dest_x + dest_w, band_y1), (hb[2], band_y1)], fill=(255, 255, 255, 255), width=3)

    # =========================================================================
    # ZONE 2: JERSEY & TORSO (U:[0.52..0.98], V:[0.52..0.98])
    # =========================================================================
    jb = to_px(0.52, 0.52, 0.98, 0.98)
    draw_alb.rectangle(jb, fill=jersey_royal)
    draw_rough.rectangle(jb, fill=185)

    if crop_jersey:
        jw, jh = crop_jersey.size
        clean_jersey = crop_jersey.copy()
        cjd = ImageDraw.Draw(clean_jersey)
        # Cleanly replace top left shoulder with smooth royal blue
        cjd.polygon([(0, 0), (int(jw*0.48), 0), (int(jw*0.35), int(jh*0.45)), (0, int(jh*0.35))], fill=jersey_royal)
        # Cleanly replace text (INDIA/MPL)
        cjd.rectangle([int(jw * 0.12), int(jh * 0.40), int(jw * 0.80), int(jh * 0.68)], fill=jersey_royal)
        cjd.rectangle([int(jw * 0.12), int(jh * 0.22), int(jw * 0.42), int(jh * 0.40)], fill=jersey_royal)

        # Dynamic chest athletic stripes
        cjd.polygon([(int(jw*0.25), int(jh*0.62)), (int(jw*0.45), int(jh*0.45)), (int(jw*0.85), int(jh*0.75)), (int(jw*0.65), int(jh*0.92))], fill=(14, 165, 233, 255))
        cjd.polygon([(int(jw*0.40), int(jh*0.50)), (int(jw*0.55), int(jh*0.38)), (int(jw*0.90), int(jh*0.65)), (int(jw*0.75), int(jh*0.78))], fill=orange_saffron)

        dest_jw = jb[2] - jb[0]
        dest_jh = jb[3] - jb[1]
        jersey_resized = clean_jersey.resize((dest_jw, dest_jh), Image.Resampling.LANCZOS)
        albedo.paste(jersey_resized, (jb[0], jb[1]))

    # =========================================================================
    # ZONE 3: CRICKET BAT (U:[0.78..0.98], V:[0.02..0.48])
    # =========================================================================
    bb = to_px(0.78, 0.02, 0.98, 0.48)
    draw_alb.rectangle(bb, fill=bat_wood)
    draw_rough.rectangle(bb, fill=110)

    for gy in range(bb[1] + 160, bb[3], 6):
        grain_col = bat_wood_dark if (gy % 18 == 0) else (234, 198, 150, 255)
        draw_alb.line([(bb[0], gy), (bb[2], gy)], fill=grain_col, width=2)

    handle_h = int((bb[3] - bb[1]) * 0.28)
    handle_box = [bb[0] + 30, bb[1], bb[2] - 30, bb[1] + handle_h]
    draw_alb.rectangle(handle_box, fill=grip_navy)
    draw_rough.rectangle(handle_box, fill=165)
    for hy in range(handle_box[1] + 8, handle_box[3], 12):
        draw_alb.line([(handle_box[0], hy), (handle_box[2], hy)], fill=(59, 130, 246, 255), width=2)

    decal_y0 = bb[1] + handle_h + 30
    decal_y1 = decal_y0 + 130
    draw_alb.rectangle([bb[0] + 20, decal_y0, bb[2] - 20, decal_y0 + 65], fill=(220, 38, 38, 255))
    draw_alb.rectangle([bb[0] + 20, decal_y0 + 65, bb[2] - 20, decal_y1], fill=grip_navy)
    draw_alb.line([(bb[0] + 20, decal_y0), (bb[2] - 20, decal_y0)], fill=(255, 255, 255, 255), width=5)
    draw_alb.line([(bb[0] + 20, decal_y1), (bb[2] - 20, decal_y1)], fill=(255, 255, 255, 255), width=5)

    # =========================================================================
    # ZONE 4: ARMS & GLOVES (U:[0.02..0.38], V:[0.26..0.50])
    # =========================================================================
    ab = to_px(0.02, 0.26, 0.38, 0.50)
    draw_alb.rectangle(ab, fill=skin_med)
    draw_rough.rectangle(ab, fill=135)

    sleeve_h = int((ab[3] - ab[1]) * 0.30)
    draw_alb.rectangle([ab[0], ab[1], ab[0] + 180, ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[0], ab[1] + sleeve_h - 15, ab[0] + 180, ab[1] + sleeve_h], fill=orange_saffron)
    draw_alb.rectangle([ab[2] - 180, ab[1], ab[2], ab[1] + sleeve_h], fill=jersey_royal)
    draw_alb.rectangle([ab[2] - 180, ab[1] + sleeve_h - 15, ab[2], ab[1] + sleeve_h], fill=orange_saffron)

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
    draw_alb.line([(tb[0], tb[1] + 20), (tb[2], tb[1] + 20)], fill=(14, 116, 178, 255), width=6)

    # =========================================================================
    # ZONE 6: BATTING PADS (U:[0.38..0.76], V:[0.02..0.24])
    # =========================================================================
    pb = to_px(0.38, 0.02, 0.76, 0.24)
    draw_alb.rectangle(pb, fill=jersey_royal)
    draw_rough.rectangle(pb, fill=95)

    if crop_pads:
        pw, ph = crop_pads.size
        clean_pads = crop_pads.crop((0, 0, pw, int(ph * 0.75)))
        
        # Eliminate background grass/turf: keep only blue/white/orange pad pixels
        pad_arr = np.array(clean_pads)
        is_blue = (pad_arr[:, :, 2] > 110) & (pad_arr[:, :, 2] > pad_arr[:, :, 0] + 10)
        is_white = (pad_arr[:, :, 0] > 190) & (pad_arr[:, :, 1] > 190) & (pad_arr[:, :, 2] > 190)
        is_orange = (pad_arr[:, :, 0] > 180) & (pad_arr[:, :, 1] > 80) & (pad_arr[:, :, 2] < 60)
        is_pad = is_blue | is_white | is_orange
        pad_arr[~is_pad] = [2, 132, 199, 255]

        # Cleanly remove text
        pad_arr[int(ph * 0.52):, :int(pw * 0.40)] = [2, 132, 199, 255]
        pad_arr[int(ph * 0.52):, int(pw * 0.60):] = [2, 132, 199, 255]

        clean_pads = Image.fromarray(pad_arr)
        dest_pw = pb[2] - pb[0]
        dest_ph = pb[3] - pb[1]
        pads_resized = clean_pads.resize((dest_pw, dest_ph), Image.Resampling.LANCZOS)
        albedo.paste(pads_resized, (pb[0], pb[1]))

    # =========================================================================
    # ZONE 7: SHOES (U:[0.02..0.38], V:[0.02..0.24])
    # =========================================================================
    sb = to_px(0.02, 0.02, 0.38, 0.24)
    draw_alb.rectangle(sb, fill=shoe_white)
    draw_rough.rectangle(sb, fill=130)

    draw_alb.rectangle([sb[0] + 15, sb[1] + 15, sb[2] - 15, sb[1] + int((sb[3]-sb[1])*0.50)], fill=jersey_royal)
    draw_alb.polygon([
        (sb[0] + 40, sb[1] + 45),
        (sb[2] - 40, sb[1] + 30),
        (sb[2] - 60, sb[1] + 65),
        (sb[0] + 30, sb[1] + 75)
    ], fill=orange_saffron)

    ms_y0 = sb[3] - int((sb[3]-sb[1])*0.32)
    ms_y1 = sb[3] - int((sb[3]-sb[1])*0.12)
    draw_alb.rectangle([sb[0], ms_y0, sb[2], ms_y1], fill=(255, 255, 255, 255))

    draw_alb.rectangle([sb[0], ms_y1, sb[2], sb[3]], fill=shoe_sole)
    for spx in range(sb[0] + 15, sb[2], 25):
        draw_alb.rectangle([spx, sb[3] - 10, spx + 12, sb[3]], fill=(15, 23, 42, 255))

    # =========================================================================
    # NORMAL & AO
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

    albedo.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    normal.save(os.path.join(tex_dir, 'batsman_normal.png'), 'PNG')
    roughness.save(os.path.join(tex_dir, 'batsman_roughness.png'), 'PNG')
    metallic.save(os.path.join(tex_dir, 'batsman_metallic.png'), 'PNG')
    ao.save(os.path.join(tex_dir, 'batsman_ao.png'), 'PNG')

    # =========================================================================
    # Accurate UV Assignment per Anatomical Part
    # =========================================================================
    uvs = np.zeros((N, 2), dtype=np.float32)
    head_cx = 0.04
    head_cz = 0.04

    for i in range(N):
        x, y, z = verts[i]

        is_bat = (y > 0.65 and x > 0.08 and z < 0.05) or (y > 0.88) or (y > 0.35 and y <= 0.65 and x > 0.14 and z < 0.02)
        if is_bat:
            u_bat = (x - 0.08) / 0.34
            v_bat = (y - 0.35) / 0.65
            u = 0.78 + np.clip(u_bat, 0.0, 1.0) * 0.20
            v = 0.02 + np.clip(v_bat, 0.0, 1.0) * 0.46
        elif y > 0.55:
            # Head cylindrical angle centered on face
            angle = math.atan2(x - head_cx, z - head_cz)
            u_head = 0.5 + (angle / (2.0 * math.pi))
            v_head = (y - 0.55) / 0.33
            u = 0.02 + np.clip(u_head, 0.0, 1.0) * 0.46
            v = 0.52 + np.clip(v_head, 0.0, 1.0) * 0.46
        elif y <= -0.85:
            u_shoe = (x + 0.35) / 0.70
            v_shoe = (y + 1.02) / 0.18
            u = 0.02 + np.clip(u_shoe, 0.0, 1.0) * 0.36
            v = 0.02 + np.clip(v_shoe, 0.0, 1.0) * 0.22
        elif y <= -0.30:
            if z >= -0.04:
                u_pad = (x + 0.25) / 0.50
                v_pad = (y + 0.85) / 0.55
                u = 0.38 + np.clip(u_pad, 0.0, 1.0) * 0.38
                v = 0.02 + np.clip(v_pad, 0.0, 1.0) * 0.22
            else:
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.85) / 0.55
                u = 0.38 + np.clip(u_tr, 0.0, 1.0) * 0.38
                v = 0.26 + np.clip(v_tr, 0.0, 1.0) * 0.12
        elif y <= 0.10:
            if x > 0.20 and y <= 0.05:
                u_gl = (x - 0.20) / 0.22
                v_gl = (y + 0.25) / 0.30
                u = 0.02 + np.clip(u_gl, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_gl, 0.0, 1.0) * 0.24
            else:
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.30) / 0.40
                u = 0.38 + np.clip(u_tr, 0.0, 1.0) * 0.38
                v = 0.38 + np.clip(v_tr, 0.0, 1.0) * 0.12
        else:
            if x < -0.15 and y > 0.30:
                u_arm = (x + 0.42) / 0.27
                v_arm = (y - 0.10) / 0.45
                u = 0.20 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_arm, 0.0, 1.0) * 0.24
            elif x > 0.18:
                u_arm = (x - 0.18) / 0.24
                v_arm = (y - 0.10) / 0.45
                u = 0.02 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.26 + np.clip(v_arm, 0.0, 1.0) * 0.24
            else:
                u_j = (x + 0.18) / 0.36
                v_j = (y - 0.10) / 0.45
                u = 0.52 + np.clip(u_j, 0.0, 1.0) * 0.46
                v = 0.52 + np.clip(v_j, 0.0, 1.0) * 0.46

        uvs[i] = [float(np.clip(u, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

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
        "asset": {"version": "2.0", "generator": "Cricket Strike Flawless PBR Engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Batsman_PBR", "mesh": 0}],
        "meshes": [
            {
                "name": "Batsman_Mesh",
                "primitives": [
                    {
                        "attributes": {"POSITION": 1, "NORMAL": 2, "TEXCOORD_0": 3},
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
            {"buffer": 0, "byteOffset": offset0, "byteLength": len0, "target": 34963},
            {"buffer": 0, "byteOffset": offset1, "byteLength": len1, "target": 34962},
            {"buffer": 0, "byteOffset": offset2, "byteLength": len2, "target": 34962},
            {"buffer": 0, "byteOffset": offset3, "byteLength": len3, "target": 34962}
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

    print('Built flawless batsman GLB and textures successfully!')

if __name__ == '__main__':
    build_flawless()
