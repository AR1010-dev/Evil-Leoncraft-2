import { Living } from './entities/entity.js?v=118';
import { TYPES } from './entities/mobs.js?v=118';
import { weaponOf } from './combat/weapons.js?v=118';

const DEG = Math.PI / 180;
const wrap = angle => ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const AIM_POINTS = { feet: 0.2, center: 0.5, upper: 0.75, head: 0.9 };

export class AutoTarget {
  constructor(options) {
    this.options = options;
    this.target = null;
    this.nextTargetChangeAt = 0;
    this.nextAttackAt = 0;
  }

  singleplayer(game) {
    return !!(game && game.entry && !game.net && !game.entry.mp);
  }

  configuredTypes() {
    return new Set(String(this.options.get('autoTargetTypes') || '')
      .split(',')
      .map(type => type.trim().toLowerCase())
      .filter(type => type && type !== 'player' && Object.prototype.hasOwnProperty.call(TYPES, type)));
  }

  validTarget(entity, types, range2, eye) {
    if (!(entity instanceof Living) || entity.isPlayer || entity.remotePlayer ||
      entity.type === 'player' || !types.has(entity.type) || entity.removed || entity.dead) return false;
    if (this.options.get('autoTargetHostileOnly') === true && !entity.constructor.HOSTILE) return false;
    if (this.options.get('autoTargetIgnoreNamed') === true && entity.customName) return false;
    if (this.options.get('autoTargetSkipHurt') === true && entity.hurtTime > 0) return false;
    const dx = entity.pos.x - eye.x;
    const dy = entity.pos.y + entity.h * 0.5 - eye.y;
    const dz = entity.pos.z - eye.z;
    return dx * dx + dy * dy + dz * dz <= range2;
  }

  chooseTarget(entities, eye, types, range2, player) {
    const priority = this.options.get('autoTargetPriority');
    let best = null, bestScore = Infinity;
    for (const entity of entities.list) {
      if (!this.validTarget(entity, types, range2, eye)) continue;
      const dx = entity.pos.x - eye.x;
      const dy = entity.pos.y + entity.h * 0.5 - eye.y;
      const dz = entity.pos.z - eye.z;
      const distance2 = dx * dx + dy * dy + dz * dz;
      let score = distance2;
      if (priority === 'lowestHealth') score = (entity.health / Math.max(1, entity.maxHealth)) * 100000 + distance2;
      else if (priority === 'crosshair') {
        const yaw = Math.atan2(-dx, -dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        score = wrap(yaw - player.yaw) ** 2 + (pitch - player.pitch) ** 2;
      }
      if (score < bestScore) { best = entity; bestScore = score; }
    }
    return best;
  }

  tick(game, gui) {
    if (this.options.get('autoTargetEnabled') !== true || !this.singleplayer(game) || !game.entities ||
      !game.player || !game.survival || gui.isOpen() || game.survival.dead || game.mode === 'spectator') {
      this.target = null;
      return;
    }

    const entities = game.entities, player = game.player;
    const types = this.configuredTypes();
    if (!types.size) { this.target = null; return; }
    if (this.options.get('autoTargetPauseWhenHurt') === true && game.survival.hurtTime > 0) return;
    if (this.options.get('autoTargetPauseWhenUsing') === true &&
      (entities.combat.use || (game.inter && game.inter.useHeld))) return;
    if (this.options.get('autoTargetPauseWhenMoving') === true && player.vel &&
      player.vel.x * player.vel.x + player.vel.y * player.vel.y + player.vel.z * player.vel.z > 0.0025) return;

    const reach = Math.min(
      clamp(Number(this.options.get('autoTargetRange')) || 3, 1, 5),
      entities.combat.reach(),
    );
    const eye = player.pickEye();
    const range2 = reach * reach;
    if (!this.validTarget(this.target, types, range2, eye)) this.target = null;
    if (!this.target || (this.options.get('autoTargetLockTarget') !== true &&
      entities.age >= this.nextTargetChangeAt)) {
      const selected = this.chooseTarget(entities, eye, types, range2, player);
      if (selected && selected !== this.target) {
        this.target = selected;
        this.nextTargetChangeAt = entities.age + clamp(Number(this.options.get('autoTargetRetargetDelay')) || 0, 0, 100);
      }
    }
    const target = this.target;
    if (!target) return;

    const dx = target.pos.x - eye.x;
    const aimPoint = AIM_POINTS[this.options.get('autoTargetAimPoint')] ?? AIM_POINTS.upper;
    const dy = target.pos.y + target.h * aimPoint - eye.y;
    const dz = target.pos.z - eye.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const smoothing = clamp(Number(this.options.get('autoTargetSmoothing')) || 0, 0, 0.95);
    const speed = clamp(Number(this.options.get('autoTargetTurnSpeed')) || 18, 1, 90) *
      (1 - smoothing * 0.9) * DEG;
    const yawDelta = wrap(yaw - player.yaw);
    player.yaw = wrap(player.yaw + clamp(yawDelta, -speed, speed));
    player.pitch = clamp(player.pitch + clamp(pitch - player.pitch, -speed, speed), -Math.PI / 2, Math.PI / 2);

    const tolerance = clamp(Number(this.options.get('autoTargetAimTolerance')) || 2, 0.5, 15) * DEG;
    if (Math.abs(wrap(yaw - player.yaw)) > tolerance || Math.abs(pitch - player.pitch) > tolerance) return;
    const minimumCharge = clamp(Number(this.options.get('autoTargetMinimumCharge')) || 1, 0.1, 1);
    if (entities.combat.cooldown() < minimumCharge || entities.age < this.nextAttackAt) return;
    if (this.options.get('autoTargetRequireAttackKey') === true && !(game.inter && game.inter.attack)) return;
    if (this.options.get('autoTargetRequireWeapon') === true &&
      !['sword', 'axe', 'spear', 'trident', 'mace'].includes(weaponOf(entities.combat.heldId()).kind)) return;

    const blockHit = player.pick(eye, reach);
    const aimedEntity = entities.pickFor(eye, blockHit ? blockHit.t : reach);
    if (aimedEntity === target && entities.attack(target)) {
      this.nextAttackAt = entities.age + clamp(Number(this.options.get('autoTargetAttackInterval')) || 0, 0, 40);
    }
  }
}
