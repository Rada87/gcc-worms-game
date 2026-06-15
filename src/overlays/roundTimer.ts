import { ColorSource, Container, Graphics, Text, Ticker } from "pixi.js";
import { drawPixelBox, LargeTextStyle } from "../mixins/styles";
import { Observable } from "rxjs";

const PANIC_THRESHOLD_SECS = 5;

/**
 * Displays a round timer duing gameplay.
 */
export class RoundTimer {
  private readonly gfx: Graphics;
  public readonly container: Container;
  private isPanic = false;
  private blinkAccumulatorMs = 0;

  constructor(
    private readonly position: Observable<{ x: number; y: number }>,
    private readonly roundTimeRemaining: Observable<number>,
    private readonly currentTeamColors: Observable<
      { bg: ColorSource; fg: ColorSource } | undefined
    >,
  ) {
    this.gfx = new Graphics({});
    const text = new Text({
      text: "00",
      style: {
        ...LargeTextStyle,
        align: "center",
      },
    });
    const { width, height } = text;
    this.container = new Container();
    this.container.addChild(this.gfx);
    this.container.addChild(text);

    this.roundTimeRemaining.subscribe((timeSeconds) => {
      text.text =
        timeSeconds === 0 ? "--" : timeSeconds.toString().padStart(2, "0");
      this.isPanic = timeSeconds > 0 && timeSeconds <= PANIC_THRESHOLD_SECS;
      if (!this.isPanic) {
        text.style.fill = 0xffffff;
        this.blinkAccumulatorMs = 0;
      }
    });

    // Blink red during the final countdown.
    Ticker.shared.add((ticker) => {
      if (!this.isPanic) {
        return;
      }
      this.blinkAccumulatorMs += ticker.deltaMS;
      if (this.blinkAccumulatorMs >= 300) {
        this.blinkAccumulatorMs = 0;
        text.style.fill = text.style.fill === 0xff4422 ? 0xffffff : 0xff4422;
      }
    });

    this.currentTeamColors.subscribe((color) => {
      this.gfx.clear();
      drawPixelBox(this.gfx, -8, 8, width + 16, height, color?.fg);
    });

    this.position.subscribe((pos) => {
      this.container.position.set(pos.x, pos.y);
    });
  }
}
