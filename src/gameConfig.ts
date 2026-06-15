/**
 * Central game configuration — all tunable gameplay values live here.
 * Change a value here to affect the whole game; no need to hunt across files.
 */
export const GameConfig = {
  // ── Worm physics & movement ──────────────────────────────────────────────
  worm: {
    /** Ground movement speed (x = horizontal acceleration, y = vertical step). */
    movementSpeed: { x: 0.0035, y: 0.1 },
    /** Grace period (ms) after leaving ground during which a jump still fires. */
    coyoteTimeMs: 200,
    /** Grace period (ms) before landing during which a buffered jump fires. */
    jumpBufferMs: 220,
    /** Horizontal impulse applied per frame while airborne (air control). */
    airControlImpulsePerFrame: 0.6,
    /** Max horizontal speed while airborne. */
    maxAirControlSpeed: 5,
    /** Fall damage = velocity * this multiplier (above minImpactForDamage). */
    impactDamageMultiplier: 0.5,
    /** Minimum velocity (units/s) required to deal fall damage. */
    minImpactForDamage: 22,
    /**
     * Impulse applied on a normal jump {x per facing direction, y upward}.
     * The x component gives the jump a clear forward arc (in the facing /
     * held direction) rather than a near-vertical hop; y sets the height,
     * kept high enough to clear obstacles.
     */
    jumpImpulse: { x: 16, y: -30 },
    /** Impulse applied on a backflip {x per facing direction, y upward}. */
    backflipImpulse: { x: 6, y: -60 },
    /** Friction while the worm is actively moving. */
    frictionActive: 0.075,
    /** Friction while the worm is standing still. */
    frictionIdle: 0.125,
    /** Bounciness while the worm is actively moving. */
    restitutionActive: 0.15,
    /** Bounciness while the worm is standing still. */
    restitutionIdle: 0.35,
    /** Aim rotation speed per frame (radians). */
    aimMoveSpeed: 0.02,
    /** Default weapon fuse timer shown on-screen (seconds). */
    weaponTimerSecs: 4,
    /** Maximum step height a worm can climb (meters). */
    maxStepMeters: 0.6,
  },

  // ── Projectile launch ────────────────────────────────────────────────────
  projectile: {
    /** Scales Math.log(duration/10) into launch force. Higher = stronger throws. */
    forceScale: 3,
    /** Horizontal force receives an extra boost by this factor. */
    xForceBoost: 1.15,
    /** Distance (world units) in front of the worm where the projectile spawns. */
    launchOffsetMeters: 2,
  },

  // ── Weapons ──────────────────────────────────────────────────────────────
  weapons: {
    bazooka: {
      /** How long the fire button can be held (higher = more force). */
      maxDuration: 80,
      /** Blast radius in meters. */
      explosionRadius: 2.75,
      /** Maximum damage at the centre of the explosion. */
      maxDamage: 45,
      /** Wind force multiplier applied each frame to the shell. */
      windForceMultiplier: 1.25,
      /** Air resistance on the shell (higher = drops faster). */
      linearDamping: 0.05,
      /** Auto-explode timer if it never hits anything (seconds). */
      autoExpireTimerSecs: 30,
    },
    grenade: {
      maxDuration: 50,
      /** Default fuse timer when thrown (seconds). Player can adjust this. */
      defaultTimerSecs: 3,
      explosionRadius: 3.0,
      maxDamage: 55,
      /** Knockback multiplier (1 = full physics force). */
      forceMultiplier: 0.4,
    },
    gasGrenade: {
      maxDuration: 50,
      defaultTimerSecs: 3,
      /** Large area, low damage — applies sickness condition. */
      explosionRadius: 6.0,
      maxDamage: 10,
      /** Very low knockback so the gas cloud stays put. */
      forceMultiplier: 0.0025,
    },
    firework: {
      maxDuration: 80,
      /** Short fuse — firework explodes quickly. */
      timerSecs: 1.33,
      explosionRadius: 2.0,
      maxDamage: 25,
      /** High drag keeps the firework near its launch arc. */
      linearDamping: 1.5,
    },
    homingMissile: {
      maxDuration: 80,
      explosionRadius: 2.25,
      maxDamage: 45,
      /** Delay (ms) before homing guidance activates after launch. */
      activationTimeMs: 65,
      /** Interval (ms) between course-correction steps. */
      adjustmentTimeMs: 6,
      /** Thrust applied toward the target each correction step. */
      thrustForce: { x: 7, y: 7 },
      linearDamping: 0.05,
      autoExpireTimerSecs: 30,
    },
    mine: {
      explosionRadius: 3.5,
      maxDamage: 40,
      forceMultiplier: 0.75,
      /** Fuse duration after proximity trigger (seconds). */
      timerSecs: 5,
      /** Proximity sensor radius (meters). */
      triggerRadiusMeters: 4,
      /** Mine is dormant for this long after placement (ms). */
      inactiveAfterPlacementMs: 4000,
    },
    shotgun: {
      /** Damage-sphere radius at the ray hit point. */
      explosionRadius: 1.5,
      maxDamage: 25,
      /** Number of shots per turn. */
      shots: 2,
    },
  },

  // ── Explosions & screen shake ────────────────────────────────────────────
  explosion: {
    /** Shrapnel particles for direct handleDamageInRadius calls. */
    shrapnelMin: 8,
    shrapnelMax: 25,
    /** Shrapnel particles for timed-explosive detonations. */
    timedShrapnelMin: 15,
    timedShrapnelMax: 35,
    /** Screen shake = explosionRadius * this (pixels). */
    screenshakeRadiusMultiplier: 3.5,
    /** Screen shake is capped at this many pixels. */
    screenshakeMaxPx: 18,
    /** Duration of the screen shake effect (ms). */
    screenshakeDurationMs: 380,
  },

  // ── Camera ───────────────────────────────────────────────────────────────
  camera: {
    /**
     * Follow smoothing time constant (ms). The camera eases toward its lock
     * target with a frame-rate-independent exponential damp; lower = snappier,
     * higher = floatier. Softens per-step vertical pops and jump/fall tracking
     * so movement reads smoothly instead of rigidly snapping every frame.
     */
    followTauMs: 90,
    /** Within this distance (px) of the target the camera snaps to settle. */
    followSnapPx: 1,
  },

  // ── World ────────────────────────────────────────────────────────────────
  world: {
    /** Maximum absolute wind value (range is -maxWind … +maxWind). */
    maxWind: 10,
  },

  // ── Game timing ──────────────────────────────────────────────────────────
  game: {
    /** Delay before health bar animates after taking damage (ms). */
    healthChangeTensionMs: 1250,
    /** How long toast popups stay visible (ms). */
    popupDelayMs: 3000,
    /** Duration of the pre-round countdown (ms). */
    preroundTimerMs: 5000,
  },
} as const;
