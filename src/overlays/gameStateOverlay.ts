import {
  Container,
  Graphics,
  Text,
  Texture,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js";
import { GameState } from "../logic/gamestate";
import { drawPixelBox, DefaultTextStyle } from "../mixins/styles";
import { teamGroupToColorSet } from "../logic/teams";
import { GameWorld } from "../world";
import { Toaster } from "./toaster";
import { WindDial } from "./windDial";
import { HEALTH_CHANGE_TENSION_TIMER_MS } from "../consts";
import Logger from "../log";
import {
  combineLatest,
  debounceTime,
  filter,
  first,
  map,
  Observable,
  Subscription,
} from "rxjs";
import { RoundTimer } from "./roundTimer";

const logger = new Logger("GameStateOverlay");

const TEAM_HEALTH_WIDTH_PX = 270;

export class GameStateOverlay {
  public readonly physicsSamples: number[] = [];
  private readonly tickerFn: (dt: Ticker) => void;
  private readonly gfx: Graphics;
  private previousStateIteration = -1;
  private readonly subscriptions: Subscription[] = [];
  private visibleTeamHealth: Record<string, number> = {};
  private largestHealthPool = 0;
  private shouldChangeTeamHealth = false;

  public readonly toaster: Toaster;
  private readonly winddial: WindDial;
  private readonly roundTimer: RoundTimer;
  private readonly teamFlagTextures: Record<string, Texture> = {};

  constructor(
    private readonly ticker: Ticker,
    private readonly stage: Container,
    private readonly gameState: GameState,
    private readonly gameWorld: GameWorld,
    private readonly screenSize: Observable<{ width: number; height: number }>,
  ) {
    this.toaster = new Toaster(this.screenSize);

    this.winddial = new WindDial(
      screenSize.pipe(
        map(({ width, height }) => ({
          x: (width / 30) * 26,
          y: (height / 10) * 8.75,
        })),
      ),
      this.gameWorld,
    );

    this.roundTimer = new RoundTimer(
      screenSize.pipe(
        map(({ width, height }) => ({
          x: width / 30,
          y: (height / 10) * 8.75,
        })),
      ),
      this.gameState.remainingRoundTimeSeconds$,
      this.gameState.currentTeam$.pipe(
        map((t) => t && teamGroupToColorSet(t.group)),
      ),
    );

    this.gfx = new Graphics();
    this.stage.addChild(this.toaster.container);
    this.stage.addChild(this.gfx);
    this.stage.addChild(this.roundTimer.container);
    this.stage.addChild(this.winddial.container);
    this.tickerFn = this.update.bind(this);
    this.ticker.add(this.tickerFn, undefined, UPDATE_PRIORITY.UTILITY);
    this.gameState.getActiveTeams().forEach((t) => {
      if (t.flag) {
        this.teamFlagTextures[t.name] = Texture.from(
          `team-flag-${t.name}`,
          true,
        );
      }
    });
    const teamHealthChange = combineLatest(
      this.gameState.getTeams().map((t) => t.maxHealth$),
    ).pipe(
      map((v) => v.reduce((v1, v2) => Math.max(v1, v2))),
      first(),
    );
    this.subscriptions.push(
      teamHealthChange.subscribe((s) => {
        this.largestHealthPool = s;
      }),
      screenSize.subscribe(({ width, height }) => {
        this.gfx.position.set(width / 2, (height / 10) * 8.75);
      }),
      this.gameWorld.entitiesMoving$
        .pipe(filter((moving) => moving === true))
        .subscribe(() => {
          this.shouldChangeTeamHealth = false;
        }),
      combineLatest([this.gameWorld.entitiesMoving$, teamHealthChange])
        .pipe(
          debounceTime(HEALTH_CHANGE_TENSION_TIMER_MS),
          filter(([moving]) => moving === false),
        )
        .subscribe(() => {
          this.shouldChangeTeamHealth = true;
        }),
    );
  }

  public destroy() {
    this.ticker.remove(this.tickerFn);
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions.length = 0;
    this.gfx.destroy();
  }

  private update(dt: Ticker) {
    this.toaster.update(dt);
    this.winddial.update();

    if (
      this.previousStateIteration === this.gameState.iteration &&
      !this.shouldChangeTeamHealth
    ) {
      return;
    }
    this.previousStateIteration = this.gameState.iteration;
    logger.debug(`Running update on iteration ${this.gameState.iteration}`);

    // TODO: Could the gameState flag this explicitly.
    // Check for health change.
    for (const team of this.gameState.getTeams()) {
      if (this.visibleTeamHealth[team.uuid] === undefined) {
        continue;
      }
    }

    this.gfx.clear();

    // Remove any previous text.
    this.gfx.removeChildren(0, this.gfx.children.length);
    // For each team:
    // TODO: Sort by health and group
    // TODO: Evenly space.
    let allHealthAccurate = true;
    const activeTeams = this.gameState.getActiveTeams();
    const teamSeperationHeight = 44;
    let teamBottomY = -(teamSeperationHeight * (activeTeams.length - 2)) / 2;
    for (const team of activeTeams) {
      if (this.visibleTeamHealth[team.uuid] === undefined) {
        this.visibleTeamHealth[team.uuid] = team.health;
      }
      if (
        this.visibleTeamHealth[team.uuid] > team.health &&
        this.shouldChangeTeamHealth
      ) {
        this.visibleTeamHealth[team.uuid] -= 1;
        allHealthAccurate = false;
      }
      const teamHealthPercentage =
        this.visibleTeamHealth[team.uuid] / this.largestHealthPool;

      const { bg, fg } = teamGroupToColorSet(team.group);
      const nameTag = new Text({
        text: team.name,
        style: {
          ...DefaultTextStyle,
          fill: this.gameState.activeTeam === team ? 0xffffff : fg,
          align: "center",
        },
      });
      const border = team === this.gameState.activeTeam ? 0xffffff : undefined;
      const nameTagStartX = -nameTag.width - 140;
      const flagBoxWidth = 28;

      const nameWidth = nameTag.width + 14;
      const nameHeight = nameTag.height;
      drawPixelBox(
        this.gfx,
        nameTagStartX - 7,
        teamBottomY - 4,
        nameWidth,
        nameHeight + 4,
        border,
      );
      nameTag.position.set(nameTagStartX, teamBottomY - 8);

      // Render flag
      if (this.teamFlagTextures[team.name]) {
        const flagX = -TEAM_HEALTH_WIDTH_PX / 2 - 10;
        const flagY = teamBottomY - 2;
        drawPixelBox(this.gfx, flagX, flagY, nameHeight, nameHeight, border);
        this.gfx.texture(
          this.teamFlagTextures[team.name],
          undefined,
          flagX + 2,
          flagY + 2,
          nameHeight - 4,
          nameHeight - 4,
        );
      }

      // Render health box.
      const healthBoxX = -TEAM_HEALTH_WIDTH_PX / 2 + flagBoxWidth;
      drawPixelBox(
        this.gfx,
        healthBoxX,
        teamBottomY - 2,
        TEAM_HEALTH_WIDTH_PX,
        nameHeight,
        border,
      );

      // Render inner health fill.
      const fillWidth = Math.max(
        0,
        (TEAM_HEALTH_WIDTH_PX - 6) * teamHealthPercentage - 2,
      );
      this.gfx
        .setFillStyle({ color: bg })
        .rect(healthBoxX + 3, teamBottomY + 1, fillWidth, nameHeight - 5)
        .fill()
        .setFillStyle({ color: fg, alpha: 0.25 })
        .rect(
          healthBoxX + 3,
          teamBottomY + 1,
          fillWidth,
          Math.floor((nameHeight - 5) / 2),
        )
        .fill();
      this.gfx.addChild(nameTag);
      teamBottomY += teamSeperationHeight;
    }

    if (allHealthAccurate) {
      logger.debug("All health considered accurate");
      this.shouldChangeTeamHealth = false;
    }
  }
}
