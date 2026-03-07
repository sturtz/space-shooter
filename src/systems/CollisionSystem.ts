import { IGame } from "../game/GameInterface";
import { Enemy } from "../entities/Enemy";
import { Vec2, vecDist, circleCollision, randomAngle } from "../utils/Math";
import { COIN_SIZE, COLORS } from "../utils/Constants";

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

          // Always show damage number (Bug #3 fix — show on killing hit too)
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

          // Splash damage — triggers on every hit, not just kills (Issue #16 fix)
          if (game.stats.splashRadius > 0) {
            for (const other of game.enemies) {
              if (!other.alive || other === enemy) continue;
              if (vecDist(enemy.pos, other.pos) < game.stats.splashRadius) {
                const splashDmg = bullet.damage * 0.5;
                if (other.takeDamage(splashDmg)) {
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
              bullet.damage * 0.5,
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
      let closestDist = 120; // max chain range

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

  /** Enemies colliding with mothership */
  checkEnemyMothershipCollisions(game: IGame): boolean {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      if (circleCollision(enemy.pos, enemy.radius, game.mothership.pos, game.mothership.radius)) {
        enemy.destroy();
        game.particles.emit(enemy.pos, 8, COLORS.mothershipDamaged, 80, 0.3, 2);

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
        game.particles.emit(coin.pos, 4, COLORS.coin, 30, 0.2, 1);
        game.audio.playCoinPickup();
      }
    }
  }
}
