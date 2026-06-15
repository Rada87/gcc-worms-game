import styles from "./pause-menu.module.css";
import Button from "./atoms/button";

// Mirrors the bindings in src/input.ts (+ the Q pause toggle handled in
// ingame-view). Kept here so players have a discoverable controls reference
// straight from the pause screen.
const CONTROLS: { action: string; keys: string }[] = [
  { action: "Move", keys: "← →" },
  { action: "Aim", keys: "↑ ↓" },
  { action: "Jump", keys: "Enter" },
  { action: "Backflip", keys: "Backspace ×2" },
  { action: "Fire (hold for power)", keys: "Space" },
  { action: "Weapon menu", keys: "E / Right-click" },
  { action: "Fuse timer", keys: "1 – 5" },
  { action: "Switch worm", keys: "N / M" },
  { action: "Pause", keys: "Q" },
];

export function PauseMenu({
  visible,
  onResume,
  onReplay,
  onQuit,
}: {
  visible: boolean;
  onResume: () => void;
  onReplay: () => void;
  onQuit: () => void;
}) {
  if (!visible) return null;
  return (
    <div className={styles.overlay}>
      <div className={styles.menu}>
        <h2 className={styles.title}>Paused</h2>
        <div className={styles.controls}>
          <p className={styles.controlsTitle}>Controls</p>
          {CONTROLS.map(({ action, keys }) => (
            <div key={action} className={styles.controlRow}>
              <span className={styles.action}>{action}</span>
              <kbd>{keys}</kbd>
            </div>
          ))}
        </div>
        <div className={styles.buttons}>
          <Button onClick={onResume}>Continue</Button>
          <Button onClick={onReplay}>Play Again</Button>
          <Button kind="error" onClick={onQuit}>
            Quit Game
          </Button>
        </div>
      </div>
    </div>
  );
}
