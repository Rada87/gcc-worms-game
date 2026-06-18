import { Assets, Ticker } from "pixi.js";
import { Background } from "../entities/background";
import { BitmapTerrain } from "../entities/bitmapTerrain";
import type { Game } from "../game";
import { Water } from "../entities/water";
import { FireFn, Worm } from "../entities/playable/worm";
import { Coordinate, MetersValue } from "../utils/coodinate";
import { shuffle } from "../utils";
import { GameStateOverlay } from "../overlays/gameStateOverlay";
import {
  GameDrawText,
  TeamWinnerText,
  templateRandomText,
} from "../text/toasts";
import { PhysicsEntity } from "../entities/phys/physicsEntity";
import staticController, { InputKind } from "../input";
import { ViewportCamera } from "../camera";
import { WormSpawnRecordedState } from "../entities/state/wormSpawn";
import { InnerWormState } from "../entities/playable/wormState";
import Logger from "../log";
import { combineLatest, filter, map, Observable } from "rxjs";
import { GameState, RoundState } from "../logic/gamestate";
import globalFlags from "../flags";
import { getAssets } from "../assets";
import { addEntitiesToWorld } from "../terrain/spawner";

const log = new Logger("localMatch");

export default async function runScenario(game: Game) {
  const gameInstance = game.netGameInstance;
  const parent = game.viewport;
  const world = game.world;
  const { worldWidth } = game.viewport;
  const wormInstances = new Map<string, Worm>();
  let currentWorm: Worm | undefined;

  const level = gameInstance.scenario;
  const terrain = BitmapTerrain.create(
    game.world,
    level.terrain.bitmap,
    Coordinate.fromScreen(level.terrain.x, level.terrain.y),
    level.terrain.destructible,
  );

  // Fit-to-content initial view: bounding box covers terrain plus the
  // water surface so the playable arena (including the kill threshold) is
  // visible at start. ViewportCamera then takes over for worm-follow.
  // wormgine.initial_zoom on the foreground layer overrides the fit.
  const terrainBounds = terrain.bounds;
  const waterPx =
    level.objects.find((v) => v.type === "wormgine.water")?.tra.y ??
    terrainBounds.y + terrainBounds.height + 100;
  // The water mesh visually starts ~130 px above the kill threshold (see
  // entities/water.ts), so use that for the visible bound.
  const waterSurfacePx = waterPx - 130;
  const fitTop = level.terrain.y + terrainBounds.y;
  const fitBottom = Math.max(
    level.terrain.y + terrainBounds.y + terrainBounds.height,
    waterSurfacePx + 80, // a strip of water visible below the surface
  );
  const fitLeft = level.terrain.x + terrainBounds.x;
  const fitRight = level.terrain.x + terrainBounds.x + terrainBounds.width;
  const fitW = fitRight - fitLeft;
  const fitH = fitBottom - fitTop;
  const padding = 1.1;
  const fitZoomX = game.viewport.screenWidth / (fitW * padding);
  const fitZoomY = game.viewport.screenHeight / (fitH * padding);
  const fitZoom = Math.max(0.4, Math.min(fitZoomX, fitZoomY, 1.5));
  const initialZoom =
    typeof level.initialZoom === "number" && level.initialZoom > 0
      ? level.initialZoom
      : fitZoom;
  const fitCenterX = (fitLeft + fitRight) / 2;
  const fitCenterY = (fitTop + fitBottom) / 2;
  game.viewport.setZoom(initialZoom, true);
  game.viewport.moveCenter(fitCenterX, fitCenterY);
  log.info(
    `fit-to-content: zoom=${initialZoom.toFixed(3)} center=(${fitCenterX.toFixed(0)}, ${fitCenterY.toFixed(0)}) bounds=${fitW}x${fitH} water=${waterSurfacePx}`,
  );

  const initialTeams = gameInstance.gameConfigImmediate.teams;

  for (const team of initialTeams) {
    if (team.flag) {
      Assets.add({ alias: `team-flag-${team.name}`, src: team.flag });
      await Assets.load(`team-flag-${team.name}`);
    }
  }

  const gameState = new GameState(
    initialTeams,
    world,
    gameInstance.gameConfigImmediate.rules,
  );

  const waterLevel = MetersValue.fromPixels(
    level.objects.find((v) => v.type === "wormgine.water")?.tra.y ?? 0,
  );

  const assets = await getAssets();
  const bgTexture = level.backgroundAsset
    ? assets.textures[level.backgroundAsset as keyof typeof assets.textures]
    : undefined;

  const bg = await world.addEntity(
    new Background(
      game.screenSize$,
      game.viewport,
      terrain,
      world,
      assets.textures.particles_cog,
      waterLevel,
      bgTexture,
    ),
  );
  bg.addToWorld(game.pixiApp.stage, parent);
  world.addEntity(terrain);
  terrain.addToWorld(parent);

  const overlay = new GameStateOverlay(
    game.pixiApp.ticker,
    game.pixiApp.stage,
    gameState,
    world,
    game.screenSize$,
  );

  const water = world.addEntity(
    new Water(
      MetersValue.fromPixels(worldWidth * 4),
      waterLevel,
      world,
      game.viewport,
    ),
  );
  water.addToWorld(parent, world);

  const camera = new ViewportCamera(
    game.viewport,
    new MetersValue(water.waterHeight.value + 2),
    world.physicsEntitySet$ as Observable<IteratorObject<PhysicsEntity>>,
    // All worms are local — camera never locks to AI
    gameState.currentWorm$.pipe(map(() => false)),
  );
  // Hold the fit-to-content view for a couple of seconds before letting
  // the camera follow the active worm, so the player can absorb the arena.
  camera.setInitialView(fitCenterX, fitCenterY, initialZoom, 3500);

  globalFlags.viewportCamera = camera;
  globalFlags.bindGameState(gameState);

  addEntitiesToWorld(world, parent, level.objects);

  let spawnPositions = shuffle(
    level.objects.filter(
      (v) => v.type === "wormgine.worm_spawn",
    ) as WormSpawnRecordedState[],
  );

  for (const team of gameState.getActiveTeams()) {
    for (const wormInstance of team.worms) {
      const spawnPointForWorm =
        spawnPositions.find((s) => s.wormUuid === wormInstance.uuid) ||
        spawnPositions.find((s) => s.teamGroup === wormInstance.team.group) ||
        spawnPositions.find((s) => !s.teamGroup);
      if (!spawnPointForWorm) {
        throw Error(
          `No spawn point for worm ${wormInstance.name} (team ${team.name})`,
        );
      }
      spawnPositions = spawnPositions.filter((s) => s !== spawnPointForWorm);
      const pos = Coordinate.fromScreen(
        spawnPointForWorm.tra.x,
        spawnPointForWorm.tra.y,
      );
      const fireFn: FireFn = async (worm, definition, opts) => {
        const newProjectile = definition.fireFn(parent, world, worm, opts);
        if (newProjectile) {
          world.addEntity(newProjectile);
        }
      };
      const wormEnt = world.addEntity(
        Worm.create(
          parent,
          world,
          pos,
          wormInstance,
          fireFn,
          overlay.toaster,
          undefined,
          () => game.gameReactChannel.isWeaponMenuOpen,
        ),
        wormInstance.uuid,
      );
      wormInstances.set(wormInstance.uuid, wormEnt);
    }
  }

  staticController.on("inputEnd", (kind: InputKind) => {
    if (kind === InputKind.CycleWormNext || kind === InputKind.CycleWormPrev) {
      if (!currentWorm?.currentState.canFire) return;
      const rState = gameState.currentRoundState;
      if (rState !== RoundState.Preround && rState !== RoundState.Playing)
        return;
      const direction = kind === InputKind.CycleWormNext ? 1 : -1;
      const nextWormInst = gameState.cycleCurrentWorm(direction);
      if (!nextWormInst) return;
      currentWorm.currentState.off("transition", transitionHandler);
      currentWorm.onEndOfTurn();
      currentWorm = wormInstances.get(nextWormInst.uuid);
      currentWorm?.onWormSelected(true);
      currentWorm?.currentState.on("transition", transitionHandler);
      return;
    }

    if (!currentWorm?.currentState.canFire) {
      return;
    }
    if (kind === InputKind.WeaponMenu) {
      game.gameReactChannel.openWeaponMenu(
        currentWorm.wormIdent.team.availableWeapons,
      );
    } else if (kind === InputKind.PickTarget) {
      game.gameReactChannel.closeWeaponMenu();
    }
  });

  game.gameReactChannel.on("weaponSelected", (code) => {
    if (!currentWorm) {
      return;
    }
    const newWep = currentWorm.wormIdent.team.availableWeapons.find(
      ([w]) => w.code === code,
    );
    if (!newWep) {
      throw Error("Selected weapon is not in active worm's inventory");
    }
    currentWorm.selectWeapon(newWep[0]);
  });

  function transitionHandler(prev: InnerWormState, next: InnerWormState) {
    if (prev === InnerWormState.Idle && gameState.isPreRound) {
      gameState.playCurrentRound();
    }
    if (next === InnerWormState.Getaway && prev === InnerWormState.Firing) {
      gameState.setTimer(5000);
    }
    if (next === InnerWormState.InactiveWaiting) {
      gameState.setTimer(5000);
    }
  }

  const roundHandlerFn = (dt: Ticker) => {
    gameState.update(dt);
  };

  gameState.begin();

  combineLatest([gameState.roundState$])
    .pipe(filter(([state]) => state === RoundState.Finished))
    .subscribe(() => {
      wormInstances.forEach((w) => w.roundTick());
    });

  combineLatest([gameState.roundState$, gameState.remainingRoundTimeSeconds$])
    .pipe(filter(([state]) => state === RoundState.Finished))
    .subscribe(() => {
      if (currentWorm) {
        currentWorm.onEndOfTurn();
        currentWorm.currentState.off("transition", transitionHandler);
      }
    });

  const roundStateSub = combineLatest([
    gameState.roundState$,
    gameState.currentWorm$,
    world.entitiesMoving$,
  ])
    .pipe(
      filter(([roundState, worm]) => {
        if (roundState === RoundState.WaitingToBegin && !worm) {
          return false;
        }
        return true;
      }),
    )
    .subscribe(([roundState, worm, entsMoving]) => {
      world.setWind(gameState.currentWind);

      if (worm === undefined && roundState === RoundState.Finished) {
        log.info("Starting first round");
        gameState.advanceRound();
        return;
      }

      if (roundState === RoundState.WaitingToBegin) {
        if (!worm) {
          throw Error("Expected worm in WaitingToBegin state");
        }
        if (worm.uuid === currentWorm?.wormIdent.uuid) {
          return;
        }
        currentWorm = wormInstances.get(worm.uuid);
        log.info("Activating worm", worm.uuid);
        world.setWind(gameState.currentWind);
        currentWorm?.onWormSelected(true);
        currentWorm?.currentState.on("transition", transitionHandler);
        gameState.beginRound();
        return;
      }

      if (roundState === RoundState.Finished && !entsMoving) {
        const nextState = gameState.advanceRound();
        if (nextState.toast) {
          overlay.toaster.pushToast(nextState.toast, 3500, undefined, true);
        }
        if ("winningTeams" in nextState) {
          game.pixiApp.ticker.remove(roundHandlerFn);
          roundStateSub.unsubscribe();
          const winnerUuids = new Set(
            nextState.winningTeams.map((t) => t.uuid),
          );
          if (nextState.winningTeams.length) {
            overlay.toaster.pushToast(
              templateRandomText(TeamWinnerText, {
                TeamName: nextState.winningTeams.map((t) => t.name).join(", "),
              }),
              8000,
            );
          } else {
            overlay.toaster.pushToast(templateRandomText(GameDrawText), 8000);
          }
          const teamResults = gameState.getTeams().map((t) => ({
            name: t.name,
            uuid: t.uuid,
            group: t.group,
            isWinner: winnerUuids.has(t.uuid),
            worms: t.worms.map((w) => ({
              name: w.name,
              health: w.health,
              maxHealth: w.maxHealth,
            })),
          }));
          let endOfGameFadeOut = 8000;
          const goToResultsAfterFade = (dt: Ticker) => {
            endOfGameFadeOut -= dt.deltaMS;
            if (endOfGameFadeOut < 0) {
              game.pixiApp.ticker.remove(goToResultsAfterFade);
              game.gameReactChannel.goToMenu(teamResults);
            }
          };
          game.pixiApp.ticker.add(goToResultsAfterFade);
        }
      }
    });

  game.pixiApp.ticker.add(roundHandlerFn);
  game.pixiApp.ticker.add((ticker) => camera.update(ticker.deltaMS));
}
