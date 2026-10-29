import { Filter, GlProgram, UniformGroup } from 'pixi.js'

const vertex = `precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vImageCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vImageCoord = aPosition;
}
`

// Original first-order optical study. Each color follows its own entry/exit
// refraction path; the luminous braid is integrated through a 3D density field.
const fragment = `precision highp float;
in vec2 vTextureCoord;
in vec2 vImageCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform vec2 uViewSize;
uniform vec2 uCenter;
uniform float uFraming;
uniform float uTime;
uniform float uReveal;
uniform float uDispersion;
uniform float uOpening;

mat2 spin;
mat2 tilt;

mat2 turn(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat2(c, -s, s, c);
}

vec2 sphereInterval(vec3 origin, vec3 ray, float radius) {
    float b = dot(origin, ray);
    float h = b * b - dot(origin, origin) + radius * radius;
    if (h <= 0.0) return vec2(-1.0);
    float root = sqrt(h);
    return vec2(-b - root, -b + root);
}

vec3 backdrop(vec3 origin, vec3 ray) {
    vec3 color = vec3(0.0015, 0.0025, 0.0045);
    // A finite grating behind the specimen makes transmission visibly bend space.
    if (ray.z < -0.001) {
        float distanceToPlate = (-2.0 - origin.z) / ray.z;
        if (distanceToPlate > 0.0) {
            vec2 p = (origin + ray * distanceToPlate).xy;
            float line = 1.0 - smoothstep(0.025, 0.11, abs(sin(p.x * 10.0)));
            float window = exp(-dot(p, p) * 0.22);
            color += vec3(0.018, 0.032, 0.05) * line * window;
        }
    }
    return color;
}

vec3 environment(vec3 origin, vec3 ray) {
    vec3 color = backdrop(origin, ray);
    float ceiling = exp(-pow((ray.y - 0.65) * 9.0, 2.0));
    float strip = exp(-pow((ray.x + ray.z * 0.4 - 0.3) * 14.0, 2.0));
    float copper = exp(-pow((ray.y + 0.48) * 10.0, 2.0));
    color += vec3(2.8, 2.7, 2.3) * ceiling;
    color += vec3(0.5, 1.7, 2.3) * strip;
    color += vec3(1.6, 0.53, 0.12) * copper;
    return color;
}

vec3 density(vec3 position) {
    position.xz = spin * position.xz;
    position.yz = tilt * position.yz;
    float angle = atan(position.z, position.x);
    float radial = length(position.xz);
    vec3 phase = vec3(0.0, 2.094395, 4.18879) + angle * 3.0 + uTime * 0.65;
    vec3 radius = vec3(0.57) + cos(phase) * 0.10;
    vec3 height = sin(phase) * 0.21;
    vec3 dr = vec3(radial) - radius;
    vec3 dy = vec3(position.y) - height;
    vec3 squaredDistance = dr * dr + dy * dy;
    vec3 filaments = exp(-squaredDistance / 0.00045);
    vec3 glow = exp(-sqrt(squaredDistance) * 20.0) * 0.015;
    return filaments + glow;
}

vec3 emission(vec3 origin, vec3 ray) {
    vec2 interval = sphereInterval(origin, ray, 0.78);
    if (interval.y <= 0.0) return vec3(0.0);
    float start = max(0.0, interval.x);
    float stepSize = (interval.y - start) / 64.0;
    vec3 radiance = vec3(0.0);
    float transmission = 1.0;
    for (int i = 0; i < 64; i++) {
        vec3 p = origin + ray * (start + (float(i) + 0.5) * stepSize);
        vec3 strands = density(p);
        float opacity = 1.0 - exp(-dot(strands, vec3(1.0)) * stepSize * 8.0);
        vec3 energy = strands.x * vec3(3.8, 1.8, 0.55)
            + strands.y * vec3(0.3, 2.5, 3.5)
            + strands.z * vec3(3.2, 2.7, 1.9);
        radiance += transmission * energy * stepSize * 10.0;
        transmission *= 1.0 - opacity;
    }
    return radiance;
}

vec3 transmit(vec3 entry, vec3 normal, vec3 ray, float ior) {
    vec3 inside = refract(ray, normal, 1.0 / ior);
    float distanceThroughGlass = max(0.0, -2.0 * dot(entry, inside));
    vec3 exit = entry + inside * distanceThroughGlass;
    vec3 outward = normalize(exit);
    vec3 outgoing = refract(inside, -outward, ior);
    if (dot(outgoing, outgoing) < 0.1) outgoing = reflect(inside, -outward);
    vec3 absorption = exp(-vec3(0.12, 0.045, 0.018) * distanceThroughGlass);
    vec3 light = emission(entry + inside * 0.001, inside);
    return backdrop(exit, outgoing) * absorption + light * sqrt(absorption);
}

void main() {
    spin = turn(uTime * 0.23);
    tilt = turn(0.6 + sin(uTime * 0.28) * 0.3);
    vec4 source = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));
    vec2 image = (vImageCoord - uCenter) * uViewSize / min(uViewSize.x, uViewSize.y);
    vec3 origin = vec3(0.0, 0.0, 4.0);
    vec3 ray = normalize(vec3(image.x * uFraming, -image.y * uFraming, -3.5));
    vec3 background = backdrop(origin, ray);
    vec3 color = background;
    vec2 interval = sphereInterval(origin, ray, 1.0);
    if (interval.x > 0.0) {
        vec3 entry = origin + ray * interval.x;
        vec3 normal = normalize(entry);
        // An illustrative equatorial cutaway exposes the unrefracted core.
        float threshold = uOpening * 0.82 - 0.06;
        float shell = smoothstep(threshold - 0.035, threshold + 0.035, abs(normal.y));
        // Evaluate only paths that contribute to this pixel's visible material.
        vec3 direct = background;
        if (shell < 1.0) direct += emission(origin, ray);
        vec3 glass = background;
        if (shell > 0.0) {
            float facing = max(0.0, dot(normal, -ray));
            float fresnel = 0.0375 + 0.9625 * pow(1.0 - facing, 5.0);
            // Per-channel IOR spread follows KHR_materials_dispersion.
            float spread = (1.48 - 1.0) * 0.025 * uDispersion;
            vec3 through = vec3(
                transmit(entry, normal, ray, 1.48 - spread).r,
                transmit(entry, normal, ray, 1.48).g,
                transmit(entry, normal, ray, 1.48 + spread).b
            );
            vec3 reflected = environment(entry, reflect(ray, normal));
            glass = through * (1.0 - fresnel) + reflected * fresnel;
            glass += vec3(0.24, 0.42, 0.48) * pow(1.0 - facing, 8.0);
        }
        float seam = exp(-pow((abs(normal.y) - threshold) * 65.0, 2.0));
        color = mix(direct, glass, shell);
        color += vec3(0.55, 0.8, 1.0) * seam * uOpening * 0.7;
    }
    vec3 displayColor = pow(1.0 - exp(-color * 1.05), vec3(1.0 / 2.2));
    // This example filters an opaque full-frame plate; copy is a separate layer.
    finalColor = vec4(mix(source.rgb, displayColor, uReveal), source.a);
}
`

export function createOpticalFilter(width: number, height: number, center: [number, number], framing: number) {
  const optics = new UniformGroup({
    uViewSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
    uCenter: { value: new Float32Array(center), type: 'vec2<f32>' },
    uFraming: { value: framing, type: 'f32' },
    uTime: { value: 0, type: 'f32' },
    uReveal: { value: 0, type: 'f32' },
    uDispersion: { value: 0, type: 'f32' },
    uOpening: { value: 0, type: 'f32' },
  })
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'spectral-core', preferredFragmentPrecision: 'highp' }),
    resources: { optics }, resolution: 'inherit', padding: 0,
  })
  return { filter, uniforms: optics.uniforms }
}
