import { useCallback } from "preact/hooks";
import { JSX } from "preact/jsx-runtime";
import { GameSettings, useGameSettingsHook } from "../../../settings";
import globalFlags from "../../../flags";
import styles from "./settings.module.css";

export default function SettingsMenu() {
  const [settings, setSettings] = useGameSettingsHook();

  const applySettingChange = useCallback((newConfig: Partial<GameSettings>) => {
    setSettings((oldSettings: GameSettings) => ({
      ...oldSettings,
      ...newConfig,
    }));
  }, []);

  const onSfxVolumeSet: JSX.GenericEventHandler<HTMLInputElement> = useCallback(
    (evt) => {
      const element = evt.target as HTMLInputElement;
      setSettings((s: GameSettings) => ({
        ...s,
        soundEffectVolume: element.valueAsNumber / 100,
      }));
    },
    [],
  );

  const onMusicVolumeSet: JSX.GenericEventHandler<HTMLInputElement> =
    useCallback((evt) => {
      const element = evt.target as HTMLInputElement;
      setSettings((s: GameSettings) => ({
        ...s,
        musicVolume: element.valueAsNumber / 100,
      }));
    }, []);

  return (
    <div class={styles.root}>
      <div class={styles.section}>
        <p class={styles.sectionTitle}>General</p>
        <div class={styles.row}>
          <span class={styles.label}>Sound effects</span>
          <input
            class={styles.slider}
            id="sound-effect-meter"
            type="range"
            onChange={onSfxVolumeSet}
            value={settings.soundEffectVolume * 100}
            step={5}
            min={0}
            max={100}
          />
        </div>
        <div class={styles.row}>
          <span class={styles.label}>Music volume</span>
          <input
            class={styles.slider}
            id="music-meter"
            type="range"
            onChange={onMusicVolumeSet}
            value={settings.musicVolume * 100}
            step={5}
            min={0}
            max={100}
          />
        </div>
      </div>
      <div class={styles.section}>
        <p class={styles.sectionTitle}>Accessibility</p>
        <label class={styles.checkRow}>
          <input
            class={styles.toggle}
            type="checkbox"
            onChange={() =>
              applySettingChange({ reduceMotion: !settings.reduceMotion })
            }
            checked={settings.reduceMotion}
          />
          <span class={styles.label}>Reduce motion (menus, game effects)</span>
        </label>
      </div>
      <div class={styles.section}>
        <p class={styles.sectionTitle}>Debug</p>
        <label class={styles.checkRow}>
          <input
            class={styles.toggle}
            type="checkbox"
            onChange={() => {
              const newValue = !settings.debugTerrainColliders;
              applySettingChange({ debugTerrainColliders: newValue });
              globalFlags.showTerrainDebug = newValue;
            }}
            checked={settings.debugTerrainColliders}
          />
          <span class={styles.label}>Zobrazit kolizní plochy terénu</span>
        </label>
      </div>
    </div>
  );
}
