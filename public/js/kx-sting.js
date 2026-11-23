/* KAELYX — transition logo partagée (overlay /stinger et transitions des POV).
   Principes (style broadcast) : aplats aux couleurs de la marque, bandes obliques à 24° comme sur les scènes,
   mouvements nets (accélération puis freinage franc), couches décalées de quelques images, sortie dans le même sens
   que l'entrée. Le logo et le nom « voyagent » sur le panneau principal avec un léger retard (mouvement secondaire).

   Mode 'logo'  (2,6 s) : écran entièrement couvert ≈ 0,42 → 2,20 s · coupe conseillée 1,0 à 1,2 s (OBS : 1200 ms).
   Mode 'sweep' (1,05 s) : bande rapide, écran couvert ≈ 0,34 → 0,66 s · coupe à 0,45 s.

   Utilisation : const s = KXSting.mount(document.body); s.play('logo', etat); s.seek(ms) fige une image (rendu vidéo). */
const KXSting = (() => {
  const CSS = `
  .kxs { position: absolute; inset: 0; z-index: 100; overflow: hidden; pointer-events: none; visibility: hidden; }
  .kxs.go { visibility: visible; }
  .kxs-p { position: absolute; left: 0; top: -200px; width: 3000px; height: 1480px; overflow: hidden; will-change: transform;
    transform: translateX(-3400px) skewX(-24deg); backface-visibility: hidden; }
  .kxs-p1 { background: linear-gradient(110deg, #561C73 0%, #9933CC 100%); }
  .kxs-edge { position: absolute; top: 0; bottom: 0; width: 10px; background: #F3F1F1; }
  .kxs-edge.l { left: 0; } .kxs-edge.r { right: 0; }
  .kxs-p2 { background:
      radial-gradient(ellipse 820px 560px at 50% 50%, rgba(153,51,204,.20), rgba(86,28,115,.08) 50%, rgba(42,43,44,0) 75%),
      repeating-linear-gradient(90deg, rgba(243,241,241,.024) 0 2px, rgba(243,241,241,0) 2px 30px),
      #2A2B2C; }
  .kxs.sweep .kxs-p2 { background: repeating-linear-gradient(90deg, rgba(243,241,241,.03) 0 2px, rgba(243,241,241,0) 2px 30px), #561C73; }
  /* Traînées de mouvement : prolongent le bord des panneaux pendant la partie la plus rapide du geste (flou de bougé) */
  .kxs-sm { position: absolute; top: -200px; height: 1480px; opacity: 0; will-change: transform, opacity; transform: translateX(-3400px) skewX(-24deg); }
  .kxs-sm.r { left: 0; width: 3560px; }
  .kxs-sm.l { left: -560px; width: 560px; }
  .kxs-sm.r.c1 { background: linear-gradient(90deg, rgba(153,51,204,0) 0 3000px, rgba(153,51,204,.85) 3000px, rgba(153,51,204,0) 3560px); }
  .kxs-sm.l.c1 { background: linear-gradient(270deg, rgba(86,28,115,.85), rgba(86,28,115,0)); }
  .kxs-sm.r.c2 { background: linear-gradient(90deg, rgba(42,43,44,0) 0 3000px, rgba(42,43,44,.9) 3000px, rgba(42,43,44,0) 3560px); }
  .kxs-sm.l.c2 { background: linear-gradient(270deg, rgba(42,43,44,.9), rgba(42,43,44,0)); }
  .kxs.sweep .kxs-sm.r.c2 { background: linear-gradient(90deg, rgba(86,28,115,0) 0 3000px, rgba(86,28,115,.9) 3000px, rgba(86,28,115,0) 3560px); }
  .kxs.sweep .kxs-sm.l.c2 { background: linear-gradient(270deg, rgba(86,28,115,.9), rgba(86,28,115,0)); }
  /* Reflet qui balaie le panneau quand il se pose */
  .kxs-sheen { position: absolute; top: 0; bottom: 0; left: -420px; width: 320px; will-change: transform;
    background: linear-gradient(90deg, rgba(243,241,241,0), rgba(243,241,241,.075), rgba(243,241,241,0)); }
  .kxs.sweep .kxs-sheen { display: none; }
  /* Bandes de la marque (comme sur les scènes), qui dérivent lentement pendant que le logo est affiché */
  .kxs-drift { position: absolute; top: 0; bottom: 0; left: 2150px; width: 400px; will-change: transform; }
  .kxs-drift i { position: absolute; top: 0; bottom: 0; }
  .kxs-drift .b1 { left: 120px; width: 170px; background: linear-gradient(110deg, #561C73 0%, #9933CC 100%); }
  .kxs-drift .b2 { left: 62px; width: 24px; background: #9933CC; opacity: .55; }
  .kxs-drift .b3 { left: 14px; width: 4px; background: #C9CCD1; opacity: .45; }
  .kxs-drift .b4 { left: -1880px; width: 4px; background: #C9CCD1; opacity: .18; }
  .kxs.sweep .kxs-drift { display: none; }
  .kxs-mat { position: absolute; inset: 0; display: grid; place-items: center; transform: skewX(24deg); }
  .kxs-in { display: flex; flex-direction: column; align-items: center; will-change: transform; }
  .kxs-logo { width: 300px; height: 300px; margin-bottom: 28px; will-change: transform; }
  .kxs-logo img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 18px 32px rgba(18,18,20,.5)); }
  .kxs.sweep .kxs-logo { width: 170px; height: 170px; margin: 0; }
  .kxs-name { display: flex; flex-direction: column; align-items: center; }
  .kxs.sweep .kxs-name { display: none; }
  .kxs-mask { display: block; overflow: hidden; padding: 0 16px; }
  .kxs-mask b { display: block; font: italic 800 112px/1.02 var(--f-title, 'Barlow Condensed', sans-serif); text-transform: uppercase; letter-spacing: .03em;
    color: #F3F1F1; white-space: nowrap; padding-right: 8px; }
  .kxs-mask small { display: block; font: 700 18px/1.4 var(--f-body, Inter, sans-serif); letter-spacing: .62em; padding-left: .62em; text-transform: uppercase; color: #C9CCD1; white-space: nowrap; }
  .kxs-line { display: block; width: 420px; height: 4px; margin: 18px 0 16px; background: #9933CC; transform: scaleX(0); }`;

  // Courbes : entrée « coup de fouet » qui freine franchement, sortie qui accélère ; textes en ease-out net
  const WHIP = 'cubic-bezier(.65, 0, .15, 1)', EXIT = 'cubic-bezier(.65, 0, .35, 1)', OUT = 'cubic-bezier(.16, 1, .3, 1)', IN = 'cubic-bezier(.55, 0, 1, .45)';
  const SK = ' skewX(-24deg)';
  const P = x => `translateX(${x}px)${SK}`;
  const OFF_L = -3400, COVER = -540, OFF_R = 2400; // panneau hors champ à gauche / centré (couvre tout) / hors champ à droite

  // Chronologies : [élément, images clés, durée, délai, courbe] — les délais sont des instants absolus (ms)
  const TL = {
    logo: {
      total: 2620,
      steps: [
        ['p1', [{ transform: P(OFF_L) }, { transform: P(COVER) }], 520, 0, WHIP, 'both'],
        ['p2', [{ transform: P(OFF_L) }, { transform: P(COVER) }], 520, 70, WHIP, 'both'],
        ['drift', [{ transform: 'translateX(0)' }, { transform: 'translateX(-320px)' }], 2620, 0, 'linear', 'both'],
        ['inner', [{ transform: 'translateX(-130px)' }, { transform: 'translateX(0)' }], 900, 70, OUT, 'both'],
        ['logo', [{ transform: 'perspective(1400px) rotateY(34deg)' }, { transform: 'perspective(1400px) rotateY(0deg)' }], 1000, 70, OUT, 'both'],
        ['img', [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }], 1500, 600, 'linear', 'both'],
        ['sheen', [{ transform: 'translateX(0)' }, { transform: 'translateX(3900px)' }], 1000, 360, 'cubic-bezier(.45, 0, .25, 1)', 'both'],
        ['name', [{ transform: 'translateY(105%)' }, { transform: 'translateY(0)' }], 560, 520, OUT, 'both'],
        ['line', [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 560, 640, OUT, 'both'],
        ['sub', [{ transform: 'translateY(105%)' }, { transform: 'translateY(0)' }], 560, 700, OUT, 'both'],
        // Sortie : les textes rentrent dans leur masque, puis les panneaux repartent dans le même sens (le dernier arrivé part le premier)
        ['sub', [{ transform: 'translateY(0)' }, { transform: 'translateY(105%)' }], 240, 1860, IN, 'forwards'],
        ['line', [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], 260, 1880, IN, 'forwards'],
        ['name', [{ transform: 'translateY(0)' }, { transform: 'translateY(105%)' }], 260, 1900, IN, 'forwards'],
        ['inner', [{ transform: 'translateX(0)' }, { transform: 'translateX(190px)' }], 520, 1990, IN, 'forwards'],
        ['logo', [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(-30deg)' }], 520, 1990, IN, 'forwards'],
        ['p2', [{ transform: P(COVER) }, { transform: P(OFF_R) }], 540, 1980, EXIT, 'forwards'],
        ['p1', [{ transform: P(COVER) }, { transform: P(OFF_R) }], 560, 2060, EXIT, 'forwards']
      ]
    },
    sweep: {
      total: 1060,
      steps: [
        ['p1', [{ transform: P(OFF_L) }, { transform: P(COVER) }], 420, 0, WHIP, 'both'],
        ['p2', [{ transform: P(OFF_L) }, { transform: P(COVER) }], 420, 50, WHIP, 'both'],
        ['inner', [{ transform: 'translateX(-90px)' }, { transform: 'translateX(0)' }], 520, 50, OUT, 'both'],
        ['logo', [{ transform: 'perspective(1400px) rotateY(30deg)' }, { transform: 'perspective(1400px) rotateY(0deg)' }], 560, 50, OUT, 'both'],
        ['inner', [{ transform: 'translateX(0)' }, { transform: 'translateX(140px)' }], 420, 560, IN, 'forwards'],
        ['logo', [{ transform: 'perspective(1400px) rotateY(0deg)' }, { transform: 'perspective(1400px) rotateY(-26deg)' }], 420, 560, IN, 'forwards'],
        ['p2', [{ transform: P(COVER) }, { transform: P(OFF_R) }], 440, 520, EXIT, 'forwards'],
        ['p1', [{ transform: P(COVER) }, { transform: P(OFF_R) }], 460, 600, EXIT, 'forwards']
      ]
    }
  };

  function mount(host = document.body) {
    if (!document.getElementById('kxs-css')) {
      const s = document.createElement('style'); s.id = 'kxs-css'; s.textContent = CSS; document.head.appendChild(s);
    }
    const root = document.createElement('div');
    root.className = 'kxs'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `<div class="kxs-p kxs-p1"><i class="kxs-edge l"></i><i class="kxs-edge r"></i></div>
      <i class="kxs-sm r c1"></i><i class="kxs-sm l c1"></i><i class="kxs-sm r c2"></i><i class="kxs-sm l c2"></i>
      <div class="kxs-p kxs-p2"><i class="kxs-sheen"></i><div class="kxs-drift"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div><div class="kxs-mat"><div class="kxs-in">
        <div class="kxs-logo"><img alt=""></div>
        <div class="kxs-name"><span class="kxs-mask"><b></b></span><i class="kxs-line"></i><span class="kxs-mask"><small></small></span></div>
      </div></div></div>`;
    host.appendChild(root);
    const el = {
      p1: root.querySelector('.kxs-p1'), p2: root.querySelector('.kxs-p2'), drift: root.querySelector('.kxs-drift'),
      inner: root.querySelector('.kxs-in'), logo: root.querySelector('.kxs-logo'), name: root.querySelector('.kxs-mask b'),
      line: root.querySelector('.kxs-line'), sub: root.querySelector('.kxs-mask small'), img: root.querySelector('.kxs-logo img'),
      sheen: root.querySelector('.kxs-sheen'), smR1: root.querySelector('.kxs-sm.r.c1'), smL1: root.querySelector('.kxs-sm.l.c1'),
      smR2: root.querySelector('.kxs-sm.r.c2'), smL2: root.querySelector('.kxs-sm.l.c2')
    };
    // Chaque geste d'un panneau a sa traînée : devant le bord à l'entrée, derrière le bord à la sortie,
    // visible surtout au milieu du geste (là où il va le plus vite)
    const SMEAR = { p1: ['smR1', 'smL1'], p2: ['smR2', 'smL2'] };
    const withSmears = steps => steps.flatMap(st => {
      const sm = SMEAR[st[0]]; if (!sm) return [st];
      const [, frames, duration, delay, easing] = st;
      const key = frames[0].transform === P(OFF_L) ? sm[0] : sm[1];
      return [st, [key, [{ transform: frames[0].transform, opacity: 0 }, { opacity: 1, offset: .5 }, { transform: frames[1].transform, opacity: 0 }], duration, delay, easing, 'both']];
    });
    const img = root.querySelector('img');
    let anims = [], endT = null;

    function dress(st) {
      const s = st?.settings || {};
      const src = s.logo || '/logo/logo.svg';
      if (img.getAttribute('src') !== src) { img.onerror = () => { img.onerror = null; img.src = '/logo/logo.svg'; }; img.src = src; }
      el.name.textContent = s.teamName || 'KAELYX';
      el.sub.textContent = s.teamSub || '';
      el.sub.parentElement.style.display = s.teamSub ? '' : 'none';
    }
    function stop() { anims.forEach(a => a.cancel()); anims = []; clearTimeout(endT); root.classList.remove('go'); }
    // Joue une transition ; renvoie sa durée (ms)
    function play(kind = 'logo', st) {
      const tl = TL[kind] || TL.logo;
      stop(); dress(st || (typeof KX !== 'undefined' ? KX.state : null));
      root.classList.toggle('sweep', kind === 'sweep');
      root.classList.add('go');
      anims = withSmears(tl.steps).map(([k, frames, duration, delay, easing, fill]) => el[k].animate(frames, { duration, delay, easing, fill }));
      endT = setTimeout(stop, tl.total + 60);
      return tl.total;
    }
    // Fige la transition à l'instant t (ms) : utilisé pour fabriquer le fichier vidéo image par image
    function seek(t, kind = 'logo', st) {
      if (!anims.length || root.dataset.kind !== kind) { play(kind, st); root.dataset.kind = kind; clearTimeout(endT); }
      anims.forEach(a => { a.pause(); a.currentTime = t; });
    }
    return { play, seek, stop, el: root };
  }
  return { mount, TL };
})();
