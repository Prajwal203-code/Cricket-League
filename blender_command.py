import bpy
import os

out_path = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League\backend\public\models\test_export.glb"
bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.active_object

try:
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True
    )
    print("GLB export succeeded! Size:", os.path.getsize(out_path))
except Exception as e:
    import traceback
    print("GLB export error:", traceback.format_exc())
