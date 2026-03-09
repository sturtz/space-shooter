import { IGame } from "../game/GameInterface";
import { Enemy } from "../entities/Enemy";
import { Vec2, vecDist, circleCollision, randomAngle } from "../utils/Math";
import { COIN_SIZE, COLORS, CHAIN_RANGE, SPLASH_DAMAGE_MULT } from "../utils/Constants";

/**
 * Handles all collision detection and resolution, extracted from Game.ts.
 */
export class CollisionSystem {
  /**
   * Player bullets vs enemies.
   * Implements: pierce, splash (on every hit), chain lightning,
   * poison, slow, damage numbers on kill, lifesteal.
   */
  checkBulletEnemyCollisions(game: IGame) {
    for (const bullet of game.bullets) {
      if (!bullet.alive) continue;
      for (const enemy of game.enemies) {
        if (!enemy.alive) continue;
        if (circleCollision(bullet.pos, bullet.radius, enemy.pos, enemy.radius)) {
          const killed = enemy.takeDamage(bullet.damage);

          // Always show damage number
          game.spawnDamageNumber(bullet.pos.x, bullet.pos.y, bullet.damage, bullet.isCrit);

          // Apply poison debuff
          if (game.stats.poisonDps > 0) {
            enemy.applyPoison(game.stats.poisonDps, 3);
          }

          // Apply slow debuff
          if (game.stats.slowOnHit > 0) {
            enemy.applySlow(game.stats.slowOnHit, 2);
          }

          if (killed) {
            game.onEnemyKilled(enemy);
          } else {
            // Hit particles
            game.particles.emit(bullet.pos, 3, COLORS.bullet, 40, 0.2, 1);
          }

          // Splash damage — triggers on every hit, not just kills
          if (game.stats.splashRadius > 0) {
            const splashDmg = bullet.damage * SPLASH_DAMAGE_MULT;
            for (const other of game.enemies) {
              if (!other.alive || other === enemy) continue;
              if (vecDist(enemy.pos, other.pos) < game.stats.splashRadius) {
                const splashKilled = other.takeDamage(splashDmg);
                // Bug #14 fix: show damage numbers for splash hits too
                game.spawnDamageNumber(other.pos.x, other.pos.y, splashDmg, false);
                if (splashKilled) {
                  game.onEnemyKilled(other);
                }
              }
            }
          }

          // Chain lightning — bounces to nearby enemies on kill
          if (killed && game.stats.chainTargets > 0) {
            this.chainLightning(
              game,
              enemy.pos,
              bullet.damage * SPLASH_DAMAGE_MULT,
              game.stats.chainTargets,
              enemy
            );
          }

          // Pierce: bullet may survive the hit
          if (bullet.onHitEnemy()) {
            bullet.destroy();
          }
          break; // Move to next bullet even if piercing (one enemy per frame per bullet)
        }
      }
    }
  }

  /** Chain lightning: damage bounces to N nearby enemies */
  private chainLightning(
    game: IGame,
    origin: Vec2,
    damage: number,
    targets: number,
    source: Enemy
  ) {
    const hit = new Set<Enemy>([source]);
    let currentPos = origin;
    let remaining = targets;

    while (remaining > 0) {
      let closest: Enemy | null = null;
      let closestDist = CHAIN_RANGE;

      for (const enemy of game.enemies) {
        if (!enemy.alive || hit.has(enemy)) continue;
        const d = vecDist(currentPos, enemy.pos);
        if (d < closestDist) {
          closestDist = d;
          closest = enemy;
        }
      }

      if (!closest) break;
      hit.add(closest);

      // Visual: lightning line
      game.particles.emitDirectional(
        closest.pos,
        randomAngle(),
        Math.PI,
        3,
        "#88aaff",
        40,
        0.15,
        1
      );

      if (closest.takeDamage(damage)) {
        game.onEnemyKilled(closest);
      }
      game.spawnDamageNumber(closest.pos.x, closest.pos.y, damage, false);

      currentPos = closest.pos;
      remaining--;
    }
  }

  /**
   * Enemies colliding with mothership.
   * Bug #1 fix: barrier is checked before applying damage — if the barrier
   * absorbs the hit, no HP is lost and no time penalty is applied.
   */
  checkEnemyMothershipCollisions(game: IGame): boolean {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (circleCollision(enemy.pos, enemy.radius, game.mothership.pos, game.mothership.radius)) {
        enemy.destroy();
        game.particles.emit(enemy.pos, 8, COLORS.mothershipDamaged, 80, 0.3, 2);

        // Barrier absorbs the hit if active
        if (game.spawner.barrierAbsorb()) {
          game.particles.emit(enemy.pos, 6, COLORS.shield, 60, 0.2, 1.5);
          game.renderer.shake(2);
          continue; // hit absorbed — no damage, no time penalty
        }

        const destroyed = game.mothership.takeDamage(1);
        game.roundTimer -= game.stats.timePenaltyPerHit;
        game.renderer.shake(5);
        game.audio.playMothershipHit();

        if (destroyed || game.roundTimer <= 0) {
          game.endRound(true);
          return true;
        }
      }
    }

    // Enemy bullets hitting mothership
    for (const bullet of game.enemyBullets) {
      if (!bullet.alive) continue;
      if (circleCollision(bullet.pos, bullet.radius, game.mothership.pos, game.mothership.radius)) {
        bullet.destroy();
        game.particles.emit(bullet.pos, 5, COLORS.mothershipDamaged, 60, 0.2, 1.5);

        // Barrier absorbs the hit if active
        if (game.spawner.barrierAbsorb()) {
          game.particles.emit(bullet.pos, 4, COLORS.shield, 40, 0.15, 1);
          game.renderer.shake(2);
          continue; // hit absorbed
        }

        const destroyed = game.mothership.takeDamage(1);
        game.roundTimer -= game.stats.timePenaltyPerHit;
        game.renderer.shake(4);
        game.audio.playMothershipHit();

        if (destroyed || game.roundTimer <= 0) {
          game.endRound(true);
          return true;
        }
      }
    }

    return false;
  }

  /** Coin collection by player */
  checkCoinCollections(game: IGame) {
    // Check if in overtime for bonus
    const inOvertime = game.stats.overtimeBonus > 0 && game.roundTimer <= 10;
    const overtimeMult = inOvertime ? 1 + game.stats.overtimeBonus : 1;

    for (const coin of game.coins) {
      if (!coin.alive) continue;
      if (vecDist(coin.pos, game.player.pos) < COIN_SIZE + game.player.radius) {
        coin.destroy();
        const value = Math.round(coin.value * overtimeMult);
        game.roundCoins += value;
        game.save.coins += value;
        game.save.lifetimeCoins += value;

        // Juicy coin pickup feedback — more particles, bigger burst, rising "+N" text
        const isRare = coin.value >= 5;
        const particleColor = isRare ? COLORS.coinRare : COLORS.coin;
        game.particles.emit(coin.pos, isRare ? 12 : 8, particleColor, isRare ? 60 : 45, 0.3, 1.5);
        // Extra white sparkle ring
        game.particles.emit(coin.pos, 4, "#ffffff", 35, 0.15, 0.8);
        // Show coin value as floating number
        game.spawnDamageNumber(coin.pos.x, coin.pos.y - 5, value, isRare);
        game.audio.playCoinPickup();
      }
    }
  }
}
