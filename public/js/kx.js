/* KAELYX — client temps réel partagé par tous les overlays */
const KX = (() => {
  const listeners = { state: [], trigger: [], open: [], error: [], chat: [], 'chat-clear': [], twitch: [], update: [], presence: [], obs: [], toast: [], povrec: [] };
  let state = null;

  function on(ev, fn) {
    (listeners[ev] ??= []).push(fn);
    if (ev === 'state' && state) fn(state);
  }

  // N'appelle fn que si la partie de l'état qui l'intéresse a changé :
  // évite de reconstruire l'overlay (logo qui clignote, animations relancées) quand on modifie un autre overlay
  function watch(select, fn) {
    let last;
    on('state', st => {
      const key = JSON.stringify(select(st));
      if (key === last) return;
      last = key; fn(st);
    });
  }

  // Multivue de l'admin (?mv) : pas de connexion propre (le navigateur limite leur nombre), l'admin relaie l'état
  const MV = window.parent !== window && new URLSearchParams(location.search).has('mv');
  function dispatch(ev, d) {
    if (ev === 'state') state = d;
    (listeners[ev] || []).forEach(f => { try { f(d); } catch (err) { console.error(err); } });
  }
  function connect() {
    if (MV) {
      addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.kx) dispatch(e.data.kx, e.data.data); });
      parent.postMessage({ kxReady: true }, location.origin);
      return;
    }
    // Dans OBS : l'overlay se signale à l'admin (connecté, à l'antenne ou non)
    const obs = window.obsstudio ? '?obs=' + encodeURIComponent(location.pathname + location.search) : '';
    const es = new EventSource('/events' + obs);
    if (obs) {
      let cid = '', seen = { active: null, visible: null };
      const report = () => cid && fetch(`/api/presence?cid=${cid}&active=${seen.active === null ? '' : +seen.active}&visible=${seen.visible === null ? '' : +seen.visible}`).catch(() => {});
      es.addEventListener('hello', e => { cid = JSON.parse(e.data).cid; report(); });
      addEventListener('obsSourceActiveChanged', e => { seen.active = !!e.detail?.active; report(); });
      addEventListener('obsSourceVisibleChanged', e => { seen.visible = !!e.detail?.visible; report(); });
    }
    const safe = (f, v) => { try { f(v); } catch (err) { console.error(err); } };
    es.onopen = () => listeners.open.forEach(f => safe(f));
    es.onerror = () => listeners.error.forEach(f => safe(f));
    es.addEventListener('state', e => { state = JSON.parse(e.data); listeners.state.forEach(f => safe(f, state)); });
    for (const ev of ['trigger', 'chat', 'chat-clear', 'twitch', 'update', 'presence', 'obs', 'toast', 'povrec'])
      es.addEventListener(ev, e => { const d = JSON.parse(e.data); listeners[ev].forEach(f => safe(f, d)); });
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'joueur';

  // Cadre cam : bord violet net, coins coupés pleins, équerres blanches. Intérieur transparent.
  // Néon : deux traits lumineux font le tour du cadre petit à petit (désactivable : opts.neon === false ou Admin > Réglages).
  let gid = 0;
  function frame(w, h, c = Math.round(Math.min(w, h) * 0.07), opts = {}) {
    const id = 'kxg' + (++gid);
    const b = opts.border || 3;
    const L = Math.round(Math.min(w, h) * 0.16);
    const o = b / 2;
    const poly = `${c},${o} ${w - o},${o} ${w - o},${h - c} ${w - c},${h - o} ${o},${h - o} ${o},${c}`;
    const br = opts.brackets === false ? '' : `
      <path d="M${w - L} -5 H${w + 5} V${L}" fill="none" stroke="#F3F1F1" stroke-width="4"/>
      <path d="M-5 ${h - L} V${h + 5} H${L}" fill="none" stroke="#F3F1F1" stroke-width="4"/>`;
    // Vitesse constante quelle que soit la taille du cadre (~260 px/s), départ décalé pour que les cadres ne tournent pas en même temps
    const per = 2 * (w + h);
    const dur = Math.max(4, Math.min(16, per / 260)).toFixed(2);
    const delay = (-Math.random() * dur).toFixed(2);
    const neon = opts.neon === false ? '' : `
      <g class="kx-neon-run" style="--nd:${dur}s;--nl:${delay}s">
        <polygon class="halo" points="${poly}" pathLength="1000" stroke-width="${b + 8}"/>
        <polygon class="core" points="${poly}" pathLength="1000" stroke-width="${b}"/>
        <polygon class="halo b" points="${poly}" pathLength="1000" stroke-width="${b + 8}"/>
        <polygon class="core b" points="${poly}" pathLength="1000" stroke-width="${b}"/>
      </g>`;
    return `<svg class="kx-frame" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9933CC"/><stop offset="1" stop-color="#561C73"/></linearGradient></defs>
      <polygon points="${poly}" fill="none" stroke="#2A2B2C" stroke-opacity=".6" stroke-width="${b + 6}"/>
      <polygon points="${poly}" fill="none" stroke="url(#${id})" stroke-width="${b}"/>${neon}
      <polygon points="0,0 ${c + o},0 0,${c + o}" fill="url(#${id})"/>
      <polygon points="${w},${h} ${w - c - o},${h} ${w},${h - c - o}" fill="url(#${id})"/>${br}
    </svg>`;
  }

  // Réglage global du néon (Admin > Réglages) : classe sur <html>, lue par le CSS
  function applyNeon(st) { document.documentElement.classList.toggle('kx-no-neon', st?.settings?.neon === false); }

  // Masque : tout l'élément est visible sauf les trous (polygones) — pour laisser passer la webcam
  function holeMask(el, w, h, polys) {
    const d = `M0 0H${w}V${h}H0Z ` + polys.map(p => 'M' + p.map(q => q.join(' ')).join(' L') + 'Z').join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path fill-rule="evenodd" d="${d}"/></svg>`;
    const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    el.style.webkitMaskImage = url; el.style.maskImage = url;
    el.style.webkitMaskSize = '100% 100%'; el.style.maskSize = '100% 100%';
  }

  function chamferPts(x, y, w, h, c) {
    return [[x + c, y], [x + w, y], [x + w, y + h - c], [x + w - c, y + h], [x, y + h], [x, y + c]];
  }

  // Champ d'étoiles + scintillement
  function starfield(canvas, count = 220) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 1920, H = canvas.height = 1080;
    const stars = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + .3,
      a: Math.random() * .6 + .2, s: Math.random() * .02 + .004, p: Math.random() * 6.28,
      c: Math.random() < .2 ? '201,204,209' : '243,241,241', v: Math.random() * .08 + .01
    }));
    (function loop(t) {
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.x -= s.v; if (s.x < -2) s.x = W + 2;
        const a = s.a * (.55 + .45 * Math.sin(t * s.s * .06 + s.p));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fillStyle = `rgba(${s.c},${a})`; ctx.fill();
      }
      requestAnimationFrame(loop);
    })(0);
  }

  // Texte découpé en lettres (animations lettre par lettre) : chaque lettre est un <span class="kx-ch" style="--i:n">
  function chars(text, start = 0) {
    let i = start;
    return String(text ?? '').split(' ').map(w => `<span class="kx-w">${[...w].map(c => `<span class="kx-ch" style="--i:${i++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
  }
  // Nombre qui défile de la valeur affichée jusqu'à « to » (points, bits, viewers…) ; el._fmt peut le mettre en forme
  function roll(el, to, ms = 900) {
    if (!el) return;
    to = Number(to) || 0;
    const from = Number(el.dataset.v ?? 0), fmt = el._fmt || (v => v);
    el.dataset.v = to;
    cancelAnimationFrame(el._roll);
    if (from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) el._roll = requestAnimationFrame(step);
    };
    el._roll = requestAnimationFrame(step);
  }
  // Plaque nom (même style que les POV) : carré logo ou photo, nom, infos, pseudo réseau, embout oblique.
  // o : { name, meta (HTML déjà échappé), photo, handle (HTML), right, cls, style }
  function plate(st, o = {}) {
    const ph = o.photo ? `<img class="ph" src="${esc(o.photo)}" alt="" onerror="this.parentElement.classList.remove('has-ph');this.remove()">` : '';
    return `<div class="kxp ${o.right ? 'right' : ''} ${o.cls || ''}" style="${o.style || ''}">
      <div class="kxp-sq ${o.photo ? 'has-ph' : ''}">${ph}${logo(st)}</div>
      <div class="kxp-main kx-neon-line bottom"><b class="kxp-name t-title">${esc(o.name)}</b>${o.meta ? `<span class="kxp-meta t-label">${o.meta}</span>` : ''}</div>
      ${o.handle ? `<div class="kxp-hd">${o.handle}</div>` : ''}
      <div class="kxp-cap" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
  }

  // Arbre de tournoi : les équipes des tours suivants sont déduites des vainqueurs (seuls les noms du 1er tour sont saisis)
  const ROUND_NAMES = { 1: 'Finale', 2: 'Demi-finales', 4: 'Quarts de finale', 8: 'Huitièmes' };
  function bracket(b) {
    const size = [4, 8, 16].includes(Number(b?.size)) ? Number(b.size) : 8, ms = b?.matches || [];
    const rounds = []; let idx = 0;
    for (let n = size / 2; n >= 1; n /= 2) {
      const prev = rounds[rounds.length - 1], r = [];
      for (let k = 0; k < n; k++) {
        const m = ms[idx] || {};
        const a = prev ? prev.matches[2 * k].winner : (m.a || ''), bb = prev ? prev.matches[2 * k + 1].winner : (m.b || '');
        const sa = Number(m.sa) || 0, sb = Number(m.sb) || 0;
        const winner = m.done && a && bb && sa !== sb ? (sa > sb ? a : bb) : '';
        r.push({ i: idx++, a, b: bb, sa, sb, done: !!m.done, winner });
      }
      rounds.push({ name: ROUND_NAMES[n] || n * 2 + 'es', matches: r });
    }
    return rounds;
  }

  function initials(name) {
    return String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  }

  // Image avec repli propre si le fichier n'existe pas encore
  function photo(src, name, cls = '') {
    const ini = esc(initials(name));
    if (!src) return `<div class="kx-ph ${cls}"><span>${ini}</span></div>`;
    return `<div class="kx-ph ${cls}"><img src="${esc(src)}" alt="" onerror="this.remove()"><span>${ini}</span></div>`;
  }

  function logo(st, cls = '') {
    const src = st?.settings?.logo || '/logo/logo.svg';
    return `<img class="${cls}" src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='/logo/logo.svg'">`;
  }

  const SOCIAL_ICONS = {
    x: '<path d="M4 4l16 16M20 4L4 20"/>',
    twitch: '<path d="M5 3h15v10l-4 4h-4l-3 3H7v-3H4V6zM11 8v4M15 8v4"/>',
    tiktok: '<path d="M14 3v11a4 4 0 1 1-4-4M14 3c0 3 2 5 5 5"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6"/>',
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9l5 3-5 3z"/>',
    discord: '<path d="M7 7c3-1.4 7-1.4 10 0l2 9c-2 1.6-4 2.3-5 2.5L13 17h-2l-1 1.5C9 18.3 7 17.6 5 16zM9.5 12.5h.01M14.5 12.5h.01"/>',
    site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'
  };
  function icon(name, size = 22) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SOCIAL_ICONS[name] || ''}</svg>`;
  }
  function socials(st) {
    const s = st?.settings?.socials || {};
    return Object.keys(SOCIAL_ICONS).filter(k => s[k]).map(k => ({ key: k, handle: s[k] }));
  }

  connect();
  watch(st => st.settings?.neon, applyNeon);
  return { on, watch, esc, slug, frame, holeMask, chamferPts, starfield, photo, logo, icon, socials, initials, chars, roll, plate, bracket, mv: MV, get state() { return state; } };
})();

/* Overlay ouvert directement dans un navigateur (pas dans OBS, ni dans l'aperçu de l'admin) :
   on réduit le 1920 × 1080 pour qu'il tienne dans la fenêtre, centré sur un damier (zones transparentes visibles). */
(() => {
  const fit = () => {
    const b = document.body;
    if (!b || !b.classList.contains('overlay') || window.obsstudio || window.top !== window) return false;
    document.documentElement.classList.add('kx-viewer');
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    document.documentElement.style.setProperty('--kx-fit', String(s));
    return true;
  };
  const start = () => { if (fit()) addEventListener('resize', fit); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
