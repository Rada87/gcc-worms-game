import {
  Container,
  Filter,
  Geometry,
  Mesh,
  Shader,
  UPDATE_PRIORITY,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { IPhysicalEntity } from "./entity";
import {
  collisionGroupBitmask,
  CollisionGroups,
  GameWorld,
  PIXELS_PER_METER,
  RapierPhysicsObject,
} from "../world";
import { ColliderDesc, Cuboid, RigidBodyDesc } from "@dimforge/rapier2d-compat";
import { MetersValue } from "../utils";

/**
 * Water for the bottom of the game world. Should collide with any objects that fall off the terrain
 * and insta-kill them.
 */
export class Water implements IPhysicalEntity {
  priority = UPDATE_PRIORITY.LOW;
  private readonly geometry: Geometry;
  private readonly waterMesh: Mesh<Geometry, Shader>;
  private static readonly collisionBitmask = collisionGroupBitmask(
    CollisionGroups.WorldObjects,
    [
      CollisionGroups.WorldObjects,
      CollisionGroups.Fire,
      CollisionGroups.Player,
    ],
  );

  // Never active.
  consideredActive = false;

  public get destroyed() {
    // Water cannot be destroyed
    return false;
  }

  public get body() {
    return this.physObject.body;
  }

  private static vertexSrc: string;
  private static fragmentSrc: string;

  static async readAssets() {
    Water.vertexSrc = (await import("../shaders/water.vert?raw")).default;
    Water.fragmentSrc = (await import("../shaders/water.frag?raw")).default;
  }

  public readonly physObject: RapierPhysicsObject;
  private readonly shader: Shader;

  public get waterHeight(): MetersValue {
    return this.height;
  }

  constructor(
    private readonly width: MetersValue,
    private readonly height: MetersValue,
    world: GameWorld,
    private readonly viewport?: Viewport,
  ) {
    // Dense grid so the vertex shader can deform a wavy surface — the old
    // 3-vertex top edge produced a flat horizon. COLS controls wave detail.
    const COLS = 192;
    const ROWS = 4;
    const positions: number[] = [];
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const x = -100 + (c / COLS) * 200;
        const y = (r / ROWS) * 100;
        positions.push(x, y);
      }
    }
    const indexBuffer: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * (COLS + 1) + c;
        const iR = i + 1;
        const iD = i + (COLS + 1);
        const iDR = iD + 1;
        indexBuffer.push(i, iR, iD, iR, iDR, iD);
      }
    }
    this.geometry = new Geometry({
      attributes: { aPosition: positions },
      indexBuffer,
    });
    this.shader = Filter.from({
      gl: {
        vertex: Water.vertexSrc,
        fragment: Water.fragmentSrc,
        name: "water",
      },
      resources: {
        uniforms: {
          iTime: { type: "f32", value: 0 },
        },
      },
    });
    this.physObject = world.createRigidBodyCollider(
      ColliderDesc.cuboid(width.value / 10, 6)
        .setSensor(true)
        .setCollisionGroups(Water.collisionBitmask),
      RigidBodyDesc.fixed().setTranslation(0, height.value),
    );
    const meshPos = this.physObject.body.translation();
    const meshHeight = 6.5;
    this.waterMesh = new Mesh({
      geometry: this.geometry,
      shader: this.shader,
      position: {
        x: width.pixels / 6,
        y: (meshPos.y - meshHeight) * PIXELS_PER_METER,
      },
      visible: true,
    });
    this.waterMesh.width = this.width.value;
    this.waterMesh.height = this.height.value;
    this.waterMesh.scale.set(40, 15);
  }

  addToWorld(parent: Container, world: GameWorld) {
    parent.addChildAt(this.waterMesh, Math.max(0, parent.children.length - 1));
    world.addBody(this, this.physObject.collider);
    world.waterYPosition =
      this.body.translation().y -
      (this.physObject.collider.shape as Cuboid).halfExtents.y;
  }

  update(): void {
    this.shader.resources.uniforms.uniforms.iTime = performance.now() / 1000;
    if (this.viewport) {
      this.waterMesh.x = this.viewport.center.x;
    }
  }

  destroy(): void {
    this.shader.destroy();
  }
}
