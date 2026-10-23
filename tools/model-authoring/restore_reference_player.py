"""Reconstruct the reference appearance on the existing shoulder-bat mesh.

This is a photo-projected reconstruction, not the unavailable original character.
The source mesh and reference photographs are kept unchanged.
"""
from pathlib import Path
import json
import struct
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import RBFInterpolator
from scipy.ndimage import distance_transform_edt
import trimesh
import cv2
from reference_atlas import bake, finish, compress_atlas

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'backend/public/models'
PHOTOS = ROOT / 'backend/public/images/players'

# Landmarks in a front orthographic render of the existing mesh and the photograph.
# They align the silhouette and visible features before projecting the texture.
SOURCE = np.array([
    [563,132],[607,172],[591,217],[446,190],[396,206],[492,222],
    [424,266],[446,311],[435,340],[388,268],[492,275],
    [351,365],[526,384],[564,433],[607,497],[344,434],[348,527],
    [245,407],[199,416],[285,449],[258,501],[298,575],[155,483],
    [353,638],[493,642],[409,523],[407,414],
    [588,584],[573,660],[563,713],[610,769],[532,798],
    [371,735],[490,737],[411,827],
    [332,858],[392,909],[322,972],[397,968],[513,857],[561,895],
    [475,987],[577,980],[322,1154],[408,1150],[496,1165],[580,1198],
    [255,1223],[413,1245],[323,1199],[475,1238],[578,1242],[529,1194]
], dtype=float)
TARGET = np.array([
    [493,152],[539,185],[517,230],[400,164],[355,190],[448,202],
    [401,265],[408,310],[403,339],[345,268],[453,264],
    [285,350],[510,351],[562,396],[597,508],[250,429],[270,529],
    [188,414],[140,424],[237,451],[213,514],[239,598],[91,494],
    [297,665],[505,661],[394,533],[374,408],
    [604,576],[587,651],[572,716],[622,757],[540,810],
    [314,747],[506,745],[387,835],
    [278,879],[345,906],[266,975],[359,981],[453,881],[530,905],
    [434,1007],[552,995],[261,1178],[368,1171],[477,1200],[580,1239],
    [207,1258],[365,1264],[274,1234],[491,1294],[562,1301],[525,1237]
], dtype=float)

FRONT_POLYGONS = [
    [(88,488),(98,510),(190,448),(226,419),(538,211),(543,190),(522,166),(492,151),(475,153),(209,376)],
    [(344,256),(346,217),(345,193),(372,168),(400,159),(436,173),(451,193),(459,248),(455,280),(436,322),(441,350),(367,358),(365,325),(345,291),(335,269)],
    [(346,328),(371,350),(434,337),(442,323),(480,343),(533,355),(560,375),(584,417),(602,507),(574,535),(556,529),(562,594),(550,642),(522,673),(310,680),(283,658),(275,598),(261,529),(249,510),(229,529),(212,497),(211,443),(230,414),(242,374),(273,352),(315,341)],
    [(151,390),(183,372),(208,377),(228,396),(243,423),(245,460),(226,489),(230,529),(247,556),(271,581),(252,600),(226,602),(205,589),(185,555),(160,507),(146,469),(130,445),(134,418)],
    [(568,511),(593,511),(613,553),(617,600),(611,643),(602,687),(602,709),(622,731),(625,760),(609,797),(584,814),(553,819),(523,803),(509,776),(514,744),(532,718),(548,704),(553,676),(555,648),(545,601),(541,550)],
    [(299,661),(507,661),(526,719),(536,812),(541,868),(549,907),(562,975),(580,1166),(582,1247),(562,1263),(568,1292),(562,1306),(496,1308),(488,1287),(482,1258),(467,1219),(447,1110),(433,1006),(409,928),(391,847),(364,898),(363,975),(369,1066),(371,1151),(364,1233),(368,1255),(351,1272),(231,1280),(206,1267),(205,1255),(220,1242),(257,1223),(260,1197),(251,1160),(249,1075),(251,1000),(249,949),(258,891),(278,871),(285,821),(286,724)]
]

