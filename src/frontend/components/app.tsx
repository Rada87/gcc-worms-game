import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { IngameView } from "./ingame-view";
import Menu from "./menu";
import { NetClientConfig, NetGameClient } from "../../net/client";
import { GameReactChannel, TeamResult } from "../../interop/gamechannel";
import type { AssetData } from "../../assets/manifest";
import {
  DEFAULT_TEAMS,
  getClientConfigHook,
  getLocalTeams,
  useGameSettingsHook,
} from "../../settings";
import { MotionConfig } from "framer-motion";
import {
  IRunningGameInstance,
  LocalGameInstance,
} from "../../logic/gameinstance";
import Logger from "../../log";
import { ResultsScreen } from "./results";
import { saveMatch } from "../../leaderboard";
import { GameMenu } from "./menus/types";
import { TeamGroup } from "../../logic/teams";
import { loadAssets } from "../../assets";

const log = new Logger("App");

interface LoadGameProps {
  scenario: string;
  level?: string;
  gameInstance: IRunningGameInstance;
  instanceKey: string;
}

async function createLocalGameInstance(level?: string) {
  await loadAssets();
  const gameInstance = new LocalGameInstance();
  const storedTeams = getLocalTeams();
  const allTeams =
    storedTeams.length >= 2
      ? storedTeams
      : [...storedTeams, ...DEFAULT_TEAMS].slice(0, 2);
  const levelAsset = level ? `levels_${level}` : "levels_gccOctavia";

  await gameInstance.addProposedTeam(allTeams[0], 3, TeamGroup.Red);
  await gameInstance.addProposedTeam(allTeams[1], 3, TeamGroup.Blue);
  await gameInstance.chooseNewLevel(
    levelAsset,
    levelAsset,
    level ?? "ŠKODA GCC Octavia",
  );
  return gameInstance;
}

export function App() {
  const [gameState, setGameState] = useState<LoadGameProps>();
  const [gameResult, setGameResult] = useState<TeamResult[] | null>(null);
  const [initialMenu, setInitialMenu] = useState<GameMenu | undefined>();
  const [client, setClient] = useState<NetGameClient>();
  const [clientConfig, setClientConfig, { removeItem: removeClientConfig }] =
    getClientConfigHook();
  const gameReactChannel = useMemo(() => new GameReactChannel(), []);

  const [lobbyGameRoomId, setLobbyGameRoomId] = useState<string>();
  const [settings] = useGameSettingsHook();
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const gId = parameters.get("gameRoomId");
    const preStateConfig = parameters.get("stateConfig");
    if (gId) {
      setLobbyGameRoomId(gId);
    } else if (preStateConfig) {
      const [scenario, level] = preStateConfig.split(";");
      void createLocalGameInstance(level).then((gameInstance) => {
        setGameState({
          scenario,
          level,
          gameInstance,
          instanceKey: crypto.randomUUID(),
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!clientConfig) {
      return;
    }

    void (async () => {
      try {
        const client = new NetGameClient(clientConfig);
        void client.start();
        setClient(client);
      } catch (ex) {
        log.error("Failed to connect to game server", ex);
      }
    });

    return () => client?.stop();
  }, [clientConfig]);

  useEffect(() => {
    const goToMenu = (event: { winDetails?: { teams: TeamResult[] } }) => {
      setGameState(undefined);
      if (event?.winDetails?.teams) {
        saveMatch(event.winDetails.teams);
        setGameResult(event.winDetails.teams);
      }
    };

    gameReactChannel.on("goToMenu", goToMenu);
    return () => {
      gameReactChannel.off("goToMenu", goToMenu);
    };
  }, [gameReactChannel]);

  useEffect(() => {
    const replayGame = () => {
      if (!gameState) {
        return;
      }
      const newGameInstance =
        gameState.gameInstance instanceof LocalGameInstance
          ? gameState.gameInstance.createReplay()
          : new LocalGameInstance();
      setGameResult(null);
      setGameState({
        scenario: gameState.scenario,
        level: gameState.level,
        gameInstance: newGameInstance,
        instanceKey: crypto.randomUUID(),
      });
    };

    gameReactChannel.on("replayGame", replayGame);
    return () => {
      gameReactChannel.off("replayGame", replayGame);
    };
  }, [gameReactChannel, gameState]);

  const onNewGame = useCallback(
    (
      scenario: string,
      gameInstance: IRunningGameInstance,
      level?: keyof AssetData,
    ) => {
      setGameResult(null);
      setGameState({
        scenario,
        level,
        gameInstance,
        instanceKey: crypto.randomUUID(),
      });
    },
    [setGameState],
  );
  const setConfig = useCallback(
    (v: NetClientConfig | null) => {
      if (v) {
        setClientConfig(v);
      } else {
        removeClientConfig();
      }
    },
    [setClientConfig],
  );

  let root = null;
  if (gameState) {
    root = (
      <IngameView
        key={gameState.instanceKey}
        scenario={gameState.scenario}
        level={gameState.level}
        gameReactChannel={gameReactChannel}
        gameInstance={gameState.gameInstance}
      />
    );
  } else if (gameResult) {
    root = (
      <ResultsScreen
        teams={gameResult}
        onPlayAgain={() => {
          setInitialMenu(undefined);
          setGameResult(null);
          setLobbyGameRoomId("LOCAL_GAME");
        }}
        onMenu={() => {
          setInitialMenu(undefined);
          setGameResult(null);
        }}
        onLeaderboard={() => {
          setInitialMenu(GameMenu.Leaderboard);
          setGameResult(null);
        }}
      />
    );
  } else {
    root = (
      <Menu
        onNewGame={onNewGame}
        setClientConfig={setConfig}
        lobbyGameRoomId={lobbyGameRoomId}
        client={client}
        initialMenu={initialMenu}
      />
    );
  }

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "never"}>
      {root}
    </MotionConfig>
  );
}
