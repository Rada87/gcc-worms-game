import { TeamResult } from "../../interop/gamechannel";
import { teamGroupToColorSet } from "../../logic/teams";
import styles from "./results.module.css";

interface Props {
  teams: TeamResult[];
  onPlayAgain: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
}

export function ResultsScreen({
  teams,
  onPlayAgain,
  onMenu,
  onLeaderboard,
}: Props) {
  const winners = teams.filter((t) => t.isWinner);
  const isDraw = winners.length !== 1;

  return (
    <div class={styles.screen}>
      <div class={styles.header}>
        <span class={styles.gameOver}>Game over</span>
        {isDraw ? (
          <span class={styles.drawLine}>Draw!</span>
        ) : (
          <span class={styles.winnerLine}>{winners[0].name} wins!</span>
        )}
      </div>

      <div class={styles.teams}>
        {teams.map((team) => {
          const colors = teamGroupToColorSet(team.group);
          const totalHp = team.worms.reduce((s, w) => s + w.health, 0);
          const totalMaxHp = team.worms.reduce((s, w) => s + w.maxHealth, 0);
          return (
            <div
              key={team.uuid}
              class={`${styles.teamCard} ${team.isWinner ? styles.winner : ""}`}
            >
              <div class={styles.teamCardHeader}>
                <span
                  class={styles.teamName}
                  style={{
                    color: `#${colors.fg.toString(16).padStart(6, "0")}`,
                  }}
                >
                  {team.name}
                </span>
                {team.isWinner && <span class={styles.winBadge}>Winner</span>}
              </div>

              <div class={styles.worms}>
                {team.worms.map((worm) => {
                  const pct = Math.round((worm.health / worm.maxHealth) * 100);
                  const alive = worm.health > 0;
                  return (
                    <div key={worm.name} class={styles.wormRow}>
                      <div class={styles.wormLabel}>
                        <span class={styles.wormName}>{worm.name}</span>
                        <span
                          class={`${styles.hp} ${alive ? styles.alive : styles.dead}`}
                        >
                          {worm.health}/{worm.maxHealth}
                        </span>
                      </div>
                      <div class={styles.hpBar}>
                        <div
                          class={`${styles.hpFill} ${alive ? "" : styles.dead}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div class={styles.wormLabel} style={{ marginTop: "0.25rem" }}>
                <span>Total HP</span>
                <span
                  class={`${styles.hp} ${totalHp > 0 ? styles.alive : styles.dead}`}
                >
                  {totalHp}/{totalMaxHp}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div class={styles.actions}>
        <button class={styles.btnPrimary} onClick={onPlayAgain}>
          Play again
        </button>
        <button class={styles.btnSecondary} onClick={onLeaderboard}>
          Leaderboard
        </button>
        <button class={styles.btnSecondary} onClick={onMenu}>
          Main menu
        </button>
      </div>

      <span class={styles.logo}>Škoda GCC</span>
    </div>
  );
}
