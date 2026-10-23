/* Cricket pose in metre coordinates. Works with FBX pre-rotation and skin helper bones. */
(function (window) {
    'use strict';
    const parts = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder',
        'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand',
        'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
    const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

    function mapBones(model) {
        const bones = {};
        model.traverse(bone => {
            if (!bone.isBone || bone.parent?.name === bone.name) return;
            const name = bone.name.replace(/^mixamorig\d*[:_]?/i, '');
            if (parts.includes(name)) bones[name] = bone;
        });
        return bones;
    }

    function create(model, frame, equipment = {}) {
        const bones = mapBones(model);
        if (parts.some(name => !bones[name])) throw new Error('The cricket player is missing a required joint');
        const rest = [];
        const fingers = {};
        model.traverse(bone => { if (bone.isBone) rest.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone() }); });
        model.traverse(bone => {
            if (bone.isBone && bone.parent?.name !== bone.name) fingers[bone.name.replace(/^mixamorig\d*[:_]?/i, '')] = bone;
        });
        frame.updateWorldMatrix(true, true);
        const point = bone => bone.getWorldPosition(v());
        const local = bone => frame.worldToLocal(point(bone));
        const target = p => frame.localToWorld(p.clone());
        const restRotations = Object.fromEntries(['Hips', 'Head', 'LeftFoot', 'RightFoot'].map(name => [name,
            frame.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bones[name].getWorldQuaternion(new THREE.Quaternion()))]));
        function orient(name, x, y, z = 0) {
            worldRotation(bones[name], frame.getWorldQuaternion(new THREE.Quaternion())
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'))).multiply(restRotations[name]));
        }

        function worldRotation(bone, desired) {
            bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
            bone.updateWorldMatrix(false, true);
        }
        function aim(bone, end, goal) {
            const origin = point(bone);
            const from = point(end).sub(origin).normalize();
            const to = goal.clone().sub(origin).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(from, to);
            worldRotation(bone, q.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
        }
        function solve(upper, lower, end, destination, pole) {
            const a = point(upper), b = point(lower), c = point(end);
            const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
            const toward = destination.clone().sub(a);
            const distance = Math.min(l1 + l2 - .0001, Math.max(Math.abs(l1 - l2) + .0001, toward.length()));
            toward.normalize();
            const bend = pole.clone().sub(a);
            bend.addScaledVector(toward, -bend.dot(toward)).normalize();
            const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
            const elbow = a.clone().addScaledVector(toward, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
            aim(upper, lower, elbow);
            aim(lower, end, a.addScaledVector(toward, distance));
        }

        function update(time = 0, swing = 0) {
            for (const r of rest) { r.bone.position.copy(r.position); r.bone.quaternion.copy(r.quaternion); }
            // Balanced batting stance used by the articulated match player.
            bones.Hips.position.y -= 14.0;
            bones.Spine.rotation.x += .20;
            bones.Spine1.rotation.x += .09;
            bones.Head.rotation.y = -.58;
            frame.updateWorldMatrix(true, true);
            for (const [side, x, z] of [['Left', .205, .055], ['Right', -.205, -.035]]) {
                solve(bones[`${side}UpLeg`], bones[`${side}Leg`], bones[`${side}Foot`], target(v(x, .12, z)), target(v(x, .5, .55)));
                orient(`${side}Foot`, 0, 0);
            }
            // A connected two-handed grip follows one bat transform, including the drive.
            const lift = Math.sin(Math.PI * swing);
            const bat = equipment.bat;
            if (bat) {
                bat.position.set(-.065 + .08 * lift, 1.03 + .15 * lift, .30 + .15 * lift);
                bat.rotation.set(-.13 - 1.5 * lift, -.08, -.14 + .12 * lift);
                if (!swing) bat.rotation.x += Math.sin(time * 1.7) * .014;
                bat.updateWorldMatrix(true, true);
            }
            for (const [side, gripY, poleX] of [['Left', -.055, .50], ['Right', -.145, -.50]]) {
                const hand = bones[`${side}Hand`];
                const grip = bat ? bat.localToWorld(v(0, gripY, 0)) : target(v(-.13, .95 + gripY, .3));
                // Wrist sits behind the handle, leaving the palm centred around it.
                const wrist = grip.clone().add(target(v(0, .02, -.105)).sub(target(v())));
                solve(bones[`${side}Arm`], bones[`${side}ForeArm`], hand, wrist, target(v(poleX, 1.10, .25)));
                const finger = hand.children.find(b => b.isBone && /HandMiddle1$/.test(b.name));
                if (finger) aim(hand, finger, wrist.clone().add(target(v(0, -.025, .10)).sub(target(v()))));
                for (const [index, name] of ['Index', 'Middle', 'Ring', 'Pinky'].entries()) {
                    const chain = [1, 2, 3, 4].map(n => fingers[`${side}Hand${name}${n}`]);
                    const y = (index - 1.5) * .015;
                    const offsets = [v(.022, y, .027), v(-.014, y, .025), v(-.021, y, -.003)];
                    for (let joint = 0; joint < 3; joint++) {
                        if (chain[joint] && chain[joint + 1]) aim(chain[joint], chain[joint + 1], grip.clone().add(target(offsets[joint]).sub(target(v()))));
                    }
                }
                const thumb = [1, 2, 3, 4].map(n => fingers[`${side}HandThumb${n}`]);
                for (let joint = 0; joint < 3; joint++) {
                    if (thumb[joint] && thumb[joint + 1]) aim(thumb[joint], thumb[joint + 1], grip.clone().add(target(v(-.025 + joint * .017, .02, .01)).sub(target(v()))));
                }
                const glove = equipment[`${side.toLowerCase()}Glove`];
                if (glove) { glove.position.copy(frame.worldToLocal(grip)).add(v(0, 0, -.015)); glove.rotation.copy(bat.rotation); }
            }
            for (const side of ['Left', 'Right']) {
                const pad = equipment[`${side.toLowerCase()}Pad`];
                if (!pad) continue;
                const knee = local(bones[`${side}Leg`]), ankle = local(bones[`${side}Foot`]);
                const up = knee.clone().sub(ankle).normalize();
                const right = up.clone().cross(v(0, 0, 1)).normalize();
                const front = right.clone().cross(up).normalize();
                pad.position.copy(ankle).lerp(knee, .55).addScaledVector(front, .065);
                pad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, front));
            }
            frame.updateWorldMatrix(true, true);
        }
        return { bones, update };
    }
    window.CricketPlayerRig = { create, mapBones };
})(window);