# Tight foreground contours, including the two open spaces under the arms.
FRONT_CONTOURS = [
    [(90,492),(97,508),(175,451),(229,420),(535,211),(541,193),(535,182),(509,157),(494,152),(485,158),(212,379)],
    [(345,246),(346,209),(355,186),(372,173),(399,164),(428,171),(446,188),(454,220),
     (456,259),(452,285),(438,312),(438,333),(453,342),(411,390),(368,359),(363,318),(350,297),(341,281),(340,265)],
    [(358,332),(367,351),(404,373),(441,326),(466,339),(505,348),(532,360),(551,386),
     (568,429),(584,471),(600,506),(565,519),(532,536),(512,502),(504,553),(499,599),(503,640),
     (496,657),(472,665),(319,665),(296,652),(299,627),(299,563),(299,525),(286,535),
     (242,516),(229,502),(244,469),(255,425),(261,395),(278,363),(307,349)],
    [(150,446),(180,440),(209,456),(222,491),(241,518),(270,544),(295,553),
     (278,580),(257,598),(239,605),(218,597),(201,582),(187,560),(174,534),(163,503)],
    [(157,396),(175,377),(192,374),(207,381),(221,395),(235,404),(244,424),(244,452),
     (231,478),(216,491),(184,495),(164,481),(148,464),(135,449),(133,431),(140,416)],
    [(536,534),(564,521),(594,513),(603,542),(611,571),(613,603),(610,631),(602,655),
     (597,695),(564,693),(563,665),(558,636),(550,615),(552,587),(546,558)],
    [(564,690),(595,691),(599,713),(617,723),(624,738),(623,765),(610,796),(589,811),
     (566,818),(539,805),(516,786),(509,765),(514,742),(530,724),(546,713)],
    [(302,656),(495,657),(507,678),(515,720),(520,779),(528,839),(536,900),
     (481,934),(439,946),(415,908),(396,842),(385,871),(365,961),(358,1002),
     (275,1003),(269,956),(274,874),(281,805),(286,738),(293,695)],
    [(276,876),(297,879),(321,890),(342,910),(357,941),(366,971),(377,989),
     (378,1037),(385,1063),(384,1094),(374,1098),(371,1150),(369,1195),(361,1234),
     (339,1245),(309,1237),(288,1226),(267,1219),(262,1175),(261,1107),(258,1050),
     (252,1015),(251,968),(255,942),(254,912),(260,891)],
    [(454,879),(482,875),(507,881),(526,896),(538,920),(547,956),(555,996),
     (560,1025),(565,1074),(573,1138),(579,1214),(581,1248),(565,1261),
     (539,1251),(512,1252),(492,1270),(480,1259),(473,1215),(466,1160),
     (452,1093),(440,1028),(428,984),(424,950),(429,918),(438,895)],
    [(271,1213),(293,1223),(323,1235),(351,1235),(365,1248),(365,1264),(347,1273),
     (284,1280),(233,1277),(210,1270),(205,1259),(214,1247),(246,1234)],
    [(506,1240),(540,1239),(559,1255),(568,1284),(562,1303),(526,1307),
     (493,1302),(487,1293),(493,1266)]
]

