import {
  UPDATE_PRIORITY,
  Container,
  Graphics,
  Rectangle,
  Texture,
  Sprite,
} from "pixi.js";
import { IPhysicalEntity } from "./entity";
import { imageDataToSolidRuns, generateStripsFromRuns } from "../terrain";
import Flags from "../flags";
import {
  collisionGroupBitmask,
  CollisionGroups,
  GameWorld,
  PIXELS_PER_METER,
  RapierPhysicsObject,
} from "../world";
import {
  Collider,
  ColliderDesc,
  Cuboid,
  RigidBody,
  RigidBodyDesc,
  Vector2,
} from "@dimforge/rapier2d-compat";
import { Coordinate, MetersValue } from "../utils/coodinate";
import Logger from "../log";

const logger = new Logger("BitmapTerrain");

export type OnDamage = () => void;

/**
 * The terrain that objects sit upon. May be damanged by entities.
 */
export class BitmapTerrain implements IPhysicalEntity {
  public readonly priority = UPDATE_PRIORITY.LOW;
  private static readonly collisionBitmask = collisionGroupBitmask(
    CollisionGroups.Terrain,
    [
      CollisionGroups.Terrain,
      CollisionGroups.WorldObjects,
      CollisionGroups.Player,
      CollisionGroups.Fire,
    ],
  );

  public get destroyed() {
    // Terrain cannot be destroyed.
    return false;
  }

  private readonly gfx: Graphics = new Graphics();
  private parts: RapierPhysicsObject[] = [];

  private _bounds: Rectangle;

  public get bounds(): Rectangle {
    return this._bounds;
  }

  private readonly foregroundCanvas: HTMLCanvasElement;
  private readonly backgroundCanvas: HTMLCanvasElement;
  private texture: Texture;
  private textureBg: Texture;
  private readonly sprite: Sprite;
  private readonly spriteBackdrop: Sprite;
  // collider.handle -> fn
  private registeredDamageFunctions = new Map<number, OnDamage>();

  // Never active.
  consideredActive = false;

  static create(
    gameWorld: GameWorld,
    texture: Texture,
    position?: Coordinate,
    destructible?: boolean,
  ) {
    return new BitmapTerrain(gameWorld, texture, position, destructible);
  }

  static drawToCanvas(texture: Texture) {
    const bitmap = texture.source.resource as ImageBitmap;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width + 10;
    canvas.height = bitmap.height + 10;
    const context = canvas.getContext("2d");
    if (!context) {
      throw Error("Failed to get render context of canvas");
    }
    context.drawImage(bitmap as CanvasImageSource, 10, 10);
    return canvas;
  }

  private constructor(
    private readonly gameWorld: GameWorld,
    texture: Texture,
    position?: Coordinate,
    private readonly destructible = true,
  ) {
    this.foregroundCanvas = BitmapTerrain.drawToCanvas(texture);
    this.texture = Texture.from(this.foregroundCanvas, true);
    this.sprite = new Sprite(this.texture);
    if (position) {
      this.sprite.x = position.screenX;
      this.sprite.y = position.screenY;
    }

    // Somehow make rain fall infront of this.
    this.backgroundCanvas = BitmapTerrain.drawToCanvas(texture);
    this.textureBg = Texture.from(this.foregroundCanvas, true);
    this.spriteBackdrop = new Sprite(
      Texture.from(this.textureBg._source, true),
    );
    this.spriteBackdrop.tint = "0x222222";
    if (position) {
      this.spriteBackdrop.x = position.screenX;
      this.spriteBackdrop.y = position.screenY;
    }

    this._bounds = new Rectangle(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      0,
      0,
    );

    Flags.on("toggleDebugView", (value) => {
      if (!value) {
        this.gfx.clear();
      }
    });

    Flags.on("toggleTerrainDebug", (value: boolean) => {
      if (value) {
        this.renderTerrainColliders();
      } else {
        this.gfx.clear();
      }
    });

    // Calculate bounding boxes
    this.calculateBoundaryVectors();
  }

