/**
 * UpgradeIcons.ts — Canvas-drawn neon-geometric icons for upgrade nodes.
 *
 * Each icon is stroked (no fills except small accent dots) with the branch
 * color and a subtle glow.  All coordinates are relative to the center
 * (x, y) within a radius of `size`.  The unit `u = size / 10`.
 */

const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export function drawUpgradeIcon(
  ctx: CanvasRenderingContext2D,
  nodeId: string,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha: number
): void {
  const draw = ICON_MAP[nodeId];
  if (!draw) {
    // Fallback — draw the node's emoji / character
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px Tektur`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x, y);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  ctx.lineWidth = Math.max(1.5, size / 10);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  draw(ctx, x, y, size, color);

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Per-icon drawing helpers                                           */
/* ------------------------------------------------------------------ */

type IconFn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string
) => void;

/* ═══════════════════ DAMAGE BRANCH (red) ═══════════════════ */

/** dmg_core — "Pulse Amplifier" → Double Chevron */
const drawDoubleChevron: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y - 4 * u);
  ctx.lineTo(x + 1 * u, y);
  ctx.lineTo(x - 3 * u, y + 4 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 0 * u, y - 4 * u);
  ctx.lineTo(x + 4 * u, y);
  ctx.lineTo(x + 0 * u, y + 4 * u);
  ctx.stroke();
};

/** dmg_range — "Expanded Rays" → Concentric Arcs */
const drawConcentricArcs: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  ctx.beginPath();
  ctx.arc(x, y, 2 * u, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 4 * u, -Math.PI / 4, Math.PI / 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 6 * u, -Math.PI / 5, Math.PI / 5);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 0.8 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
};

/** dmg_crit — "Sword Wound" → 4-Point Starburst */
const drawStarburst: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const r = 5 * u;
  const inner = 1.8 * u;

  // Four diamond points at N/S/E/W with inner cross
  ctx.beginPath();
  // North
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + inner, y);
  // East
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + inner);
  // South
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - inner, y);
  // West
  ctx.lineTo(x - r, y);
  ctx.lineTo(x, y - inner);
  ctx.closePath();
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(x, y, 1 * u, 0, TWO_PI);
  ctx.stroke();
};

/** dmg_overclock — "Scythe" → Crescent Arc + Speed Lines */
const drawCrescent: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Thick crescent arc
  const oldLW = ctx.lineWidth;
  ctx.lineWidth = Math.max(2.5, s / 7);
  ctx.beginPath();
  ctx.arc(x, y, 4 * u, -Math.PI * 0.7, Math.PI * 0.3);
  ctx.stroke();
  ctx.lineWidth = oldLW;

  // Speed lines
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 5 * u, y - 1.5 * u);
  ctx.lineTo(x - 2 * u, y - 1.5 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 5.5 * u, y + 0.5 * u);
  ctx.lineTo(x - 2.5 * u, y + 0.5 * u);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, s / 10);
};

/* ═══════════════════ WEAPONS BRANCH (yellow) ═══════════════════ */

/** guns_missile — "Rocket Pods" → Triangle Rocket */
const drawRocket: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Main triangle
  ctx.beginPath();
  ctx.moveTo(x, y - 5 * u);
  ctx.lineTo(x + 3 * u, y + 3 * u);
  ctx.lineTo(x - 3 * u, y + 3 * u);
  ctx.closePath();
  ctx.stroke();

  // Exhaust V
  ctx.beginPath();
  ctx.moveTo(x - 1.5 * u, y + 3 * u);
  ctx.lineTo(x, y + 5.5 * u);
  ctx.lineTo(x + 1.5 * u, y + 3 * u);
  ctx.stroke();

  // Fins
  ctx.beginPath();
  ctx.moveTo(x - 4 * u, y + 1 * u);
  ctx.lineTo(x - 3 * u, y + 1 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 3 * u, y + 1 * u);
  ctx.lineTo(x + 4 * u, y + 1 * u);
  ctx.stroke();
};

/** guns_bolt — "Hypersonic Bolt" → Arrow with Pierce Lines */
const drawPierceArrow: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Shaft
  ctx.beginPath();
  ctx.moveTo(x - 4 * u, y);
  ctx.lineTo(x + 5 * u, y);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(x + 5 * u, y);
  ctx.lineTo(x + 1 * u, y - 3 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 5 * u, y);
  ctx.lineTo(x + 1 * u, y + 3 * u);
  ctx.stroke();

  // Pierce lines (dimmer, dashed)
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x + 2 * u, y - 1.5 * u);
  ctx.lineTo(x + 7 * u, y - 1.5 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 2 * u, y + 1.5 * u);
  ctx.lineTo(x + 7 * u, y + 1.5 * u);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
};

/** guns_chain — "Ringed Beam" → Lightning Zigzag */
const drawLightning: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  ctx.beginPath();
  ctx.moveTo(x - 1 * u, y - 5 * u);
  ctx.lineTo(x + 2 * u, y - 1 * u);
  ctx.lineTo(x - 1 * u, y + 0.5 * u);
  ctx.lineTo(x + 2 * u, y + 5 * u);
  ctx.stroke();

  // Small circle at top
  ctx.beginPath();
  ctx.arc(x - 1 * u, y - 5 * u, 0.8 * u, 0, TWO_PI);
  ctx.stroke();
};

/** guns_barrage — "Bombing Run" → Cluster of Circles */
const drawCluster: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const r = 1.5 * u;
  const d = 3 * u;

  // Four circles in diamond
  const positions = [
    [x, y - d],
    [x - d, y],
    [x + d, y],
    [x, y + d],
  ];

  for (const [cx, cy] of positions) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.stroke();

    // Connect line from center
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
};

/* ═══════════════════ ECONOMY BRANCH (orange) ═══════════════════ */

/** econ_duration — "Extended Ops" → Hourglass */
const drawHourglass: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Top triangle
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y - 5 * u);
  ctx.lineTo(x + 3 * u, y - 5 * u);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.stroke();

  // Bottom triangle
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y + 5 * u);
  ctx.lineTo(x + 3 * u, y + 5 * u);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.stroke();

  // Horizontal lines at top and bottom
  ctx.beginPath();
  ctx.moveTo(x - 4 * u, y - 5 * u);
  ctx.lineTo(x + 4 * u, y - 5 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 4 * u, y + 5 * u);
  ctx.lineTo(x + 4 * u, y + 5 * u);
  ctx.stroke();
};

/** econ_value — "Double Take" → Stacked Diamonds */
const drawStackedDiamonds: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Diamond 1 (top)
  ctx.beginPath();
  ctx.moveTo(x, y - 5 * u);
  ctx.lineTo(x + 2.5 * u, y - 2 * u);
  ctx.lineTo(x, y + 1 * u);
  ctx.lineTo(x - 2.5 * u, y - 2 * u);
  ctx.closePath();
  ctx.stroke();

  // Diamond 2 (bottom)
  ctx.beginPath();
  ctx.moveTo(x, y - 1 * u);
  ctx.lineTo(x + 2.5 * u, y + 2 * u);
  ctx.lineTo(x, y + 5 * u);
  ctx.lineTo(x - 2.5 * u, y + 2 * u);
  ctx.closePath();
  ctx.stroke();
};

/** econ_magnet — "Coin Magnet" → Circle with Inward Arrows */
const drawMagnet: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const r = 5 * u;

  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.stroke();

  // 4 inward arrows at N/S/E/W
  const dirs = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  const aLen = 2 * u;

  for (const [dx, dy] of dirs) {
    const startX = x + dx * r;
    const startY = y + dy * r;
    const endX = x + dx * (r - 3 * u);
    const endY = y + dy * (r - 3 * u);

    // Shaft
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    const perpX = -dy;
    const perpY = dx;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + (-dx + perpX * 0.5) * aLen, endY + (-dy + perpY * 0.5) * aLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + (-dx - perpX * 0.5) * aLen, endY + (-dy - perpY * 0.5) * aLen);
    ctx.stroke();
  }
};

/** econ_combo — "Profit Margin" → Ascending Bar Chart */
const drawBarChart: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const barW = 2 * u;
  const baseY = y + 4 * u;
  const gap = 3 * u;

  // Bar 1 (short)
  ctx.beginPath();
  ctx.rect(x - gap - barW / 2, baseY - 3 * u, barW, 3 * u);
  ctx.stroke();

  // Bar 2 (medium)
  ctx.beginPath();
  ctx.rect(x - barW / 2, baseY - 5 * u, barW, 5 * u);
  ctx.stroke();

  // Bar 3 (tall)
  ctx.beginPath();
  ctx.rect(x + gap - barW / 2, baseY - 7 * u, barW, 7 * u);
  ctx.stroke();

  // Base line
  ctx.beginPath();
  ctx.moveTo(x - gap - barW, baseY);
  ctx.lineTo(x + gap + barW, baseY);
  ctx.stroke();
};

/** econ_lucky — "Lucky Strike" → 4-Pointed Sparkle Star */
const drawSparkle: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const longR = 5 * u;
  const shortR = 2.5 * u;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? longR : shortR;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
};

/** econ_swarm — "Swarm Attractor" → Spiral Vortex */
const drawSpiral: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Spiral ~1.5 turns
  ctx.beginPath();
  const steps = 60;
  const maxAngle = Math.PI * 3; // 1.5 turns
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * maxAngle;
    const r = (1 + t * 4) * u;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Orbiting dots
  const dotDistances = [1.5, 3, 4.5];
  const dotAngles = [0.8, 2.4, 4.2];
  for (let i = 0; i < dotDistances.length; i++) {
    const dr = dotDistances[i] * u;
    const da = dotAngles[i];
    ctx.beginPath();
    ctx.arc(x + Math.cos(da) * dr, y + Math.sin(da) * dr, 0.6 * u, 0, TWO_PI);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }
};

/* ═══════════════════ MOVEMENT BRANCH (teal) ═══════════════════ */

/** move_speed — "Thrusters" → Triple Exhaust Chevrons */
const drawChevrons: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Chevron 1
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y - 4 * u);
  ctx.lineTo(x, y - 2 * u);
  ctx.lineTo(x + 3 * u, y - 4 * u);
  ctx.stroke();

  // Chevron 2
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y - 0.5 * u);
  ctx.lineTo(x, y + 1.5 * u);
  ctx.lineTo(x + 3 * u, y - 0.5 * u);
  ctx.stroke();

  // Chevron 3
  ctx.beginPath();
  ctx.moveTo(x - 3 * u, y + 3 * u);
  ctx.lineTo(x, y + 5 * u);
  ctx.lineTo(x + 3 * u, y + 3 * u);
  ctx.stroke();
};

/** move_emp — "Flash Grenade" → Expanding EMP Ring */
const drawEMPRing: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Center circle
  ctx.beginPath();
  ctx.arc(x, y, 1.5 * u, 0, TWO_PI);
  ctx.stroke();

  // 4 arc segments at cardinal directions (inner)
  const innerR = 4 * u;
  const arcSpan = Math.PI / 3; // 60°
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    ctx.beginPath();
    ctx.arc(x, y, innerR, a - arcSpan / 2, a + arcSpan / 2);
    ctx.stroke();
  }

  // 4 smaller arcs (outer)
  const outerR = 6 * u;
  const outerSpan = Math.PI / 4.5; // ~40°
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    ctx.beginPath();
    ctx.arc(x, y, outerR, a - outerSpan / 2, a + outerSpan / 2);
    ctx.stroke();
  }
};

/** move_mine — "Rolling Bomb" → Circle with Fuse */
const drawBomb: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Circle body (shifted down slightly)
  ctx.beginPath();
  ctx.arc(x, y + 1 * u, 3.5 * u, 0, TWO_PI);
  ctx.stroke();

  // Fuse line
  ctx.beginPath();
  ctx.moveTo(x + 2 * u, y - 2 * u);
  ctx.lineTo(x + 3.5 * u, y - 4 * u);
  ctx.stroke();

  // Spark at fuse tip
  const sx = x + 3.5 * u;
  const sy = y - 4 * u;
  const sparkLen = 1.5 * u;
  for (let i = 0; i < 3; i++) {
    const angle = (TWO_PI / 3) * i - Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * sparkLen, sy + Math.sin(angle) * sparkLen);
    ctx.stroke();
  }
};

/** move_trap — "Time Trap" → Clock with Slow Waves */
const drawClock: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Clock circle
  ctx.beginPath();
  ctx.arc(x, y, 4 * u, 0, TWO_PI);
  ctx.stroke();

  // Hour hand
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 2.5 * u);
  ctx.stroke();

  // Minute hand
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 2 * u, y + 0.5 * u);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 0.5 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();

  // Wavy lines from edges
  const waveY1 = y - 1 * u;
  const waveY2 = y + 2 * u;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const wx = x + 4.5 * u + t * 3 * u;
    const wy = waveY1 + Math.sin(t * Math.PI * 3) * 0.8 * u;
    if (i === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const wx = x + 4.5 * u + t * 3 * u;
    const wy = waveY2 + Math.sin(t * Math.PI * 3 + 1) * 0.8 * u;
    if (i === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
};

/* ═══════════════════ EFFECTS BRANCH (purple) ═══════════════════ */

/** eff_poison — "Assassin's Touch" → Poison Drop */
const drawPoisonDrop: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Teardrop (pointed top, round bottom)
  ctx.beginPath();
  ctx.moveTo(x, y - 5 * u);
  ctx.bezierCurveTo(x + 4 * u, y - 1 * u, x + 3.5 * u, y + 3 * u, x, y + 4 * u);
  ctx.bezierCurveTo(x - 3.5 * u, y + 3 * u, x - 4 * u, y - 1 * u, x, y - 5 * u);
  ctx.stroke();

  // Splash arc below
  ctx.beginPath();
  ctx.arc(x, y + 5.5 * u, 1.5 * u, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  // Small flanking drops
  const sd = 0.4; // scale
  for (const dir of [-1, 1]) {
    const dx = dir * 3.5 * u;
    const dy = 1 * u;
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy - 2 * u * sd);
    ctx.bezierCurveTo(
      x + dx + 1.5 * u * sd,
      y + dy,
      x + dx + 1.2 * u * sd,
      y + dy + 1.5 * u * sd,
      x + dx,
      y + dy + 2 * u * sd
    );
    ctx.bezierCurveTo(
      x + dx - 1.2 * u * sd,
      y + dy + 1.5 * u * sd,
      x + dx - 1.5 * u * sd,
      y + dy,
      x + dx,
      y + dy - 2 * u * sd
    );
    ctx.stroke();
  }
};

/** eff_slow — "Toxic Drop" → Down Arrow with Ripples */
const drawSlowArrow: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Shaft
  ctx.beginPath();
  ctx.moveTo(x, y - 4 * u);
  ctx.lineTo(x, y + 5 * u);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x, y + 5 * u);
  ctx.lineTo(x - 3 * u, y + 1 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + 5 * u);
  ctx.lineTo(x + 3 * u, y + 1 * u);
  ctx.stroke();

  // Wavy horizontal lines
  for (const wy of [y - 1 * u, y + 2 * u]) {
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const wx = x - 3 * u + t * 6 * u;
      const wwy = wy + Math.sin(t * Math.PI * 2) * 0.8 * u;
      if (i === 0) ctx.moveTo(wx, wwy);
      else ctx.lineTo(wx, wwy);
    }
    ctx.stroke();
  }
};

/** eff_bomb — "Unlit Bomb" → Circle with Tick Marks */
const drawTickBomb: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const r = 4 * u;

  // Circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.stroke();

  // 8 tick marks
  for (let i = 0; i < 8; i++) {
    const angle = (TWO_PI / 8) * i;
    const innerR = r - 1 * u;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    ctx.stroke();
  }

  // Central dot
  ctx.beginPath();
  ctx.arc(x, y, 0.6 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();

  // Fuse at top
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + 1 * u, y - r - 2 * u);
  ctx.stroke();

  // Unlit tip circle
  ctx.beginPath();
  ctx.arc(x + 1 * u, y - r - 2.5 * u, 0.6 * u, 0, TWO_PI);
  ctx.stroke();
};

/* ═══════════════════ MOTHERSHIP BRANCH (blue) ═══════════════════ */

/** ms_hull — "Reinforced Hull" → Hexagon Shield */
const drawHexShield: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Outer hexagon
  drawHex(ctx, x, y, 5 * u, 0);

  // Inner hexagon (dimmer)
  ctx.save();
  ctx.globalAlpha *= 0.5;
  drawHex(ctx, x, y, 2.5 * u, 0);
  ctx.restore();
};

/** ms_turret — "Sentinel Eye" → Crosshair Reticle */
const drawCrosshair: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  const r = 4 * u;
  const gap = 1.5 * u;
  const ext = 5.5 * u;

  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TWO_PI);
  ctx.stroke();

  // Vertical line with gap
  ctx.beginPath();
  ctx.moveTo(x, y - ext);
  ctx.lineTo(x, y - gap);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + gap);
  ctx.lineTo(x, y + ext);
  ctx.stroke();

  // Horizontal line with gap
  ctx.beginPath();
  ctx.moveTo(x - ext, y);
  ctx.lineTo(x - gap, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + gap, y);
  ctx.lineTo(x + ext, y);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 0.8 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
};

/** ms_barrier — "Barrier Echoes" → Nested Hexagon Outlines */
const drawNestedHex: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Hex 1 — full opacity
  drawHex(ctx, x, y, 5 * u, 0);

  // Hex 2 — 70% opacity, slight rotation
  ctx.save();
  ctx.globalAlpha *= 0.7;
  drawHex(ctx, x, y, 3.5 * u, (5 * Math.PI) / 180);
  ctx.restore();

  // Hex 3 — 40% opacity, more rotation
  ctx.save();
  ctx.globalAlpha *= 0.4;
  drawHex(ctx, x, y, 2 * u, (10 * Math.PI) / 180);
  ctx.restore();
};

/* ------------------------------------------------------------------ */
/*  Shared hex helper                                                  */
/* ------------------------------------------------------------------ */

function drawHex(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rotation: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6 + rotation;
    const hx = x + r * Math.cos(angle);
    const hy = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();
}

/* ═══════════════════ ADDITIONAL ICONS ═══════════════════ */

/** ms_slow — "Gravity Well" → Spiral inward arrows + circle */
const drawGravityWell: IconFn = (ctx, x, y, s) => {
  const u = s / 10;
  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, 5 * u, 0, TWO_PI);
  ctx.stroke();

  // Inner circle (core)
  ctx.beginPath();
  ctx.arc(x, y, 1.2 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();

  // 4 inward spiral arcs
  for (let i = 0; i < 4; i++) {
    const baseAngle = (TWO_PI / 4) * i;
    ctx.beginPath();
    ctx.arc(x, y, 3.5 * u, baseAngle, baseAngle + Math.PI / 3);
    ctx.stroke();

    // Arrow tip at end of arc (pointing inward)
    const tipAngle = baseAngle + Math.PI / 3;
    const tipX = x + Math.cos(tipAngle) * 3.5 * u;
    const tipY = y + Math.sin(tipAngle) * 3.5 * u;
    const inward = Math.atan2(y - tipY, x - tipX);
    const aLen = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(inward + 0.5) * aLen, tipY + Math.sin(inward + 0.5) * aLen);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(inward - 0.5) * aLen, tipY + Math.sin(inward - 0.5) * aLen);
    ctx.stroke();
  }
};

/** dmg_forward — "Forward Field" → Arrow pointing forward with arc wings */
const drawForwardField: IconFn = (ctx, x, y, s) => {
  const u = s / 10;

  // Central arrow pointing right (forward)
  ctx.beginPath();
  ctx.moveTo(x - 4 * u, y);
  ctx.lineTo(x + 4 * u, y);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x + 4 * u, y);
  ctx.lineTo(x + 1 * u, y - 2.5 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4 * u, y);
  ctx.lineTo(x + 1 * u, y + 2.5 * u);
  ctx.stroke();

  // Wing arcs — extending forward from center
  ctx.beginPath();
  ctx.arc(x - 1 * u, y, 4 * u, -Math.PI / 4, Math.PI / 4);
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.beginPath();
  ctx.arc(x - 2 * u, y, 5.5 * u, -Math.PI / 5, Math.PI / 5);
  ctx.stroke();
  ctx.restore();

  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 0.7 * u, 0, TWO_PI);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
};

/* ------------------------------------------------------------------ */
/*  Lookup table                                                       */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, IconFn> = {
  // Damage
  dmg_core: drawDoubleChevron,
  dmg_range: drawConcentricArcs,
  dmg_crit: drawStarburst,
  dmg_overclock: drawCrescent,

  // Weapons
  guns_missile: drawRocket,
  guns_bolt: drawPierceArrow,
  guns_chain: drawLightning,
  guns_barrage: drawCluster,

  // Economy
  econ_duration: drawHourglass,
  econ_value: drawStackedDiamonds,
  econ_magnet: drawMagnet,
  econ_combo: drawBarChart,
  econ_lucky: drawSparkle,
  econ_swarm: drawSpiral,

  // Movement
  move_speed: drawChevrons,
  move_emp: drawEMPRing,
  move_mine: drawBomb,
  move_trap: drawClock,

  // Effects
  eff_poison: drawPoisonDrop,
  eff_slow: drawSlowArrow,
  eff_bomb: drawTickBomb,

  // Mothership
  ms_hull: drawHexShield,
  ms_turret: drawCrosshair,
  ms_barrier: drawNestedHex,
  ms_slow: drawGravityWell,

  // Damage (additional)
  dmg_forward: drawForwardField,
};
