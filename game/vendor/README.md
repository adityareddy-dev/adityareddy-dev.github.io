# Vendor

Third-party code the game loads at runtime. Copied in, not fetched from a CDN.

## three.js 0.186.1

MIT, see `three/LICENSE`. Source: https://www.npmjs.com/package/three

`three/build/` holds `three.module.js` and the `three.core.js` it imports. `three/addons/` is the part of the package's `examples/jsm` folder the game uses, with the same folder layout so the files' own relative imports keep working.

The importmap in `game/index.html` maps `three` to `./vendor/three/build/three.module.js` and `three/addons/` to `./vendor/three/addons/`.

What's in `addons/`:

- `loaders/GLTFLoader.js`
- `libs/meshopt_decoder.module.js`
- `utils/SkeletonUtils.js`, `utils/BufferGeometryUtils.js`
- `environments/RoomEnvironment.js`
- `geometries/RoundedBoxGeometry.js`
- `renderers/CSS2DRenderer.js`
- `postprocessing/`: `EffectComposer`, `Pass`, `RenderPass`, `ShaderPass`, `MaskPass`, `OutputPass`, `UnrealBloomPass`, `OutlinePass`, `SMAAPass`
- `shaders/`: `CopyShader`, `OutputShader`, `LuminosityHighPassShader`, `FXAAShader`, `SMAAShader`, `VignetteShader`

## Adding another addon

```
npm pack three@0.186.1
tar -xf three-0.186.1.tgz
```

Copy the file from `package/examples/jsm/<folder>/` to `game/vendor/three/addons/<folder>/`, same name. Open it and copy anything it imports with a relative path too. Imports of `'three'` already resolve through the importmap. Keep the version the same as the build, addons from another release tend to break.
