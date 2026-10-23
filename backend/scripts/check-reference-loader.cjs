// Exercise the actual Three r128 GLTF/ImageBitmap loaders and served GLB under
// the server's connect-src policy. Node does not enforce CSP, so this harness
// enforces its blob-fetch rule. ImageBitmap decoding is a metadata shim; this
// is a loader integration check, not a browser or GPU rendering check.
// node backend/scripts/check-reference-loader.cjs <three-r128.cjs> <GLTFLoader.cjs>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.THREE = require(path.resolve(process.argv[2]));
global.self = global;
global.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.subarray(1, 4).toString() === 'PNG') {
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Expected JPEG or PNG texture');
    for (let offset = 2; offset < bytes.length;) {
        assert.equal(bytes[offset], 0xff);
        const marker = bytes[offset + 1];
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
            return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
        }
        offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    throw new Error('JPEG dimensions missing');
};
vm.runInThisContext(fs.readFileSync(path.resolve(process.argv[3]), 'utf8'));

(async () => {
    assert.equal(THREE.REVISION, '128');
    const origin = process.env.CRICKET_QA_URL || 'http://localhost:3005';
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    const policy = page.headers.get('content-security-policy');
    const directives = Object.fromEntries(policy.split(';').map(value => {
        const [name, ...sources] = value.trim().split(/\s+/);
        return [name, sources];
    }));
    const connect = directives['connect-src'] || directives['default-src'];
    const actualFetch = global.fetch;
    let embeddedTextureRequests = 0;
    global.fetch = (url, options) => {
        if (String(url).startsWith('blob:')) {
            embeddedTextureRequests++;
            if (!connect.includes('blob:')) {
                return Promise.reject(new TypeError('connect-src blocks the GLB embedded texture fetch'));
            }
        }
        return actualFetch(url, options);
    };
    const response = await fetch(new URL('/models/hero_reference_reconstruction.glb?v=2', origin));
    assert.equal(response.status, 200);
    const bytes = await response.arrayBuffer();
    const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes, origin + '/', resolve, reject));
    let meshes = 0;
    gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        meshes++;
        assert.ok(object.geometry.attributes.position.count > 0);
        assert.ok(object.material.map.image.width > 0);
        assert.ok(object.material.map.image.height > 0);
    });
    assert.equal(meshes, 2);
    assert.equal(embeddedTextureRequests, 2);
    console.log(`PASS: real GLTFLoader parsed ${meshes} textured meshes; both embedded texture fetches permitted by served CSP.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
