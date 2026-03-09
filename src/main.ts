import { ScreenManager } from "./game/ScreenManager";

// Try to lock orientation to landscape on supported devices
try {
  const orientation = screen.orientation as any;
  const lockOrientation =
    orientation?.lock?.bind(orientation) ??
    (screen as any).lockOrientation?.bind(screen) ??
    (screen as any).mozLockOrientation?.bind(screen) ??
    (screen as any).msLockOrientation?.bind(screen);

  if (lockOrientation) {
    lockOrientation("landscape").catch(() => {
      /* not supported or not in fullscreen – overlay handles it */
    });
  }
} catch {
  /* orientation lock not available */
}

const menuCanvas = document.getElementById("menu-canvas") as HTMLCanvasElement;
const gameCanvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const upgradeCanvas = document.getElementById("upgrade-canvas") as HTMLCanvasElement;

if (!menuCanvas || !gameCanvas || !upgradeCanvas) {
  throw new Error("Canvas elements not found!");
}

const manager = new ScreenManager(menuCanvas, gameCanvas, upgradeCanvas);

// Game loop
let lastTime = 0;
const MAX_DT = 1 / 30; // Cap delta time to prevent spiral of death

function gameLoop(timestamp: number) {
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  manager.update(dt);
  manager.render();

  requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  requestAnimationFrame(gameLoop);
});
