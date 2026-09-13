import os
from PIL import Image

img = Image.open('./backend/public/images/players/hero_IN.jpg')
w, h = img.size
print(f'hero_IN.jpg size: {w} x {h}')

# Let's crop various regions from hero_IN.jpg:
# 1. Head & Face (including headband, hair, beard): y around 10% to 25%, x around 40% to 60%
head_crop = img.crop((int(w * 0.38), int(h * 0.10), int(w * 0.62), int(h * 0.25)))
head_crop.save('./backend/public/models/textures/crop_head.png')

# 2. Jersey Torso: y around 23% to 48%, x around 30% to 70%
jersey_crop = img.crop((int(w * 0.28), int(h * 0.23), int(w * 0.72), int(h * 0.48)))
jersey_crop.save('./backend/public/models/textures/crop_jersey.png')

# 3. Cricket Bat: y around 10% to 38%, x around 10% to 70%
bat_crop = img.crop((int(w * 0.10), int(h * 0.10), int(w * 0.72), int(h * 0.38)))
bat_crop.save('./backend/public/models/textures/crop_bat.png')

# 4. Batting Glove: left glove y around 48% to 62%, x around 64% to 82%
glove_crop = img.crop((int(w * 0.64), int(h * 0.48), int(w * 0.84), int(h * 0.62)))
glove_crop.save('./backend/public/models/textures/crop_glove.png')

# 5. Batting Pads: y around 62% to 92%, x around 30% to 75%
pads_crop = img.crop((int(w * 0.30), int(h * 0.62), int(w * 0.76), int(h * 0.92)))
pads_crop.save('./backend/public/models/textures/crop_pads.png')

# 6. Shoes: y around 86% to 98%, x around 24% to 76%
shoes_crop = img.crop((int(w * 0.24), int(h * 0.86), int(w * 0.78), int(h * 0.98)))
shoes_crop.save('./backend/public/models/textures/crop_shoes.png')

print('Cropped all parts successfully!')
