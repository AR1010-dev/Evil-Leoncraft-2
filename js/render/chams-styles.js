export const CHAMS_STYLE_NAMES = [
  'tint', 'enchanted', 'holographic', 'pulse', 'inferno', 'ice', 'toxic', 'void',
  'matrix', 'aurora', 'crystal', 'plasma', 'ghost', 'solar',
];

export const CHAMS_CUSTOM_STYLES = /* glsl */`
uniform float uChamsEffectAmount;
vec2 chamsWorldUv(vec3 worldPos) {
  return vec2(dot(worldPos, vec3(0.82, 0.31, 0.47)), dot(worldPos, vec3(-0.26, 0.38, 0.89)));
}
vec3 chamsCustomSpectrum(float hue) {
  vec3 p = abs(fract(hue + vec3(0.0, 0.666667, 0.333333)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}
vec3 chamsCustomStyle(vec3 base, vec2 uv, float t, vec3 N, vec3 V, float style) {
  vec3 result = base;
  if (style < 4.5) {
    vec2 p = uv - 0.5;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float turbulence = sin(angle * 3.0 - radius * 13.0 - t * 1.4) * 0.55
                     + sin(angle * 5.0 + radius * 24.0 - t * 1.8) * 0.2;
    float heat = 0.5 + 0.5 * sin(radius * 19.0 - angle * 2.8 - t * 2.2 + turbulence);
    vec3 fire = mix(vec3(0.16, 0.008, 0.02), vec3(1.0, 0.16, 0.01), smoothstep(0.08, 0.84, heat));
    fire = mix(fire, vec3(1.0, 0.86, 0.24), smoothstep(0.72, 1.0, heat));
    result = mix(base, fire, 0.8);
  } else if (style < 5.5) {
    float frost = pow(max(0.0, sin((uv.x + uv.y) * 28.0)), 12.0);
    vec3 ice = mix(vec3(0.015, 0.12, 0.34), vec3(0.28, 0.88, 1.0), smoothstep(0.05, 0.95, uv.y));
    result = mix(base, ice, 0.78) + vec3(frost * 0.28);
  } else if (style < 6.5) {
    vec2 warped = uv + 0.035 * vec2(sin(uv.y * 9.0 + t * 0.2), sin(uv.x * 7.0 - t * 0.16));
    float cells = sin(warped.x * 21.0) * sin(warped.y * 17.0);
    float vein = 1.0 - smoothstep(0.0, 0.22, abs(cells));
    vec3 toxic = mix(vec3(0.012, 0.08, 0.025), vec3(0.28, 0.96, 0.08), 0.35 + vein * 0.65);
    result = mix(base, toxic, 0.82);
  } else if (style < 7.5) {
    vec2 p = uv - 0.5;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float swirl = angle + t * 0.45 + sin(radius * 18.0 - angle * 3.0 - t) * 0.18;
    float ringRadius = 0.25 + sin(swirl * 3.0 - t * 0.7) * 0.025;
    float ring = exp(-abs(radius - ringRadius) * 48.0);
    float spiral = pow(max(0.0, sin(swirl * 4.0 - radius * 28.0 - t * 1.2)), 5.0);
    vec2 starCell = floor(uv * 32.0);
    float starSeed = fract(sin(dot(starCell, vec2(127.1, 311.7))) * 43758.5453);
    float stars = step(0.992, starSeed) * (0.4 + 0.6 * sin(t * 2.0 + starSeed * 6.2831853));
    float edge = pow(1.0 - max(dot(normalize(N), normalize(V)), 0.0), 2.0);
    vec3 dark = base * 0.06 + vec3(0.012, 0.006, 0.035);
    dark += vec3(0.48, 0.12, 0.95) * ring + vec3(0.06, 0.42, 0.9) * spiral * 0.45;
    dark += vec3(0.72, 0.88, 1.0) * stars * 0.65 + vec3(0.22, 0.035, 0.55) * edge * 0.8;
    result = mix(base, dark, 0.92);
  } else if (style < 8.5) {
    float column = floor(uv.x * 24.0);
    float row = floor(uv.y * 38.0 + t * 5.0);
    float glyph = step(0.56, fract(sin(column * 127.1 + row * 311.7) * 43758.5453));
    float scan = 0.5 + 0.5 * sin((uv.y * 38.0 - t * 5.0) * 6.2831853);
    vec3 green = vec3(0.015, 0.12, 0.035) + vec3(0.12, 0.92, 0.3) * glyph * scan;
    result = mix(base, green, 0.88);
  } else if (style < 9.5) {
    float flow = uv.y * 4.0 + sin(uv.x * 7.0 - t * 0.32) * 0.55 + sin(uv.x * 13.0 + t * 0.18) * 0.18;
    float curtain = 0.5 + 0.5 * sin(flow * 6.2831853 - t * 0.2);
    float glow = pow(max(0.0, curtain), 3.0);
    vec3 aurora = mix(vec3(0.025, 0.18, 0.32), vec3(0.12, 0.9, 0.58), smoothstep(0.25, 0.9, curtain));
    aurora = mix(aurora, vec3(0.52, 0.28, 0.88), smoothstep(0.72, 1.0, curtain) * 0.65);
    result = mix(base, aurora, 0.64) + vec3(0.12, 0.38, 0.5) * glow * 0.24;
  } else if (style < 10.5) {
    vec2 cell = floor(uv * vec2(14.0, 18.0));
    float facet = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float edgeLine = 1.0 - smoothstep(0.0, 0.08, abs(fract(uv.x * 14.0) - 0.5));
    vec3 crystal = mix(vec3(0.045, 0.22, 0.42), vec3(0.68, 0.92, 1.0), facet);
    result = mix(base, crystal, 0.78) + vec3(edgeLine * 0.16);
  } else if (style < 11.5) {
    float wave = sin(uv.x * 11.0 + t * 1.1) + cos(uv.y * 13.0 - t * 0.9) + sin((uv.x + uv.y) * 9.0 - t * 0.7);
    vec3 plasma = chamsCustomSpectrum(0.58 + wave * 0.075);
    result = mix(base, plasma, 0.84);
  } else if (style < 12.5) {
    vec3 ghost = mix(base, vec3(0.34, 0.78, 0.91), 0.7);
    float edge = pow(1.0 - max(dot(normalize(N), normalize(V)), 0.0), 2.0);
    result = ghost + vec3(0.18, 0.68, 0.9) * edge * 0.55;
  } else {
    vec2 p = uv - 0.5;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float wave = 0.5 + 0.5 * sin(radius * 10.0 - t * 0.7 + sin(angle * 3.0 + t * 0.16) * 0.8);
    float rays = pow(max(0.0, cos(angle * 9.0 + sin(angle * 3.0 + t * 0.12) * 1.2)), 5.0);
    float core = 1.0 - smoothstep(0.08, 0.18, radius);
    float flare = rays * (1.0 - smoothstep(0.12, 0.58, radius));
    vec3 gold = mix(vec3(0.32, 0.075, 0.008), vec3(1.0, 0.56, 0.08), wave);
    gold += vec3(1.0, 0.72, 0.22) * flare * 0.85 + vec3(1.0, 0.94, 0.62) * core * 0.55;
    float edge = pow(1.0 - max(dot(normalize(N), normalize(V)), 0.0), 2.0);
    gold += vec3(1.0, 0.82, 0.34) * edge * 0.28;
    result = mix(base, gold, 0.82);
  }
  return mix(result, uChamsColor, 0.08);
}
`;
