import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

# Load mesh
mesh = trimesh.load('./backend/public/models/batsman.glb', force='mesh')
verts = mesh.vertices
x_min, x_max = verts[:,0].min(), verts[:,0].max()
y_min, y_max = verts[:,1].min(), verts[:,1].max()

print(f'Mesh X bounds: [{x_min:.3f}, {x_max:.3f}], Y bounds: [{y_min:.3f}, {y_max:.3f}]')

# Load hero_IN image
img_front = Image.open('./backend/public/images/players/hero_IN.jpg').convert('RGBA')
fw, fh = img_front.size
print(f'Front image size: {fw}x{fh}')

# In hero_IN.jpg, crop the player tightly to match the mesh bounds
# Bat tip is at top right (y ~ 130), shoe bottoms at y ~ 1315
# Leftmost (viewer left) hand at x ~ 100, rightmost (viewer right) pad/shoe at x ~ 620
player_box = (100, 120, 625, 1320)
player_crop = img_front.crop(player_box)
print(f'Player cropped size: {player_crop.size}')

# Create 2048x2048 texture atlas
# Left: Front View [0.0..0.50]
# Right: Back View [0.50..1.0]
atlas = Image.new('RGBA', (2048, 2048), (2, 132, 199, 255)) # Team India Blue base

# Resize player crop to fit left half (1024 x 2048)
front_tex = player_crop.resize((1000, 2000), Image.Resampling.LANCZOS)
atlas.paste(front_tex, (12, 24))

# Create back view on right half (1000 x 2000)
# Back view has black hair at top, royal blue jersey with orange collar/trim, blue trousers, rear pad straps, wooden bat spine
back_tex = Image.new('RGBA', (1000, 2000), (2, 132, 199, 255))
b_draw = ImageDraw.Draw(back_tex)

# 1. Hair & Fade on back of head (y: 0..450)
b_draw.rectangle([250, 80, 750, 480], fill=(20, 18, 16, 255)) # Black hair
# Fade edges
for fx in range(120):
    t = fx / 120.0
    c = (int(20*(1-t) + 180*t), int(18*(1-t) + 126*t), int(16*(1-t) + 90*t), 255)
    b_draw.line([(250 - fx, 200), (250 - fx, 480)], fill=c)
    b_draw.line([(750 + fx, 200), (750 + fx, 480)], fill=c)

# Headband on back
b_draw.rectangle([150, 320, 850, 390], fill=(2, 132, 199, 255))
b_draw.line([(150, 320), (850, 320)], fill=(255, 255, 255, 255), width=4)
b_draw.line([(150, 390), (850, 390)], fill=(255, 255, 255, 255), width=4)

# 2. Orange collar & jersey back (y: 480..1050)
b_draw.rectangle([200, 480, 800, 560], fill=(249, 115, 22, 255)) # Orange collar band
b_draw.line([(200, 560), (800, 560)], fill=(255, 255, 255, 255), width=5)

# Orange side stripes along jersey back flanks
b_draw.polygon([(200, 560), (300, 560), (320, 1050), (200, 1050)], fill=(249, 115, 22, 255))
b_draw.polygon([(800, 560), (700, 560), (680, 1050), (800, 1050)], fill=(249, 115, 22, 255))

# 3. Bat Back Wooden Spine (Left side of back view: x: 100..320, y: 150..950)
b_draw.polygon([(120, 150), (300, 150), (380, 950), (200, 950)], fill=(222, 186, 136, 255))
# Wood grain
for gy in range(160, 950, 12):
    b_draw.line([(120, gy), (380, gy)], fill=(188, 148, 98, 255), width=2)

# 4. Trousers Back & Pad Straps (y: 1050..1850)
# Trousers blue
b_draw.rectangle([150, 1050, 850, 1850], fill=(2, 132, 199, 255))
# Orange outer racing stripes
b_draw.rectangle([150, 1050, 220, 1850], fill=(249, 115, 22, 255))
b_draw.rectangle([780, 1050, 850, 1850], fill=(249, 115, 22, 255))

# Pad Rear Straps with metal buckles (y: 1350..1800)
for sy in [1420, 1580, 1740]:
    b_draw.rectangle([180, sy, 460, sy + 35], fill=(30, 58, 138, 255)) # Left leg strap
    b_draw.rectangle([540, sy, 820, sy + 35], fill=(30, 58, 138, 255)) # Right leg strap
    b_draw.line([(180, sy), (460, sy)], fill=(255, 255, 255, 255), width=2)
    b_draw.line([(540, sy), (820, sy)], fill=(255, 255, 255, 255), width=2)
    # Metal buckle
    b_draw.rectangle([300, sy + 5, 340, sy + 30], fill=(220, 220, 220, 255))
    b_draw.rectangle([660, sy + 5, 700, sy + 30], fill=(220, 220, 220, 255))

# 5. Shoes Heel Back (y: 1850..2000)
b_draw.rectangle([150, 1850, 440, 1960], fill=(248, 250, 252, 255)) # White heels
b_draw.rectangle([560, 1850, 850, 1960], fill=(248, 250, 252, 255))
# Blue overlays & Orange heel tab
b_draw.rectangle([150, 1860, 440, 1910], fill=(2, 132, 199, 255))
b_draw.rectangle([560, 1860, 850, 1910], fill=(2, 132, 199, 255))
b_draw.rectangle([280, 1850, 310, 1930], fill=(249, 115, 22, 255))
b_draw.rectangle([690, 1850, 720, 1930], fill=(249, 115, 22, 255))
# Dark sole
b_draw.rectangle([150, 1960, 440, 2000], fill=(30, 41, 59, 255))
b_draw.rectangle([560, 1960, 850, 2000], fill=(30, 41, 59, 255))

atlas.paste(back_tex, (1036, 24))
atlas.save('./backend/public/models/textures/batsman_albedo.png', 'PNG')

# Generate matching normal map
gray = atlas.convert('L')
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
normal.save('./backend/public/models/textures/batsman_normal.png', 'PNG')

# Roughness
roughness = Image.new('L', (2048, 2048), 170)
# Darken face skin and pad areas
r_draw = ImageDraw.Draw(roughness)
r_draw.rectangle([0, 0, 1024, 2048], fill=140)
roughness.save('./backend/public/models/textures/batsman_roughness.png', 'PNG')

# Metallic
metallic = Image.new('L', (2048, 2048), 0)
metallic.save('./backend/public/models/textures/batsman_metallic.png', 'PNG')

# AO
ao = Image.new('L', (2048, 2048), 255)
ao.save('./backend/public/models/textures/batsman_ao.png', 'PNG')

print('Generated front/back atlas!')
