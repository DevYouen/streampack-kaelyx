// Widget StreamElements — alertes Kaelyx (mêmes animations que /alerts)
let F = {};
const queue = []; let busy = false;
// Logo Kaelyx intégré (version blanche : la plus nette en petit sur le bandeau anthracite). Utilisé si le champ Logo est vide.
const KX_LOGO = `<svg class="kx-logo" xmlns="http://www.w3.org/2000/svg" viewBox="150 260 700 480" aria-hidden="true"><g fill="#F3F1F1">
<path d="M308 343 H462 L446 360 L436 470 L332 586 L340 360 Z"/><path d="M302 660 L566 372 L770 280 L562 432 Z"/><path d="M460 568 L525 512 L725 720 L582 686 Z"/>
<path d="M300 530 C228 562 166 612 170 652 C175 698 320 690 430 646 L560 598 C440 650 300 676 222 660 C192 652 196 604 300 530 Z"/>
<path d="M620 410 C700 382 806 370 828 404 C852 444 742 530 610 592 C716 522 800 452 792 418 C780 390 702 396 620 410 Z"/></g></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABELS = {
  follow: ['Nouveau follow', () => ''],
  sub: ['Nouvel abonné', a => a > 1 ? `${a} mois` : 'Bienvenue'],
  gift: ['Subs offerts', a => `${a || 1} sub${(a || 1) > 1 ? 's' : ''} offert${(a || 1) > 1 ? 's' : ''}`],
  bits: ['Bits', a => `${a || 0} bits`],
  raid: ['Raid', a => `${a || 0} viewers`],
  don: ['Don', a => `${a || 0} ${F.currency || '€'}`]
};

window.addEventListener('onWidgetLoad', obj => { F = obj.detail.fieldData || {}; });

window.addEventListener('onEventReceived', obj => {
  const l = obj.detail.listener, e = obj.detail.event || {};
  let t = null;
  if (l === 'follower-latest') t = { type: 'follow', user: e.name };
  else if (l === 'subscriber-latest') {
    if (e.bulkGifted) t = { type: 'gift', user: e.sender || e.name, amount: e.amount };
    else if (e.gifted && e.isCommunityGift) return; // déjà couvert par le bulk
    else if (e.gifted) t = { type: 'gift', user: e.sender || e.name, amount: 1 };
    else t = { type: 'sub', user: e.name, amount: e.amount, message: e.message };
  }
  else if (l === 'cheer-latest') t = { type: 'bits', user: e.name, amount: e.amount, message: e.message };
  else if (l === 'raid-latest') t = { type: 'raid', user: e.name, amount: e.amount };
  else if (l === 'tip-latest') t = { type: 'don', user: e.name, amount: e.amount, message: e.message };
  if (t && F['on_' + t.type] !== false) { queue.push(t); next(); }
});

function next() {
  if (busy || !queue.length) return;
  busy = true;
  const t = queue.shift();
  const [label, fmt] = LABELS[t.type];
  const amt = fmt(Number(t.amount) || 0);
  const dur = Math.max(2, Number(F.duration) || 6) * 1000;
  const stage = document.getElementById('stage');
  const logo = F.logo ? `<img src="${esc(F.logo)}" alt="">` : KX_LOGO;
  stage.innerHTML = `<div class="alert" id="a">
    <svg class="slash" viewBox="0 0 760 420" aria-hidden="true">
      <path d="M560 20 L200 400" stroke-width="10"/><path d="M620 60 L300 400" stroke-width="7"/><path d="M670 110 L400 400" stroke-width="5"/>
    </svg>
    <div class="burst"></div>
    <div class="card">
      <div class="label blade">${logo}<span>${esc(label)}</span></div>
      <div class="name blade"><b class="t-title">${esc(t.user || 'Viewer')}</b></div>
      ${amt ? `<div class="amount blade"><i class="k"></i>${esc(amt)}<i class="k"></i></div>` : ''}
      ${t.message && F.showMessage !== false ? `<div class="msg chamfer">${esc(t.message)}</div>` : ''}
    </div></div>`;
  const a = document.getElementById('a');
  requestAnimationFrame(() => a.classList.add('play'));
  if (F.sound) { const s = document.getElementById('snd'); s.src = F.sound; s.volume = Math.min(1, Math.max(0, Number(F.volume ?? 60) / 100) || 0); s.play().catch(() => {}); }
  setTimeout(() => a.classList.add('leave'), dur - 500);
  setTimeout(() => { stage.innerHTML = ''; busy = false; setTimeout(next, 400); }, dur);
}
