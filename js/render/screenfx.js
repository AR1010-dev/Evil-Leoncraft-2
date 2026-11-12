/* ---------------------------------------------------------------------------
   Leoncraft 2 - what the game does to the whole view, besides the HUD.

     the wobble   standing in a nether portal, or with Nausea, the world (not
                  your hand) is stretched sideways along an axis that turns
                  round (0, 0.71, 0.71) of the view, 20 degrees a tick in a
                  portal and 7 with Nausea, by 1 / k where k is
                  (5 / (i * i + 5) - i * 0.04) squared and i the effect's
                  strength: in a portal it grows 0.0125 a tick (all of it
                  after 80 ticks), with Nausea 1/150 a tick while more than
                  3 seconds of it are left, and otherwise it dies away 0.05 a
                  tick (Spin, ticked with the game).
     under water  the game's water overlay: a blue picture (ours, 16 x 16)
                  laid four times across and down the screen at a tenth of
                  its own opacity, sliding as you turn (a 64th of a tile a
                  degree), as bright as the light where your eyes are.

     const spin = new Spin();  spin.tick(portalTime, nausea);  state.spin = spin.at(alpha)
     screenFx(renderer, cam, state)   after the camera's projection is made
--------------------------------------------------------------------------- */
import { timeOfDay } from './vanilla.js?v=118';
const THREE = window.THREE;

const CLARITY_DEFAULTS = Object.freeze({
  enabled: false,
  blindnessOpacity: 0,
  darknessOpacity: 0,
  nauseaOpacity: 0,
  fogRestoration: 1,
  wobbleDampening: 1,
  colorCorrection: 1,
  ambientBoost: 0,
  flashThreshold: 0,
  customOverlayOpacity: 0,
  transitionTime: 0.25,
});
const CLARITY_NATURAL = Object.freeze({
  blindnessOpacity: 1,
  darknessOpacity: 1,
  nauseaOpacity: 1,
  fogRestoration: 0,
  wobbleDampening: 0,
  colorCorrection: 0,
  ambientBoost: 0,
  flashThreshold: 1,
  customOverlayOpacity: 1,
  transitionTime: 0.25,
});
let clarityTarget = Object.assign({}, CLARITY_DEFAULTS);
const clarityCurrent = Object.assign({}, CLARITY_NATURAL);

