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

/** Virtual joystick state (mobile only) */
export interface JoystickState {
  active: boolean;
  /** Center of the joystick base (game coords) */
  baseX: number;
  baseY: number;
  /** Current thumb position (game coords) */
  thumbX: number;
  thumbY: number;
  /** Normalized direction (-1 to 1 on each axis) */
  dirX: number;
  dirY: number;
  /** How far the thumb is from center (0–1) */
  magnitude: number;
}

export class InputManager {
  keys: Set<string> = new Set();
  mousePos: Vec2 = vec2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  mouseDown: boolean = false;
  private canvas: HTMLCanvasElement;

  /** Coordinate transform — set by Game from Renderer.gameOffsetX/Y/gameScale */
  private _gameOffsetX = 0;
  private _gameOffsetY = 0;
  private _gameScale = 1;

  /** Call after renderer.resize() to keep input mapping in sync */
  setCoordTransform(offsetX: number, offsetY: number, scale: number) {
    this._gameOffsetX = offsetX;
    this._gameOffsetY = offsetY;
    this._gameScale = scale;
  }

  // Touch / Mobile support
  isTouchDevice: boolean = false;
  dashRequested: boolean = false;

  // Touch follow: tracks the active touch position (player moves toward it)
  touchTargetActive: boolean = false;
  private touchMoveId: number | null = null;

  // Right side touch for dash
  private touchDashId: number | null = null;

  // Virtual joystick (floating — appears where left-side touch starts)
  joystick: JoystickState = {
    active: false,
    baseX: 0,
    baseY: 0,
    thumbX: 0,
    thumbY: 0,
    dirX: 0,
    dirY: 0,
    magnitude: 0,
  };
  readonly JOYSTICK_RADIUS = 50; // max distance thumb can move from base (game coords)
  readonly JOYSTICK_DEAD_ZONE = 0.1; // ignore tiny movements

  // Raw screen-space start position of the joystick touch (CSS pixels)
  private _startCssX = 0;
  private _startCssY = 0;

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
      this.mousePos = vec2(
        (e.clientX - this._gameOffsetX) / this._gameScale,
        (e.clientY - this._gameOffsetY) / this._gameScale
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
    // Left half of screen → floating joystick (move)
    // Right 25% + bottom 40% → dash button
    // Everything else on right → ignored (auto-fire handles shooting)

    this.onTouchStart = (e: TouchEvent) => {
      this.isTouchDevice = true;
      e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const { gameX, gameY } = this.touchToGame(touch);

        // Dash zone: right 25% of screen + bottom 40%
        const isDashArea = gameX > GAME_WIDTH * 0.75 && gameY > GAME_HEIGHT * 0.6;

        if (isDashArea) {
          if (this.touchDashId === null) {
            this.touchDashId = touch.identifier;
            this.dashRequested = true;
          }
        } else if (gameX < GAME_WIDTH * 0.75 || gameY < GAME_HEIGHT * 0.6) {
          // Most of screen → joystick (excludes only dash zone)
          if (this.touchMoveId === null) {
            this.touchMoveId = touch.identifier;
            this.touchTargetActive = true;

            // Remember where the thumb landed in CSS pixels — direction is relative to this
            this._startCssX = touch.clientX;
            this._startCssY = touch.clientY;

            // Place joystick base at touch point (game coords for rendering)
            const pad = this.JOYSTICK_RADIUS + 16;
            const clampedX = Math.max(pad, Math.min(GAME_WIDTH - pad, gameX));
            const clampedY = Math.max(pad, Math.min(GAME_HEIGHT - pad, gameY));
            this.joystick.active = true;
            this.joystick.baseX = clampedX;
            this.joystick.baseY = clampedY;
            this.joystick.thumbX = gameX;
            this.joystick.thumbY = gameY;
            this.joystick.dirX = 0;
            this.joystick.dirY = 0;
            this.joystick.magnitude = 0;
            // Also set mousePos for compatibility
            this.mousePos = vec2(gameX, gameY);
          }
        }
      }
    };

    this.onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.identifier === this.touchMoveId) {
          // ── Direction from raw CSS pixels (where thumb actually is on screen) ──
          const cssDx = touch.clientX - this._startCssX;
          const cssDy = touch.clientY - this._startCssY;
          const cssDist = Math.sqrt(cssDx * cssDx + cssDy * cssDy);
          const cssClamped = Math.min(cssDist, this.JOYSTICK_RADIUS);

          // Normalized direction and magnitude from screen-space
          const norm = cssClamped / this.JOYSTICK_RADIUS;
          if (cssDist > 0 && norm > this.JOYSTICK_DEAD_ZONE) {
            this.joystick.dirX = cssDx / cssDist;
            this.joystick.dirY = cssDy / cssDist;
            this.joystick.magnitude = norm;
          } else {
            this.joystick.dirX = 0;
            this.joystick.dirY = 0;
            this.joystick.magnitude = 0;
          }

          // ── Thumb position in game coords (for rendering only) ──
          const gameClamped = Math.min(cssDist / this._gameScale, this.JOYSTICK_RADIUS);
          if (cssDist > 0) {
            this.joystick.thumbX = this.joystick.baseX + (cssDx / cssDist) * gameClamped;
            this.joystick.thumbY = this.joystick.baseY + (cssDy / cssDist) * gameClamped;
          }

          // Update mousePos for compatibility (aim direction)
          const { gameX, gameY } = this.touchToGame(touch);
          this.mousePos = vec2(gameX, gameY);
        }
      }
    };

    this.onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.identifier === this.touchMoveId) {
          this.touchMoveId = null;
          this.touchTargetActive = false;
          this.joystick.active = false;
          this.joystick.dirX = 0;
          this.joystick.dirY = 0;
          this.joystick.magnitude = 0;
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

  /** Convert a Touch event to game coordinates (unclamped — side zones valid for joystick) */
  private touchToGame(touch: Touch): { gameX: number; gameY: number } {
    return {
      gameX: (touch.clientX - this._gameOffsetX) / this._gameScale,
      gameY: (touch.clientY - this._gameOffsetY) / this._gameScale,
    };
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
