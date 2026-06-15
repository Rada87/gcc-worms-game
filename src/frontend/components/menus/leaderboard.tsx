import { useState } from "preact/hooks";
import {
  getMatches,
  clearMatches,
  computeTeamStats,
  type MatchRecord,
  type TeamStats,
} from "../../../leaderboard";
import styles from "./leaderboard.module.css";

interface Props {
  onBack: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MatchRow({ record }: { record: MatchRecord }) {
  const isDraw = record.winnerNames.length !== 1;
  return (
    <div class={styles.matchRow}>
      <span class={styles.matchDate}>{formatDate(record.playedAt)}</span>
      <span
        class={`${styles.matchResult} ${isDraw ? styles.draw : styles.win}`}
      >
        {isDraw ? "Draw" : `${record.winnerNames[0]} wins`}
      </span>
      <span class={styles.matchTeams}>
        {record.teams.map((t) => t.name).join(" vs ")}
      </span>
    </div>
  );
}

function StatsTable({ stats }: { stats: TeamStats[] }) {
  if (stats.length === 0) return null;
  return (
    <table class={styles.statsTable}>
      <thead>
        <tr>
          <th>Team</th>
          <th>Matches</th>
          <th>Wins</th>
          <th>Draws</th>
          <th>Losses</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.name} class={s.wins > 0 ? styles.topTeam : undefined}>
            <td>{s.name}</td>
            <td>{s.matches}</td>
            <td class={styles.wins}>{s.wins}</td>
            <td>{s.draws}</td>
            <td>{s.losses}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LeaderboardMenu({ onBack }: Props) {
  const [matches, setMatches] = useState(() => getMatches());
  const stats = computeTeamStats(matches);

  function handleClear() {
    clearMatches();
    setMatches([]);
  }

  return (
    <div class={styles.root}>
      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>Team standings</h2>
        {stats.length === 0 ? (
          <p class={styles.empty}>No matches played yet.</p>
        ) : (
          <StatsTable stats={stats} />
        )}
      </div>

      <div class={styles.section}>
        <h2 class={styles.sectionTitle}>Match history</h2>
        {matches.length === 0 ? (
          <p class={styles.empty}>No matches recorded yet.</p>
        ) : (
          <div class={styles.matchList}>
            {matches.map((m) => (
              <MatchRow key={m.id} record={m} />
            ))}
          </div>
        )}
      </div>

      <div class={styles.actions}>
        <button class={styles.btnSecondary} onClick={onBack}>
          Back
        </button>
        {matches.length > 0 && (
          <button class={styles.btnDanger} onClick={handleClear}>
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}
