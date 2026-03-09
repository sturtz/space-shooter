// === Procedural Web Audio sound effects ===

import type { MusicTrack } from "../utils/SaveManager";

/** Track metadata: file path + BPM for beat sync */
const TRACK_INFO: Record<MusicTrack, { src: string; bpm: number; beatOffset: number }> = {
  fire: { src: "./assets/sounds/fire.mp3", bpm: 100, beatOffset: 1.2 },
  chill: { src: "./assets/sounds/chill.mp3", bpm: 130, beatOffset: 0.0 },
  trap: { src: "./assets/sounds/trap.mp3", bpm: 130, beatOffset: 0.0 },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private masterGain: GainNode | null = null;

  // Dedicated sub-gain for procedural cone synth layers.
  private coneTrackGain: GainNode | null = null;

  // Background music — loops continuously through ALL game states
  private musicEl: HTMLAudioElement;
  private musicStarted = false;
  private currentTrack: MusicTrack = "fire";

  private muted = false;
  private volumeBeforeMute = 0.07;

  // Cone-attack music track state — synced to music currentTime
  private coneTrackPlaying = false;
  private coneTrackTimer: number | null = null;
  private coneTrackNodes: { stop: () => void }[] = [];
  private coneBeatCallback: (() => void) | null = null;
  private coneBeatIndex = 0;

  // Music-synced beat tracking (updated on track switch)
  private musicBPM = 100;
  private beatOffset = 0;
  private lastMusicBeat = -1;

  constructor() {
    this.musicEl = new Audio(TRACK_INFO.fire.src);
    this.musicEl.loop = true;
    this.musicEl.volume = 0.05;

    // Wire mute toggle immediately
    const icon = document.getElementById("volume-icon") as HTMLImageElement | null;
    if (icon) icon.addEventListener("click", () => this.toggleMute());
  }

  /** Initialize audio context + start music. Call on first user interaction. */
  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.2;
      this.masterGain.connect(this.ctx.destination);

      this.coneTrackGain = this.ctx.createGain();
      this.coneTrackGain.gain.value = 1;
      this.coneTrackGain.connect(this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio not available:", e);
    }
    if (!this.musicStarted) {
      this.musicStarted = true;
      this.musicEl.play().catch(() => {});
    }

    // Wire up volume slider if present
    const slider = document.getElementById("music-volume") as HTMLInputElement | null;
    if (slider) {
      slider.value = String(this.musicEl.volume);
      slider.addEventListener("input", () => {
        if (this.muted) this.muted = false;
        const icon = document.getElementById("volume-icon") as HTMLImageElement | null;
        if (icon) icon.src = "./assets/items/volume-on.svg";
        this.setMusicVolume(parseFloat(slider.value));
      });
    }
  }

  // ── Track switching ────────────────────────────────────────────

  /** Get the currently playing track name */
  get track(): MusicTrack {
    return this.currentTrack;
  }

  /** Get available track names */
  get availableTracks(): MusicTrack[] {
    return ["fire", "chill", "trap"];
  }

  /** Switch to a different music track. Preserves volume and playback state. */
  switchTrack(track: MusicTrack) {
    if (track === this.currentTrack) return;

    const info = TRACK_INFO[track];
    const wasPlaying = !this.musicEl.paused;
    const vol = this.musicEl.volume;

    // Stop cone track scheduling before swapping audio
    const hadCone = this.coneTrackPlaying;
    const savedCallback = this.coneBeatCallback;
    if (hadCone) this.stopConeTrack();

    // Swap audio source
    this.musicEl.pause();
    this.musicEl.src = info.src;
    this.musicEl.loop = true;
    this.musicEl.volume = vol;
    this.musicEl.currentTime = 0;

    this.currentTrack = track;
    this.musicBPM = info.bpm;
    this.beatOffset = info.beatOffset;

    if (wasPlaying || this.musicStarted) {
      this.musicEl.play().catch(() => {});
    }

    // Restart cone track with new BPM if it was running
    if (hadCone && savedCallback) {
      this.startConeTrack(savedCallback);
    }
  }

  /** Apply saved preferences (track + volume). Call after init. */
  applyPreferences(track: MusicTrack, volume: number) {
    this.setMusicVolume(volume);
    if (track !== this.currentTrack) {
      this.switchTrack(track);
    }
  }

  // ── Music playback controls ────────────────────────────────────

  /** Pause background music */
  stopMenuMusic() {
    this.musicEl.pause();
  }

  /** Resume background music */
  resumeMenuMusic() {
    if (this.musicStarted) {
      this.musicEl.play().catch(() => {});
    }
  }

  /** Set music volume (0–1) */
  setMusicVolume(v: number) {
    this.musicEl.volume = Math.max(0, Math.min(1, v));
    if (v > 0) this.volumeBeforeMute = v;
  }

  /** Get current music volume */
  getMusicVolume(): number {
    return this.musicEl.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    const icon = document.getElementById("volume-icon") as HTMLImageElement | null;
    const slider = document.getElementById("music-volume") as HTMLInputElement | null;
    if (this.muted) {
      this.volumeBeforeMute = this.musicEl.volume;
      this.musicEl.volume = 0;
      if (this.masterGain) this.masterGain.gain.value = 0;
      if (icon) icon.src = "./assets/items/volume-off.svg";
      if (slider) slider.value = "0";
    } else {
      this.musicEl.volume = this.volumeBeforeMute;
      if (this.masterGain) this.masterGain.gain.value = this.volumeBeforeMute;
      if (icon) icon.src = "./assets/items/volume-on.svg";
      if (slider) slider.value = String(this.volumeBeforeMute);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private get ready(): boolean {
    return this.initialized && this.ctx !== null && this.masterGain !== null;
  }

  // ── SFX ────────────────────────────────────────────────────────

  /** Short laser "pew" for player shooting */
  playShoot() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  /** Explosion sound for enemy death */
  playExplosion() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(80, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.15);
    subGain.gain.setValueAtTime(0.25, ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    sub.connect(subGain);
    subGain.connect(this.masterGain!);
    sub.start(ctx.currentTime);
    sub.stop(ctx.currentTime + 0.15);
  }

  /** Coin pickup jingle */
  playCoinPickup() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(900, ctx.currentTime + 0.04);
    osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  /** Mothership hit — alarm-like warning */
  playMothershipHit() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Upgrade purchase */
  playUpgrade() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /** EMP/Flashbang burst when dashing with upgrade */
  playFlashbang() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(2000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(60, ctx.currentTime);
    subGain.gain.setValueAtTime(0.2, ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    sub.connect(subGain);
    subGain.connect(this.masterGain!);
    sub.start(ctx.currentTime);
    sub.stop(ctx.currentTime + 0.15);
  }

  /** Player took HP damage */
  playPlayerHit() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Dash whoosh */
  playDash() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  /** Error buzz when can't afford */
  playError() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.setValueAtTime(80, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  /** UI click sound for menu interactions */
  playClick() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }

  // ── Cone track (beat-synced weapon firing) ─────────────────────

  get isConeTrackPlaying(): boolean {
    return this.coneTrackPlaying;
  }

  startConeTrack(onBeat?: () => void) {
    if (!this.ready) return;
    if (this.coneTrackPlaying) return;
    this.coneTrackPlaying = true;
    this.coneBeatCallback = onBeat ?? null;
    this.coneBeatIndex = 0;
    this.lastMusicBeat = -1;
    this.scheduleMusicSyncLoop();
  }

  stopConeTrack() {
    this.coneTrackPlaying = false;
    this.coneBeatCallback = null;
    if (this.coneTrackTimer !== null) {
      cancelAnimationFrame(this.coneTrackTimer);
      this.coneTrackTimer = null;
    }
    for (const n of this.coneTrackNodes) {
      try {
        n.stop();
      } catch (_e) {
        /* already stopped */
      }
    }
    this.coneTrackNodes = [];
  }

  /**
   * Polls music currentTime every frame to detect beat crossings.
   * Fires the cone beat callback on every even beat (every 2 beats).
   * BPM and offset are updated when track changes.
   */
  private scheduleMusicSyncLoop() {
    if (!this.coneTrackPlaying || !this.ready) return;

    const beatDuration = 60 / this.musicBPM;
    const musicTime = this.musicEl.currentTime - this.beatOffset;
    const currentBeat = Math.floor(musicTime / beatDuration);

    if (currentBeat > this.lastMusicBeat && currentBeat >= 0) {
      this.lastMusicBeat = currentBeat;
      this.coneBeatIndex = currentBeat;

      if (this.coneTrackNodes.length > 50) {
        this.coneTrackNodes = this.coneTrackNodes.slice(-30);
      }

      if (this.coneBeatCallback && currentBeat % 2 === 0) {
        this.coneBeatCallback();
      }
    }

    this.coneTrackTimer = requestAnimationFrame(() => this.scheduleMusicSyncLoop());
  }

  /** One-shot cone blast SFX */
  playConeBlast() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, t);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.28);
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(60, t);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.2);
    subGain.gain.setValueAtTime(0.2, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    sub.connect(subGain);
    subGain.connect(this.masterGain!);
    sub.start(t);
    sub.stop(t + 0.28);
  }
}
