import { Viewport } from "pixi-viewport";
import { Point } from "pixi.js";
import { MovedEvent } from "pixi-viewport/dist/types";
import Logger from "./log";
import { MetersValue } from "./utils";
import { GameConfig } from "./gameConfig";
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  map,
  Observable,
  Subscription,
} from "rxjs";

const logger = new Logger("ViewportCamera");

export enum CameraLockPriority {
  // Do not lock the camera to this object
  NoLock = 0,
  // Snap the camera to this object if the current player isn't local, but allow the user to move away.
  SuggestedLockNonLocal = 1,
  // Snap the camera to this object, but allow the user to move away.
  SuggestedLockLocal = 2,
  // Lock the camera to this object, but only suggest it to local players.
  LockIfNotLocalPlayer = 3,
  // Always lock the camera to this object.
  AlwaysLock = 4,
}

export interface LockableEntity {
  cameraLockPriority$: Observable<CameraLockPriority>;
  destroyed: boolean;
  sprite: {
    position: Point;
  };
}

type CurrentLockType = {
  target: LockableEntity;
  priority: CameraLockPriority;
  isLocal: boolean;
} | null;

export class ViewportCamera {
  private currentLock = new BehaviorSubject<CurrentLockType>(null);
  private userWantsControl = false;
  private lastMoveHash = Number.MIN_SAFE_INTEGER;
  private cameraSub?: Subscription;
  // While true, snapToPosition is a no-op for all lock priorities except
  // AlwaysLock (e.g. explosions). Used by setInitialView to hold a chosen
  // overview frame for a few seconds at game start.
  private initialViewHold = false;

  private shakeEndMs = 0;
  private shakeStartMs = 0;
  private shakeIntensityPx = 0;

  // Smooth follow: rather than hard-snapping the viewport centre onto the lock
  // target every frame (which makes walking, stepping over terrain and jumping
  // feel rigid and jerky), we ease the centre toward the target with a
  // frame-rate-independent exponential damp. See GameConfig.camera for tuning.
  private static readonly followTauMs = GameConfig.camera.followTauMs;
  private static readonly followSnapPx = GameConfig.camera.followSnapPx;
  // Frame delta (ms) of the current tick, fed in from the ticker so the follow
  // damp is frame-rate independent. Clamped on intake to survive long stalls.
  private frameDtMs = 16;

  /**
   * Gets an observable to the current lock target.
   */
  public get lockTarget(): Observable<CurrentLockType> {
    return this.currentLock.asObservable();
  }

  constructor(
    private readonly viewport: Viewport,
    private readonly clampY: MetersValue,
    physicalEntities: Observable<IteratorObject<LockableEntity>>,
    currentPlayableIsLocal: Observable<boolean>,
  ) {
    viewport.on("moved", (event: MovedEvent) => {
      // "drag" and "wheel" are the only types that come from genuine user
      // input. Programmatic moveCenter/setZoom fire "center"/"zoom", clamps
      // fire "clamp-*", snapTo fires "snap", decelerate after drag fires
      // "decelerate" — none of those should grab user control.
      if (event.type !== "drag" && event.type !== "wheel") {
        return;
      }
      if (this.initialViewHold) {
        this.initialViewHold = false;
        logger.debug("Initial view hold released by user input");
      }
      if (this.userWantsControl === false) {
        this.userWantsControl = true;
        this.lastMoveHash = 0;
        logger.debug("Player took control");
      }
    });
    combineLatest([physicalEntities, currentPlayableIsLocal])
      .pipe(debounceTime(200))
      .subscribe(([entities, currentPlayableIsLocal]) => {
        this.updateEntitySet(entities, currentPlayableIsLocal);
      });
  }

