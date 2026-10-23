// Lifecycle checks using the same Three.js version as index.html, with a fake
// canvas/renderer. This checks scene logic, not GPU rendering or browser layout.
// Usage: node tools/model-authoring/check_hero_runtime.cjs <three-r128.cjs>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = { ...require(path.resolve(process.argv[2])) };
const requests = [];
let nextFrame;
let lastCamera;
const stages = new Map();

class Element extends EventTarget {
    constructor() {
        super();
        this.isConnected = true;
        this.style = {};
        this.innerHTML = '';
        this.canvas = null;
        this.fallback = null;
    }
    set innerHTML(value) {
        this.status = { style: {}, appendChild: child => { this.retry = child; }, remove: () => { this.status = null; } };
    }
    getBoundingClientRect() { return { width: 360, height: 640 }; }
    querySelector(selector) { return selector === '#hero3dStatus' ? this.status : this.canvas; }
    closest() { return null; }
    setPointerCapture() {}
    after(element) { this.fallback = element; }
}
for (const id of ['heroCharacterStage', 'characterStudioStage']) {
    const stage = new Element();
    stage.canvas = new Element();
    stages.set(id, stage);
}
THREE.WebGLRenderer = class {
    constructor() { this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 16 }; }
    setSize() {}
    setPixelRatio() {}
    render(scene, camera) { lastCamera = camera; }
    dispose() {}
};
THREE.PMREMGenerator = class { dispose() {} };
THREE.GLTFLoader = class { load(url, ok, progress, fail) { requests.push({ type: 'glb', url, ok, fail }); } };
THREE.FBXLoader = class { load(url, ok, progress, fail) { requests.push({ type: 'fbx', url, ok, fail }); } };
const window = new EventTarget();
window.THREE = THREE;
window.devicePixelRatio = 1;
const document = {
    hidden: false,
    getElementById: id => stages.get(id) || null,
    createElement: () => new Element()
};
const context = vm.createContext({
    window, document, THREE, console, AbortController,
    localStorage: { getItem: () => null },
    requestAnimationFrame: fn => { nextFrame = fn; return 1; },
    cancelAnimationFrame: () => {},
    ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../backend/public/hero3dBatsman.js'), 'utf8'), context);
const api = window.Hero3DBatsman;

function player() {
    const scene = new THREE.Group();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(.9, 1.93, .7), material));
    return { scene, texture, material };
}
function pointer(type, x, y) {
    const event = new Event(type);
    Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y });
    stages.get('heroCharacterStage').dispatchEvent(event);
}
function settle() { for (let i = 0; i < 100; i++) nextFrame(); }

api.init('hero3dCanvas', 'heroCharacterStage');
assert.equal(requests.length, 1);
assert.equal(requests[0].type, 'glb');
assert.match(requests[0].url, /hero_reference_reconstruction\.glb/);
assert.ok(lastCamera.isOrthographicCamera);
const loaded = player();
requests[0].ok({ scene: loaded.scene });
assert.equal(window.__hero3d.getMesh(), loaded.scene);
assert.equal(window.__hero3d.getPose(), null);
assert.equal(loaded.material.toneMapped, false);
api.setJersey({ name: 'TEST', number: 99 });
api.setCountry('AU');
assert.equal(loaded.material.map, loaded.texture, 'saved appearance must not overwrite the reference atlas');
const root = loaded.scene.parent.parent;
pointer('pointerdown', 100, 100);
pointer('pointermove', 140, 100);
pointer('pointerup', 140, 100);
settle();
assert.ok(root.rotation.y > .3, 'a drag must keep the rotated view');
pointer('pointerdown', 100, 100);
pointer('pointerup', 100, 100);
settle();
assert.ok(Math.abs(root.rotation.y) < .0001, 'a tap must reset the view');
let disposed = 0;
loaded.texture.addEventListener('dispose', () => disposed++);
api.dispose();
assert.equal(disposed, 1, 'embedded texture must be released');

api.init('hero3dCanvas', 'heroCharacterStage');
const stale = requests.at(-1);
api.dispose();
api.init('characterStudioCanvas', 'characterStudioStage');
assert.equal(requests.at(-1).type, 'fbx', 'editable studio must retain its rigged model');
const late = player();
let staleDisposed = false;
late.texture.addEventListener('dispose', () => { staleDisposed = true; });
stale.ok({ scene: late.scene });
assert.ok(staleDisposed, 'late load must be disposed after switching stages');
assert.equal(window.__hero3d.getMesh(), null, 'late home load must not enter the studio');
api.dispose();
api.init('hero3dCanvas', 'heroCharacterStage');
requests.at(-1).fail(new Error('Simulated model loading failure'));
const failedStage = stages.get('heroCharacterStage');
assert.equal(failedStage.canvas.fallback, null, 'a failed model must never become a JPG');
assert.match(failedStage.status.textContent, /Could not load the 3D player/);
assert.equal(failedStage.retry.textContent, 'Retry');
const beforeRetry = requests.length;
failedStage.retry.onclick({ stopPropagation() {} });
assert.equal(requests.length, beforeRetry + 1, 'retry must request the GLB again');
requests.at(-1).ok({ scene: player().scene });
assert.ok(window.__hero3d.getMesh(), 'retry must recover the 3D scene');
api.dispose();
console.log('PASS: reference loading, camera, atlas preservation, drag/reset, disposal, stage switching, and failure/retry without a JPG.');
