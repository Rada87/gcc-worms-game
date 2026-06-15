import { useCallback, useEffect, useState } from "preact/hooks";
import { IngameView } from "./ingame-view";
import Menu from "./menu";
import { NetClientConfig, NetGameClient } from "../../net/client";
import { GameReactChannel, TeamResult } from "../../interop/gamechannel";
import type { AssetData } from "../../assets/manifest";
import { getClientConfigHook, useGameSettingsHook } from "../../settings";
import { MotionConfig } from "framer-motion";
import {
  IRunningGameInstance,
  LocalGameInstance,
} from "../../logic/gameinstance";
import Logger from "../../log";
import { ResultsScreen } from "./results";
import { saveMatch } from "../../leaderboard";
import { GameMenu } from "./menus/types";

const log = new Logger("App");

interface LoadGameProps {
  scenario: string;
  level?: string;
  gameInstance: IRunningGameInstance;
  instanceKey: string;
}

export function App() {
  const [gameState, setGameState] = useState<LoadGameProps>();
  const [gameResult, setGameResult] = useState<TeamResult[] | null>(null);
  const [initialMenu, setInitialMenu] = useState<GameMenu | undefined>();
  const [client, setClient] = useState<NetGameClient>();
  const [clientConfig, setClientConfig, { removeItem: removeClientConfig }] =
    getClientConfigHook();
  const gameReactChannel = new GameReactChannel();

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
      const gameInstance = new LocalGameInstance();
      gameInstance.startGame();
      setGameState({
        scenario,
        level,
        gameInstance,
        instanceKey: crypto.randomUUID(),
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

  gameReactChannel.on("goToMenu", (event) => {
    setGameState(undefined);
    if (event.winDetails?.teams) {
      saveMatch(event.winDetails.teams);
      setGameResult(event.winDetails.teams);
    }
  });

  gameReactChannel.on("replayGame", () => {
    if (gameState) {
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
    }
  });

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
