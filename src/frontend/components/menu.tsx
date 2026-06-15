import { useCallback, useEffect, useState } from "preact/hooks";
import styles from "./menu.module.css";
import { NetClientConfig, NetGameClient } from "../../net/client";
import { GameMenu } from "./menus/types";
import OnlinePlayMenu from "./menus/online-play";
import { OverlayTest } from "./menus/overlaytest";
import type { AssetData } from "../../assets/manifest";
import TeamEditorMenu from "./menus/team-editor";
import SettingsMenu from "./menus/settings";
import LeaderboardMenu from "./menus/leaderboard";
import MenuHeader from "./atoms/menu-header";
import { Lobby } from "./menus/lobby";
import { motion, AnimatePresence } from "framer-motion";
import { ComponentChildren } from "preact";
import {
  IRunningGameInstance,
  LocalGameInstance,
} from "../../logic/gameinstance";
import settingsAnim from "../../assets/ui/settings_icon.webm";
import { JSXInternal } from "preact/src/jsx";
import {
  DEFAULT_TEAMS,
  getLocalTeams,
  useGameSettingsHook,
} from "../../settings";
import { TeamGroup } from "../../logic/teams";

interface Props {
  onNewGame: (
    scenario: string,
    gameInstance: IRunningGameInstance,
    level?: keyof AssetData,
  ) => void;
  setClientConfig: (config: NetClientConfig | null) => void;
  client?: NetGameClient;
  lobbyGameRoomId?: string;
  initialMenu?: GameMenu;
}

const buildCommit = import.meta.env.VITE_BUILD_COMMIT;

function SubMenu(props: {
  key: string | GameMenu;
  children: ComponentChildren;
}) {
  return (
    <motion.div
      style={{
        position: "absolute",
        width: "100%",
        height: "100vh",
        top: 0,
        left: 0,
      }}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      <div className={styles.menu}>
        <menu key={props.key}>{props.children}</menu>
      </div>
    </motion.div>
  );
}

function mainMenu(
  onLocalGame: () => void,
  setCurrentMenu: (menu: GameMenu) => void,
  onQuickGame: () => void,
) {
  const [{ reduceMotion }] = useGameSettingsHook();
  const videoHover: JSXInternal.MouseEventHandler<HTMLButtonElement> =
    useCallback(
      (evt) => {
        if (reduceMotion) {
          return;
        }
        (evt.target as HTMLButtonElement).querySelector("video")?.play();
      },
      [reduceMotion],
    );
  const videoHoverOut: JSXInternal.MouseEventHandler<HTMLButtonElement> = (
    evt,
  ) => {
    (evt.target as HTMLButtonElement).querySelector("video")?.pause();
  };
  return (
    <SubMenu key="main-menu">
      <h1>GCC Worms</h1>
      <p className={styles.subtitle}>Škoda GCC · Vibe coding competition</p>
      <ul className={styles.mainMenu}>
        {/* Play section */}
        <li className={styles.menuSection}>
          <p className={styles.sectionLabel}>Play</p>
          <div
            className={styles.sectionTiles}
            style={{ flexDirection: "column" }}
          >
            <button
              onClick={() => onLocalGame()}
              onMouseOver={videoHover}
              onMouseOut={videoHoverOut}
              className={styles.primaryTile}
            >
              <span onMouseOver={videoHover} onMouseOut={videoHoverOut}>
                Skirmish
              </span>
              <video muted src={settingsAnim} loop />
            </button>
            <button
              onClick={() => onQuickGame()}
              onMouseOver={videoHover}
              onMouseOut={videoHoverOut}
              className={styles.primaryTile}
            >
              <span onMouseOver={videoHover} onMouseOut={videoHoverOut}>
                Quick Game
              </span>
              <video muted src={settingsAnim} loop />
            </button>
          </div>
        </li>
        {/* Manage section */}
        <li className={styles.menuSection}>
          <p className={styles.sectionLabel}>Manage</p>
          <div className={styles.sectionTiles}>
            <button
              onClick={() => setCurrentMenu(GameMenu.TeamEditor)}
              onMouseOver={videoHover}
              onMouseOut={videoHoverOut}
              className={styles.videoButton}
            >
              <span onMouseOver={videoHover} onMouseOut={videoHoverOut}>
                Team Editor
              </span>
              <video muted src={settingsAnim} loop />
            </button>
            {/* Leaderboard is hidden from the menu for the competition build;
                the menu case and component are kept intact so it can be
                re-enabled later. Online Play is likewise hidden (single-device
                build). Team Editor and Settings share this row. */}
            <button
              onClick={() => setCurrentMenu(GameMenu.Settings)}
              onMouseOver={videoHover}
              onMouseOut={videoHoverOut}
              className={styles.videoButton}
            >
              <span onMouseOver={videoHover} onMouseOut={videoHoverOut}>
                Settings
              </span>
              <video muted src={settingsAnim} loop />
            </button>
          </div>
        </li>
      </ul>
      <p>
        You can check out the source code over on{" "}
        <a
          href="https://github.com/Rada87/gcc-worms-game/actions"
          target="_blank"
        >
          GitHub
        </a>
        .
      </p>
      <p>
        <a href="https://gcc.skoda-auto.com" target="_blank">
          Join Our Team at gcc.skoda-auto.com
        </a>
      </p>
    </SubMenu>
  );
}