  addToWorld(parent: Container) {
    parent.addChild(this.spriteBackdrop, this.sprite, this.gfx);
  }

  calculateBoundaryVectors(
    boundaryX = 0,
    boundaryY = 0,
    boundaryWidth = this.foregroundCanvas.width,
    boundaryHeight = this.foregroundCanvas.height,
  ) {
    const isFullRecompute =
      boundaryX === 0 &&
      boundaryY === 0 &&
      boundaryWidth === this.foregroundCanvas.width &&
      boundaryHeight === this.foregroundCanvas.height;
    console.time("Generating terrain");
    const context = this.foregroundCanvas.getContext("2d");
    if (!context) {
      throw Error("Failed to get render context of canvas");
    }

    // Remove every collider whose AABB intersects the snapshot region.
    // Center-only checks miss large interior quads whose center sits outside
    // the snapshot box but which still overlap the damaged pixels — leaving
    // an invisible collider behind after destruction.
    const regionMinX = boundaryX;
    const regionMaxX = boundaryX + boundaryWidth;
    const regionMinY = boundaryY;
    const regionMaxY = boundaryY + boundaryHeight;
    const removableBodies = this.parts.filter((b) => {
      const tr = b.body.translation();
      const cx = tr.x * PIXELS_PER_METER;
      const cy = tr.y * PIXELS_PER_METER;
      const shape = b.collider.shape;
      let hw = 0;
      let hh = 0;
      if (shape instanceof Cuboid) {
        hw = shape.halfExtents.x * PIXELS_PER_METER;
        hh = shape.halfExtents.y * PIXELS_PER_METER;
      }
      return !(
        cx + hw < regionMinX ||
        cx - hw > regionMaxX ||
        cy + hh < regionMinY ||
        cy - hh > regionMaxY
      );
    });

    for (const body of removableBodies) {
      this.gameWorld.removeBody(body);
      const damageFn = this.registeredDamageFunctions.get(body.collider.handle);
      if (damageFn) {
        this.registeredDamageFunctions.delete(body.collider.handle);
        damageFn?.();
      }
    }
    // TODO: Fix this.
    this.parts = this.parts.filter(
      (b) => !removableBodies.some((rB) => b.body.handle === rB.body.handle),
    );
    const imgData = context.getImageData(
      boundaryX,
      boundaryY,
      boundaryWidth,
      boundaryHeight,
    );

    const { columns, boundingBox } = imageDataToSolidRuns(
      boundaryX,
      boundaryY,
      imgData,
    );
    if (isFullRecompute) {
      this._bounds = boundingBox;
    } else if (boundingBox.width > 0 && boundingBox.height > 0) {
      // Partial recompute: extend existing bounds rather than replacing them,
      // otherwise pointInTerrain() would shrink to the latest damage region.
      const minX = Math.min(this._bounds.x, boundingBox.x);
      const minY = Math.min(this._bounds.y, boundingBox.y);
      const maxX = Math.max(
        this._bounds.x + this._bounds.width,
        boundingBox.x + boundingBox.width,
      );
      const maxY = Math.max(
        this._bounds.y + this._bounds.height,
        boundingBox.y + boundingBox.height,
      );
      this._bounds = new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    // Multi-run strips: each solid segment per column generates its own strip,
    // so overhangs and hollow areas never create phantom collision.
    const quadtreeRects = generateStripsFromRuns(columns);

    logger.debug("Found", quadtreeRects.length, "strips in terrain");

    // Now create the pieces
    const newParts: RapierPhysicsObject[] = [];
    for (const quad of quadtreeRects) {
      const body = this.gameWorld.createRigidBodyCollider(
        ColliderDesc.cuboid(
          quad.width / (PIXELS_PER_METER * 2),
          quad.height / (PIXELS_PER_METER * 2),
        ).setCollisionGroups(BitmapTerrain.collisionBitmask),

        // Position the body at the CENTER of the quad so the collision shape
        // aligns with the visible terrain pixels.
        RigidBodyDesc.fixed().setTranslation(
          (quad.x + this.sprite.x + quad.width / 2) / PIXELS_PER_METER,
          (quad.y + this.sprite.y + quad.height / 2) / PIXELS_PER_METER,
        ),
      );
      newParts.push(body);
    }
    this.parts.push(...newParts);

    this.gameWorld.addBody(this, ...newParts.map((p) => p.collider));
    console.timeEnd("Generating terrain");

    if (Flags.showTerrainDebug) {
      this.renderTerrainColliders();
    }
  }

  onDamage(point: Vector2, radius: MetersValue) {
    logger.debug(`Terrain took damaged (${point.x} ${point.y}`, radius);
    if (!this.destructible) {
      // Terrain is indestructible, ignore all damage.
      return;
    }
    const context = this.foregroundCanvas.getContext("2d");
    if (!context) {
      throw Error("Failed to get context");
    }

    // Optmise this check!
    const imageX = point.x * PIXELS_PER_METER - this.sprite.x;
    const imageY = point.y * PIXELS_PER_METER - this.sprite.y;
    const radiusMargin = radius.pixels * 4;
    const snapshotX = imageX - radiusMargin / 2;
    const snapshotY = imageY - radiusMargin / 2;
    const snapshotWidth = radiusMargin;
    const snapshotHeight = radiusMargin;

    // Fetch the current image
    const before = context.getImageData(
      snapshotX,
      snapshotY,
      snapshotWidth,
      snapshotHeight,
    );
    // Draw a circle

    // Give the exploded area a border
    // context.fillStyle = 'green';
    // context.arc(imageX, imageY, radius + 15, 0, 2 * Math.PI);
    // context.fill();

    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "grey";
    context.beginPath();
    context.arc(imageX, imageY, radius.pixels, 0, 2 * Math.PI);
    context.fill();
    // Fetch the new image
    const after = context.getImageData(
      snapshotX,
      snapshotY,
      snapshotWidth,
      snapshotHeight,
    );

    // Show the new image with our newly created hole.
    context.putImageData(after, snapshotX, snapshotY);

    const smallerRadius = radius.pixels / 3;
    // TODO: Only do this conditionally
    if (smallerRadius) {
      const beforeBg = context.getImageData(
        snapshotX,
        snapshotY,
        snapshotWidth,
        snapshotHeight,
      );
      const contextBg = this.backgroundCanvas.getContext("2d");
      if (!contextBg) {
        throw Error("Failed to get context");
      }
      contextBg.fillStyle = "grey";
      contextBg.beginPath();
      const offset = radius.pixels / 2 - smallerRadius;
      contextBg.arc(
        offset + imageX,
        offset + imageY,
        smallerRadius,
        0,
        2 * Math.PI,
      );
      contextBg.fill();

      const afterBg = contextBg.getImageData(
        snapshotX,
        snapshotY,
        snapshotWidth,
        snapshotHeight,
      );

      // See what has changed, hopefully a red cricle!
      for (let i = 0; i < before.data.length; i += 4) {
        const oldDataValue =
          beforeBg.data[i] +
          beforeBg.data[i + 1] +
          beforeBg.data[i + 2] +
          beforeBg.data[i + 3];
        const newDataValue =
          afterBg.data[i] +
          afterBg.data[i + 1] +
          afterBg.data[i + 2] +
          afterBg.data[i + 3];
        if (oldDataValue !== newDataValue) {
          // Zero the alpha channel for anything that has changed...like a red cricle
          afterBg.data[i + 0] = 0;
          afterBg.data[i + 1] = 0;
          afterBg.data[i + 2] = 0;
          afterBg.data[i + 3] = 0;
        }
      }
      contextBg.putImageData(afterBg, snapshotX, snapshotY);
      const newTex = Texture.from(this.backgroundCanvas);
      this.spriteBackdrop.texture = newTex;
      this.textureBg.destroy();
      this.textureBg = newTex;
    }

    // Remember to recalculate the collision paths
    this.calculateBoundaryVectors(
      snapshotX,
      snapshotY,
      snapshotWidth,
      snapshotHeight,
    );
    const newTex = Texture.from(this.foregroundCanvas);
    this.sprite.texture = newTex;
    this.texture.destroy();
    this.texture = newTex;
  }

  private renderTerrainColliders(): void {
    this.gfx.clear();
    for (const part of this.parts) {
      const tr = part.body.translation();
      const shape = part.collider.shape as Cuboid;
      const hw = shape.halfExtents.x * PIXELS_PER_METER;
      const hh = shape.halfExtents.y * PIXELS_PER_METER;
      const cx = tr.x * PIXELS_PER_METER;
      const cy = tr.y * PIXELS_PER_METER;
      this.gfx
        .setFillStyle({ color: 0xff2222, alpha: 0.18 })
        .setStrokeStyle({ color: 0xff4444, width: 1, alpha: 0.85 })
        .rect(cx - hw, cy - hh, hw * 2, hh * 2)
        .fill()
        .stroke();
    }
  }

  public update(): void {
    if (!Flags.DebugView) {
      return;
    }
  }

  public getNearestTerrainPosition(
    point: Vector2,
    width: number,
    maxHeightDiff: number,
    xDirection = 0,
  ): { point: Vector2; fell: false } | { fell: true; point: null } {
    // This needs a rethink, we really want to have it so that the character's "platform" is visualised
    // by this algorithm. We want to figure out if we can move left or right, and if not if we're going to fall.

    // First filter for all the points within the range of the point.
    const filteredPoints = this.parts.filter((p) => {
      return (
        p.body.translation().x < point.x + width + xDirection &&
        p.body.translation().x > point.x - width - xDirection &&
        p.body.translation().y > point.y - maxHeightDiff
      );
    });

    // This needs to answer the following as quickly as possible:

    // Can we go to the next x point without falling?
    let closestTerrainPoint: Vector2 | undefined;

    const rejectedPoints: RigidBody[] = [];

    for (const terrain of filteredPoints) {
      const terrainPoint = terrain.body.translation();
      const distY = Math.abs(terrainPoint.y - point.y);
      if (xDirection < 0 && terrainPoint.x - point.x > xDirection) {
        // If moving left, -3
        continue;
      }
      if (xDirection > 0 && terrainPoint.x - point.x < xDirection) {
        // If moving right
        continue;
      }
      if (distY > maxHeightDiff) {
        rejectedPoints.push(terrain.body);
        continue;
      }
      const distX = Math.abs(terrainPoint.x - (point.x + xDirection));
      const prevDistX = closestTerrainPoint
        ? Math.abs(closestTerrainPoint.x - (point.x + xDirection))
        : Number.MAX_SAFE_INTEGER;
      if (distX < prevDistX) {
        closestTerrainPoint = terrainPoint;
      }
    }

    if (closestTerrainPoint) {
      return { point: closestTerrainPoint, fell: false };
    }

    logger.verbose(
      "Rejected points from getNearestTerrainPosition",
      rejectedPoints,
    );

    // We have fallen, look for the closest X position to land on.
    return {
      point: null,
      fell: true,
    };
  }

  public pointInTerrain(point: Coordinate): boolean {
    // Avoid costly iteration with this one neat trick.
    if (!this._bounds.contains(point.screenX, point.screenY)) {
      return false;
    }
    return this.gameWorld.pointInAnyObject(point);
  }

  public registerDamageListener(collider: Collider, fn: OnDamage) {
    this.registeredDamageFunctions.set(collider.handle, fn);
  }

  destroy(): void {
    throw new Error("Never destroyed.");
  }
}
