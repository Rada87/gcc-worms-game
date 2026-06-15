import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import type { TeamGroup } from "../logic/teams";
import type { IWeaponCode, IWeaponDefiniton } from "../weapons/weapon";

export interface WormResult {
  name: string;
  health: number;
  maxHealth: number;
}

export interface TeamResult {
  name: string;
  uuid: string;
  group: TeamGroup;
  isWinner: boolean;
  worms: WormResult[];
}

interface GoToMenuEvent {
  winDetails?: WinDetails;
}

interface WinDetails {
  teams: TeamResult[];
}

export type AmmoCount = [IWeaponDefiniton, number][];

type GameReactChannelEvents<ReloadedGameState extends object> = {
  goToMenu: (event: GoToMenuEvent) => void;
  closeWeaponMenu: () => void;
  openWeaponMenu: (weapons: AmmoCount) => void;
  weaponSelected: (code: IWeaponCode) => void;
  saveGameState: (callback: (state: ReloadedGameState) => void) => void;
  replayGame: () => void;
};

export class GameReactChannel<
  ReloadedGameState extends object = object,
> extends (EventEmitter as new () => TypedEmitter<
  GameReactChannelEvents<object>
>) {
  constructor() {
    super();
  }

  public goToMenu(teams?: TeamResult[]) {
    this.emit("goToMenu", {
      winDetails: teams ? { teams } : undefined,
    });
  }

  public isWeaponMenuOpen = false;

  public openWeaponMenu(weapons: AmmoCount) {
    this.isWeaponMenuOpen = true;
    this.emit("openWeaponMenu", weapons);
  }

  public closeWeaponMenu() {
    this.isWeaponMenuOpen = false;
    this.emit("closeWeaponMenu");
  }

  public weaponMenuSelect(code: IWeaponCode) {
    this.isWeaponMenuOpen = false;
    this.emit("weaponSelected", code);
  }

  public replayGame() {
    this.emit("replayGame");
  }

  public async saveGameState(): Promise<ReloadedGameState> {
    return new Promise((resolve) =>
      this.emit("saveGameState", (state) =>
        resolve(state as ReloadedGameState),
      ),
    );
  }
}
