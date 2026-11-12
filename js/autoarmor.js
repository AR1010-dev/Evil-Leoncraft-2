/* Automatically upgrade worn armour from the player's inventory. */
import { CreativeInventoryScreen, InventoryScreen } from './ui/inventory.js?v=118';
import { armorOf, maxDamage } from './items.js?v=118';

const ARMOR_SLOTS = [0, 1, 2, 3];
const ENCHANTMENTS = [
  ['protection', 'autoArmorProtectionWeight', 1],
  ['fire_protection', 'autoArmorFireProtectionWeight', 0.35],
  ['blast_protection', 'autoArmorBlastProtectionWeight', 0.35],
  ['projectile_protection', 'autoArmorProjectileProtectionWeight', 0.35],
  ['unbreaking', 'autoArmorUnbreakingWeight', 0.2],
  ['mending', 'autoArmorMendingWeight', 0.75],
  ['thorns', 'autoArmorThornsWeight', 0.15],
];

const stackKey = stack => {
  if (!stack) return '';
  const ench = stack.ench ? Object.keys(stack.ench).sort().map(key => [key, stack.ench[key]]) : [];
  return JSON.stringify([stack.id, stack.dmg || 0, stack.count || 1, ench]);
};
const remainingDurability = stack => {
  const max = stack ? maxDamage(stack.id) : 0;
  return max ? Math.max(0, 1 - (stack.dmg || 0) / max) : 1;
};

export class AutoArmor {
  constructor(options) {
    this.options = options;
    this.nextActionAt = 0;
    this.pending = null;
    this.combatUntil = 0;
    this.lastHit = null;
  }

  combatActive(game, now) {
    const combat = game.entities && game.entities.combat;
    if (combat && combat.lastHit && combat.lastHit !== this.lastHit) {
      this.lastHit = combat.lastHit;
      this.combatUntil = now + (this.options.get('autoArmorCombatPause') ?? 1500);
    }
    return !!(game.survival.hurtTime > 0 || (combat && combat.use) || now < this.combatUntil);
  }

  allowed(game, gui, now) {
    const o = this.options, screen = gui.screen;
    if (o.get('autoArmorEnabled') !== true || game.mode === 'spectator' || game.survival.dead) return false;
    if (game.inv.carried) return false;
    if (o.get('autoArmorRequireInventoryOpen') === true) {
      const inventoryOpen = screen instanceof InventoryScreen ||
        (screen instanceof CreativeInventoryScreen && screen.T.inventory);
      if (!inventoryOpen || screen.inv !== game.inv) return false;
    } else if (o.get('autoArmorPauseWhenScreenOpen') !== false && gui.isOpen()) return false;
    if (o.get('autoArmorPauseInCombat') !== false && this.combatActive(game, now)) return false;
    return true;
  }

  enchantScore(stack) {
    if (!stack || !stack.ench) return 0;
    let score = 0;
    for (const [name, key, fallback] of ENCHANTMENTS) {
      const level = Number(stack.ench[name]) || 0;
      score += level * (this.options.get(key) ?? fallback);
    }
    return score;
  }

  score(stack, slot) {
    const armor = stack && armorOf(stack.id), o = this.options;
    if (!armor || armor.slot !== slot || armor.points <= 0) return -Infinity;
    if (o.get('autoArmorIgnoreCurses') !== false && stack.ench &&
      (stack.ench.binding_curse || stack.ench.vanishing_curse)) return -Infinity;
    const durability = remainingDurability(stack);
    const limit = (o.get('autoArmorDurabilityLimit') ?? 0) / 100;
    if (maxDamage(stack.id) && durability * 100 < limit * 100) return -Infinity;
    const points = armor.points * (o.get('autoArmorArmorWeight') ?? 1);
    const toughness = armor.toughness * (o.get('autoArmorToughnessWeight') ?? 1);
    const knockback = armor.knockback * (o.get('autoArmorKnockbackWeight') ?? 4);
    const enchants = this.enchantScore(stack) * (o.get('autoArmorEnchantmentWeight') ?? 1);
    const durabilityScore = durability * (o.get('autoArmorDurabilityWeight') ?? 0.5);
    let total = points + toughness + knockback + enchants + durabilityScore;
    const formula = o.get('autoArmorRatingFormula');
    if (formula === 'armorFirst') total += armor.points * 100;
    else if (formula === 'survivability') {
      total = points + toughness * 2.5 + knockback * 3 +
        enchants * 1.5 + durabilityScore;
    }
    return total;
  }

  bestUpgrade(inv) {
    let best = null;
    for (const slot of ARMOR_SLOTS) {
      const equipped = inv.armor[slot];
      if (equipped && equipped.ench && equipped.ench.binding_curse && inv.mode !== 'creative') continue;
      const equippedScore = this.score(equipped, slot);
      for (let index = 0; index < inv.slots.length; index++) {
        const candidate = inv.slots[index];
        if (!candidate || candidate.count <= 0) continue;
        const score = this.score(candidate, slot);
        if (!Number.isFinite(score) || score <= equippedScore + 0.001) continue;
        const gain = score - (Number.isFinite(equippedScore) ? equippedScore : 0);
        if (!best || gain > best.gain) best = { slot, index, equippedKey: stackKey(equipped), candidateKey: stackKey(candidate), gain };
      }
    }
    return best;
  }

  tick(game, gui, now) {
    const o = this.options;
    if (!this.allowed(game, gui, now)) { this.pending = null; return; }
    if (now < this.nextActionAt) return;
    const upgrade = this.bestUpgrade(game.inv);
    if (!upgrade) { this.pending = null; return; }
    if (!this.pending || this.pending.slot !== upgrade.slot || this.pending.index !== upgrade.index ||
      this.pending.candidateKey !== upgrade.candidateKey || this.pending.equippedKey !== upgrade.equippedKey) {
      const min = Math.max(100, Math.min(300, o.get('autoArmorDelayMin') ?? 100));
      const max = Math.max(min, Math.min(300, o.get('autoArmorDelayMax') ?? 300));
      this.pending = Object.assign({}, upgrade, { at: now + min + Math.random() * (max - min) });
      return;
    }
    if (now < this.pending.at) return;
    const inv = game.inv, candidate = inv.slots[upgrade.index], equipped = inv.armor[upgrade.slot];
    if (stackKey(candidate) !== upgrade.candidateKey || stackKey(equipped) !== upgrade.equippedKey) {
      this.pending = null;
      return;
    }
    inv.armor[upgrade.slot] = candidate;
    inv.slots[upgrade.index] = equipped;
    const changedAt = performance.now();
    inv.popAt[upgrade.index] = changedAt;
    inv.changed();
    if (gui.isOpen()) gui.markDirty();
    this.pending = null;
    this.nextActionAt = now + Math.max(100, o.get('autoArmorSwapInterval') ?? 250);
  }
}
