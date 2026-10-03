import * as THREE from 'three';

// A ring on the floor where a click landed. Fades out on its own.
export function createMarker({ scene, engine }) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.13, 28),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.visible = false;
  scene.add(ring);
  let life = 0;

  engine.onUpdate(
    (dt) => {
      if (life <= 0) return;
      life -= dt;
      const k = Math.max(0, life / 0.6);
      ring.material.opacity = k * 0.9;
      ring.scale.setScalar(1 + (1 - k) * 0.8);
      ring.visible = life > 0;
    },
    { order: 55, always: true, name: 'marker' },
  );

  return {
    show(point) {
      ring.position.set(point.x, point.y + 0.02, point.z);
      ring.visible = true;
      life = 0.6;
    },
  };
}
