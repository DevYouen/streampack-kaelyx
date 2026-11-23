/* KAELYX — fond « soie » en temps réel (WebGL) : rubans violets qui ondulent lentement à l'angle de la marque (24°),
   sur l'anthracite. Palette stricte (anthracite, violet profond, violet, touches de blanc), grain très léger anti-bandes.
   Calculé en résolution réduite puis agrandi (c'est un flou doux) : peu coûteux, même dans OBS.

   const s = KXFX.silk(canvas, { focus: [x, y] (0..1), strength: 0..1.6, scale: .5, width: 1920, height: 1080, paused: false });
   s.play() / s.pause() · s.speed(1..3) accélère en douceur · s.strength(v) · s.render(secondes) dessine une image précise (rendu vidéo).
   Sans WebGL (ou dans la multivue de l'admin), toutes ces fonctions existent mais ne font rien : le fond CSS reste. */
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
  float s = min(uStrength, 1.0), hot = max(uStrength - 1.0, 0.0);
  vec3 col = BG;
  col = mix(col, DEEP, body * 0.78 * s);
  col = mix(col, VIO, rib * (0.50 * s + 0.35 * hot));
  col += WHITE * fold * (0.07 * s + 0.16 * hot);
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float d = distance(uv * asp, uFocus * asp);
  col += VIO * (0.20 * s + 0.25 * hot) * exp(-d * d * 5.0);
  float v = smoothstep(1.3, 0.3, length(p * vec2(0.85, 1.1)));
  col = mix(BG * 0.8, col, v);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.016;
  gl_FragColor = vec4(col, 1.0);
}`;
  const NOOP = { play() {}, pause() {}, stop() {}, render() {}, speed() {}, strength() {}, focus() {}, ok: false };

  function silk(canvas, opts = {}) {
    if (!canvas || (typeof KX !== 'undefined' && KX.mv)) return NOOP; // multivue de l'admin : fond CSS seulement
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: !!opts.capture, powerPreference: 'low-power' });
    if (!gl) return NOOP;
    const scale = opts.scale || 0.5;
    canvas.width = Math.round((opts.width || 1920) * scale); canvas.height = Math.round((opts.height || 1080) * scale);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return NOOP;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return NOOP;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const uRes = U('uRes'), uTime = U('uTime'), uFocus = U('uFocus'), uStrength = U('uStrength');
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    const fc = opts.focus || [0.5, 0.5];
    gl.uniform2f(uFocus, fc[0], 1 - fc[1]);
    // Intensité et vitesse suivent leur cible en douceur (pas d'à-coup quand le compte à rebours accélère le fond)
    let str = opts.strength ?? 1, strTarget = str, spd = 1, spdTarget = 1;
    gl.uniform1f(uStrength, str);
    const base = opts.offset ?? Math.random() * 40;
    let sim = 0, last = 0, raf = 0, running = false;
    const draw = t => { gl.uniform1f(uTime, base + t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const frame = now => {
      if (!running) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      spd += (spdTarget - spd) * Math.min(1, dt * 1.5);
      if (Math.abs(strTarget - str) > 0.001) { str += (strTarget - str) * Math.min(1, dt * 1.5); gl.uniform1f(uStrength, str); }
      sim += dt * spd;
      draw(sim);
      raf = requestAnimationFrame(frame);
    };
    const ctl = {
      ok: true,
      play() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); canvas.classList.add('on'); },
      pause() { running = false; cancelAnimationFrame(raf); },
      stop() { ctl.pause(); },
      render(t) { ctl.pause(); str = strTarget; gl.uniform1f(uStrength, str); draw(t); canvas.classList.add('on'); },
      speed(s) { spdTarget = s; },
      strength(s) { strTarget = s; },
      focus(x, y) { gl.uniform2f(uFocus, x, 1 - y); }
    };
    if (!opts.paused) ctl.play();
    return ctl;
  }
  return { silk };
})();
