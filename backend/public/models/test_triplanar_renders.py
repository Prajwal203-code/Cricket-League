import os
import sys
import math
import numpy as np
from PIL import Image
import trimesh

def test_triplanar_offline_renders():
    input_glb = './backend/public/models/batsman.glb'
    mesh = trimesh.load(input_glb, force='mesh')
    mesh.merge_vertices()

    verts = mesh.vertices.astype(np.float32)
    faces = mesh.faces.astype(np.uint32)
    normals = mesh.vertex_normals.astype(np.float32)
    N = len(verts)

    x_min, x_max = float(verts[:,0].min()), float(verts[:,0].max())
    y_min, y_max = float(verts[:,1].min()), float(verts[:,1].max())
    z_min, z_max = float(verts[:,2].min()), float(verts[:,2].max())

    tex_dir = './backend/public/models/textures'
    tex_front = Image.open(os.path.join(tex_dir, 'batsman_albedo.png')).convert('RGBA')
    tex_back = Image.open(os.path.join(tex_dir, 'batsman_back.png')).convert('RGBA')
    tex_side = Image.open(os.path.join(tex_dir, 'batsman_side.png')).convert('RGBA')

    tw, th = tex_front.size
    arr_f = np.array(tex_front)
    arr_b = np.array(tex_back)
    arr_s = np.array(tex_side)

    # UV coordinates
    uvs_front = np.zeros((N, 2), dtype=np.float32)
    uvs_back = np.zeros((N, 2), dtype=np.float32)
    uvs_side = np.zeros((N, 2), dtype=np.float32)

    for i in range(N):
        x, y, z = verts[i]
        u_f = (x - x_min) / (x_max - x_min)
        u_b = 1.0 - u_f
        u_s = (z - z_min) / (z_max - z_min)
        v = (y - y_min) / (y_max - y_min)

        uvs_front[i] = [float(np.clip(u_f, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]
        uvs_back[i] = [float(np.clip(u_b, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]
        uvs_side[i] = [float(np.clip(u_s, 0.001, 0.999)), float(np.clip(v, 0.001, 0.999))]

    out_dir = './backend/public/models/verification_renders'
    os.makedirs(out_dir, exist_ok=True)

    # Software Tri-Planar Rasterizer
    def render_triplanar(rot_y_deg, filename):
        width, height = 400, 700
        rad = math.radians(rot_y_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)

        # Rotate mesh
        rv = np.zeros_like(verts)
        rv[:, 0] = verts[:, 0] * cos_a + verts[:, 2] * sin_a
        rv[:, 1] = verts[:, 1]
        rv[:, 2] = -verts[:, 0] * sin_a + verts[:, 2] * cos_a

        # Rotate normals
        rn = np.zeros_like(normals)
        rn[:, 0] = normals[:, 0] * cos_a + normals[:, 2] * sin_a
        rn[:, 1] = normals[:, 1]
        rn[:, 2] = -normals[:, 0] * sin_a + normals[:, 2] * cos_a

        # Projection
        cy = (y_min + y_max) * 0.5
        scale_y = (height * 0.88) / (y_max - y_min)
        scale_x = scale_y

        sx = (rv[:, 0] * scale_x + width * 0.5)
        sy = (height * 0.94 - (rv[:, 1] - y_min) * scale_y)
        sz = rv[:, 2]

        z_buf = np.full((height, width), -1e9, dtype=np.float32)
        out_pixels = np.zeros((height, width, 4), dtype=np.uint8)

        for f in faces:
            i0, i1, i2 = f
            p0 = np.array([sx[i0], sy[i0], sz[i0]])
            p1 = np.array([sx[i1], sy[i1], sz[i1]])
            p2 = np.array([sx[i2], sy[i2], sz[i2]])

            # Backface culling in screen space
            det = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
            if det >= 0:
                continue

            min_x = max(0, int(math.floor(min(p0[0], p1[0], p2[0]))))
            max_x = min(width - 1, int(math.ceil(max(p0[0], p1[0], p2[0]))))
            min_y = max(0, int(math.floor(min(p0[1], p1[1], p2[1]))))
            max_y = min(height - 1, int(math.ceil(max(p0[1], p1[1], p2[1]))))

            if min_x > max_x or min_y > max_y:
                continue

            inv_det = 1.0 / det

            # Average model-space normal for triangle
            avg_mn = (normals[i0] + normals[i1] + normals[i2]) / 3.0
            
            # Tri-Planar weights
            wf = max(0.0, avg_mn[2]) ** 2
            wb = max(0.0, -avg_mn[2]) ** 2
            ws = (abs(avg_mn[0]) * 1.5) ** 2
            w_sum = wf + wb + ws
            if w_sum < 1e-6:
                wf, wb, ws = 1.0, 0.0, 0.0
                w_sum = 1.0
            wf /= w_sum
            wb /= w_sum
            ws /= w_sum

            # Triangle UVs
            uv_f_tri = (uvs_front[i0] + uvs_front[i1] + uvs_front[i2]) / 3.0
            uv_b_tri = (uvs_back[i0] + uvs_back[i1] + uvs_back[i2]) / 3.0
            uv_s_tri = (uvs_side[i0] + uvs_side[i1] + uvs_side[i2]) / 3.0

            # Pixel sample
            px_f = arr_f[int(np.clip((1.0 - uv_f_tri[1]) * (th - 1), 0, th - 1)), int(np.clip(uv_f_tri[0] * (tw - 1), 0, tw - 1))]
            px_b = arr_b[int(np.clip((1.0 - uv_b_tri[1]) * (th - 1), 0, th - 1)), int(np.clip(uv_b_tri[0] * (tw - 1), 0, tw - 1))]
            px_s = arr_s[int(np.clip((1.0 - uv_s_tri[1]) * (th - 1), 0, th - 1)), int(np.clip(uv_s_tri[0] * (tw - 1), 0, tw - 1))]

            col = (px_f.astype(np.float32) * wf + px_b.astype(np.float32) * wb + px_s.astype(np.float32) * ws).astype(np.uint8)

            # Rasterize
            for py in range(min_y, max_y + 1):
                for px in range(min_x, max_x + 1):
                    w0 = ((p1[0] - px) * (p2[1] - py) - (p1[1] - py) * (p2[0] - px)) * inv_det
                    w1 = ((p2[0] - px) * (p0[1] - py) - (p2[1] - py) * (p0[0] - px)) * inv_det
                    w2 = 1.0 - w0 - w1

                    if w0 >= 0 and w1 >= 0 and w2 >= 0:
                        pz = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
                        if pz > z_buf[py, px]:
                            z_buf[py, px] = pz
                            out_pixels[py, px] = col

        img = Image.fromarray(out_pixels, 'RGBA')
        img.save(os.path.join(out_dir, filename), 'PNG')
        print(f'Rendered {filename}!')

    # Render Front (0 deg), Side (90 deg), and Back (180 deg)
    render_triplanar(0, 'triplanar_front_0deg.png')
    render_triplanar(90, 'triplanar_side_90deg.png')
    render_triplanar(180, 'triplanar_back_180deg.png')

if __name__ == '__main__':
    test_triplanar_offline_renders()
