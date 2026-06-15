#version 300 es

precision mediump float;

in vec2  vTextureCoord;
in vec2  vMeshPos;
in float vWaveHeight;

uniform sampler2D uSampler;
uniform float     iTime;

out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i),                hash(i + vec2(1, 0)), u.x),
        mix(hash(i + vec2(0, 1)),   hash(i + vec2(1, 1)), u.x),
        u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p *= 2.07;
        a *= 0.5;
    }
    return v;
}

void main() {
    // The mesh covers a huge horizontal span but only ~100 units vertically;
    // most of the visible water sits in the top ~15 units. Normalise depth
    // generously so the surface region gets richer detail.
    float depth = clamp(vMeshPos.y / 55.0, 0.0, 1.0);

    // Toxic palette: sickly yellow-green at the surface → murky olive →
    // black-green sludge. Saturated up top so danger reads instantly.
    vec3 surface = vec3(0.48, 0.66, 0.18);
    vec3 mid     = vec3(0.16, 0.32, 0.13);
    vec3 deep    = vec3(0.03, 0.10, 0.05);
    vec3 col = mix(surface, mid, smoothstep(0.0, 0.32, depth));
    col      = mix(col,     deep, smoothstep(0.28, 1.0, depth));

    // Account for the mesh stretch (~40× horizontally, ~15× vertically)
    // when picking noise frequencies — otherwise features look 1-D.
    vec2 ws = vec2(0.35, 0.95);

    // Drifting muck across the whole sheet — visible at every camera scale.
    vec2 muckUV = vMeshPos * ws * 0.7 + vec2(iTime * 0.5, 0.0);
    float muck  = fbm(muckUV);
    muck = smoothstep(0.20, 0.85, muck);
    col = mix(col, col * vec3(0.40, 0.55, 0.25), muck * 0.80);
    col += vec3(0.12, 0.20, 0.04) * (1.0 - muck) * (1.0 - depth * 0.6);

    // Oil-slick film: spans the surface, not just the muck peaks. Driven
    // by a slower phase + sin of muck so streaks bend organically.
    float surfaceMask = smoothstep(20.0, 0.0, vMeshPos.y - vWaveHeight);
    float oilPhase    = vMeshPos.x * ws.x * 1.5 + muck * 10.0 + iTime * 0.6;
    vec3  oil = vec3(
        0.5 + 0.5 * sin(oilPhase),
        0.5 + 0.5 * sin(oilPhase + 2.094),
        0.5 + 0.5 * sin(oilPhase + 4.188)
    );
    // Biofilm tint — pushed warm + slightly desaturated.
    oil = mix(vec3(dot(oil, vec3(0.33))), oil, 0.6) * vec3(1.1, 1.0, 0.5);
    float oilStrength = surfaceMask * (0.35 + 0.45 * muck);
    col = mix(col, oil, oilStrength * 0.65);

    // Scum islands — pale lumpy patches floating on top, with crusty
    // dark borders. Tuned to recur a few times across the visible window.
    vec2 scumUV = vMeshPos * ws * 1.4 + vec2(iTime * 0.10, 0.0);
    float scumBase = fbm(scumUV);
    float scum  = smoothstep(0.45, 0.68, scumBase);
    float scumMask = smoothstep(5.0, 0.0, vMeshPos.y - vWaveHeight);
    col = mix(col, vec3(0.62, 0.65, 0.42), scum * scumMask * 0.85);
    float scumEdge = smoothstep(0.38, 0.50, scumBase) - scum;
    col = mix(col, vec3(0.06, 0.10, 0.04), scumEdge * scumMask * 0.8);

    // Radioactive flecks — high density, neon-green pinpricks that fire
    // off at random cells. The lifeT shaping makes them blink crisply.
    vec2 cellSize = vec2(7.0, 12.0);
    vec2 cellId   = floor(vMeshPos * cellSize);
    vec2 cellPos  = fract(vMeshPos * cellSize) - 0.5;
    float seed    = hash(cellId);
    float lifeT   = fract(seed * 13.37 + iTime * 0.5);
    float blink   = smoothstep(0.85, 1.0, lifeT) * smoothstep(0.0, 0.15, lifeT);
    // Halo + bright core.
    float glowR   = length(cellPos);
    float glow    = exp(-glowR * 8.0);
    float core    = smoothstep(0.10, 0.0, glowR);
    col += (vec3(0.50, 1.30, 0.30) * glow + vec3(0.85, 1.4, 0.8) * core) *
           blink * (1.0 - depth * 0.4) * 1.2;

    // Rising bubbles — band a few metres below surface, drift up.
    vec2 bubbleUV = vMeshPos * vec2(2.2, 1.5);
    bubbleUV.y -= iTime * 1.5;  // upward motion
    float bubble  = smoothstep(0.75, 0.92, fbm(bubbleUV));
    float bubbleBand = smoothstep(2.0, 12.0, vMeshPos.y) *
                       (1.0 - smoothstep(18.0, 35.0, vMeshPos.y));
    col = mix(col, vec3(0.70, 0.90, 0.50), bubble * bubbleBand * 0.55);

    // Subsurface murk streaks — diagonal ribbons of darker matter that drift
    // through the depths.
    float streak = sin(vMeshPos.y * 0.45 + vMeshPos.x * 0.10 - iTime * 0.4);
    col *= 1.0 - 0.20 * smoothstep(0.4, 1.0, streak) * depth;

    // Wave-crest gleam: sickly yellow-green highlight on peaks.
    float crest = smoothstep(0.6, 1.4, vWaveHeight) *
                  smoothstep(4.0, 0.0, vMeshPos.y);
    col += vec3(0.65, 0.85, 0.30) * crest * 0.65;

    // Soft tonemap so neon highlights compress instead of clipping.
    col = col / (col + 0.80);
    col = pow(col, vec3(0.82));

    // Heavy alpha — toxic water isn't see-through.
    float alpha = mix(0.95, 1.00, depth);

    fragColor = vec4(col, alpha);
}