const variants = {
  enter: (direction: number) => {
    return {
      x: direction > 0 ? "50vw" : "-50vw",
      opacity: 0,
      transition: { duration: 0.75 },
    };
  },
  center: {
    zIndex: 1,
    scape: 1,
    x: 0,
    opacity: 1,
    transition: { duration: 0.75 },
  },
  exit: (direction: number) => {
    return {
      zIndex: 0,
      x: direction < 0 ? "50vw" : "-50vw",
      opacity: 0,
      transition: { duration: 0.75 },
    };
  },
};

export default function Menu({
  onNewGame,
  client,
  setClientConfig,
  lobbyGameRoomId,
  initialMenu,
}: Props) {
  const [currentMenu, setCurrentMenu] = useState(
    initialMenu ?? GameMenu.MainMenu,
  );
  const [currentLobbyId, setLobbyId] = useState(lobbyGameRoomId);

  useEffect(() => {
    if (currentLobbyId) {
      setCurrentMenu(GameMenu.Lobby);
    } else {
      setCurrentMenu((m) => (m === GameMenu.Lobby ? GameMenu.MainMenu : m));
    }
  }, [currentLobbyId]);

  const onStartNewGame = useCallback(() => {
    localStorage.setItem("wormgine_last_commit", buildCommit);
    setLobbyId("LOCAL_GAME");
  }, [onNewGame]);

  const onQuickGame = useCallback(async () => {
    localStorage.setItem("wormgine_last_commit", buildCommit);
    const gameInstance = new LocalGameInstance();
    const storedTeams = getLocalTeams();
    const allTeams =
      storedTeams.length >= 2
        ? storedTeams
        : [...storedTeams, ...DEFAULT_TEAMS].slice(0, 2);
    await gameInstance.addProposedTeam(allTeams[0], 3, TeamGroup.Red);
    await gameInstance.addProposedTeam(allTeams[1], 3, TeamGroup.Blue);
    await gameInstance.chooseNewLevel(
      "levels_gccOctavia",
      "levels_gccOctavia",
      "ŠKODA GCC Octavia",
    );
    onNewGame("localMatch", gameInstance);
  }, [onNewGame]);

  const goBack = () => {
    setCurrentMenu(GameMenu.MainMenu);
    setLobbyId("");
  };
  let menu;

  if (currentMenu === GameMenu.MainMenu) {
    menu = mainMenu(onStartNewGame, setCurrentMenu, onQuickGame);
  } else if (currentMenu === GameMenu.OnlinePlay) {
    menu = (
      <SubMenu key={GameMenu.OnlinePlay}>
        <MenuHeader onGoBack={goBack}>Online Play</MenuHeader>
        <OnlinePlayMenu
          onCreateLobby={(roomId) => setLobbyId(roomId)}
          client={client}
          setClientConfig={setClientConfig}
        />
      </SubMenu>
    );
  } else if (currentMenu === GameMenu.TeamEditor) {
    menu = (
      <SubMenu key={GameMenu.TeamEditor}>
        <MenuHeader onGoBack={goBack}>Team Editor</MenuHeader>
        <TeamEditorMenu />
      </SubMenu>
    );
  } else if (currentMenu === GameMenu.Settings) {
    menu = (
      <SubMenu key={GameMenu.Settings}>
        <MenuHeader onGoBack={goBack}>Settings</MenuHeader>
        <SettingsMenu />
      </SubMenu>
    );
  } else if (currentMenu === GameMenu.OverlayTest) {
    menu = (
      <SubMenu key={GameMenu.OverlayTest}>
        <MenuHeader onGoBack={goBack}>Overlay Test</MenuHeader>
        <OverlayTest />
      </SubMenu>
    );
  } else if (currentMenu === GameMenu.Leaderboard) {
    menu = (
      <SubMenu key={GameMenu.Leaderboard}>
        <MenuHeader onGoBack={goBack}>Leaderboard</MenuHeader>
        <LeaderboardMenu onBack={goBack} />
      </SubMenu>
    );
  } else if (currentMenu === GameMenu.Lobby) {
    const onOpenIngame = (gameInstance: IRunningGameInstance) => {
      onNewGame("localMatch", gameInstance);
    };
    if (!currentLobbyId) {
      throw Error("Current Lobby ID must be set!");
    }

    // TODO: Go back needs to exit game?
    menu = (
      <SubMenu key={GameMenu.Lobby}>
        <MenuHeader onGoBack={goBack}>Lobby</MenuHeader>
        <Lobby
          client={client}
          onOpenIngame={onOpenIngame}
          exitToMenu={() => setLobbyId(undefined)}
          gameRoomId={currentLobbyId}
        />
      </SubMenu>
    );
  } else {
    throw Error(`Unknown menu! ${GameMenu[currentMenu]}`);
  }
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      <div className={styles.appBg} />
      <AnimatePresence
        custom={currentMenu === GameMenu.MainMenu ? 1 : -1}
        initial={false}
      >
        {menu}
      </AnimatePresence>
    </div>
  );
}
