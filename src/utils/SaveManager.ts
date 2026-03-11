import { APP_VERSION } from "./Constants";

const SAVE_KEY = "space_shooter_save";

export type MusicTrack = "fire" | "chill" | "trap";

export interface SaveData {
  coins: number;
  starCoins: number;
  upgradeLevels: Record<string, number>;
  starUpgradeLevels: Record<string, number>;
  currentLevel: number;
  lifetimeCoins: number;
  lifetimeKills: number;
  prestigeCount: number;
  highestLevel: number;
  /** Special abilities earned by defeating bosses — stacks, persists between runs */
  specialAbilities: string[];
  /** Whether the first-load tutorial has been completed */
  tutorialSeen: boolean;
  /** Selected background music track */
  musicTrack: MusicTrack;
  /** Music volume (0–1) */
  musicVolume: number;
  /** Whether algorithmic art effects are enabled (sacred geometry, geometric bursts, formations) */
  algoArtEnabled: boolean;
  /** App version — save is wiped when this doesn't match the current version */
  appVersion: string;
}

export function getDefaultSave(): SaveData {
  return {
    coins: 0,
    starCoins: 0,
    upgradeLevels: {},
    starUpgradeLevels: {},
    currentLevel: 1,
    lifetimeCoins: 0,
    lifetimeKills: 0,
    prestigeCount: 0,
    highestLevel: 1,
    specialAbilities: [],
    tutorialSeen: false,
    musicTrack: "fire",
    musicVolume: 0.07,
    algoArtEnabled: true,
    appVersion: APP_VERSION,
  };
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save game:", e);
  }
}

export function loadGame(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);

      // Wipe save if version doesn't match (also catches old buildNumber-based saves)
      const savedVersion = parsed.appVersion ?? parsed.buildNumber?.toString();
      if (savedVersion !== APP_VERSION) {
        console.info(
          `Version mismatch (save: ${savedVersion}, current: ${APP_VERSION}) — wiping save.`
        );
        clearSave();
        return getDefaultSave();
      }

      const save = { ...getDefaultSave(), ...parsed };

      // Migrate old specialAbility (string) → specialAbilities (array)
      if (parsed.specialAbility && !parsed.specialAbilities) {
        save.specialAbilities = [parsed.specialAbility];
        delete (save as Record<string, unknown>).specialAbility;
      }

      return save;
    }
  } catch (e) {
    console.warn("Failed to load game:", e);
  }
  return getDefaultSave();
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

/** Helper: check if a specific ability has been earned */
export function hasAbility(save: SaveData, id: string): boolean {
  return save.specialAbilities.includes(id);
}

/** Helper: add an ability if not already present (stacking) */
export function addAbility(save: SaveData, id: string): void {
  if (!save.specialAbilities.includes(id)) {
    save.specialAbilities.push(id);
  }
}
