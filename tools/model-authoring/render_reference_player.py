"""Render the exported GLB's actual geometry and embedded textures without a browser.

The unlit, orthographic previews share one depth buffer across all materials.
Run after restore_reference_player.py. Output is kept in verification_renders.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw
import trimesh

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'backend/public/models/hero_reference_reconstruction.glb'
OUTPUT = ROOT / 'backend/public/models/verification_renders'


def render(scene, angle, width=460, height=840):
    radians = math.radians(angle)
    c, s = math.cos(radians), math.sin(radians)
    rotation = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    frame = np.full((height, width, 4), [227, 232, 240, 255], dtype=np.uint8)
    depth = np.full((height, width), -np.inf)
    scale = (height - 90) / 1.93
    for name in scene.graph.nodes_geometry:
        transform, key = scene.graph[name]
        mesh = scene.geometry[key]
        vertices = trimesh.transform_points(mesh.vertices, transform) @ rotation.T
        xy = np.column_stack((width / 2 + vertices[:, 0] * scale,
                              height - 40 - vertices[:, 1] * scale))
        uv = mesh.visual.uv
        texture = np.asarray(mesh.visual.material.baseColorTexture.convert('RGB'))
        th, tw = texture.shape[:2]
        for face in mesh.faces:
            p = xy[face]
            a, b = p[1] - p[0], p[2] - p[0]
            area = a[0]*b[1] - a[1]*b[0]
            if area >= -1e-8:
                continue
            lo = np.maximum(np.floor(p.min(axis=0)).astype(int), [0, 0])
            hi = np.minimum(np.ceil(p.max(axis=0)).astype(int), [width - 1, height - 1])
            if np.any(lo > hi):
                continue
            xx, yy = np.meshgrid(np.arange(lo[0], hi[0] + 1) + .5,
                                 np.arange(lo[1], hi[1] + 1) + .5)
            w0 = ((p[1, 0] - xx) * (p[2, 1] - yy) - (p[1, 1] - yy) * (p[2, 0] - xx)) / area
            w1 = ((p[2, 0] - xx) * (p[0, 1] - yy) - (p[2, 1] - yy) * (p[0, 0] - xx)) / area
            w2 = 1 - w0 - w1
            z = w0 * vertices[face[0], 2] + w1 * vertices[face[1], 2] + w2 * vertices[face[2], 2]
            region = np.s_[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            visible = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6) & (z > depth[region])
            if not visible.any():
                continue
            tex_uv = w0[..., None] * uv[face[0]] + w1[..., None] * uv[face[1]] + w2[..., None] * uv[face[2]]
            tx = np.clip(tex_uv[..., 0] * tw - .5, 0, tw - 1)
            ty = np.clip((1 - tex_uv[..., 1]) * th - .5, 0, th - 1)
            ix, iy = tx.astype(int), ty.astype(int)
            fx, fy = (tx - ix)[..., None], (ty - iy)[..., None]
            jx, jy = np.minimum(ix + 1, tw - 1), np.minimum(iy + 1, th - 1)
            color = (1-fy) * ((1-fx)*texture[iy, ix] + fx*texture[iy, jx]) + fy * ((1-fx)*texture[jy, ix] + fx*texture[jy, jx])
            frame[region][visible, :3] = color[visible].astype(np.uint8)
            depth[region][visible] = z[visible]
    return Image.fromarray(frame)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scene = trimesh.load(MODEL, force='scene', process=False)
    board = Image.new('RGB', (460 * 4, 875), '#e3e8f0')
    for index, angle in enumerate([0, 35, 90, 180]):
        result = render(scene, angle)
        result.save(OUTPUT / f'reference_{angle}.png')
        board.paste(result, (460 * index, 35))
        ImageDraw.Draw(board).text((460 * index + 20, 12), f'{angle} degrees - reconstructed mesh', fill='#18283e')
        print(f'Rendered {angle} degrees', flush=True)
    board.save(OUTPUT / 'reference_contact_sheet.jpg', quality=94)


if __name__ == '__main__':
    main()
