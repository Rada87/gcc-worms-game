import useLocalStorageState from "use-local-storage-state";
import { NetClientConfig } from "../net/client";

export * from "./teams";

export const WORMGINE_STORAGE_KEY_SETTINGS = "wormgine.settings";
export const WORMGINE_STORAGE_KEY_CLIENT_CONFIG = "wormgine.client_config";

export interface GameSettings {
  soundEffectVolume: number;
  musicVolume: number;
  reduceMotion: boolean;
  debugTerrainColliders: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  soundEffectVolume: 0.1,
  musicVolume: 0.5,
  reduceMotion: false,
  debugTerrainColliders: false,
};

export function getClientConfigHook() {
  return useLocalStorageState<NetClientConfig>(
    WORMGINE_STORAGE_KEY_CLIENT_CONFIG,
  );
}

export function getGameSettings(): GameSettings {
  const item = localStorage.getItem(WORMGINE_STORAGE_KEY_SETTINGS);
  if (!item) {
    return DEFAULT_SETTINGS;
  }
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(item),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useGameSettingsHook() {
  return useLocalStorageState<GameSettings>(WORMGINE_STORAGE_KEY_SETTINGS, {
    defaultValue: getGameSettings(),
  });
}
