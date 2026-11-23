/* KAELYX — fond « soie » en temps réel (WebGL) : rubans violets qui ondulent lentement à l'angle de la marque (24°),
   sur l'anthracite. Palette stricte (anthracite, violet profond, violet, touches de blanc), grain très léger anti-bandes.
   Calculé en demi-résolution puis agrandi (c'est un flou doux) : peu coûteux, même dans OBS.
   KXFX.silk(canvas, { focus: [x, y] (0..1), strength: 0..1, scale: .5 }) → { stop() }. Sans WebGL : ne fait rien (le fond CSS reste). */
const KXFX = (() => {
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uFocus; uniform float uStrength;
const vec3 BG = vec3(0.165, 0.169, 0.173);
const vec3 DEEP = vec3(0.337, 0.110, 0.451);
const vec3 VIO = vec3(0.600, 0.200, 0.800);
const vec3 WHITE = vec3(0.953, 0.945, 0.945);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float an = 0.4189; // 24°
  vec2 q = mat2(cos(an), sin(an), -sin(an), cos(an)) * p;
  q.x *= 0.42; // étiré dans le sens des bandes : rubans
  float t = uTime * 0.05;
  vec2 w = vec2(fbm(q * 1.5 + vec2(t, -t * 0.7)), fbm(q * 1.5 + vec2(-t * 0.6, t) + 3.1));
  float f = fbm(q * 2.1 + 1.9 * w + vec2(t * 1.2, 0.0));
  float body = smoothstep(0.42, 0.86, f);
  float rib = smoothstep(0.60, 0.92, f);
  float fold = clamp(1.0 - abs(f - 0.66) * 7.0, 0.0, 1.0); fold = fold * fold * fold;
  vec3 col = BG;
  col = mix(col, DEEP, body * 0.78 * uStrength);
  col = mix(col, VIO, rib * 0.50 * uStrength);
  col += WHITE * fold * 0.07 * uStrength;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float d = distance(uv * asp, uFocus * asp);
  col += VIO * 0.20 * uStrength * exp(-d * d * 5.0);
  float v = smoothstep(1.3, 0.3, length(p * vec2(0.85, 1.1)));
  col = mix(BG * 0.8, col, v);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}`;

  function silk(canvas, opts = {}) {
    if (!canvas || (typeof KX !== 'undefined' && KX.mv)) return { stop() {} }; // multivue de l'admin : fond CSS seulement
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return { stop() {} };
    const scale = opts.scale || 0.5;
    canvas.width = Math.round(1920 * scale); canvas.height = Math.round(1080 * scale);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return { stop() {} };
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return { stop() {} };
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const uRes = U('uRes'), uTime = U('uTime'), uFocus = U('uFocus'), uStrength = U('uStrength');
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    const focus = opts.focus || [0.5, 0.5];
    gl.uniform2f(uFocus, focus[0], 1 - focus[1]);
    gl.uniform1f(uStrength, opts.strength ?? 1);
    const t0 = performance.now() - (opts.offset || Math.random() * 40000);
    let raf = 0, alive = true;
    const frame = now => {
      if (!alive) return;
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    canvas.classList.add('on');
    return {
      stop() { alive = false; cancelAnimationFrame(raf); },
      focus(x, y) { gl.uniform2f(uFocus, x, 1 - y); },
      strength(s) { gl.uniform1f(uStrength, s); }
    };
  }
  return { silk };
})();
