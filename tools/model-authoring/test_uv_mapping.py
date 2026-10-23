import sys
import os
import math
import numpy as np
import trimesh

def compute_batsman_uvs(mesh):
    verts = mesh.vertices
    normals = mesh.vertex_normals
    N = len(verts)
    uvs = np.zeros((N, 2), dtype=np.float32)

    # Center references
    head_center_z = 0.04

    for i in range(N):
        x, y, z = verts[i]

        # -------------------------------------------------------------
        # 1. SHOES: y <= -0.85
        # UV Zone: [0.02..0.48] x [0.02..0.24]
        # -------------------------------------------------------------
        if y <= -0.85:
            # Map shoes to [0.04, 0.46] x [0.04, 0.22]
            u_rel = (x + 0.35) / 0.70
            v_rel = (y + 1.02) / 0.18
            u = 0.04 + np.clip(u_rel, 0.0, 1.0) * 0.42
            v = 0.04 + np.clip(v_rel, 0.0, 1.0) * 0.18

        # -------------------------------------------------------------
        # 2. BATTING PADS & LOWER TROUSERS: -0.85 < y <= -0.30
        # UV Zone Pads: [0.52..0.98] x [0.02..0.28]
        # UV Zone Trousers Lower: [0.46..0.72] x [0.26..0.54]
        # -------------------------------------------------------------
        elif y <= -0.30:
            if z >= -0.04: # Pad front & sides
                # Left Pad (x < 0) vs Right Pad (x >= 0)
                if x < 0:
                    u_pad = (x + 0.25) / 0.25
                    u = 0.52 + np.clip(u_pad, 0.0, 1.0) * 0.21
                else:
                    u_pad = x / 0.25
                    u = 0.75 + np.clip(u_pad, 0.0, 1.0) * 0.21
                v_pad = (y + 0.85) / 0.55
                v = 0.04 + np.clip(v_pad, 0.0, 1.0) * 0.22
            else: # Back of trousers behind pads
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.85) / 0.55
                u = 0.46 + np.clip(u_tr, 0.0, 1.0) * 0.26
                v = 0.26 + np.clip(v_tr, 0.0, 1.0) * 0.14

        # -------------------------------------------------------------
        # 3. UPPER TROUSERS & LEFT GLOVE: -0.30 < y <= 0.10
        # -------------------------------------------------------------
        elif y <= 0.10:
            if x < -0.22 and y <= 0.05: # Left Glove
                u_gl = (x + 0.42) / 0.20
                v_gl = (y + 0.25) / 0.30
                u = 0.04 + np.clip(u_gl, 0.0, 1.0) * 0.18
                v = 0.27 + np.clip(v_gl, 0.0, 1.0) * 0.18
            else: # Upper Trousers
                u_tr = (x + 0.25) / 0.50
                v_tr = (y + 0.30) / 0.40
                u = 0.46 + np.clip(u_tr, 0.0, 1.0) * 0.26
                v = 0.38 + np.clip(v_tr, 0.0, 1.0) * 0.15

        # -------------------------------------------------------------
        # 4. JERSEY TORSO, ARMS, BAT LOWER: 0.10 < y <= 0.55
        # -------------------------------------------------------------
        elif y <= 0.55:
            # Bat handle / lower blade
            if x > 0.14 and z < 0.05 and y > 0.32:
                # Bat UV: [0.76..0.98] x [0.52..0.98]
                v_bat = (y - 0.32) / 0.70
                u_bat = (x - 0.14) / 0.28
                u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
                v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44
            # Right Arm & Glove (holding bat)
            elif x > 0.14:
                u_arm = (x - 0.14) / 0.26
                v_arm = (y - 0.10) / 0.45
                u = 0.24 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.27 + np.clip(v_arm, 0.0, 1.0) * 0.25
            # Left Arm (forearm / sleeve)
            elif x < -0.20:
                u_arm = (x + 0.42) / 0.22
                v_arm = (y - 0.10) / 0.45
                u = 0.04 + np.clip(u_arm, 0.0, 1.0) * 0.18
                v = 0.35 + np.clip(v_arm, 0.0, 1.0) * 0.18
            # Jersey Torso
            else:
                u_j = (x + 0.20) / 0.40
                v_j = (y - 0.10) / 0.45
                u = 0.46 + np.clip(u_j, 0.0, 1.0) * 0.26
                v = 0.60 + np.clip(v_j, 0.0, 1.0) * 0.36

        # -------------------------------------------------------------
        # 5. HEAD & BAT BLADE: 0.55 < y <= 0.88
        # -------------------------------------------------------------
        elif y <= 0.88:
            # Bat blade
            if x > 0.08 and z < 0.05:
                v_bat = (y - 0.32) / 0.70
                u_bat = (x - 0.08) / 0.32
                u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
                v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44
            # Head, Face, Beard, Hair, Headband
            else:
                # Cylindrical / frontal unwrap around head center
                angle = math.atan2(x, z - head_center_z) # -pi to +pi
                u_head = (angle + math.pi) / (2 * math.pi)
                # Align front face (angle ~ 0) with center of head UV island (u_head = 0.5)
                # u_head goes from 0.0 to 1.0 with 0.5 at front
                v_head = (y - 0.55) / 0.33
                u = 0.04 + np.clip(u_head, 0.0, 1.0) * 0.38
                v = 0.60 + np.clip(v_head, 0.0, 1.0) * 0.36

        # -------------------------------------------------------------
        # 6. BAT TIP: y > 0.88
        # -------------------------------------------------------------
        else:
            v_bat = (y - 0.32) / 0.70
            u_bat = (x - 0.05) / 0.35
            u = 0.76 + np.clip(u_bat, 0.0, 1.0) * 0.20
            v = 0.52 + np.clip(v_bat, 0.0, 1.0) * 0.44

        uvs[i] = [np.clip(u, 0.001, 0.999), np.clip(v, 0.001, 0.999)]

    return uvs

if __name__ == '__main__':
    mesh = trimesh.load('./backend/public/models/batsman.glb', force='mesh')
    uvs = compute_batsman_uvs(mesh)
    print(f'Computed UVs for {len(uvs)} vertices:')
    print(f'U min={uvs[:,0].min():.4f}, max={uvs[:,0].max():.4f}')
    print(f'V min={uvs[:,1].min():.4f}, max={uvs[:,1].max():.4f}')
