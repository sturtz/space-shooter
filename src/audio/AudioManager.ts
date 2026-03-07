// === Procedural Web Audio sound effects ===

export class AudioManager {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private masterGain: GainNode | null = null;

  // Cone-attack music track state
  private coneTrackPlaying = false;
  private coneTrackTimer: number | null = null;
  private coneTrackNodes: { stop: () => void }[] = [];
  private coneBeatCallback: (() => void) | null = null;
  private coneBeatIndex = 0;

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio not available:", e);
    }
  }

  private get ready(): boolean {
    return this.initialized && this.ctx !== null && this.masterGain !== null;
  }

  /** Short laser "pew" for player shooting */
  playShoot() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
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

    // Noise burst via oscillator
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

    // Sub-bass thump
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
    // Bright zap burst
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
    // Sub thump
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

  // =========================================================================
  //  CONE ATTACK MUSIC TRACK — Dark, dreary, spacey, spooky
  //  75 BPM (0.8s per beat) — slow, ominous pulse.
  //  Primary layers: deep kick, sub drone, ghostly hat, dark pad, void sweep
  //  Secondary track: variety element every 2-3 beats (chimes, stingers, etc.)
  //  onBeat callback fires every beat for cone weapon sync.
  // =========================================================================

  get isConeTrackPlaying(): boolean {
    return this.coneTrackPlaying;
  }

  startConeTrack(onBeat?: () => void) {
    if (!this.ready) return;
    if (this.coneTrackPlaying) return;
    this.coneTrackPlaying = true;
    this.coneBeatCallback = onBeat ?? null;
    this.coneBeatIndex = 0;
    this.scheduleConeLoop();
  }

  stopConeTrack() {
    this.coneTrackPlaying = false;
    this.coneBeatCallback = null;
    if (this.coneTrackTimer !== null) {
      clearTimeout(this.coneTrackTimer);
      this.coneTrackTimer = null;
    }
    for (const n of this.coneTrackNodes) {
      try { n.stop(); } catch (_) { /* already stopped */ }
    }
    this.coneTrackNodes = [];
  }

  // ---- internal scheduling -------------------------------------------------

  private scheduleConeLoop() {
    if (!this.coneTrackPlaying || !this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const BEAT = 60 / 40; // 40 BPM = 1.5s per beat — very slow & ominous

    // Node cleanup
    if (this.coneTrackNodes.length > 50) {
      this.coneTrackNodes = this.coneTrackNodes.slice(-30);
    }

    // Fire beat callback (cone weapon sync)
    if (this.coneBeatCallback) {
      this.coneBeatCallback();
    }

    const bi = this.coneBeatIndex;

    // --- Primary Track ---

    // Layer 1: Deep muffled kick on every beat
    this.scheduleDeepKick(now);

    // Layer 2: Sub drone (continuous low rumble, changes note every 4 beats)
    this.scheduleSubDrone(now, BEAT);

    // Layer 3: Ghostly hi-hat (sparse — every other beat only)
    if (bi % 2 === 0) {
      this.scheduleGhostlyHat(now);
    }

    // Layer 4: Dark eerie pad (slow attack minor chord, sustains across beat)
    this.scheduleDarkPad(now, BEAT);

    // Layer 5: Void sweep (descending filter — every 4th beat)
    if (bi % 4 === 0) {
      this.scheduleVoidSweep(now, BEAT * 3);
    }

    // --- Secondary Track (variety every 2-3 beats) ---
    // Cycles through different spooky elements
    const secondaryPattern = [0, 0, 1, 0, 2, 0, 0, 3]; // trigger on non-zero
    const secondaryType = secondaryPattern[bi % secondaryPattern.length];
    if (secondaryType > 0) {
      this.scheduleSecondaryElement(now, BEAT, secondaryType);
    }

    this.coneBeatIndex++;

    this.coneTrackTimer = window.setTimeout(() => {
      this.scheduleConeLoop();
    }, BEAT * 1000 - 25);
  }

  /** Deep muffled kick — low sine with slow decay, no click transient */
  private scheduleDeepKick(time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(80, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.25);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, time);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.45);
    this.coneTrackNodes.push(osc);
  }

  /** Sub drone — continuous low rumble, minor key movement */
  private scheduleSubDrone(time: number, beatLen: number) {
    const ctx = this.ctx!;
    // Dark minor riff: A1, Ab1, G1, Ab1 (chromatic descent & return)
    const freqs = [55, 51.91, 49, 51.91]; // A1, Ab1, G1, Ab1
    const freq = freqs[Math.floor(this.coneBeatIndex / 2) % freqs.length];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    // Very slow vibrato for unease
    osc.frequency.linearRampToValueAtTime(freq * 1.005, time + beatLen * 0.5);
    osc.frequency.linearRampToValueAtTime(freq * 0.995, time + beatLen);

    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.1);
    gain.gain.setValueAtTime(0.12, time + beatLen * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.02, time + beatLen * 0.98);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + beatLen + 0.05);
    this.coneTrackNodes.push(osc);
  }

  /** Ghostly hi-hat — very quiet, heavily filtered, long tail */
  private scheduleGhostlyHat(time: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "square";
    osc.frequency.setValueAtTime(4000 + Math.random() * 3000, time);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(6000, time);
    filter.Q.setValueAtTime(8, time); // narrow = ghostly ring

    gain.gain.setValueAtTime(0.03, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15); // long fade

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.18);
    this.coneTrackNodes.push(osc);
  }

  /** Dark pad — detuned minor chord with slow attack, eerie and sustained */
  private scheduleDarkPad(time: number, beatLen: number) {
    const ctx = this.ctx!;
    // A minor: A2(110), C3(130.81), Eb3(155.56) — diminished feel
    const chordFreqs = [110, 130.81, 155.56];
    const padStart = time + 0.02;
    const padDur = beatLen * 0.9;

    for (const freq of chordFreqs) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine"; // pure sine for haunting quality
        osc.frequency.setValueAtTime(freq, padStart);
        osc.detune.setValueAtTime(detune, padStart);

        // Slow attack, sustained, slow fade
        gain.gain.setValueAtTime(0.0, padStart);
        gain.gain.linearRampToValueAtTime(0.025, padStart + padDur * 0.3);
        gain.gain.setValueAtTime(0.025, padStart + padDur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, padStart + padDur);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(padStart);
        osc.stop(padStart + padDur + 0.05);
        this.coneTrackNodes.push(osc);
      }
    }
  }

  /** Void sweep — descending filter sweep, creates a sucking void feel */
  private scheduleVoidSweep(time: number, duration: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(40, time);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2000, time);
    filter.frequency.exponentialRampToValueAtTime(80, time + duration * 0.9);
    filter.Q.setValueAtTime(5, time);
    filter.Q.linearRampToValueAtTime(1, time + duration);

    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + duration * 0.15);
    gain.gain.setValueAtTime(0.05, time + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.95);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + duration);
    this.coneTrackNodes.push(osc);
  }

  /**
   * Secondary variety elements — different spooky sounds on a rotating cycle.
   * type 1: Ghostly chime (high pitched, reverb-like decay)
   * type 2: Dissonant stinger (tritone interval, brief)
   * type 3: Metallic resonance (filtered noise ring)
   */
  private scheduleSecondaryElement(time: number, beatLen: number, type: number) {
    const ctx = this.ctx!;

    if (type === 1) {
      // Ghostly chime — high sine with long decay
      const notes = [880, 1046.5, 784]; // A5, C6, G5 — rotate
      const freq = notes[this.coneBeatIndex % notes.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.linearRampToValueAtTime(freq * 0.99, time + 0.6);
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + 0.65);
      this.coneTrackNodes.push(osc);
    }

    if (type === 2) {
      // Dissonant stinger — tritone (devil's interval)
      const root = 220; // A3
      const tritone = root * 1.414; // ~Eb4
      for (const f of [root, tritone]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, time);
        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.06, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(time);
        osc.stop(time + 0.28);
        this.coneTrackNodes.push(osc);
      }
    }

    if (type === 3) {
      // Metallic resonance — tightly filtered square, ringing
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "square";
      osc.frequency.setValueAtTime(200 + Math.random() * 100, time);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1200, time);
      filter.Q.setValueAtTime(20, time); // high Q = metallic ring
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(time);
      osc.stop(time + 0.55);
      this.coneTrackNodes.push(osc);
    }
  }

  /** One-shot cone blast SFX — dark, muted version */
  playConeBlast() {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;

    // Dark mid-range thud
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

    // Sub impact
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
