import type { TeamResult } from "./interop/gamechannel";

const STORAGE_KEY = "wormgine_leaderboard";
const MAX_RECORDS = 100;

export interface MatchRecord {
  id: string;
  playedAt: number; // unix ms
  teams: TeamResult[];
  winnerNames: string[]; // empty = draw
}

function load(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

function save(records: MatchRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveMatch(teams: TeamResult[]): MatchRecord {
  const records = load();
  const record: MatchRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playedAt: Date.now(),
    teams,
    winnerNames: teams.filter((t) => t.isWinner).map((t) => t.name),
  };
  records.unshift(record);
  save(records.slice(0, MAX_RECORDS));
  return record;
}

export function getMatches(): MatchRecord[] {
  return load();
}

export function clearMatches(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export interface TeamStats {
  name: string;
  wins: number;
  draws: number;
  losses: number;
  matches: number;
}

export function computeTeamStats(records: MatchRecord[]): TeamStats[] {
  const map = new Map<string, TeamStats>();
  for (const record of records) {
    const isDraw = record.winnerNames.length !== 1;
    for (const team of record.teams) {
      let stats = map.get(team.name);
      if (!stats) {
        stats = { name: team.name, wins: 0, draws: 0, losses: 0, matches: 0 };
        map.set(team.name, stats);
      }
      stats.matches++;
      if (isDraw) {
        stats.draws++;
      } else if (team.isWinner) {
        stats.wins++;
      } else {
        stats.losses++;
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.wins - a.wins || b.matches - a.matches,
  );
}
