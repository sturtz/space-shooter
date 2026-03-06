import { Game } from "./game/Game";

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
