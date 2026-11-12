const TRACER_VERTEX_SHADER = `
  uniform vec2 uResolution;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aAlong;
  attribute float aSide;
  attribute vec3 aColor;
  attribute float aOpacity;
  attribute float aWidth;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec4 startClip = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
    vec4 endClip = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
    vec2 screenDelta = (endClip.xy / endClip.w - startClip.xy / startClip.w) * uResolution;
    float lineLength = length(screenDelta);
    vec2 perpendicular = lineLength > 0.0001
      ? vec2(-screenDelta.y, screenDelta.x) / lineLength
      : vec2(0.0, 1.0);
    vec4 clip = mix(startClip, endClip, aAlong);
    clip.xy += perpendicular * aSide * aWidth * vec2(1.0 / uResolution.x, 1.0 / uResolution.y) * clip.w;
    gl_Position = clip;
    vColor = aColor;
    vOpacity = aOpacity;
  }
`;

const TRACER_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    gl_FragColor = vec4(vColor, vOpacity);
  }
`;

const DEFAULT_OPTIONS = {
  enabled: true,
  anchor: { x: 0, y: -1 },
  anchorDistance: 0.35,
  renderDistance: 64,
  opacity: 0.9,
  opacityFalloff: 1,
  thickness: 2,
  lockOnThickness: 4,
  lockOnOpacity: 1,
  lockOnColor: 0xffdf55,
  entityColor: 0xffffff,
  teammateColor: 0x48c8ff,
  lowHealthColor: 0xff4545,
  highHealthColor: 0x62ee79,
  includePlayers: true,
  includeTeammates: true,
  includeMobs: true,
  entityTypes: null,
  filterEntity: null,
  maxTargets: 128,
  renderOrder: 1,
};

/**
 * Draw screen-anchored, depth-tested tracer lines in a parent-owned THREE.Scene.
 *
 * Construction:
 *   new TracerRenderer({ scene, THREE?, options? })
 *
 * Call update(frame) each render frame with:
 *   camera: THREE.Camera (required)
 *   entities: current-frame array of { id, position, tracerPosition?, type?,
 *     isPlayer?, isTeammate?, isMob?, isActive?, alive?, dead?, health?,
 *     maxHealth?, lockedOn? }. Positions are world-space Vector3s or {x,y,z}.
 *   playerPosition?: world position used for render-distance checks (camera
 *     position is used when omitted)
 *   occluders?: current opaque world meshes (recursive THREE raycast targets)
 *   isLineOfSightClear?: optional synchronous (entity, cameraPosition,
 *     targetPosition, distance) => boolean. It must check current world state.
 *   lockedOnId?: entity id, viewportWidth/viewportHeight?: drawing-buffer pixels
 *
 * Supply either current opaque occluders or isLineOfSightClear. Without either,
 * no targets are drawn. update() refreshes positions and LOS every frame and
 * clears the draw range when a target is missing, filtered, or occluded.
 * configure(options) updates settings; maxTargets is fixed at construction to
 * keep GPU buffers reusable. render() synchronizes mesh visibility; the parent
 * must render the scene passed to the constructor. dispose() detaches and
 * releases GPU resources.
 */
export class TracerRenderer {
  constructor({ scene, THREE = window.THREE, options = {} } = {}) {
    if (!THREE) throw new Error('TracerRenderer requires THREE.js');
    if (!scene || typeof scene.add !== 'function') throw new Error('TracerRenderer requires a THREE.Scene');

    this.THREE = THREE;
    this.scene = scene;
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.maxTargets = Math.max(1, Math.floor(Number(this.options.maxTargets) || DEFAULT_OPTIONS.maxTargets));
    this._disposed = false;
    this._lineCount = 0;
    this._lockedOnId = null;
    this._hits = [];
    this._occluders = [];
    this._losCallback = null;

    const vertexCount = this.maxTargets * 6;
    const geometry = this.geometry = new THREE.BufferGeometry();
    this._starts = new Float32Array(vertexCount * 3);
    this._ends = new Float32Array(vertexCount * 3);
    this._colors = new Float32Array(vertexCount * 3);
    this._opacities = new Float32Array(vertexCount);
    this._widths = new Float32Array(vertexCount);
    const along = new Float32Array(vertexCount);
    const sides = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 6) {
      along.set([0, 1, 1, 0, 1, 0], i);
      sides.set([-1, -1, 1, -1, 1, 1], i);
    }

    const dynamic = (array, size) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aStart', dynamic(this._starts, 3));
    geometry.setAttribute('aEnd', dynamic(this._ends, 3));
    geometry.setAttribute('aColor', dynamic(this._colors, 3));
    geometry.setAttribute('aOpacity', dynamic(this._opacities, 1));
    geometry.setAttribute('aWidth', dynamic(this._widths, 1));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    geometry.setDrawRange(0, 0);

    const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const initialWidth = Math.max(1, Number(this.options.viewportWidth) || (typeof window === 'undefined' ? 1 : window.innerWidth * pixelRatio));
    const initialHeight = Math.max(1, Number(this.options.viewportHeight) || (typeof window === 'undefined' ? 1 : window.innerHeight * pixelRatio));
    this._resolution = new THREE.Vector2(initialWidth, initialHeight);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uResolution: { value: this._resolution } },
      vertexShader: TRACER_VERTEX_SHADER,
      fragmentShader: TRACER_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = Number(this.options.renderOrder) || 0;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this._anchorNdc = new THREE.Vector2();
    this._anchor = new THREE.Vector3();
    this._cameraPosition = new THREE.Vector3();
    this._viewerPosition = new THREE.Vector3();
    this._targetPosition = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._cameraForward = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._lowHealthColor = new THREE.Color(this.options.lowHealthColor);
    this._highHealthColor = new THREE.Color(this.options.highHealthColor);
    this._entityColor = new THREE.Color(this.options.entityColor);
    this._teammateColor = new THREE.Color(this.options.teammateColor);
    this._lockOnColor = new THREE.Color(this.options.lockOnColor);
    this._color = new THREE.Color();
  }

  setViewport(width, height) {
    if (this._disposed) return;
    this._resolution.set(Math.max(1, Number(width) || 1), Math.max(1, Number(height) || 1));
  }

  configure(options = {}) {
    if (this._disposed) return;
    if (options.maxTargets != null && Math.floor(Number(options.maxTargets)) !== this.maxTargets) {
      throw new RangeError('maxTargets is fixed when TracerRenderer is constructed');
    }
    Object.assign(this.options, options);
    this._lowHealthColor.set(this.options.lowHealthColor);
    this._highHealthColor.set(this.options.highHealthColor);
    this._entityColor.set(this.options.entityColor);
    this._teammateColor.set(this.options.teammateColor);
    this._lockOnColor.set(this.options.lockOnColor);
    this.mesh.renderOrder = Number(this.options.renderOrder) || 0;
  }

  update(frame = {}) {
    if (this._disposed) return 0;
    const options = this.options;
    const camera = frame.camera;
    const entities = frame.entities;
    this._lineCount = 0;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;

    if (!options.enabled || !camera || !Array.isArray(entities)) return 0;
    if (Number.isFinite(frame.viewportWidth) && Number.isFinite(frame.viewportHeight)) {
      this.setViewport(frame.viewportWidth, frame.viewportHeight);
    }

    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this._cameraPosition);
    camera.getWorldDirection(this._cameraForward);
    const viewer = frame.playerPosition;
    if (!this._readPosition(viewer, this._viewerPosition)) this._viewerPosition.copy(this._cameraPosition);

    const anchorOption = options.anchor || DEFAULT_OPTIONS.anchor;
    this._anchorNdc.set(Number(anchorOption.x) || 0, Number(anchorOption.y) || 0);
    this._raycaster.setFromCamera(this._anchorNdc, camera);
    this._anchor.copy(this._raycaster.ray.origin).addScaledVector(
      this._raycaster.ray.direction,
      Math.max(0, Number(options.anchorDistance) || 0),
    );

    this._occluders = Array.isArray(frame.occluders) ? frame.occluders : [];
    this._losCallback = typeof frame.isLineOfSightClear === 'function' ? frame.isLineOfSightClear : null;
    this._lockedOnId = frame.lockedOnId;

    const maxDistance = Math.max(0, Number(options.renderDistance) || 0);
    const maxDistanceSq = maxDistance * maxDistance;
    for (let i = 0; i < entities.length && this._lineCount < this.maxTargets; i++) {
      const entity = entities[i];
      if (!this._acceptEntity(entity, options)) continue;
      if (!this._readPosition(entity.tracerPosition || entity.position, this._targetPosition)) continue;

      const distanceSq = this._viewerPosition.distanceToSquared(this._targetPosition);
      if (distanceSq > maxDistanceSq) continue;
      if (this._direction.subVectors(this._targetPosition, this._cameraPosition).dot(this._cameraForward) <= 0) continue;
      const distance = Math.sqrt(distanceSq);
      if (!this._hasCurrentLineOfSight(entity, distance)) continue;

      const locked = entity.lockedOn === true ||
        (this._lockedOnId != null && entity.id === this._lockedOnId);
      this._writeLine(entity, distance, locked, options);
    }

    const count = this._lineCount * 6;
    this.geometry.setDrawRange(0, count);
    if (count) {
      this.geometry.attributes.aStart.needsUpdate = true;
      this.geometry.attributes.aEnd.needsUpdate = true;
      this.geometry.attributes.aColor.needsUpdate = true;
      this.geometry.attributes.aOpacity.needsUpdate = true;
      this.geometry.attributes.aWidth.needsUpdate = true;
    }
    this.render();
    return this._lineCount;
  }

  _acceptEntity(entity, options) {
    if (!entity || entity.isActive === false || entity.active === false || entity.alive === false || entity.dead === true) return false;
    if (entity.isLocalPlayer === true || entity.isSelf === true) return false;

    const type = entity.type || entity.kind || entity.category;
    const isTeammate = entity.isTeammate === true || type === 'teammate';
    const isPlayer = entity.isPlayer === true || type === 'player' || isTeammate;
    const isMob = entity.isMob === true || (!isPlayer && type != null);
    if (isTeammate ? !options.includeTeammates : isPlayer ? !options.includePlayers : isMob && !options.includeMobs) return false;
    if (Array.isArray(options.entityTypes) && !options.entityTypes.includes(type)) return false;
    if (typeof options.filterEntity === 'function' && !options.filterEntity(entity)) return false;
    return true;
  }

  _hasCurrentLineOfSight(entity, distance) {
    if (this._losCallback) {
      return this._losCallback(entity, this._cameraPosition, this._targetPosition, distance) === true;
    }
    if (!Array.isArray(this._occluders)) return false;
    if (!this._occluders.length) return true;

    this._direction.subVectors(this._targetPosition, this._cameraPosition);
    if (this._direction.lengthSq() < 1e-10) return true;
    this._direction.normalize();
    this._raycaster.ray.origin.copy(this._cameraPosition);
    this._raycaster.ray.direction.copy(this._direction);
    this._raycaster.near = 0;
    this._raycaster.far = Math.max(0, distance - 0.03);
    this._hits.length = 0;
    this._raycaster.intersectObjects(this._occluders, true, this._hits);
    return this._hits.length === 0;
  }

  _writeLine(entity, distance, locked, options) {
    const THREE = this.THREE;
    const base = this._lineCount * 18;
    const vertex = this._lineCount * 6;
    const anchor = this._anchor;
    const target = this._targetPosition;
    const health = Number(entity.health);
    const maxHealth = Number(entity.maxHealth);

    if (locked) this._color.copy(this._lockOnColor);
    else if (Number.isFinite(health) && Number.isFinite(maxHealth) && maxHealth > 0) {
      this._color.copy(this._lowHealthColor).lerp(this._highHealthColor, THREE.MathUtils.clamp(health / maxHealth, 0, 1));
    } else if (entity.isTeammate === true || entity.type === 'teammate' || entity.kind === 'teammate' || entity.category === 'teammate') this._color.copy(this._teammateColor);
    else this._color.copy(this._entityColor);

    const remaining = options.renderDistance > 0 ? Math.max(0, 1 - distance / options.renderDistance) : 0;
    const falloff = Math.pow(remaining, Math.max(0, Number(options.opacityFalloff) || 0));
    const opacity = THREE.MathUtils.clamp(Number(options.opacity) * falloff * (locked ? Number(options.lockOnOpacity) : 1), 0, 1);
    const width = Math.max(0.1, Number(locked ? options.lockOnThickness : options.thickness) || 1);

    for (let i = 0; i < 6; i++) {
      const p = base + i * 3;
      this._starts[p] = anchor.x; this._starts[p + 1] = anchor.y; this._starts[p + 2] = anchor.z;
      this._ends[p] = target.x; this._ends[p + 1] = target.y; this._ends[p + 2] = target.z;
      this._colors[p] = this._color.r; this._colors[p + 1] = this._color.g; this._colors[p + 2] = this._color.b;
      this._opacities[vertex + i] = opacity;
      this._widths[vertex + i] = width * 0.5;
    }
    this._lineCount++;
  }

  _readPosition(value, out) {
    if (!value) return false;
    if (Array.isArray(value)) out.set(Number(value[0]), Number(value[1]), Number(value[2]));
    else if (typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number') out.set(value.x, value.y, value.z);
    else return false;
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
  }

  render() {
    if (this._disposed) return false;
    this.mesh.visible = !!this.options.enabled && this._lineCount > 0;
    return this.mesh.visible;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this._hits.length = 0;
    this._occluders = [];
    this._losCallback = null;
    this._lineCount = 0;
  }
}
