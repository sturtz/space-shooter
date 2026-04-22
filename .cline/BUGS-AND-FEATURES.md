# Space Shooter — Bugs, Performance & TODO

Open items only. Resolved items logged in CHANGELOG.md.

---

## Open Bugs

| # | Bug | Priority |
|---|---|---|
| 13 | No object pooling for bullets/enemies/coins — GC pressure from frequent `new` | 🟡 Medium |
| 16/29 | Event listeners in constructors never cleaned up — would leak on re-instantiation | 🟡 Medium |
| 28 | `resetHp` always uses `PLAYER_BASE_HP` instead of upgraded HP (no HP upgrade exists yet) | 🟢 Low |

---

## Performance — Remaining Items

| ID | Description | Impact | Effort |
|---|---|---|---|
| P5 | Cache HUD gradients (10-20 gradient allocs/frame) | Medium | 30 min |
| P8 | Object pool for Bullet/Coin/Missile | High | 1 hour |
| P9 | Shrink entity arrays at round start | Low | 5 min |
| P14 | Rewrite p5.js background in raw Canvas2D (~1MB bundle reduction) | Medium | Large |
| P16 | Single canvas instead of 3 stacked (~15MB GPU savings) | Medium | Medium |

---

## Game.ts Refactoring — Remaining Phases

Current: ~1700 lines (was ~2322, Phase 1+2 done).

### Phase 3 — Systems Extraction

| # | Module | Lines | New File | Effort |
|---|---|---|---|---|
| 3a | WeaponSystem (cone, missile, laser, bomb) | ~250 | `src/systems/WeaponSystem.ts` | 1 hour |
| 3b | EffectsManager (DamageNumber, DashRing, LaserBeam) | ~150 | `src/systems/EffectsManager.ts` | 30 min |
| 3c | BossSystem (spawn variants, reward granting) | ~80 | fold into `SpawnSystem.ts` | 20 min |

### Phase 4 — Interface Cleanup

| # | What | Effort |
|---|---|---|
| 4a | Update `IGame` to match slimmed-down Game.ts | 15 min |
| 4b | Remove remaining dead fields | 10 min |
| 4c | Wire `AbortController` for event listener cleanup (Bug #16) | 20 min |

---

## Repeating Code Patterns (future cleanup)

- **AoE "damage enemies in radius"** — `damageEnemiesInRadius()` exists in CollisionSystem but not wired into all 5 sites in Game.ts
- **Particle burst recipes** — `emitExplosion()`, `emitEnemyDeath()`, `emitCoinPickup()` exist in ParticleSystem but not wired into all call sites
- **`screenToGame()` coordinate transform** — `Renderer.screenToGame()` exists but MenuScreen.ts and UpgradeScreen.ts still have local copies

---

## Feature Ideas

- [ ] Object pooling for bullets/coins/missiles (P8)
- [ ] Rewrite p5.js background in raw Canvas2D (P14)
- [ ] Single canvas instead of 3 stacked (P16)
- [ ] Unit tests (currently all manual/visual)
- [ ] HP upgrade (would need to wire `resetHp` to upgraded value, Bug #28)

---

## QA Notes

### Desktop — All Screens ✅

Menu, Tutorial, Gameplay, Pause, Game Over, Upgrade Screen all functional.

### Mobile Testing

Puppeteer can't emulate `ontouchstart` — use real device or Chrome DevTools touch emulation.
Key areas: joystick + dash, camera zoom (1.75×), pause menu targets, upgrade screen touch joystick + fire zone, bottom bar buttons.
