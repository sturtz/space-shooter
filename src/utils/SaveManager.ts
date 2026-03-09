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
  /** Special ability earned by defeating the boss — persists between runs */
  specialAbility: string | null;
  /** Whether the first-load tutorial has been completed */
  tutorialSeen: boolean;
  /** Selected background music track */
  musicTrack: MusicTrack;
  /** Music volume (0–1) */
  musicVolume: number;
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
    specialAbility: null,
    tutorialSeen: false,
    musicTrack: "fire",
    musicVolume: 0.07,
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
      return { ...getDefaultSave(), ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load game:", e);
  }
  return getDefaultSave();
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
