/**
 * Asset preloader — images/gifs start loading as soon as this module is imported.
 * By the time the player clicks "Start" they will almost always be ready.
 * Consumers check imageReady() before drawing.
 *
 * Folder layout under /public/assets/:
 *   bg/      — background images (parallax, stars)
 *   ships/   — player, enemies, mothership + death anims
 *   items/   — coins, orbs, asteroids, pickups
 *   sounds/  — sfx wav files
 */

function img(src: string): HTMLImageElement {
  const el = new Image();
  el.src = src;
  return el;
}

// ─── Background ──────────────────────────────────────────────────────────────
export const BgImages = {
  parallax: img("./assets/bg/pink-parallax-space-stars.png"),
  stars: img("./assets/bg/stars.png"),
};

// ─── Player sprites ───────────────────────────────────────────────────────────
export const PlayerImages = {
  glider: img("./assets/ships/starfighter-r2.svg"),
};

// ─── Ships / enemies ─────────────────────────────────────────────────────────
export const ShipImages = {
  enemyBee: img("./assets/ships/enemy-bee.svg"),
  enemyButterfly: img("./assets/ships/enemy-butterfly.svg"),
  enemyBoss: img("./assets/ships/enemy-boss.svg"),
  mothershipDeath: img("./assets/ships/mothership-death.gif"),
  mothership: img("./assets/ships/mothership.svg"),
};

// ─── Asteroids ───────────────────────────────────────────────────────────────
export const AsteroidImages = {
  tiny: [img("./assets/items/tiny-asteroid.png"), img("./assets/items/tiny-purple-asteroid.png")],
  small: [
    img("./assets/items/small-asteroid.png"),
    img("./assets/items/sm-asteroid.png"),
    img("./assets/items/purple-asteroid-small.png"),
  ],
  big: [img("./assets/items/md-asteroid.png"), img("./assets/items/large-asteroid.png")],
};

// ─── Items / pickups ─────────────────────────────────────────────────────────
export const ItemImages = {
  coin: img("./assets/items/coin1.png"),
  orbBlue: img("./assets/items/orb-blue1.png"),
  orbRed: img("./assets/items/orb-red1.png"),
  bomb: img("./assets/items/bomb.gif"),
  enemyProjectile: img("./assets/items/enemy-projectile.png"),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick a random image from a pool array */
export function pickRandom(pool: HTMLImageElement[]): HTMLImageElement {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Returns true if an HTMLImageElement is fully decoded and ready to draw */
export function imageReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}