def extend_edges(image, polygons, holes=(), refine=True):
    """Dilate foreground colors so UV margins never sample stadium/grass pixels."""
    mask = Image.new('L', image.size)
    draw = ImageDraw.Draw(mask)
    for points in polygons:
        draw.polygon(points, fill=255)
    for points in holes:
        draw.polygon(points, fill=0)
    seed = np.asarray(mask)
    inner = distance_transform_edt(seed > 0)
    outer = distance_transform_edt(seed == 0)
    labels = np.where(seed > 0, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype('uint8')
    labels[outer > 0] = cv2.GC_BGD
    labels[inner > 28] = cv2.GC_FGD
    if refine:
        cv2.setRNGSeed(0)
        cv2.grabCut(np.asarray(image).copy(), labels, None, np.zeros((1, 65)),
                    np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
        foreground = (labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)
    else:
        foreground = seed > 0
    foreground = distance_transform_edt(foreground) > 5
    pixels = np.asarray(image).copy()
    red, green, blue = np.moveaxis(pixels.astype(float), 2, 0)
    yy, xx = np.mgrid[:image.height, :image.width]
    # Remove residual pitch/stadium colors left inside approximate contours.
    ground = (yy > 830) & (blue < .86*np.maximum(red, green)) & (red < 1.5*green)
    neutral = (np.maximum.reduce([red, green, blue])-np.minimum.reduce([red, green, blue])) < .19*np.maximum.reduce([red, green, blue])
    stadium = (yy > 325) & (yy < 680) & (xx > 250) & (xx < 555) & neutral
    foreground &= ~(ground | stadium)
    outside = ~foreground
    nearest = distance_transform_edt(outside, return_distances=False, return_indices=True)
    pixels[outside] = pixels[nearest[0][outside], nearest[1][outside]]
    return Image.fromarray(pixels)

def main():
    mesh = trimesh.load(MODELS / 'batsman.glb', force='mesh', process=True)
    mesh.merge_vertices()
    # Preserve silhouette while giving the shading continuous vertex normals.
    vertices, faces = trimesh.remesh.subdivide(mesh.vertices, mesh.faces)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    original = mesh.vertices.copy()
    projected = np.column_stack((384 + (original[:, 0] + .00728737) * 556.47,
                                 688 - (original[:, 1] + .00101310) * 556.47))
    warp = RBFInterpolator(SOURCE, TARGET - SOURCE, kernel='thin_plate_spline', smoothing=8)
    aligned = projected + warp(projected)
    vertices = original.copy()
    faces = mesh.faces.copy()
    vertices[:, 0] = (aligned[:, 0] - 384) / 600
    vertices[:, 1] = (1308 - aligned[:, 1]) / 600
    vertices[:, 2] = original[:, 2]
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)

    front = extend_edges(Image.open(PHOTOS / 'hero_IN.jpg').convert('RGB'), FRONT_CONTOURS, refine=False)
    # Back view is an inferred view; landmarks align the independently drawn reference.
    # Bat/arm positions differ between photographs, so the hidden surface is approximate.
    back = Image.open(PHOTOS / 'hero_IN_back.jpg').convert('RGB')
    back_polygons = [
        [(455,140),(474,128),(519,128),(534,149),(596,447),(618,520),(611,590),(595,605),(577,570),(558,520),(547,423)],
        [(336,247),(335,187),(355,160),(398,152),(438,178),(451,218),(449,270),(430,292),(438,326),(349,326),(347,287),(331,274)],
        [(347,311),(435,312),(490,337),(539,366),(562,412),(589,509),(569,526),(596,555),(581,585),(557,584),(533,547),(507,530),(499,625),(506,657),(279,666),(266,645),(269,552),(253,523),(231,559),(229,598),(228,650),(211,703),(244,740),(257,797),(240,815),(197,821),(171,806),(158,769),(161,723),(177,697),(171,638),(174,597),(187,544),(198,486),(215,407),(235,373),(280,339)],
        [(278,653),(506,653),(527,762),(536,875),(550,980),(560,1114),(555,1247),(569,1270),(566,1295),(539,1305),(469,1303),(457,1286),(459,1254),(455,1181),(444,1080),(425,958),(396,839),(371,890),(350,1004),(335,1122),(326,1230),(326,1292),(302,1310),(247,1306),(217,1291),(216,1266),(239,1239),(237,1157),(236,1042),(235,951),(250,873),(258,782)]
    ]
    back = extend_edges(back, back_polygons)
    uv_front = np.column_stack(((mesh.vertices[:,0]*600+384)/768,
                                1-(1308-mesh.vertices[:,1]*600)/1376))
    # Align back torso, hips, head and limbs separately using smooth landmark warping.
    front_points = TARGET.copy()
    back_points = np.array([
        [489,129],[524,146],[533,218],[391,154],[440,183],[345,191],
        [392,262],[389,296],[390,320],[450,261],[333,254],
        [504,348],[270,344],[234,400],[199,503],[556,435],[541,529],
        [587,491],[604,503],[557,488],[575,548],[576,587],[606,597],
        [500,660],[280,660],[390,536],[390,401],
        [190,576],[195,648],[194,716],[160,756],[233,804],
        [479,747],[280,745],[393,835],
        [514,879],[448,906],[532,975],[446,981],[309,881],[243,905],
        [332,1007],[237,995],[554,1178],[461,1171],[318,1200],[240,1239],
        [567,1280],[457,1290],[520,1250],[325,1294],[217,1292],[274,1250]
    ],dtype=float)
    rear_warp = RBFInterpolator(front_points, back_points, kernel='thin_plate_spline', smoothing=20)
    rear_xy = rear_warp(np.column_stack((mesh.vertices[:,0]*600+384,1308-mesh.vertices[:,1]*600)))
    uv_back = np.column_stack((rear_xy[:,0]/768,1-rear_xy[:,1]/1376))
    scene = finish(bake(mesh, uv_front, uv_back, front, back), mesh, uv_front, front)
    data = compress_atlas(scene.export(file_type='glb'))
    # These photographs already contain lighting. Keep that lighting in portable viewers.
    n = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20+n])
    document['asset']['extras'] = {
        'description': 'Unrigged photo-projected reconstruction; unseen surfaces are inferred.',
        'references': ['hero_IN.jpg', 'hero_IN_back.jpg'],
        'sourceMesh': 'batsman.glb'
    }
    document['extensionsUsed'] = ['KHR_materials_unlit']
    for material in document['materials']:
        material['extensions'] = {'KHR_materials_unlit': {}}
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20+n:]
    data = struct.pack('<4sII', b'glTF', 2, 20+len(encoded)+len(tail)) + struct.pack('<I4s',len(encoded),b'JSON') + encoded + tail
    destination = MODELS / 'hero_reference_reconstruction.glb'
    destination.write_bytes(data)
    print(f'Wrote {destination.name}: {len(mesh.faces)} triangles, {len(data):,} bytes; photo-projected, unrigged reconstruction.')

if __name__ == '__main__':
    main()
