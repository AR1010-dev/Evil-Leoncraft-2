import { itemName, maxStack, sameItem, withCount } from './items.js?v=118';
import { DIMS } from './dims.js?v=118';

const conditions = new Set(['health', 'hunger', 'playerRange', 'always']);

const profilesOf = options => {
  const saved = options.get('autoOffhandProfiles');
  return Array.from({ length: 10 }, (_, index) => {
    const profile = saved && saved[index] || {};
    return {
      enabled: profile.enabled === true,
      itemId: Number.isInteger(profile.itemId) && profile.itemId > 0 ? profile.itemId : 0,
      condition: conditions.has(profile.condition) ? profile.condition : 'health',
      threshold: Number.isFinite(profile.threshold) ? profile.threshold : 6,
    };
  });
};

export class AutoOffhand {
  constructor(options) {
    this.options = options;
    this.nextActionAt = 0;
  }

  conditionMet(profile, game) {
    if (profile.condition === 'always') return true;
    if (profile.condition === 'health') return game.survival.health <= profile.threshold;
    if (profile.condition === 'hunger') return game.survival.food <= profile.threshold;
    if (profile.condition === 'playerRange') {
      const players = game.net && game.net.players && game.net.players.list;
      if (!players) return false;
      const { x, y, z } = game.player.pos;
      if (![x, y, z].every(Number.isFinite)) return false;
      const dimension = DIMS[game.dim] ? DIMS[game.dim].code : game.dim;
      const limit2 = profile.threshold * profile.threshold;
      for (const remote of players.values()) {
        const state = remote.st;
        if (!state || state.d !== dimension) continue;
        const dx = state.x - x, dy = state.y - y, dz = state.z - z;
        if (dx * dx + dy * dy + dz * dz <= limit2) return true;
      }
    }
    return false;
  }

  profileStatus(index, game, gui) {
    const profile = profilesOf(this.options)[index];
    if (!profile || !profile.enabled) return { text: `Profile ${index + 1}: Disabled`, working: false, missing: false };
    const name = profile.itemId ? itemName(profile.itemId) || `Item ${profile.itemId}` : '';
    if (this.options.get('autoOffhandEnabled') !== true) return { text: 'Auto Offhand: Disabled', working: false, missing: false };
    if (!profile.itemId) return { text: `Profile ${index + 1}: Select target item`, working: false, missing: true };
    if (!game) return { text: `Profile ${index + 1}: Waiting for world`, working: false, missing: false };
    if (!this.conditionMet(profile, game)) return { text: `Waiting: ${profile.condition}`, working: false, missing: false };
    if (game.inv.offhand && game.inv.offhand.id === profile.itemId) {
      return { text: `Active: ${name} equipped`, working: true, missing: false };
    }
    if (!game.inv.slots.some(stack => stack && stack.id === profile.itemId && stack.count > 0)) {
      return { text: `Missing: ${name}`, working: false, missing: true };
    }
    if (gui && gui.isOpen()) return { text: `Ready: ${name} (close screen)`, working: false, missing: false };
    return { text: `Ready: ${name}`, working: true, missing: false };
  }

  tick(game, gui, now) {
    if (this.options.get('autoOffhandEnabled') !== true || !game || !game.inv ||
      game.mode === 'spectator' || game.survival.dead || game.inv.carried || gui.isOpen() ||
      now < this.nextActionAt) return;

    const inv = game.inv;
    for (const profile of profilesOf(this.options)) {
      if (!profile.enabled || !profile.itemId || !this.conditionMet(profile, game)) continue;
      if (inv.offhand && inv.offhand.id === profile.itemId) continue;
      const sourceIndex = inv.slots.findIndex(stack => stack && stack.id === profile.itemId && stack.count > 0);
      if (sourceIndex < 0) continue;
      const source = inv.slots[sourceIndex], offhand = inv.offhand;
      const nextSlots = inv.slots.slice();

      if (source.count === 1) {
        nextSlots[sourceIndex] = offhand;
      } else {
        nextSlots[sourceIndex] = withCount(source, source.count - 1);
        if (offhand) {
          let remaining = offhand.count || 1;
          for (let index = 0; index < nextSlots.length && remaining > 0; index++) {
            const stack = nextSlots[index];
            if (index === sourceIndex || !sameItem(stack, offhand)) continue;
            const moved = Math.min(remaining, Math.max(0, maxStack(stack.id) - stack.count));
            if (!moved) continue;
            nextSlots[index] = withCount(stack, stack.count + moved);
            remaining -= moved;
          }
          for (let index = 0; index < nextSlots.length && remaining > 0; index++) {
            if (index === sourceIndex || nextSlots[index]) continue;
            const moved = Math.min(remaining, maxStack(offhand.id));
            nextSlots[index] = withCount(offhand, moved);
            remaining -= moved;
          }
          if (remaining > 0) continue;
        }
      }
      for (let index = 0; index < nextSlots.length; index++) inv.slots[index] = nextSlots[index];
      inv.offhand = withCount(source, 1);
      inv.changed();
      this.nextActionAt = now + 250;
      return;
    }
  }
}
