import { jest } from "@jest/globals";
import { EventEmitter } from "events";

export class MockViewport extends EventEmitter {
    public screenHeight = 1080;
    public scale = { x: 1, y: 1 };
    private _center = { x: 0, y: 0 };

    constructor() {
        super();
    }

    // pixi-viewport's moveCenter accepts either (x, y) or a Point. Track the
    // resulting centre so tests can assert the camera converges on its target.
    public moveCenter = jest.fn((x: number | { x: number; y: number }, y?: number) => {
        if (typeof x === "number" && typeof y === "number") {
            this._center = { x, y };
        } else if (typeof x === "object") {
            this._center = { x: x.x, y: x.y };
        }
    });

    public get center() {
        return this._center;
    }
}
