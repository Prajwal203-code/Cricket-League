import os
import sys
import math
import struct
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import trimesh

def render_mesh_to_image(mesh, uvs, texture, width=512, height=1024, rot_y_deg=0):
    # Software UV texture rasterizer for exact visual verification
    verts = mesh.vertices.copy()
    faces = mesh.faces
    normals = mesh.vertex_normals
    
    # Rotate around Y axis
    rad = math.radians(rot_y_deg)
    cos_r = math.cos(rad)
    sin_r = math.sin(rad)
    rot_matrix = np.array([
        [cos_r, 0, sin_r],
        [0, 1, 0],
        [-sin_r, 0, cos_r]
    ])
    verts = verts @ rot_matrix.T
    
    # Camera setup (Orthographic view)
    # Fit into viewport
    x_min, x_max = -0.65, 0.65
    y_min, y_max = -1.15, 1.15
    
    # Screen coordinates
    screen_x = ((verts[:, 0] - x_min) / (x_max - x_min) * (width - 1)).astype(np.float32)
    # y=y_max -> screen_y=0 (top), y=y_min -> screen_y=height-1 (bottom)
    screen_y = ((y_max - verts[:, 1]) / (y_max - y_min) * (height - 1)).astype(np.float32)
    screen_z = verts[:, 2] # depth (higher is closer to camera)
    
    tex_w, tex_h = texture.size
    tex_arr = np.array(texture)
    
    # Z-buffer and frame buffer
    z_buffer = np.full((height, width), -1e9, dtype=np.float32)
    frame_buffer = np.zeros((height, width, 4), dtype=np.uint8)
    frame_buffer[:, :, 3] = 0 # Transparent background
    
    # Light direction: from top-front-right
    light_dir = np.array([0.4, 0.7, 0.6])
    light_dir /= np.linalg.norm(light_dir)
    
    for f in faces:
        v0, v1, v2 = f
        # Screen positions
        p0 = np.array([screen_x[v0], screen_y[v0]])
        p1 = np.array([screen_x[v1], screen_y[v1]])
        p2 = np.array([screen_x[v2], screen_y[v2]])
        
        # 2D cross product for backface culling & area
        area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
        if area <= 0: # backface or degenerate
            continue
            
        z0, z1, z2 = screen_z[v0], screen_z[v1], screen_z[v2]
        uv0, uv1, uv2 = uvs[v0], uvs[v1], uvs[v2]
        
        # Face normal & simple directional lighting
        fn = normals[f].mean(axis=0) @ rot_matrix.T
        fn_len = np.linalg.norm(fn)
        if fn_len > 0:
            fn /= fn_len
        diffuse = max(0.2, float(np.dot(fn, light_dir)))
        ambient = 0.5
        light_factor = min(1.3, ambient + diffuse * 0.7)
        
        # Bounding box of triangle
        min_x = max(0, int(np.floor(min(p0[0], p1[0], p2[0]))))
        max_x = min(width - 1, int(np.ceil(max(p0[0], p1[0], p2[0]))))
        min_y = max(0, int(np.floor(min(p0[1], p1[1], p2[1]))))
        max_y = min(height - 1, int(np.ceil(max(p0[1], p1[1], p2[1]))))
        
        if min_x > max_x or min_y > max_y:
            continue
            
        # Barycentric rasterization
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                p = np.array([x + 0.5, y + 0.5])
                w0 = ((p1[0] - p[0]) * (p2[1] - p[1]) - (p1[1] - p[1]) * (p2[0] - p[0])) / area
                w1 = ((p2[0] - p[0]) * (p0[1] - p[1]) - (p2[1] - p[1]) * (p0[0] - p[0])) / area
                w2 = 1.0 - w0 - w1
                
                if w0 >= -0.01 and w1 >= -0.01 and w2 >= -0.01:
                    z = w0 * z0 + w1 * z1 + w2 * z2
                    if z > z_buffer[y, x]:
                        z_buffer[y, x] = z
                        # Interpolate UV
                        uv = w0 * uv0 + w1 * uv1 + w2 * uv2
                        # Sample texture (v=1 at top, v=0 at bottom for WebGL conventions)
                        tx = int(np.clip(uv[0] * (tex_w - 1), 0, tex_w - 1))
                        ty = int(np.clip((1.0 - uv[1]) * (tex_h - 1), 0, tex_h - 1))
                        
                        col = tex_arr[ty, tx].astype(np.float32)
                        lit_col = np.clip(col[:3] * light_factor, 0, 255).astype(np.uint8)
                        frame_buffer[y, x, :3] = lit_col
                        frame_buffer[y, x, 3] = 255
                        
    return Image.fromarray(frame_buffer, 'RGBA')

print('Rasterizer defined!')
