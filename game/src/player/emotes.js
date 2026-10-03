const SIZE = 160;
const POP = 0.32;
const FADE = 0.3;
const INK = '#1d1d1f';

const ICONS = {
  zzz(g) {
    g.fillStyle = '#5a67d8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [text, x, y, px] of [
      ['z', 54, 96, 26],
      ['Z', 77, 76, 36],
      ['Z', 104, 52, 46],
    ]) {
      g.font = `800 ${px}px Inter, system-ui, sans-serif`;
      g.fillText(text, x, y);
    }
  },
  sweat(g) {
    g.fillStyle = '#4aa3ff';
    g.beginPath();
    g.moveTo(80, 28);
    g.bezierCurveTo(74, 46, 53, 66, 53, 84);
    g.arc(80, 84, 27, Math.PI, 0, true);
    g.bezierCurveTo(107, 66, 86, 46, 80, 28);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(80, 84, 16, Math.PI * 0.62, Math.PI * 0.95);
    g.stroke();
  },
  exclaim(g) {
    g.fillStyle = '#e5484d';
    g.beginPath();
    g.roundRect(70, 28, 20, 56, 10);
    g.fill();
    g.beginPath();
    g.arc(80, 104, 11, 0, Math.PI * 2);
    g.fill();
  },
  coffee(g) {
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(103, 84, 12, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(50, 64, 54, 44, [4, 4, 18, 18]);
    g.fill();
    g.stroke();
    g.fillStyle = '#7a4a2b';
    g.fillRect(55, 68, 44, 9);
    g.strokeStyle = '#9a8f86';
    g.lineWidth = 5;
    for (const x of [66, 86]) {
      g.beginPath();
      g.moveTo(x, 54);
      g.bezierCurveTo(x - 8, 46, x + 8, 40, x, 30);
      g.stroke();
    }
  },
  heart(g) {
    g.fillStyle = '#e5484d';
    g.beginPath();
    g.moveTo(80, 112);
    g.bezierCurveTo(30, 78, 46, 32, 80, 56);
    g.bezierCurveTo(114, 32, 130, 78, 80, 112);
    g.fill();
  },
  scribble(g) {
    const points = [
      [42, 58], [112, 48], [52, 100], [118, 88], [46, 78], [104, 112], [64, 36],
      [98, 72], [42, 106], [120, 62], [70, 114], [90, 32], [54, 68], [110, 102],
    ];
    g.strokeStyle = '#b3261e';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i += 1) {
      const [x, y] = points[i];
      const [nx, ny] = points[i + 1];
      g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    g.stroke();
  },
  idea(g) {
    g.strokeStyle = '#f2b33d';
    g.lineWidth = 6;
    g.lineCap = 'round';
    for (let i = 0; i < 5; i += 1) {
      const a = Math.PI + (i * Math.PI) / 4;
      g.beginPath();
      g.moveTo(80 + Math.cos(a) * 36, 66 + Math.sin(a) * 36);
      g.lineTo(80 + Math.cos(a) * 46, 66 + Math.sin(a) * 46);
      g.stroke();
    }
    g.fillStyle = '#ffcf4a';
    g.beginPath();
    g.arc(80, 66, 25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8d8a99';
    g.beginPath();
    g.roundRect(68, 90, 24, 20, 5);
    g.fill();
  },
  music(g) {
    g.fillStyle = '#7b5cd6';
    g.beginPath();
    g.ellipse(60, 100, 13, 10, -0.35, 0, Math.PI * 2);
    g.ellipse(98, 92, 13, 10, -0.35, 0, Math.PI * 2);
    g.fill();
    g.fillRect(66, 46, 7, 54);
    g.fillRect(104, 38, 7, 54);
    g.beginPath();
    g.moveTo(66, 46);
    g.lineTo(111, 36);
    g.lineTo(111, 52);
    g.lineTo(66, 62);
    g.fill();
  },
};

export const EMOTES = Object.keys(ICONS);

// One billboard over the head. It pops in, floats a little and fades.
export function createEmotes(ctx) {
  const { three: THREE } = ctx;
  const textures = new Map();
  const material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 20;
  sprite.visible = false;
  sprite.name = 'player-emote';
  ctx.scene.add(sprite);

  const size = ctx.config.player.height * 0.62;
  let name = null;
  let age = 0;
  let life = 0;

  function texture(id) {
    if (textures.has(id)) return textures.get(id);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fffaf2';
    g.strokeStyle = 'rgba(29, 29, 31, 0.16)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(68, 124);
    g.lineTo(80, 152);
    g.lineTo(92, 124);
    g.arc(80, 70, 60, Math.PI * 0.42, Math.PI * 2.58);
    g.closePath();
    g.fill();
    g.stroke();
    if (ICONS[id]) ICONS[id](g);
    else {
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 30px Inter, system-ui, sans-serif';
      g.fillText(String(id).slice(0, 5), 80, 72);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    textures.set(id, map);
    return map;
  }

  return {
    sprite,
    get name() {
      return name;
    },
    get active() {
      return !!name;
    },
    show(id, seconds = 2.5) {
      name = id;
      age = 0;
      life = Math.max(0.6, seconds);
      material.map = texture(id);
      material.needsUpdate = true;
      material.opacity = 0;
      sprite.visible = true;
    },
    clear() {
      name = null;
      sprite.visible = false;
    },
    // anchor is a world point just above the head.
    update(dt, anchor, shown = true) {
      if (!name) return;
      age += dt;
      if (age >= life) {
        this.clear();
        return;
      }
      const t = Math.min(1, age / POP);
      const pop = 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
      const s = size * Math.max(0.01, pop);
      sprite.scale.set(s, s, 1);
      sprite.position.copy(anchor);
      sprite.position.y += Math.sin(age * 3.2) * 0.012;
      material.opacity = Math.min(1, age / 0.12, (life - age) / FADE);
      sprite.visible = shown;
    },
  };
}
