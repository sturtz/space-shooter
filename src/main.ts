import { Game } from "./game/Game";

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

const canvas = document.getElementById("game") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element not found!");

const game = new Game(canvas);

// Game loop
let lastTime = 0;
const MAX_DT = 1 / 30; // Cap delta time to prevent spiral of death

function gameLoop(timestamp: number) {
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  game.update(dt);
  game.render();

  requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  requestAnimationFrame(gameLoop);
});

function handleResize() {
  game.renderer.resize();
}

window.addEventListener("resize", handleResize);

// orientationchange fires BEFORE resize on most mobile browsers
// — wait for dimensions to settle before recalculating
window.addEventListener("orientationchange", () => {
  setTimeout(handleResize, 150);
});
