import { Vec2, vec2 } from "../utils/Math";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/Constants";

// Keys that the game uses — only these should have their default browser behavior blocked
const GAME_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  " ",
]);

export class InputManager {
  keys: Set<string> = new Set();
  mousePos: Vec2 = vec2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  mouseDown: boolean = false;
  private canvas: HTMLCanvasElement;

  // Touch / Mobile support
  isTouchDevice: boolean = false;
  dashRequested: boolean = false;

  // Touch follow: tracks the active touch position (player moves toward it)
  touchTargetActive: boolean = false;
  private touchMoveId: number | null = null;

  // Right side touch for dash
  private touchDashId: number | null = null;

  // Store bound handlers for cleanup
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onContextMenu: (e: Event) => void;
  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private onTouchEnd: (e: TouchEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      this.keys.add(key);
      if (GAME_KEYS.has(key)) {
        e.preventDefault();
      }
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };

    this.onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / rect.width;
      const scaleY = GAME_HEIGHT / rect.height;
      this.mousePos = vec2(
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY,
      );
    };

    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = true;
    };

    this.onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
    };

    this.onContextMenu = (e: Event) => e.preventDefault();

    // === TOUCH HANDLERS ===
    // Controls: touch anywhere (except dash zone) → player follows that position.
    // Right 12% of the canvas (game-coord x > GAME_WIDTH * 0.88) → dash button.

    this.onTouchStart = (e: TouchEvent) => {
      this.isTouchDevice = true;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const rect = canvas.getBoundingClientRect();
        const scaleX = GAME_WIDTH / rect.width;
        const scaleY = GAME_HEIGHT / rect.height;
        const gameX = (touch.clientX - rect.left) * scaleX;
        const gameY = (touch.clientY - rect.top) * scaleY;

        const isDashArea = gameX > GAME_WIDTH * 0.88;

        if (isDashArea) {
          // Right-side tap = dash
          if (this.touchDashId === null) {
            this.touchDashId = touch.identifier;
            this.dashRequested = true;
          }
        } else if (this.touchMoveId === null) {
          // Primary movement touch — update mousePos so Player.move() can use it
          this.touchMoveId = touch.identifier;
          this.mousePos = vec2(gameX, gameY);
          this.touchTargetActive = true;
          e.preventDefault();
        }
      }
    };

    this.onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.identifier === this.touchMoveId) {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const scaleX = GAME_WIDTH / rect.width;
          const scaleY = GAME_HEIGHT / rect.height;
          this.mousePos = vec2(
            (touch.clientX - rect.left) * scaleX,
            (touch.clientY - rect.top) * scaleY,
          );
        }
      }
    };

    this.onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.identifier === this.touchMoveId) {
          this.touchMoveId = null;
          this.touchTargetActive = false;
        }
        if (touch.identifier === this.touchDashId) {
          this.touchDashId = null;
        }
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("mouseup", this.onMouseUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);

    // Touch events
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  /** Remove all event listeners — call when tearing down the game */
  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.canvas.removeEventListener("touchcancel", this.onTouchEnd);
  }

  /** Consume the dash request (call once per frame after processing) */
  consumeDash(): boolean {
    if (this.dashRequested) {
      this.dashRequested = false;
      return true;
    }
    return false;
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  get moveDirection(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.isKeyDown("w") || this.isKeyDown("arrowup")) y -= 1;
    if (this.isKeyDown("s") || this.isKeyDown("arrowdown")) y += 1;
    if (this.isKeyDown("a") || this.isKeyDown("arrowleft")) x -= 1;
    if (this.isKeyDown("d") || this.isKeyDown("arrowright")) x += 1;

    const len = Math.sqrt(x * x + y * y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return vec2(x, y);
  }

  get isFiring(): boolean {
    // On mobile: auto-shoot is always active (handled by Game.ts for aiming)
    return this.mouseDown || this.isKeyDown(" ") || this.isTouchDevice;
  }
}
