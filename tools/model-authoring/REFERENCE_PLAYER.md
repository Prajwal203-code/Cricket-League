# Reference player reconstruction

The home hero loads `backend/public/models/hero_reference_reconstruction.glb`.
It reconstructs the appearance of `images/players/hero_IN.jpg` on the existing
`batsman.glb` shoulder-bat mesh. The original mesh and photographs remain unchanged.

This is an approximation, not the original character asset. The coarse base mesh
limits the silhouette and facial geometry. Unseen surfaces use an independently
drawn back reference and interpolated nearby surface colors. Detail is strongest
from the front; oblique views can reveal stretching and reconstruction artifacts.
The exported GLB has no skeleton or swing animation.

The home renderer opens front-on, supports drag and arrow-key rotation, and resets
with a tap or the Home key. Its lighting is baked into the texture. Saved country,
kit, and equipment settings do not recolor this fixed reference. The character
studio and match retain their existing editable/animated Shannon model.

## Regenerate

Python 3.10+ dependencies: `numpy`, `Pillow`, `scipy`, `trimesh`, and
`opencv-python-headless`. Run from the repository root:

```powershell
python tools/model-authoring/restore_reference_player.py
python tools/model-authoring/render_reference_player.py
```

The first command aligns the mesh to image landmarks, removes background colors,
and bakes a padded texture atlas with front/back depth checks. Hidden portions of
the bat therefore do not simply receive the face projected in front of them.
The second command reads the exported GLB and creates front, oblique, side, and
back previews in `backend/public/models/verification_renders/`.

## Validate

```powershell
node --check backend/public/hero3dBatsman.js
node tools/model-authoring/check_hero_runtime.cjs <path-to-three-r128.cjs>
node backend/scripts/check-reference-loader.cjs <path-to-three-r128.cjs> <path-to-GLTFLoader-r128.cjs>
```

The runtime check uses the same Three.js 0.128.0 build as `index.html`, with a fake
renderer and DOM. It covers loading, projection choice, preserving the baked
texture when settings arrive, drag/reset, disposal, late loads during stage
switching, retaining the editable studio model, and retry after failure without
substituting a JPG.
It does not verify GPU rendering or browser layout. Offline previews render the
actual exported geometry and atlas with a software depth buffer.

The loader integration check uses the actual Three.js GLTFLoader and the running
server's security policy. Embedded GLB textures use ImageBitmapLoader's `fetch`
of blob URLs, so `connect-src` must include `blob:`; allowing it in `img-src` alone
is insufficient. A 200 response for the GLB does not verify that its textures load.
This check models that policy in Node and stubs bitmap decoding with image header
metadata; it does not replace visual verification in a browser.
