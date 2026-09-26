"""
🏏 Antigravity <-> Blender Live Bridge
========================================
This script connects Blender 5.x / 4.x / 3.x to Antigravity.

HOW TO RUN IN BLENDER:
1. In Blender, look at the top menu bar and click the 'Scripting' tab.
2. Click 'Open' (or '+ New') and open this file:
   blender_bridge.py
3. Click the 'Run Script' button (▶ Play icon) or press Alt + P.
4. Check the System Console or Blender Status bar — it will show:
   "[Antigravity Bridge] Connected and listening for commands!"

Now, whenever you ask Antigravity to model, animate, color, or export something,
Antigravity can send commands that execute directly inside your open Blender window!
"""

import bpy
import os
import sys
import traceback
import time

# Base directory (Cricket League project folder)
def get_bridge_dir():
    # 1. Try to get directory from Blender's text datablock filepath
    try:
        for t in bpy.data.texts:
            if "blender_bridge" in t.name and t.filepath:
                fp = bpy.path.abspath(t.filepath)
                d = os.path.dirname(os.path.abspath(fp))
                if os.path.exists(d):
                    return d
    except Exception:
        pass
    # 2. Dedicated project folder
    default_dir = r"c:\Users\gowda\OneDrive\Desktop\xampp\htdocs\Cricket League"
    if os.path.exists(default_dir):
        return default_dir
    return os.getcwd()

BRIDGE_DIR = get_bridge_dir()
CMD_FILE = os.path.join(BRIDGE_DIR, "blender_command.py")
OUT_FILE = os.path.join(BRIDGE_DIR, "blender_output.txt")
HEARTBEAT_FILE = os.path.join(BRIDGE_DIR, "blender_status.json")

last_mtime = 0

def bridge_poll():
    global last_mtime
    try:
        # 1. Update heartbeat file so Antigravity knows Blender is actively listening
        if not hasattr(bridge_poll, "last_hb") or time.time() - bridge_poll.last_hb > 2.0:
            bridge_poll.last_hb = time.time()
            with open(HEARTBEAT_FILE, "w", encoding="utf-8") as f:
                f.write(f'{{"connected": true, "timestamp": {time.time()}, "version": "{bpy.app.version_string}"}}')

        # 2. Check for new command file
        if os.path.exists(CMD_FILE):
            mtime = os.path.getmtime(CMD_FILE)
            if mtime > last_mtime:
                last_mtime = mtime
                with open(CMD_FILE, "r", encoding="utf-8") as f:
                    code = f.read().strip()

                if code:
                    print(f"\n[Antigravity Bridge] Executing command ({len(code)} bytes)...")
                    try:
                        globals_dict = {
                            "bpy": bpy,
                            "C": bpy.context,
                            "D": bpy.data,
                            "__file__": CMD_FILE
                        }
                        exec(compile(code, CMD_FILE, "exec"), globals_dict)
                        
                        # Refresh 3D Viewports immediately
                        for window in bpy.context.window_manager.windows:
                            for area in window.screen.areas:
                                if area.type == 'VIEW_3D':
                                    area.tag_redraw()

                        with open(OUT_FILE, "w", encoding="utf-8") as out:
                            out.write(f"SUCCESS: Executed at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                        print("[Antigravity Bridge] Command completed successfully.")
                    except Exception as e:
                        err = traceback.format_exc()
                        print(f"[Antigravity Bridge Error]:\n{err}")
                        with open(OUT_FILE, "w", encoding="utf-8") as out:
                            out.write(f"ERROR:\n{err}\n")

    except Exception as general_err:
        print(f"[Antigravity Bridge Poll Exception]: {general_err}")

    return 0.3

# Register timer in Blender
if bpy.app.timers.is_registered(bridge_poll):
    bpy.app.timers.unregister(bridge_poll)

bpy.app.timers.register(bridge_poll, persistent=True)
print("\n" + "="*60)
print(f"🚀 [Antigravity Bridge] Connected & listening!")
print(f"📁 Watching: {CMD_FILE}")
print(f"✨ Blender Version: {bpy.app.version_string}")
print("="*60 + "\n")
