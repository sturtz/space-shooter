import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { ParticleSystem } from "../systems/ParticleSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { UpgradeManager, PlayerStats } from "../upgrades/UpgradeManager";
import { SaveData } from "../utils/SaveManager";
import { Player } from "../entities/Player";
import { Mothership } from "../entities/Mothership";
import { Bullet } from "../entities/Bullet";
import { Rock } from "../entities/Rock";
import { EnemyShip } from "../entities/EnemyShip";
import { Enemy } from "../entities/Enemy";
import { Coin } from "../entities/Coin";
import { Debris } from "../entities/Debris";
import { HUD } from "../ui/HUD";
import { AudioManager } from "../audio/AudioManager";
import { GameState } from "./Game";

/**
 * Interface that systems and UI screens use to interact with the Game.
 * Kept in sync with Game.ts — all fields that subsystems reference must be listed here.
 */
export interface IGame {
  renderer: Renderer;
  input: InputManager;
  particles: ParticleSystem;
  spawner: SpawnSystem;
  upgrades: UpgradeManager;
  hud: HUD;
  audio: AudioManager;
  save: SaveData;
  stats: PlayerStats;

  state: GameState;
  player: Player;
  mothership: Mothership;
  bullets: Bullet[];
  enemies: (Rock | EnemyShip)[];
  coins: Coin[];
  debris: Debris[];
  enemyBullets: Bullet[];

  roundTimer: number;
  roundDuration: number;
  spawnTimer: number;
  spawnRate: number;
  roundCoins: number;
  roundKills: number;
  killStreak: number;
  streakTimer: number;
  gameTime: number;
  paused: boolean;
  bossEnemy: Rock | EnemyShip | null;
  bossDefeated: boolean;

  startRun(): void;
  deathCause: "mothership" | "player" | "time" | "forfeit" | "";
  endRound(mothershipDestroyed: boolean, cause?: "mothership" | "player" | "time"): void;
  onEnemyKilled(enemy: Enemy): void;
  spawnDamageNumber(x: number, y: number, damage: number, isCrit?: boolean): void;
}
