import { Renderer } from "../rendering/Renderer";
import { AudioManager } from "../audio/AudioManager";
import { UpgradeManager } from "../upgrades/UpgradeManager";
import { SaveData, loadGame, saveGame } from "../utils/SaveManager";
import { MenuScreen } from "./MenuScreen";
import { Game } from "./Game";
import { UpgradeScreen } from "../ui/UpgradeScreen";

export type ScreenName = "menu" | "game" | "upgrade";

/**
 * Manages three dedicated canvases (menu, game, upgrade).
 * Only one canvas is visible at a time. Shared resources
 * (save data, audio, upgrades) are owned here and passed down.
 */
export class ScreenManager {
  // Shared resources
  save: SaveData;
  audio: AudioManager;
  upgrades: UpgradeManager;

  // Canvases + renderers
  menuCanvas: HTMLCanvasElement;
  gameCanvas: HTMLCanvasElement;
  upgradeCanvas: HTMLCanvasElement;
  menuRenderer: Renderer;
  gameRenderer: Renderer;
  upgradeRenderer: Renderer;

  // Screens
  menuScreen: MenuScreen;
  gameScreen: Game;
  upgradeScreen: UpgradeScreen;

  // Current active screen
  active: ScreenName = "menu";

  constructor(
    menuCanvas: HTMLCanvasElement,
    gameCanvas: HTMLCanvasElement,
    upgradeCanvas: HTMLCanvasElement
  ) {
    this.menuCanvas = menuCanvas;
    this.gameCanvas = gameCanvas;
    this.upgradeCanvas = upgradeCanvas;

    // Shared resources
    this.save = loadGame();
    this.audio = new AudioManager();
    this.upgrades = new UpgradeManager(this.save);

    // Each canvas gets its own Renderer
    this.menuRenderer = new Renderer(menuCanvas);
    this.gameRenderer = new Renderer(gameCanvas);
    this.upgradeRenderer = new Renderer(upgradeCanvas);

    // Create screens — each receives its renderer + shared resources
    this.menuScreen = new MenuScreen(this.menuRenderer, this);
    this.gameScreen = new Game(this.gameCanvas, this.gameRenderer, this);
    this.upgradeScreen = new UpgradeScreen(this.upgradeRenderer, this);

    // Custom cursor
    const customCursor = document.querySelector(".custom-cursor") || null;
    document.addEventListener("mousemove", (e) => {
      if (customCursor && customCursor instanceof HTMLElement) {
        customCursor.style.top = e.clientY + "px";
        customCursor.style.left = e.clientX + "px";
      }
    });

    // Show initial screen
    if (!this.save.tutorialSeen) {
      this.show("menu"); // MenuScreen handles tutorial internally
    } else {
      this.show("menu");
    }

    // Handle window resize — resize all renderers
    window.addEventListener("resize", () => {
      this.menuRenderer.resize();
      this.gameRenderer.resize();
      this.upgradeRenderer.resize();
    });
  }

  /** Switch to a screen — hides current, shows new */
  show(screen: ScreenName) {
    this.active = screen;

    // Hide all canvases
    this.menuCanvas.style.display = "none";
    this.gameCanvas.style.display = "none";
    this.upgradeCanvas.style.display = "none";

    // Show active canvas
    switch (screen) {
      case "menu":
        this.menuCanvas.style.display = "block";
        this.menuRenderer.resize();
        break;
      case "game":
        this.gameCanvas.style.display = "block";
        this.gameRenderer.resize();
        break;
      case "upgrade":
        this.upgradeCanvas.style.display = "block";
        this.upgradeRenderer.resize();
        this.upgradeScreen.refresh();
        break;
    }
  }

  /** Called from MenuScreen when player clicks Start */
  startGame() {
    this.audio.init();
    // Apply saved music preferences (track + volume)
    this.audio.applyPreferences(this.save.musicTrack, this.save.musicVolume);
    this.show("game");
    this.gameScreen.startRun();
  }

  /** Called from Game when round ends — go to upgrade screen */
  goToUpgradeScreen() {
    this.audio.stopConeTrack();
    saveGame(this.save);
    this.show("upgrade");
  }

  /** Called from UpgradeScreen when player clicks Start Run */
  startRunFromUpgrade() {
    this.show("game");
    this.gameScreen.startRun();
  }

  /** Called from UpgradeScreen when player clicks Menu */
  goToMenu() {
    this.show("menu");
  }

  /** Update the active screen */
  update(dt: number) {
    switch (this.active) {
      case "menu":
        this.menuScreen.update(dt);
        break;
      case "game":
        this.gameScreen.update(dt);
        break;
      case "upgrade":
        this.upgradeScreen.update(dt);
        break;
    }
  }

  /** Render the active screen */
  render() {
    switch (this.active) {
      case "menu":
        this.menuScreen.render();
        break;
      case "game":
        this.gameScreen.render();
        break;
      case "upgrade":
        this.upgradeScreen.render();
        break;
    }
  }
}
