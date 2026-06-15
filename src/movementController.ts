import {
  Ball,
  Collider,
  Cuboid,
  RoundCuboid,
  Shape,
  Vector2,
} from "@dimforge/rapier2d-compat";
import { GameWorld, RapierPhysicsObject, wouldCollide } from "./world";
import { add, Coordinate, MetersValue } from "./utils";
import Logger from "./log";

const logger = new Logger("movementController");

export let debugData: {
  rayCoodinate: Coordinate;
  shape: Cuboid;
};

export function getHalfHeight(shape: Shape) {
  if (shape instanceof Cuboid) {
    return shape.halfExtents.y;
  }
  if (shape instanceof Ball) {
    return shape.radius;
  }
  if (shape instanceof RoundCuboid) {
    return shape.halfExtents.y;
  }
  throw Error(`Unknown shape ${shape.type}`);
}

export function getGroundDifference(colliderA: Collider, colliderB: Collider) {
  const [higher, lower] = [colliderA, colliderB].sort(
    (a, b) => b.translation().y - a.translation().y,
  );
  const higherBottom = higher.translation().y - getHalfHeight(higher.shape);
  const lowerTop = lower.translation().y + getHalfHeight(lower.shape);
  return Math.round((lowerTop - higherBottom) * 100) / 100;
}

export function calculateMovement(
  physObject: RapierPhysicsObject,
  movement: Vector2,
  maxSteppy: MetersValue,
  world: GameWorld,
): Vector2 {
  const currentTranslation = physObject.body.translation();
  // Offset from current shape
  if (
    physObject.collider.shape instanceof Cuboid === false &&
    physObject.collider.shape instanceof RoundCuboid === false
  ) {
    throw Error("calculateMovement only supports cuboid objects");
  }
  const currentShape = physObject.collider.shape as Cuboid | RoundCuboid;
  const move = add(currentTranslation, movement);

  const { y: objHalfHeight, x: objHalfWidth } = currentShape.halfExtents;
  // Get the extremity.
  const rayCoodinate = new Coordinate(
    // Coodinate check in advance of the current shape
    move.x +
      (movement.x < 0
        ? currentShape.halfExtents.x * -1.5
        : currentShape.halfExtents.x * 1.5),
    // Increase the bounds to the steppy position.
    move.y - maxSteppy.value / 2,
  );

  // Increase by steppy amount.
  const initialCollisionShape = new Cuboid(
    objHalfWidth / 2,
    objHalfHeight + maxSteppy.value,
  );
  debugData = { rayCoodinate, shape: initialCollisionShape };

  const collides = world.checkCollisionShape(
    rayCoodinate,
    initialCollisionShape,
    physObject.collider,
  );
  // Pop the highest collider that is within stepping range.
  // Filter out ceiling/overhead terrain whose center is too far above the worm — those
  // should not block horizontal movement (the physics engine handles actual ceiling collision).
  const highestCollider = collides
    .filter(
      (s) =>
        !s.collider.isSensor() &&
        wouldCollide(
          physObject.collider.collisionGroups(),
          s.collider.collisionGroups(),
        ) &&
        currentTranslation.y - s.collider.translation().y <=
          maxSteppy.value + 0.1,
    )
    .sort((a, b) => a.collider.translation().y - b.collider.translation().y)[0];

  // No obstacle ahead — but we should still check whether the ground drops slightly
  // so the worm follows uneven terrain instead of momentarily floating off small ledges
  // (which would otherwise trigger a "falling" state and cancel the player's input).
  if (!highestCollider) {
    logger.debug("No collision");

    const downRayCoordinate = new Coordinate(
      move.x +
        (movement.x < 0
          ? -currentShape.halfExtents.x * 0.5
          : currentShape.halfExtents.x * 0.5),
      move.y + objHalfHeight + maxSteppy.value / 2,
    );
    const downShape = new Cuboid(objHalfWidth * 0.4, maxSteppy.value / 2);
    const downCollides = world.checkCollisionShape(
      downRayCoordinate,
      downShape,
      physObject.collider,
    );
    const groundBelow = downCollides
      .filter(
        (s) =>
          !s.collider.isSensor() &&
          wouldCollide(
            physObject.collider.collisionGroups(),
            s.collider.collisionGroups(),
          ),
      )
      .sort(
        (a, b) => a.collider.translation().y - b.collider.translation().y,
      )[0];

    if (groundBelow) {
      const groundTop =
        groundBelow.collider.translation().y -
        getHalfHeight(groundBelow.collider.shape);
      const targetY = groundTop - objHalfHeight - 0.02;
      // Only snap down if the drop is small (within maxSteppy) — for larger drops
      // we let physics handle the fall naturally.
      if (
        targetY > currentTranslation.y &&
        targetY - currentTranslation.y <= maxSteppy.value
      ) {
        move.y = targetY;
      }
    }
    return move;
  }

  const bodyT = highestCollider.collider.translation();
  const stepSize = currentTranslation.y - bodyT.y;
  if (stepSize > maxSteppy.value) {
    return currentTranslation;
  }

  // Step
  const differential = getGroundDifference(
    physObject.collider,
    highestCollider.collider,
  );
  if (differential >= 1.5) {
    return currentTranslation;
  } else if (differential > 0) {
    // Apply extra clearance for small pixel-level obstacles (< 4px) to prevent
    // the worm from immediately re-colliding after the step-up.
    const clearance = differential < 0.2 ? 0.2 : 0.1;
    move.y -= differential + clearance;
  }

  return move;
}
