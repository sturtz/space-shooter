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

// ── Game loop with visibility/focus handling ─────────────────────
let lastTime = 0;
const MAX_DT = 1 / 30; // Cap delta time to prevent spiral of death
let rafId = 0;
let running = true;

function gameLoop(timestamp: number) {
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  manager.update(dt);
  manager.render();

  if (running) {
    rafId = requestAnimationFrame(gameLoop);
  }
}

function startLoop() {
  if (running) return;
  running = true;
  // Resume audio (music + AudioContext)
  manager.audio.onResume();
  // Resume p5.js background
  if (typeof (window as any).loop === "function") {
    (window as any).loop();
  }
  rafId = requestAnimationFrame((timestamp) => {
    lastTime = timestamp; // Reset lastTime to avoid huge dt spike
    rafId = requestAnimationFrame(gameLoop);
  });
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  // Suspend audio (music + AudioContext) to save CPU/battery
  manager.audio.onSuspend();
  // Pause p5.js background rendering
  if (typeof (window as any).noLoop === "function") {
    (window as any).noLoop();
  }
}

// ── Visibility change: pause everything when tab/app is hidden ───
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else {
    startLoop();
  }
});

// Also handle window blur/focus for some mobile browsers that don't
// fire visibilitychange reliably (e.g. switching apps on iOS)
window.addEventListener("blur", () => {
  stopLoop();
});

window.addEventListener("focus", () => {
  if (document.hidden) return; // Let visibilitychange handle it
  startLoop();
});

// Start
requestAnimationFrame((timestamp) => {
  lastTime = timestamp;
  rafId = requestAnimationFrame(gameLoop);
});
