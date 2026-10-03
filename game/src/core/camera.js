import * as THREE from 'three';

const damp = (current, goal, lambda, dt) => current + (goal - current) * (1 - Math.exp(-lambda * dt));

// Raised three-quarter camera that follows a target. Wheel and pinch zoom.
export function createCameraRig({ camera, input, config, bus }) {
  const c = config.camera;
  const target = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();
  let followed = null;
  let bounds = null;
  let distance = c.distance;
  let distanceGoal = c.distance;
  let yaw = c.yaw;
  let pitch = c.pitch;
  let shakeTime = 0;
  let shakeLength = 0;
  let shakeStrength = 0;
  let focus = null;
  let first = true;

  function readGoal() {
    if (focus) {
      goal.copy(focus.point);
      return;
    }
    if (!followed) return;
    goal.copy(followed.isObject3D ? followed.position : followed);
    goal.y += c.lookHeight;
    if (bounds) {
      goal.x = Math.min(bounds.maxX, Math.max(bounds.minX, goal.x));
      goal.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, goal.z));
    }
  }

  function place() {
    const flat = Math.cos(pitch) * distance;
    offset.set(Math.sin(yaw) * flat, Math.sin(pitch) * distance, Math.cos(yaw) * flat);
    camera.position.copy(target).add(offset).add(shakeOffset);
    camera.lookAt(target.x + shakeOffset.x, target.y + shakeOffset.y, target.z + shakeOffset.z);
  }

  function update(dt) {
    const zoom = input ? input.takeZoom() : 0;
    if (zoom && !focus) {
      distanceGoal = Math.min(c.maxDistance, Math.max(c.minDistance, distanceGoal * Math.exp(zoom)));
    }
    readGoal();
    const wanted = focus?.distance ?? distanceGoal;
    if (first) {
      target.copy(goal);
      distance = wanted;
      first = false;
    } else {
      target.x = damp(target.x, goal.x, c.followLambda, dt);
      target.y = damp(target.y, goal.y, c.followLambda, dt);
      target.z = damp(target.z, goal.z, c.followLambda, dt);
      distance = damp(distance, wanted, c.zoomLambda, dt);
    }
    if (shakeTime > 0) {
      shakeTime -= dt;
      const k = shakeStrength * Math.max(0, shakeTime / shakeLength);
      shakeOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    } else {
      shakeOffset.set(0, 0, 0);
    }
    place();
  }

  return {
    update,
    target,
    // Object3D or Vector3 to keep in frame. null leaves the camera where it is.
    follow(thing) {
      followed = thing;
    },
    // Looks at a point until release() is called. Zoom is locked meanwhile.
    focus(point, { distance: d } = {}) {
      focus = { point: point.clone(), distance: d };
      bus?.emit('camera:focus', { point: focus.point });
    },
    release() {
      focus = null;
      bus?.emit('camera:release', {});
    },
    // Jumps to the target with no easing. Use after a teleport.
    snap() {
      first = true;
      update(0);
    },
    shake(strength = 0.08, seconds = 0.3) {
      shakeStrength = strength;
      shakeLength = seconds;
      shakeTime = seconds;
    },
    setBounds(box) {
      bounds = box;
    },
    setZoom(d, instant = false) {
      distanceGoal = Math.min(c.maxDistance, Math.max(c.minDistance, d));
      if (instant) distance = distanceGoal;
    },
    get distance() {
      return distance;
    },
    get yaw() {
      return yaw;
    },
    set yaw(value) {
      yaw = value;
    },
    get pitch() {
      return pitch;
    },
    set pitch(value) {
      pitch = Math.min(1.4, Math.max(0.3, value));
    },
  };
}
