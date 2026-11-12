export const STAR_MOTION_GLSL = /* glsl */`
uniform vec3 uStarMotion;
vec3 starMotionDirection(vec3 d) {
  float cx = cos(uStarMotion.y), sx = sin(uStarMotion.y);
  float cy = cos(uStarMotion.x), sy = sin(uStarMotion.x);
  float cz = cos(uStarMotion.z), sz = sin(uStarMotion.z);
  d = vec3(d.x, d.y * cx - d.z * sx, d.y * sx + d.z * cx);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  return vec3(d.x * cz - d.y * sz, d.x * sz + d.y * cz, d.z);
}
`;

export const STAR_MOTION_PRESETS = [
  { id: 'sky-follow', name: 'Sky Follow', rates: [0, 0, 0] },
  { id: 'slow-east', name: 'Slow East', rates: [0.006, 0, 0] },
  { id: 'slow-west', name: 'Slow West', rates: [-0.006, 0, 0] },
  { id: 'east-drift', name: 'East Drift', rates: [0.02, 0, 0] },
  { id: 'west-drift', name: 'West Drift', rates: [-0.02, 0, 0] },
  { id: 'fast-east', name: 'Fast East', rates: [0.06, 0, 0] },
  { id: 'fast-west', name: 'Fast West', rates: [-0.06, 0, 0] },
  { id: 'northward', name: 'Northward', rates: [0, 0.015, 0] },
  { id: 'southward', name: 'Southward', rates: [0, -0.015, 0] },
  { id: 'vertical-sweep', name: 'Vertical Sweep', rates: [0, 0.045, 0] },
  { id: 'tilted-orbit', name: 'Tilted Orbit', rates: [0.012, 0.012, 0.004] },
  { id: 'reverse-orbit', name: 'Reverse Orbit', rates: [-0.012, -0.012, -0.004] },
  { id: 'equatorial-spin', name: 'Equatorial Spin', rates: [0.025, 0, 0.012] },
  { id: 'polar-spin', name: 'Polar Spin', rates: [0.005, 0.028, 0] },
  { id: 'diagonal-drift', name: 'Diagonal Drift', rates: [0.018, 0.012, 0] },
  { id: 'crosswind', name: 'Crosswind', rates: [0.024, -0.016, 0] },
  { id: 'gentle-spiral', name: 'Gentle Spiral', rates: [0.01, 0.009, 0.006] },
  { id: 'quick-spiral', name: 'Quick Spiral', rates: [0.045, 0.034, 0.025] },
  { id: 'counter-roll', name: 'Counter Roll', rates: [0.012, 0.018, -0.015] },
  { id: 'celestial-gyre', name: 'Celestial Gyre', rates: [0.038, -0.023, 0.031] },
];
