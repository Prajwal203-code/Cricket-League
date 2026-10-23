"""Bake view projections with depth checks, preventing faces from repeating on the bat.

Unseen surfaces interpolate nearby visible surface colors. They are inferred, not
recovered detail. Each triangle has a padded atlas tile to avoid UV overlaps.
"""
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import map_coordinates, maximum_filter
import trimesh
import io
import json
import struct


def depth_map(vertices, faces, xy, sign, size):
    width, height = size
    depth = np.full((height, width), -100., dtype=np.float32)
    for face in faces:
        p = xy[face]
        a, b = p[1] - p[0], p[2] - p[0]
        area = a[0]*b[1] - a[1]*b[0]
        if abs(area) < 1e-7:
            continue
        lo = np.maximum(np.floor(p.min(axis=0)).astype(int), 0)
        hi = np.minimum(np.ceil(p.max(axis=0)).astype(int), [width-1, height-1])
        if np.any(lo > hi):
            continue
        xx, yy = np.meshgrid(np.arange(lo[0], hi[0]+1), np.arange(lo[1], hi[1]+1))
        w0 = ((p[1,0]-xx)*(p[2,1]-yy) - (p[1,1]-yy)*(p[2,0]-xx))/area
        w1 = ((p[2,0]-xx)*(p[0,1]-yy) - (p[2,1]-yy)*(p[0,0]-xx))/area
        w2 = 1-w0-w1
        inside = (w0 >= -.001) & (w1 >= -.001) & (w2 >= -.001)
        z = sign * (w0*vertices[face[0],2] + w1*vertices[face[1],2] + w2*vertices[face[2],2])
        target = depth[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
        np.maximum(target, np.where(inside, z, -100), out=target)
    return maximum_filter(depth, size=3)


def sample_image(image, xy):
    return np.column_stack([map_coordinates(image[:,:,i], [xy[:,1], xy[:,0]], order=1, mode='nearest')
                            for i in range(3)]).astype(float)


def bake(mesh, front_uv, back_uv, front, back):
    views = []
    for uv, photo, sign in [(front_uv, front, 1), (back_uv, back, -1)]:
        xy = uv * [photo.width, -photo.height] + [0, photo.height]
        depth = depth_map(mesh.vertices, mesh.faces, xy, sign, photo.size)
        views.append((xy, np.asarray(photo, dtype=float), sign, depth))
    print('Calculated front and rear visibility', flush=True)
    normals = mesh.vertex_normals

    def projected(points, normal, coordinates, view):
        _, photo, sign, depth = view
        visible_depth = map_coordinates(depth, [coordinates[:,1], coordinates[:,0]], order=0, mode='nearest')
        visible = sign * points[:,2] >= visible_depth - .018
        weight = visible * np.clip((sign*normal[:,2] - .08)/.25, 0, 1)
        return sample_image(photo, coordinates), weight

    known_points, known_normals, known_colors = [], [], []
    # Vertices and face centers seed the unseen sides with nearby visible colors.
    seeds = np.concatenate((mesh.vertices, mesh.triangles.mean(axis=1)))
    seed_normals = np.concatenate((normals, normals[mesh.faces].mean(axis=1)))
    for view in views:
        xy = np.concatenate((view[0], view[0][mesh.faces].mean(axis=1)))
        color, weight = projected(seeds, seed_normals, xy, view)
        visible = weight > .95
        known_points.append(seeds[visible])
        known_normals.append(seed_normals[visible])
        known_colors.append(color[visible])
    known_colors = np.concatenate(known_colors)
    tree = cKDTree(np.column_stack((np.concatenate(known_points), .08*np.concatenate(known_normals))))

    tile = 16
    columns = int(np.ceil(np.sqrt(len(mesh.faces))))
    rows = int(np.ceil(len(mesh.faces) / columns))
    width, height = columns*tile, rows*tile
    atlas = np.zeros((height, width, 3), dtype=np.uint8)
    yy, xx = np.mgrid[:tile, :tile]
    # Pixel centers are clamped to the triangle to fill every gutter.
    bary = np.column_stack((1-(xx.ravel()+yy.ravel()-4)/(tile-5),
                             (xx.ravel()-2)/(tile-5), (yy.ravel()-2)/(tile-5)))
    bary = np.maximum(bary, 0)
    bary /= bary.sum(axis=1, keepdims=True)
    out_uv = np.empty((len(mesh.faces), 3, 2))
    for start in range(0, len(mesh.faces), 128):
        faces = mesh.faces[start:start+128]
        positions = np.einsum('pk,fkc->fpc', bary, mesh.vertices[faces]).reshape(-1,3)
        normal = np.einsum('pk,fkc->fpc', bary, normals[faces]).reshape(-1,3)
        normal /= np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-9)
        distances, indices = tree.query(np.column_stack((positions, .08*normal)), k=3, workers=4)
        weights = 1 / np.maximum(distances, .002)**2
        color = (known_colors[indices] * weights[...,None]).sum(axis=1) / weights.sum(axis=1,keepdims=True)
        for view in views:
            xy = np.einsum('pk,fkc->fpc', bary, view[0][faces]).reshape(-1,2)
            direct, amount = projected(positions, normal, xy, view)
            color = color*(1-amount[:,None]) + direct*amount[:,None]
        colors = np.clip(color, 0, 255).astype('uint8').reshape(len(faces),tile,tile,3)
        for offset, patch in enumerate(colors):
            index = start+offset
            x, y = (index % columns)*tile, (index // columns)*tile
            atlas[y:y+tile, x:x+tile] = patch
            px = np.array([[x+2.5,y+2.5],[x+tile-2.5,y+2.5],[x+2.5,y+tile-2.5]])
            out_uv[index] = px/[width,-height] + [0,1]
        if start % 8192 == 0:
            print(f'Baking appearance: {start}/{len(mesh.faces)} triangles', flush=True)
    result = trimesh.Trimesh(vertices=mesh.vertices[mesh.faces].reshape(-1,3),
                            faces=np.arange(len(mesh.faces)*3).reshape(-1,3),
                            vertex_normals=normals[mesh.faces].reshape(-1,3), process=False)
    texture = Image.fromarray(atlas)
    texture.format = 'JPEG'
    material = trimesh.visual.material.PBRMaterial(name='ReferenceAppearance',
                baseColorTexture=texture, metallicFactor=0, roughnessFactor=1)
    result.visual = trimesh.visual.TextureVisuals(uv=out_uv.reshape(-1,2), material=material)
    print(f'Baked {width} x {height} padded appearance atlas', flush=True)
    return result


def finish(baked, mesh, front_uv, front):
    """Preserve full photo resolution on visible front faces; keep inferred sides."""
    xy = front_uv * [front.width, -front.height] + [0, front.height]
    depth = depth_map(mesh.vertices, mesh.faces, xy, 1, front.size)
    visible_depth = map_coordinates(depth, [xy[:,1], xy[:,0]], order=0, mode='nearest')
    visible = mesh.vertices[:,2] >= visible_depth - .03
    use_front = visible[mesh.faces].all(axis=1) & (mesh.face_normals[:,2] > .12)
    # Correct any pitch greens remaining in the inferred equipment surfaces.
    atlas = np.asarray(baked.visual.material.baseColorTexture.convert('RGB')).copy()
    tile = 16
    columns = atlas.shape[1] // tile
    yy, xx = np.mgrid[:tile, :tile]
    bary = np.column_stack((1-(xx.ravel()+yy.ravel()-4)/(tile-5),
                           (xx.ravel()-2)/(tile-5), (yy.ravel()-2)/(tile-5)))
    bary = np.maximum(bary,0)
    bary /= bary.sum(axis=1,keepdims=True)
    clean = np.asarray(front, dtype=float)
    for index, face in enumerate(mesh.faces):
        x, y = (index % columns)*tile, (index // columns)*tile
        colors = atlas[y:y+tile,x:x+tile].reshape(-1,3).astype(float)
        r,g,b = colors.T
        points = bary @ mesh.vertices[face]
        bad = (points[:,1] < .81) & (b < .9*np.maximum(r,g)) & (r < 1.5*g)
        if bad.any():
            photo_xy = bary @ xy[face]
            colors[bad] = sample_image(clean, photo_xy[bad])
            atlas[y:y+tile,x:x+tile] = colors.reshape(tile,tile,3).astype('uint8')
    texture = Image.fromarray(atlas)
    texture.format = 'JPEG'
    baked.visual.material.baseColorTexture = texture
    rest = baked.submesh([np.where(~use_front)[0]], append=True, repair=False)
    # Keep embedded UVs instead of applying the photograph to hidden bat faces.
    surface = trimesh.Trimesh(vertices=mesh.vertices.copy(), faces=mesh.faces[use_front],
                             vertex_normals=mesh.vertex_normals.copy(), process=False)
    surface.visual = trimesh.visual.TextureVisuals(uv=front_uv, material=trimesh.visual.material.PBRMaterial(
        name='ReferenceFrontDetail',baseColorTexture=front,metallicFactor=0,roughnessFactor=1))
    surface.remove_unreferenced_vertices()
    scene = trimesh.Scene()
    scene.add_geometry(rest, node_name='InferredSurfaces')
    scene.add_geometry(surface, node_name='ReferenceFrontDetail')
    print(f'Preserved full front detail on {use_front.sum()} visible triangles',flush=True)
    return scene


def compress_atlas(data):
    """Encode only the large inferred atlas as JPEG; retain lossless front detail."""
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20+length])
    binary = data[28+length:]
    images = {image['bufferView']: image for image in document.get('images', [])}
    packed = bytearray()
    for index, view in enumerate(document['bufferViews']):
        offset = view.get('byteOffset',0)
        payload = binary[offset:offset+view['byteLength']]
        if index in images:
            picture = Image.open(io.BytesIO(payload))
            if picture.width > 2048:
                stream = io.BytesIO()
                picture.convert('RGB').save(stream, format='JPEG', quality=92, subsampling=0)
                payload = stream.getvalue()
                images[index]['mimeType'] = 'image/jpeg'
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'] = len(packed)
        view['byteLength'] = len(payload)
        packed.extend(payload)
    packed.extend(b'\0' * (-len(packed) % 4))
    document['buffers'][0]['byteLength'] = len(packed)
    encoded = json.dumps(document,separators=(',',':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    return (struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(packed)) +
            struct.pack('<I4s',len(encoded),b'JSON') + encoded +
            struct.pack('<I4s',len(packed),b'BIN\0') + packed)
