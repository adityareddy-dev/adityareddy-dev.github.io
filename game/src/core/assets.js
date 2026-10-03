import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Loads and caches models, textures and data. A missing file never throws.
export function createAssets({ bus, base = new URL('./', document.baseURI) }) {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new THREE.TextureLoader();

  let manifest = { models: {} };
  const cache = new Map();
  const missing = new Set();

  const entry = (key) => manifest.models?.[key] || null;
  const fileOf = (keyOrPath) => {
    const e = entry(keyOrPath);
    return e ? e.file || e.url : keyOrPath;
  };
  const url = (keyOrPath) => new URL(fileOf(keyOrPath), base).href;

  function fail(what, err) {
    if (!missing.has(what)) {
      missing.add(what);
      console.warn(`Asset missing or unreadable: ${what}`, err?.message || err || '');
      bus?.emit('assets:missing', { what });
    }
    return null;
  }

  function cached(key, load) {
    if (!cache.has(key)) cache.set(key, load().catch((err) => fail(key, err)));
    return cache.get(key);
  }

  async function fetchOk(path) {
    const res = await fetch(new URL(path, base));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res;
  }

  const json = (path) => cached(`json:${path}`, async () => (await fetchOk(path)).json());
  const arrayBuffer = (path) => cached(`buffer:${path}`, async () => (await fetchOk(path)).arrayBuffer());
  const gltf = (keyOrPath) => cached(`gltf:${fileOf(keyOrPath)}`, () => gltfLoader.loadAsync(url(keyOrPath)));

  function placeholder({ size = [0.4, 0.4, 0.4], color = 0x8d8a99 } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    mesh.position.y = size[1] / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.userData.placeholder = true;
    return group;
  }

  // A fresh copy of a model. anchor "floor" puts the origin under the middle of its base.
  async function model(keyOrPath, { anchor = 'origin', scale, shadows = true, fallback = true } = {}) {
    const e = entry(keyOrPath);
    const data = await gltf(keyOrPath);
    if (!data) return fallback ? placeholder({ size: e?.size }) : null;
    const copy = cloneSkinned(data.scene);
    copy.animations = data.animations || [];
    const s = scale ?? e?.scale ?? 1;
    if (s !== 1) copy.scale.multiplyScalar(s);
    if (shadows) {
      copy.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }
    copy.userData.asset = keyOrPath;
    if (anchor !== 'floor') return copy;
    const box = new THREE.Box3().setFromObject(copy);
    const centre = box.getCenter(new THREE.Vector3());
    copy.position.x -= centre.x;
    copy.position.z -= centre.z;
    copy.position.y -= box.min.y;
    const group = new THREE.Group();
    group.add(copy);
    group.animations = copy.animations;
    group.userData.asset = keyOrPath;
    group.userData.size = box.getSize(new THREE.Vector3()).toArray();
    return group;
  }

  function texture(path, { srgb = true, repeat, flipY } = {}) {
    return cached(`texture:${path}:${srgb}`, async () => {
      const tex = await textureLoader.loadAsync(new URL(path, base).href);
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      if (repeat) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
      }
      if (flipY !== undefined) tex.flipY = flipY;
      return tex;
    });
  }

  async function loadManifest(path = 'assets/manifest.json') {
    const data = await json(path);
    manifest = data && typeof data === 'object' ? { ...data, models: data.models || {} } : { models: {} };
    return manifest;
  }

  // Warms the cache. keys can be a list of model keys or "all".
  async function preload(keys = 'all', onProgress) {
    const list = keys === 'all' ? Object.keys(manifest.models) : [].concat(keys);
    let done = 0;
    const failed = [];
    await Promise.all(
      list.map(async (key) => {
        if (!(await gltf(key))) failed.push(key);
        done += 1;
        onProgress?.(done, list.length, key);
      }),
    );
    return { loaded: list.length - failed.length, missing: failed };
  }

  return {
    get manifest() {
      return manifest;
    },
    missing,
    entry,
    url,
    has: (key) => !!entry(key),
    loadManifest,
    preload,
    gltf,
    model,
    texture,
    json,
    arrayBuffer,
    placeholder,
  };
}
