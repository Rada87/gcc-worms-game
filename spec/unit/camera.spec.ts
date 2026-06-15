import { describe, expect, test } from "@jest/globals";
import { CameraLockPriority, LockableEntity, ViewportCamera } from "../../src/camera";
import { Viewport } from "pixi-viewport";
import { MockViewport } from "../test-utils/viewport-mock";
import { MockPhysicsEntity } from "../test-utils/physent-mock";
import { MetersValue } from "../../src/utils";
import { BehaviorSubject, debounceTime, firstValueFrom, map, Observable } from "rxjs";


function createTestEnv() {
    const viewport = new MockViewport();
    const waterPosition = new MetersValue(30);
    const entities = new BehaviorSubject<LockableEntity[]>([]);
    const isLocalPlayer = new BehaviorSubject<boolean>(true);
    const camera = new ViewportCamera(viewport as unknown as Viewport, waterPosition, entities.pipe(map(e => new Set(e).values())), isLocalPlayer.asObservable());
    const lockTarget = getFinalValue(camera.lockTarget);
    return { viewport, camera, entities, isLocalPlayer, lockTarget };
}

function getFinalValue<T>(observable: Observable<T>): Promise<T> {
    // The camera itself debounces, so allow enough time.
    return firstValueFrom(observable.pipe(debounceTime(500)));
}

/**
 * Drive several follow frames so the smooth (damped) camera converges on its
 * target. The follow snaps exactly once it is within 1px, so this settles to
 * the clamped target after enough frames.
 */
function settleCamera(camera: ViewportCamera, frames = 200, dtMs = 16) {
    for (let i = 0; i < frames; i++) {
        camera.update(dtMs);
    }
}

describe('ViewportCamera', () => {
    test('camera starts with nolock', async () => {
        const { lockTarget } = createTestEnv();
        expect(await lockTarget).toBeNull();
    });
    test('camera has nolock when no entities exist', async () => {
        const { entities, lockTarget } = createTestEnv();
        entities.next([]);
        expect(await lockTarget).toBeNull();
    });
    test('camera ignores targets with nolock', async () => {
        const { entities, lockTarget } = createTestEnv();
        const ent = new MockPhysicsEntity();
        ent.setCameraLock(CameraLockPriority.NoLock);
        entities.next([ent]);
        expect(await lockTarget).toBeNull();
    });
    test('camera locks onto a single target', async () => {
        const { viewport, camera, entities, lockTarget } = createTestEnv();
        const ent = new MockPhysicsEntity();
        ent.setCameraLock(CameraLockPriority.SuggestedLockLocal);
        entities.next([ent]);
        expect((await lockTarget)?.target).toEqual(ent);

        settleCamera(camera);
        expect(viewport.moveCenter).toHaveBeenCalled();
        // Horizontal follow is unclamped, so the camera should converge exactly.
        expect(viewport.center.x).toBeCloseTo(ent.sprite.position.x, 0);
    });
    test('camera does not move if non-local lock', async () => {
        const { viewport, camera, entities, lockTarget } = createTestEnv();
        const ent = new MockPhysicsEntity();
        ent.setCameraLock(CameraLockPriority.SuggestedLockNonLocal);
        entities.next([ent]);
        expect((await lockTarget)?.target).toEqual(ent);

        settleCamera(camera);
        expect(viewport.moveCenter).not.toHaveBeenCalled();
    });

    test('camera ignores lock once the user takes control', async () => {
        const { viewport, camera, entities, lockTarget } = createTestEnv();
        const ent = new MockPhysicsEntity();
        ent.setCameraLock(CameraLockPriority.SuggestedLockLocal);
        entities.next([ent]);
        expect((await lockTarget)?.target).toEqual(ent);

        settleCamera(camera);
        expect(viewport.moveCenter).toHaveBeenCalled();

        // A genuine drag hands control to the user; the camera must stop following.
        viewport.emit('moved', { type: "drag" });
        const callsBefore = viewport.moveCenter.mock.calls.length;
        settleCamera(camera);
        expect(viewport.moveCenter.mock.calls.length).toBe(callsBefore);
    });
    test('camera moves to a higher priority target', async () => {
        const { viewport, camera, entities, lockTarget } = createTestEnv();
        const entLower = new MockPhysicsEntity();
        const entHigher = new MockPhysicsEntity();
        entLower.setCameraLock(CameraLockPriority.SuggestedLockLocal);
        entities.next([entLower, entHigher]);
        expect((await lockTarget)?.target).toBe(entLower);
        settleCamera(camera);
        expect(viewport.center.x).toBeCloseTo(entLower.sprite.position.x, 0);

        const nextLockTarget = getFinalValue(camera.lockTarget);
        entHigher.setCameraLock(CameraLockPriority.LockIfNotLocalPlayer);
        expect((await nextLockTarget)?.target).toBe(entHigher);

        settleCamera(camera);
        expect(viewport.center.x).toBeCloseTo(entHigher.sprite.position.x, 0);
    });

    test('camera moves to a lower priority target when the higher cancels', async () => {
        const { viewport, camera, entities, lockTarget } = createTestEnv();
        const entLower = new MockPhysicsEntity();
        const entHigher = new MockPhysicsEntity();
        entLower.setCameraLock(CameraLockPriority.SuggestedLockLocal);
        entHigher.setCameraLock(CameraLockPriority.LockIfNotLocalPlayer);
        entities.next([entLower, entHigher]);
        expect((await lockTarget)?.target).toBe(entHigher);

        settleCamera(camera);
        expect(viewport.center.x).toBeCloseTo(entHigher.sprite.position.x, 0);

        const nextLockTarget = getFinalValue(camera.lockTarget);
        entHigher.setCameraLock(CameraLockPriority.NoLock);
        expect((await nextLockTarget)?.target).toEqual(entLower);
        settleCamera(camera);
        expect(viewport.center.x).toBeCloseTo(entLower.sprite.position.x, 0);
    });
});