  /**
   * Set the camera to a manually chosen view and freeze auto-follow until
   * the user interacts, or until `holdMs` elapses. Called at game start to
   * present a fit-to-content overview before yielding to worm-follow.
   */
  public setInitialView(
    centerX: number,
    centerY: number,
    zoom: number,
    holdMs = 3500,
  ) {
    this.viewport.setZoom(zoom, true);
    this.viewport.moveCenter(centerX, centerY);
    this.initialViewHold = true;
    this.lastMoveHash = centerX + centerY;
    setTimeout(() => {
      if (this.initialViewHold) {
        this.initialViewHold = false;
        const currentTarget = this.currentLock.value;
        if (currentTarget && !currentTarget.target.destroyed) {
          const tx = currentTarget.target.sprite.position.x;
          const ty = currentTarget.target.sprite.position.y;
          const clamped = this.clampTargetY(tx, ty);
          this.viewport.animate({
            position: { x: clamped[0], y: clamped[1] },
            time: 900,
            ease: "easeInOutQuad",
          });
          this.lastMoveHash = clamped[0] + clamped[1];
        }
        logger.debug("Initial view hold expired");
      }
    }, holdMs);
  }

  private clampTargetY(x: number, y: number): [number, number] {
    const out: [number, number] = [x, y];
    // Don't drop below the void under the water surface.
    const clampYBottom = this.clampY.pixels - this.viewport.screenHeight / 2;
    if (out[1] > clampYBottom) out[1] = clampYBottom;
    // Don't rise so high that the water disappears from the screen. We
    // reserve ~180 px of always-visible water strip so the hazard reads
    // even when the camera is tracking a worm high on the map.
    const waterMeshTopPixels = this.clampY.pixels - 170;
    const halfScreenWorldH =
      this.viewport.screenHeight / (2 * this.viewport.scale.y);
    const clampYTop = waterMeshTopPixels - halfScreenWorldH + 180;
    if (out[1] < clampYTop) out[1] = clampYTop;
    return out;
  }

  public snapToPosition(
    newTarget: Point,
    priority: CameraLockPriority,
    currentEntityIsLocal: boolean,
  ) {
    // Hold the start-of-match overview until the timer elapses or the
    // player interacts. We deliberately block every priority including
    // AlwaysLock — the hold window is short (<= 4s) and nothing critical
    // (explosions, projectiles) can happen before the first round begins.
    if (this.initialViewHold) {
      return;
    }

    const targetXY = this.clampTargetY(newTarget.x, newTarget.y);

    // Short circuit if the clamped target hasn't changed AND the viewport
    // is actually sitting on it — otherwise we'd skip re-applying after
    // an animate plugin slid us off the clamped position.
    const newMoveHash = targetXY[0] + targetXY[1];
    const viewportSettled =
      Math.abs(this.viewport.center.x - targetXY[0]) < 0.5 &&
      Math.abs(this.viewport.center.y - targetXY[1]) < 0.5;
    if (this.lastMoveHash === newMoveHash && viewportSettled) {
      return;
    }
    this.lastMoveHash = newMoveHash;

    switch (priority) {
      case CameraLockPriority.SuggestedLockNonLocal:
        if (this.userWantsControl) {
          return;
        }
        // Need a better way to determine this.
        if (!currentEntityIsLocal) {
          this.moveCameraTowards(targetXY);
        }
        break;
      case CameraLockPriority.SuggestedLockLocal:
        if (this.userWantsControl) {
          return;
        }
        this.moveCameraTowards(targetXY);
        break;
      case CameraLockPriority.LockIfNotLocalPlayer:
        if (!currentEntityIsLocal) {
          this.moveCameraTowards(targetXY);
        } else if (!this.userWantsControl) {
          this.moveCameraTowards(targetXY);
        }
        break;

      case CameraLockPriority.AlwaysLock:
        if (!this.userWantsControl) {
          this.moveCameraTowards(targetXY);
        }
        break;
    }
  }

