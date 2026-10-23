import os
import sys
import math
import numpy as np
from PIL import Image, ImageEnhance, ImageDraw
import trimesh
from test_rasterizer import render_mesh_to_image

def enhance_textures():
    tex_dir = './backend/public/models/textures'
    
    # 1. Front Texture
    front_path = os.path.join(tex_dir, 'batsman_albedo.png')
    front = Image.open(front_path).convert('RGBA')
    
    # Enhance Color Saturation (1.3x) & Contrast (1.15x) for deep original colors
    enh_col = ImageEnhance.Color(front)
    front_rich = enh_col.enhance(1.35)
    enh_con = ImageEnhance.Contrast(front_rich)
    front_rich = enh_con.enhance(1.18)
    enh_bri = ImageEnhance.Brightness(front_rich)
    front_rich = enh_bri.enhance(0.92) # Deepen tones so it never looks washed out
    
    front_rich.save(os.path.join(tex_dir, 'batsman_albedo.png'), 'PNG')
    print('Enhanced batsman_albedo.png with deep original colors!')

    # 2. Back Texture
    back_path = os.path.join(tex_dir, 'batsman_back.png')
    back = Image.open(back_path).convert('RGBA')
    
    enh_col_b = ImageEnhance.Color(back)
    back_rich = enh_col_b.enhance(1.35)
    enh_con_b = ImageEnhance.Contrast(back_rich)
    back_rich = enh_con_b.enhance(1.18)
    enh_bri_b = ImageEnhance.Brightness(back_rich)
    back_rich = enh_bri_b.enhance(0.92)
    
    back_rich.save(os.path.join(tex_dir, 'batsman_back.png'), 'PNG')
    print('Enhanced batsman_back.png with deep original colors!')

if __name__ == '__main__':
    enhance_textures()
