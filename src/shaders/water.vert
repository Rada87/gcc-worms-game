#version 300 es
precision mediump float;

in vec2 aPosition;
in vec2 aUVs;
out vec2 vTextureCoord;
out vec2 vMeshPos;
out float vWaveHeight;

uniform mat3  uProjectionMatrix;
uniform mat3  uWorldTransformMatrix;
uniform mat3  uTransformMatrix;
uniform float iTime;
uniform vec4  inputSize;
uniform vec4  outputFrame;

float hash11(float x) {
    return fract(sin(x * 127.1) * 43758.5453);
}

void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;

    // Damping with depth so only the top region undulates.
    float surfaceFactor = clamp(1.0 - aPosition.y / 14.0, 0.0, 1.0);

    // Five layered sine waves with different wavelengths and speeds. The
    // shortest one gives small ripples, the longest one is a slow swell.
    // Wavelengths are tuned to be visible at the mesh's 40× horizontal
    // stretch — a frequency of 1.4 here = wavelength ~4.5 mesh units.
    float w1 = sin(iTime * 0.55 + aPosition.x * 0.08)            * 1.30;
    float w2 = sin(iTime * 0.92 - aPosition.x * 0.22 + 1.7)      * 0.65;
    float w3 = sin(iTime * 0.30 + aPosition.x * 0.04 + 3.1)      * 1.10;
    float w4 = sin(iTime * 1.40 + aPosition.x * 0.55 + 0.6)      * 0.35;
    float w5 = sin(iTime * 0.20 + aPosition.x * 0.015 - 1.2)     * 1.50;

    // Tiny hash-driven jitter — per-vertex randomness adds choppy texture
    // that breaks up the otherwise-smooth sine sum, so the top edge looks
    // genuinely irregular rather than mathematically perfect.
    float jitter = (hash11(floor(aPosition.x * 3.0)) - 0.5) * 0.5 *
                   sin(iTime * 1.7 + aPosition.x * 0.8);

    float heave = (w1 + w2 + w3 + w4 + w5 + jitter) * surfaceFactor;

    vec2 displaced = aPosition + vec2(0.0, heave);
    gl_Position = vec4((mvp * vec3(displaced, 1.0)).xy, 0.0, 1.0);

    vMeshPos = aPosition;
    vWaveHeight = heave;
    vTextureCoord = aPosition * (outputFrame.zw * inputSize.zw);
}