  /**
   * Ease the viewport centre toward `target` using a frame-rate-independent
   * exponential damp, so camera follow feels smooth instead of snapping. The
   * frame dt is clamped so a long stall (tab backgrounded, pause) can't cause a
   * huge jump on the next tick.
   */
  private moveCameraTowards(target: [number, number]) {
    const center = this.viewport.center;
    const alpha = 1 - Math.exp(-this.frameDtMs / ViewportCamera.followTauMs);
    let nextX = center.x + (target[0] - center.x) * alpha;
    let nextY = center.y + (target[1] - center.y) * alpha;
    if (Math.abs(target[0] - nextX) < ViewportCamera.followSnapPx) {
      nextX = target[0];
    }
    if (Math.abs(target[1] - nextY) < ViewportCamera.followSnapPx) {
      nextY = target[1];
    }
    this.viewport.moveCenter(nextX, nextY);
  }

  public updateEntitySet(
    entities: IteratorObject<LockableEntity>,
    isLocal: boolean,
  ) {
    this.cameraSub?.unsubscribe();
    logger.info("Recalculating entity set");

    const obs = entities
      // XXX: This type is actually wrong.
      .filter((entity) => entity.cameraLockPriority$)
      .map((entity) =>
        entity.cameraLockPriority$.pipe(
          map((priority) => ({ priority, entity })),
        ),
      );

    this.cameraSub = combineLatest([...obs]).subscribe((entities) => {
      logger.info(
        "New camera lock requested",
        entities.map((e) => ({
          priority: e.priority,
          ent: e.entity.toString(),
        })),
      );
      const currentTarget = this.currentLock.value;
      let nextTarget = currentTarget;

      // Apply new value for currentLock before iterating.
      const currentEnt = entities.find(
        (e) => e.entity === currentTarget?.target,
      );
      if (currentTarget !== null && !currentEnt) {
        // Ent is no longer found.
        nextTarget = null;
      } else if (nextTarget && currentEnt) {
        nextTarget.priority = currentEnt.priority;
      }

      for (const { entity, priority } of entities) {
        if (priority === CameraLockPriority.NoLock) {
          continue;
        }
        if (currentTarget && currentTarget?.priority >= priority) {
          logger.debug(
            "New lock is not higher priority than",
            currentTarget.target.toString(),
            CameraLockPriority[priority],
          );
          // Skipping as higher priority exists.
          continue;
        }
        if (entity !== currentTarget?.target) {
          // Reset user control.
          this.userWantsControl = false;
          logger.debug("New lock target", entity.toString());
          nextTarget = {
            target: entity,
            priority,
            isLocal,
          };
        } else {
          logger.debug("New lock target is same as last, ignoring");
          continue;
        }
      }
      this.currentLock.next(nextTarget);
    });
  }

  /**
   * Trigger a camera shake effect. Safe to call repeatedly — takes the
   * strongest intensity and longest remaining duration.
   */
  public shake(intensityPx: number, durationMs: number) {
    const now = Date.now();
    const newEnd = now + durationMs;
    if (newEnd > this.shakeEndMs) {
      this.shakeStartMs = now;
      this.shakeEndMs = newEnd;
    }
    this.shakeIntensityPx = Math.max(this.shakeIntensityPx, intensityPx);
  }

  public update(dtMs = 16) {
    // Clamp so a long stall (tab backgrounded, pause) can't snap the camera in
    // one huge jump on the next tick.
    this.frameDtMs = Math.min(Math.max(dtMs, 0), 100);
    const currentTarget = this.currentLock.getValue();
    if (!currentTarget) {
      return;
    }
    if (currentTarget.target.destroyed) {
      this.currentLock.next(null);
      return;
    }
    this.snapToPosition(
      currentTarget.target.sprite.position,
      currentTarget.priority,
      currentTarget.isLocal,
    );

    const now = Date.now();
    if (this.shakeEndMs > now && this.shakeIntensityPx > 0) {
      const totalMs = this.shakeEndMs - this.shakeStartMs;
      const decay = (this.shakeEndMs - now) / totalMs;
      const intensity = this.shakeIntensityPx * decay;
      this.viewport.position.x += (Math.random() * 2 - 1) * intensity;
      this.viewport.position.y += (Math.random() * 2 - 1) * intensity;
    } else {
      this.shakeIntensityPx = 0;
    }
  }
}
