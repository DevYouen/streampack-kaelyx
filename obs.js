// Connexion à OBS (WebSocket intégré à OBS 28+, protocole v5) : replay instantané avec le tampon de relecture.
// Le mot de passe du WebSocket OBS est rangé dans data/obs.json (jamais dans l'état lu par les overlays).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCENE = 'Kaelyx · Replay', MEDIA = 'Kaelyx · Replay vidéo', BAND = 'Kaelyx · Replay bandeau';

module.exports = function ({ dataDir, broadcast, port }) {
  const FILE = path.join(dataDir, 'obs.json');
  let cfg = { url: 'ws://127.0.0.1:4455', password: '', enabled: false };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
  const status = { state: 'off', error: '', replayBuffer: null, replaying: false, url: cfg.url, enabled: cfg.enabled, hasPassword: !!cfg.password };
  const setStatus = p => { Object.assign(status, p); broadcast('obs', status); };
  let ws = null, retry = null, nextId = 1, pending = new Map(), waiters = [], prevScene = '', endTimer = null;

  const sha = s => crypto.createHash('sha256').update(s).digest('base64');
  function connect() {
    clearTimeout(retry);
    try { ws && ws.close(); } catch {}
    ws = null;
    if (!cfg.enabled) return setStatus({ state: 'off', error: '' });
    if (typeof WebSocket === 'undefined') return setStatus({ state: 'error', error: 'WebSocket indisponible (Node 22 requis)' });
    setStatus({ state: 'connecting', error: '' });
    let sock;
    try { sock = new WebSocket(cfg.url); } catch (e) { return fail('adresse invalide'); }
    ws = sock;
    sock.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.op === 0) { // Hello : identification (avec mot de passe si OBS en demande un)
        const d = { rpcVersion: 1, eventSubscriptions: 4 | 64 | 256 }; // scènes, sorties, médias
        if (m.d.authentication) {
          if (!cfg.password) { fail('OBS demande un mot de passe'); try { sock.close(); } catch {} return; }
          d.authentication = sha(sha(cfg.password + m.d.authentication.salt) + m.d.authentication.challenge);
        }
        sock.send(JSON.stringify({ op: 1, d }));
      } else if (m.op === 2) { setStatus({ state: 'connected', error: '' }); refresh(); }
      else if (m.op === 7) { const p = pending.get(m.d.requestId); if (p) { pending.delete(m.d.requestId); m.d.requestStatus.result ? p.ok(m.d.responseData || {}) : p.ko(new Error(m.d.requestStatus.comment || 'refusé par OBS')); } }
      else if (m.op === 5) onEvent(m.d.eventType, m.d.eventData || {});
    };
    sock.onclose = ev => {
      if (ws !== sock) return;
      for (const p of pending.values()) p.ko(new Error('connexion OBS perdue')); pending.clear();
      if (ev.code === 4009) fail('mot de passe OBS incorrect');
      else if (status.state !== 'error') fail(status.state === 'connected' ? 'connexion OBS perdue' : 'OBS injoignable (lancé ? WebSocket activé ?)');
    };
    sock.onerror = () => {};
  }
  function fail(error) {
    setStatus({ state: 'error', error, replayBuffer: null });
    clearTimeout(retry); if (cfg.enabled) retry = setTimeout(connect, 10000); // nouvel essai toutes les 10 s
  }
  function req(requestType, requestData = {}) {
    return new Promise((ok, ko) => {
      if (!ws || status.state !== 'connected') return ko(new Error('OBS non connecté'));
      const requestId = String(nextId++);
      pending.set(requestId, { ok, ko });
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => { if (pending.delete(requestId)) ko(new Error('OBS ne répond pas')); }, 8000);
    });
  }
  const waitEvent = (type, ms) => new Promise((ok, ko) => {
    const w = { type, ok }; waiters.push(w);
    setTimeout(() => { waiters = waiters.filter(x => x !== w); ko(new Error('OBS n’a pas enregistré le replay')); }, ms);
  });
  function onEvent(type, d) {
    for (const w of waiters.filter(x => x.type === type)) { waiters = waiters.filter(x => x !== w); w.ok(d); }
    if (type === 'ReplayBufferStateChanged') setStatus({ replayBuffer: !!d.outputActive });
    if (type === 'MediaInputPlaybackEnded' && d.inputName === MEDIA && status.replaying) stop();
  }
  async function refresh() { try { const r = await req('GetReplayBufferStatus'); setStatus({ replayBuffer: !!r.outputActive }); } catch { setStatus({ replayBuffer: null }); } }

  // Crée la scène de replay (vidéo + bandeau) si elle n'existe pas encore, et démarre le tampon de relecture
  async function setup() {
    const { scenes } = await req('GetSceneList');
    if (!scenes.some(s => s.sceneName === SCENE)) await req('CreateScene', { sceneName: SCENE });
    const { inputs } = await req('GetInputList');
    if (!inputs.some(i => i.inputName === MEDIA))
      await req('CreateInput', { sceneName: SCENE, inputName: MEDIA, inputKind: 'ffmpeg_source', sceneItemEnabled: true,
        inputSettings: { is_local_file: true, local_file: '', restart_on_activate: true, close_when_inactive: true, clear_on_media_end: false } });
    if (!inputs.some(i => i.inputName === BAND))
      await req('CreateInput', { sceneName: SCENE, inputName: BAND, inputKind: 'browser_source', sceneItemEnabled: true,
        inputSettings: { url: `http://localhost:${port}/replay`, width: 1920, height: 1080, reroute_audio: false } });
    try { await req('StartReplayBuffer'); } catch {} // déjà démarré, ou désactivé dans les réglages de sortie d'OBS
    await refresh();
    return { scene: SCENE };
  }
  // Replay : enregistre les dernières secondes, passe sur la scène de replay, revient tout seul à la fin
  async function play({ slow = false } = {}) {
    if (status.replaying) throw new Error('un replay est déjà en cours');
    const rb = await req('GetReplayBufferStatus');
    if (!rb.outputActive) throw new Error('le tampon de relecture d’OBS n’est pas démarré (bouton « Préparer OBS »)');
    const saved = waitEvent('ReplayBufferSaved', 10000);
    await req('SaveReplayBuffer');
    const { savedReplayPath } = await saved;
    const { scenes } = await req('GetSceneList');
    if (!scenes.some(s => s.sceneName === SCENE)) await setup();
    const cur = await req('GetCurrentProgramScene');
    prevScene = cur.currentProgramSceneName || cur.sceneName || '';
    await req('SetInputSettings', { inputName: MEDIA, inputSettings: { local_file: savedReplayPath, speed_percent: slow ? 50 : 100 } });
    await req('SetCurrentProgramScene', { sceneName: SCENE });
    setStatus({ replaying: true, slow });
    broadcast('trigger', { kind: 'replay-start', slow, at: Date.now() });
    clearTimeout(endTimer); endTimer = setTimeout(() => status.replaying && stop(), 5 * 60e3); // filet de sécurité
    return { path: savedReplayPath };
  }
  async function stop() {
    clearTimeout(endTimer);
    setStatus({ replaying: false });
    broadcast('trigger', { kind: 'replay-end', at: Date.now() });
    if (prevScene) { try { await req('SetCurrentProgramScene', { sceneName: prevScene }); } catch {} }
  }
  function configure(next) {
    if (typeof next.url === 'string' && /^wss?:\/\/[^\s]+$/.test(next.url.trim())) cfg.url = next.url.trim();
    if (typeof next.password === 'string') cfg.password = next.password;
    if (typeof next.enabled === 'boolean') cfg.enabled = next.enabled;
    try { fs.writeFileSync(FILE, JSON.stringify(cfg)); } catch {}
    setStatus({ url: cfg.url, enabled: cfg.enabled, hasPassword: !!cfg.password });
    connect();
  }
  connect();
  return { status: () => status, configure, setup, play, stop };
};