function clarityValue(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

/*
 * Render-only API (also exposed as renderer.setEnvironmentalClarity(options)):
 * enabled; blindnessOpacity/darknessOpacity/nauseaOpacity (remaining 0..1);
 * fogRestoration (0..1 restored range), colorCorrection (0..1 neutralized
 * darkening), wobbleDampening (0..1 removed view motion), flashThreshold and
 * customOverlayOpacity (remaining 0..1), ambientBoost, and transitionTime in
 * seconds. Opacity 1 preserves vanilla visuals; fogRestoration/colorCorrection/
 * wobbleDampening at 1 maximally restore/dampen their corresponding visuals.
 * The custom overlay is this renderer's underwater texture.
 */
export function setEnvironmentalClarity(options = {}) {
  if (!options || typeof options !== 'object') return getEnvironmentalClarity();
  const next = Object.assign({}, clarityTarget);
  if (Object.prototype.hasOwnProperty.call(options, 'enabled')) next.enabled = !!options.enabled;
  for (const key of Object.keys(CLARITY_DEFAULTS)) {
    if (key !== 'enabled' && Object.prototype.hasOwnProperty.call(options, key)) {
      next[key] = clarityValue(options[key], CLARITY_DEFAULTS[key]);
    }
  }
  clarityTarget = next;
  return getEnvironmentalClarity();
}

export function getEnvironmentalClarity() {
  return Object.assign({}, clarityTarget);
}

function updateClarity(state, dt) {
  const enabled = clarityTarget.enabled;
  const duration = clarityTarget.transitionTime;
  const blend = duration <= 0 ? 1 :
    1 - Math.exp(-Math.max(0, Math.min(0.25, Number(dt) || 0)) * 3 / duration);
  for (const key of Object.keys(CLARITY_NATURAL)) {
    const target = enabled ? clarityTarget[key] : CLARITY_NATURAL[key];
    clarityCurrent[key] += (target - clarityCurrent[key]) * blend;
  }
  // The profile is attached to this frame's render snapshot only.
  state.environmentalClarity = clarityCurrent;
  return clarityCurrent;
}

export function prepareEnvironmentalClarity(state, dt) {
  return updateClarity(state, dt);
}

/* the strength of the wobble, ticked with the game */
export class Spin {
  constructor() { this.i = 0; this.o = 0; this.rate = 20; this.t = 0; this.source = null; this.out = { i: 0, rate: 20, t: 0, source: null }; }
  // portalTime: how long you have stood in a nether portal (dim/realms.js: it grows only while you are in one);
  // nausea: the effect's ticks left (-1 for ever), or null
  tick(portalTime, nausea) {
    const inPortal = portalTime > (this.pt || 0);
    this.pt = portalTime;
    this.o = this.i; this.t++;
    let f = 0;
    if (inPortal) f = 0.0125;
    else if (nausea !== null && nausea !== undefined && (nausea < 0 || nausea > 60)) f = 1 / 150;
    else if (this.i > 0) f = -0.05;
    this.i = Math.max(0, Math.min(1, this.i + f));
    if (inPortal) this.source = 'portal';
    else if (nausea !== null && nausea !== undefined) this.source = 'nausea';
    // (the turn is the portal's while there is no Nausea)
    this.rate = nausea !== null && nausea !== undefined ? 7 : 20;
  }
  at(alpha) {
    const i = this.o + (this.i - this.o) * alpha;
    if (i <= 0) return null;
    const o = this.out;
    o.i = i; o.rate = this.rate; o.t = this.t + alpha; o.source = this.source;
    return o;
  }
}

const AXIS = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
const R1 = new THREE.Matrix4(), SC = new THREE.Matrix4(), R2 = new THREE.Matrix4();
function wobble(cam, s, strength) {
  const i = s.i * strength;
  let k = 5 / (i * i + 5) - i * 0.04;
  k *= k;
  const l = s.t * s.rate * Math.PI / 180;
  R1.makeRotationAxis(AXIS, l); SC.makeScale(1 / k, 1, 1); R2.makeRotationAxis(AXIS, -l);
  cam.projectionMatrix.multiply(R1).multiply(SC).multiply(R2);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

/* our water picture: the game's deep blue, a grain of lighter and darker pixels, a little more opaque here and there */
function waterPicture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d'), img = g.createImageData(16, 16), d = img.data;
  let s = 20261007;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return ((s >>> 8) & 0xffff) / 0xffff; };
  for (let i = 0; i < 256; i++) {
    const n = rnd();
    d[i * 4] = 36 + Math.round(n * 12); d[i * 4 + 1] = 88 + Math.round(n * 13); d[i * 4 + 2] = 255;
    d[i * 4 + 3] = rnd() < 0.2 ? 146 : 136;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
let water = null, waterKey = '';
function waterOverlay(R, state, opacity) {
  if (opacity <= 0 || !state.eyeInWater || state.player === null || state.player === undefined) { if (water && water.style.display !== 'none') water.style.display = 'none'; return; }
  if (!water) {
    water = document.createElement('div');
    water.style.cssText = 'position:fixed;inset:0;pointer-events:none;image-rendering:pixelated;background-repeat:repeat;';
    water.style.backgroundImage = 'url(' + waterPicture() + ')';
    const c = document.getElementById('c');
    if (c && c.parentNode) c.parentNode.insertBefore(water, c.nextSibling); else document.body.appendChild(water);
  }
  // as bright as the light where the eyes are: the sky's (darkened at night as the game does) or the block light, through the game's curve
  const L = R.avatar && R.avatar.uLight ? R.avatar.uLight.value : null;
  const td = timeOfDay(((state.time || 0) * 20) % 24000);
  const dark = Math.floor((1 - Math.max(0, Math.min(1, Math.cos(td * Math.PI * 2) * 2 + 0.5))) * 11);
  const raw = Math.max(0, L ? Math.max(Math.round(L.x * 15) - dark, Math.round(L.y * 15)) : 15) / 15;
  const f = raw / (4 - 3 * raw);
  const W = window.innerWidth, H = window.innerHeight, tw = W / 4, th = H / 4;
  // a 64th of a tile a degree: across as you turn, up and down as you look up and down
  const yaw = 180 - (state.yaw || 0) * 180 / Math.PI, pitch = -(state.pitch || 0) * 180 / Math.PI;
  const x = ((yaw / 64) % 1) * tw, y = ((-pitch / 64) % 1) * th;
  const key = Math.round(x) + ',' + Math.round(y) + ',' + tw + ',' + th + ',' + f.toFixed(2);
  if (key !== waterKey) {
    waterKey = key;
    water.style.backgroundSize = tw + 'px ' + th + 'px';
    water.style.backgroundPosition = Math.round(x) + 'px ' + Math.round(y) + 'px';
    water.style.filter = 'brightness(' + f.toFixed(2) + ')';
  }
  water.style.opacity = String(0.1 * opacity);
  if (water.style.display === 'none') water.style.display = '';
}

/* each frame, once the camera's projection is made (renderer.js) */
export function screenFx(R, cam, state, dt = 1 / 60) {
  const clarity = state.environmentalClarity || updateClarity(state, dt);
  if (state.spin) {
    const damped = Math.max(0, 1 - clarity.wobbleDampening);
    const nausea = state.spin.source === 'nausea' ? clarity.nauseaOpacity : 1;
    const strength = damped * nausea;
    if (strength > 0) wobble(cam, state.spin, strength);
  }
  waterOverlay(R, state, clarity.customOverlayOpacity);
}
