import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { TimedExplosive, TimedExplosiveRecordedState } from "./timedExplosive";
import { collisionGroupBitmask, CollisionGroups, GameWorld } from "../../world";
import {
  ActiveEvents,
  ColliderDesc,
  RigidBodyDesc,
  Vector2,
} from "@dimforge/rapier2d-compat";
import { Coordinate, MetersValue } from "../../utils/coodinate";
import { AssetPack } from "../../assets";
import { WormInstance } from "../../logic";
import { angleForVector, mult } from "../../utils";
import { EntityType } from "../type";
import Logger from "../../log";
import globalFlags, { DebugLevel } from "../../flags";
import { arcPoints } from "../../utils/arc";
import { GameConfig } from "../../gameConfig";

const logger = new Logger("HomingMissile");

const ACTIVATION_TIME_MS = GameConfig.weapons.homingMissile.activationTimeMs;
const ADJUSTMENT_TIME_MS = GameConfig.weapons.homingMissile.adjustmentTimeMs;
const forceMult = new Vector2(
  GameConfig.weapons.homingMissile.thrustForce.x,
  GameConfig.weapons.homingMissile.thrustForce.y,
);

export interface HomingMissileRecordedState
  extends TimedExplosiveRecordedState {
  target: {
    x: number;
    y: number;
  };
  hasActivated: boolean;
}

/**
 * Homing missile that attempts to hit a point target.
 */
export class HomingMissile extends TimedExplosive<HomingMissileRecordedState> {
  public static getMissilePath(
    start: Coordinate,
    target: Coordinate,
  ): Coordinate[] {
    return arcPoints(
      [start.worldX, start.worldY],
      [target.worldX, target.worldY],
      0.55,
    ).map((v) => Coordinate.fromWorld(v[0], v[1]));
  }

  public static readAssets(assets: AssetPack) {
    HomingMissile.textureInactive = assets.textures.missileInactive;
    HomingMissile.textureActive = assets.textures.missileActive;
  }

  private static readonly collisionBitmask = collisionGroupBitmask(
    CollisionGroups.WorldObjects,
    [CollisionGroups.Terrain, CollisionGroups.WorldObjects],
  );
  private static textureInactive: Texture;
  private static textureActive: Texture;
  private forcePath: Coordinate[] = [];
  private readonly debugGfx = new Graphics();
  private lastPathAdjustment = 0;
  private hasActivated = false;

  static create(
    parent: Container,
    gameWorld: GameWorld,
    position: Coordinate,
    force: Vector2,
    target: Coordinate,
    owner?: WormInstance,
    onDestroy?: () => void,
  ) {
    const ent = new HomingMissile(
      position,
      gameWorld,
      parent,
      force,
      target,
      owner,
      onDestroy,
    );
    gameWorld.addBody(ent, ent.physObject.collider);
    parent.addChild(ent.sprite);
    parent.addChild(ent.wireframe.renderable);
    parent.addChild(ent.debugGfx);
    return ent;
  }

  private constructor(
    position: Coordinate,
    world: GameWorld,
    parent: Container,
    initialForce: Vector2,
    private target: Coordinate,
    owner?: WormInstance,
    private readonly onDestroyCallback?: () => void,
  ) {
    const sprite = new Sprite(HomingMissile.textureInactive);
    const body = world.createRigidBodyCollider(
      ColliderDesc.cuboid(0.5, 0.2)
        .setActiveEvents(ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(HomingMissile.collisionBitmask)
        .setMass(1),
      // TODO: Angle rotation the right way.
      RigidBodyDesc.dynamic()
        .setTranslation(position.worldX, position.worldY)
        .setLinvel(initialForce.x, initialForce.y)
        // TODO: Check
        // TODO: Friction
        .setLinearDamping(GameConfig.weapons.homingMissile.linearDamping),
    );

    super(sprite, body, world, parent, {
      explosionRadius: new MetersValue(
        GameConfig.weapons.homingMissile.explosionRadius,
      ),
      explodeOnContact: true,
      timerSecs: GameConfig.weapons.homingMissile.autoExpireTimerSecs,
      autostartTimer: true,
      ownerWorm: owner,
      maxDamage: GameConfig.weapons.homingMissile.maxDamage,
    });
    this.debugGfx.visible = globalFlags.DebugView === DebugLevel.BasicOverlay;
    globalFlags.on(
      "toggleDebugView",
      (debug) => (this.debugGfx.visible = debug === DebugLevel.BasicOverlay),
    );
    this.sprite.x = position.screenX;
    this.sprite.y = position.screenY;
    this.sprite.scale.set(0.75, 0.75);
    this.sprite.anchor.set(0.5, 0.5);

    // Align sprite with body.
    this.rotationOffset = Math.PI / 2;
    logger.debug(`pos: ${position}`, `target: ${target}`);
  }

  update(dt: number, dMs: number) {
    super.update(dt, dMs);
    if (!this.physObject || this.sprite.destroyed || this.isSinking) {
      return;
    }
    this.lastPathAdjustment += dt;

    if (!this.hasActivated && this.lastPathAdjustment >= ACTIVATION_TIME_MS) {
      this.hasActivated = true;
      const { target } = this;
      const { position } = this.sprite;
      this.sprite.texture = HomingMissile.textureActive;
      this.forcePath = HomingMissile.getMissilePath(
        Coordinate.fromScreen(position.x, position.y),
        target,
      );
      // Draw paths once
      const start = this.forcePath.pop()!;
      this.debugGfx.moveTo(start.screenX, start.screenY);
      for (const point of this.forcePath) {
        this.debugGfx
          .lineTo(point.screenX, point.screenY)
          .stroke({ width: 5, color: 0xffbd01, alpha: 1 });
      }
      logger.debug("Activated!");
    }

    if (this.hasActivated && this.lastPathAdjustment >= ADJUSTMENT_TIME_MS) {
      this.lastPathAdjustment = 0;
      const [nextOrLastItem] = this.forcePath.splice(0, 1);
      this.safeUsePhys(({ body }) => {
        if (nextOrLastItem) {
          const translation = body.translation();
          const impulse = mult(
            new Vector2(
              nextOrLastItem.worldX - translation.x,
              nextOrLastItem.worldY - translation.y,
            ),
            forceMult,
          );
          body.setLinvel(impulse, true);
        }
      });
    }
    this.safeUsePhys(({ body }) => {
      body.setRotation(angleForVector(body.linvel()), false);
      this.wireframe.setDebugText(
        `${this.lastPathAdjustment}t ${body.rotation()}  ${Math.round(body.linvel().x)} ${Math.round(body.linvel().y)} ${this.hasActivated ? "act" : "noact"}`,
      );
    });
  }

  destroy(): void {
    this.onDestroyCallback?.();
    super.destroy();
    this.debugGfx.destroy();
  }

  recordState() {
    return {
      ...super.recordState(),
      target: {
        x: this.target.worldX,
        y: this.target.worldY,
      },
      hasActivated: this.hasActivated,
      type: EntityType.HomingMissile,
    };
  }

  applyState(d: HomingMissileRecordedState): void {
    super.applyState(d);
    if (!this.hasActivated) {
      this.hasActivated = d.hasActivated;
    }
    const newTarget = Coordinate.fromWorld(d.target.x, d.target.y);
    if (this.target.hash() !== newTarget.hash()) {
      logger.info("Missle course adjusted by network sync");
      this.target = newTarget;
      const { position } = this.sprite;
      this.forcePath = HomingMissile.getMissilePath(
        Coordinate.fromScreen(position.x, position.y),
        newTarget,
      );
    }
  }
}
