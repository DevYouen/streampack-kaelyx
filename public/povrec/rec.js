/* Enregistreur des POV — tourne dans une fenêtre cachée de l'application de bureau (electron/povrec.js).
   Chaque POV est ouverte dans sa propre fenêtre cachée (/povrec/src.html) ; ici on la capture (image + son), on l'encode
   en continu (H.264 + AAC, carte graphique si possible) et on ne garde que les dernières secondes en mémoire.
   Sur demande, les N dernières secondes deviennent un fichier MP4 envoyé au serveur, que l'overlay /pov rejoue. */
const recs = new Map();   // id joueur -> enregistreur
let keepSec = 30;         // durée gardée (réglage « Durée du replay »)

const KEY_EVERY = 2e6;    // une image clé toutes les 2 s : un replay commence au plus 2 s avant la durée demandée

function fail(r, msg) {
  if (r.state === 'error') return;
  r.state = 'error'; r.error = msg;
  stopRec(r);
}
function stopRec(r) {
  r.stopped = true;
  try { r.stream.getTracks().forEach(t => t.stop()); } catch {}
  try { if (r.venc.state !== 'closed') r.venc.close(); } catch {}
  try { if (r.aenc && r.aenc.state !== 'closed') r.aenc.close(); } catch {}
}
// Lit une piste image par image (ou bloc de son par bloc de son) tant que l'enregistreur tourne
async function pump(r, reader, fn) {
  try {
    while (!r.stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      if (r.stopped) { value.close(); break; }
      fn(value);
    }
  } catch (e) { if (!r.stopped) fail(r, 'lecture : ' + e.message); }
  try { reader.releaseLock(); } catch {}
}
// Ne garde que les dernières secondes ; on coupe toujours sur une image clé pour que le clip démarre net
function trim(r) {
  const v = r.video;
  if (v.length < 2) return;
  const cutoff = v[v.length - 1].ts - (keepSec + 1) * 1e6;
  let k = 0;
  for (let i = 0; i < v.length && v[i].ts <= cutoff; i++) if (v[i].key) k = i;
  if (k > 0) v.splice(0, k);
  const t0 = v[0].ts - 5e5;
  let j = 0;
  while (j < r.audio.length && r.audio[j].ts < t0) j++;
  if (j) r.audio.splice(0, j);
}

async function start(id, cfg) {
  const old = recs.get(id);
  if (old) stopRec(old);
  keepSec = cfg.seconds || 30;
  // La fenêtre à capturer est choisie par l'application (une seule demande à la fois)
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: cfg.width, height: cfg.height, frameRate: cfg.fps },
    audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: true }
  });
  const vt = stream.getVideoTracks()[0], at = stream.getAudioTracks()[0];
  const r = { id, cfg, stream, video: [], audio: [], vcfg: null, acfg: null, state: 'rec', error: '', stopped: false,
    lastKey: -Infinity, frames: 0, fpsCount: 0, fps: 0, dropped: 0 };
  recs.set(id, r);

  // Image : H.264 (profil High), par la carte graphique si elle le permet
  r.venc = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig) r.vcfg = meta.decoderConfig;
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      r.video.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
      trim(r);
    },
    error: e => fail(r, 'encodage de l’image : ' + e.message)
  });
  const vconf = { codec: cfg.height > 720 ? 'avc1.640032' : 'avc1.64001F', width: cfg.width, height: cfg.height, bitrate: cfg.bitrate,
    framerate: cfg.fps, hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' }, latencyMode: 'realtime' };
  if (!(await VideoEncoder.isConfigSupported(vconf)).supported) vconf.hardwareAcceleration = 'no-preference';
  if (!(await VideoEncoder.isConfigSupported(vconf)).supported) { stopRec(r); recs.delete(id); throw new Error('encodage H.264 indisponible sur ce PC'); }
  r.venc.configure(vconf);
  pump(r, new MediaStreamTrackProcessor({ track: vt }).readable.getReader(), f => {
    // PC trop chargé : on saute une image plutôt que de prendre du retard
    if (r.venc.state !== 'configured' || r.venc.encodeQueueSize > 6) { r.dropped++; f.close(); return; }
    const key = f.timestamp - r.lastKey >= KEY_EVERY;
    if (key) r.lastKey = f.timestamp;
    r.venc.encode(f, { keyFrame: key });
    r.frames++; r.fpsCount++;
    f.close();
  });

  // Son : AAC stéréo
  if (at) {
    r.aenc = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig) r.acfg = meta.decoderConfig;
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        r.audio.push({ data, ts: chunk.timestamp, dur: chunk.duration || 0 });
      },
      error: e => { r.audioError = e.message; } // sans son, le replay reste possible
    });
    pump(r, new MediaStreamTrackProcessor({ track: at }).readable.getReader(), a => {
      try {
        if (r.aenc.state === 'unconfigured') r.aenc.configure({ codec: 'mp4a.40.2', sampleRate: a.sampleRate, numberOfChannels: Math.min(2, a.numberOfChannels), bitrate: 160000 });
        if (r.aenc.state === 'configured') r.aenc.encode(a);
      } catch (e) { r.audioError = e.message; }
      a.close();
    });
  }
  vt.addEventListener('ended', () => fail(r, 'capture interrompue'));
  const s = vt.getSettings();
  return { width: s.width, height: s.height, audio: !!at };
}

function stop(id) {
  const r = recs.get(id);
  if (r) { stopRec(r); recs.delete(id); }
}

// Les `seconds` dernières secondes en MP4 (démarre sur l'image clé juste avant)
function clip(id, seconds) {
  const r = recs.get(id);
  if (!r || r.state !== 'rec') throw new Error(r ? r.error || 'enregistrement arrêté' : 'POV non enregistrée');
  const v = r.video;
  if (!r.vcfg || v.length < 10) throw new Error('enregistrement en cours de démarrage, réessaie dans quelques secondes');
  const end = v[v.length - 1].ts, from = end - seconds * 1e6;
  let s = -1;
  for (let i = 0; i < v.length; i++) if (v[i].key && (s < 0 || v[i].ts <= from)) s = i;
  if (s < 0) throw new Error('aucune image clé, réessaie dans quelques secondes');
  const vs = v.slice(s), t0 = vs[0].ts;
  const as = r.acfg ? r.audio.filter(a => a.ts >= t0 && a.ts <= end + 2e5) : [];
  const target = new Mp4Muxer.ArrayBufferTarget();
  const mux = new Mp4Muxer.Muxer({
    target, fastStart: 'in-memory', firstTimestampBehavior: 'cross-track-offset',
    video: { codec: 'avc', width: r.vcfg.codedWidth || r.cfg.width, height: r.vcfg.codedHeight || r.cfg.height, frameRate: r.cfg.fps },
    audio: as.length ? { codec: 'aac', numberOfChannels: r.acfg.numberOfChannels, sampleRate: r.acfg.sampleRate } : undefined
  });
  // Image et son entrelacés dans l'ordre du temps (même horloge de capture pour les deux)
  let i = 0, j = 0;
  while (i < vs.length || j < as.length) {
    if (j >= as.length || (i < vs.length && vs[i].ts <= as[j].ts)) {
      const c = vs[i], next = vs[i + 1];
      mux.addVideoChunkRaw(c.data, c.key ? 'key' : 'delta', c.ts - t0, next ? next.ts - c.ts : 1e6 / r.cfg.fps, i === 0 ? { decoderConfig: r.vcfg } : undefined);
      i++;
    } else {
      const a = as[j];
      mux.addAudioChunkRaw(a.data, 'key', a.ts - t0, a.dur || 21333, j === 0 ? { decoderConfig: r.acfg } : undefined);
      j++;
    }
  }
  mux.finalize();
  return { buf: target.buffer, duration: (end - t0) / 1e6, audio: as.length > 0, width: r.cfg.width, height: r.cfg.height };
}

// État envoyé à l'application chaque seconde (affiché dans l'admin)
setInterval(() => {
  const list = [...recs.values()].map(r => {
    const v = r.video;
    const firstKey = v.find(c => c.key);
    const sec = firstKey ? Math.min(keepSec, (v[v.length - 1].ts - firstKey.ts) / 1e6) : 0;
    r.fps = r.fpsCount; r.fpsCount = 0;
    return { id: r.id, state: r.state, error: r.error, seconds: Math.floor(sec), fps: r.fps, audio: !!r.acfg && !r.audioError };
  });
  window.kxRec && kxRec.status(list);
}, 1000);

// Appelé par l'application (electron/povrec.js)
window.KXR = {
  start, stop,
  setSeconds: s => { keepSec = s; },
  clip: (id, seconds, req) => {
    try { const c = clip(id, seconds); kxRec.clip(req, c.buf, { duration: c.duration, audio: c.audio, width: c.width, height: c.height }); }
    catch (e) { kxRec.clip(req, null, { error: e.message }); }
  }
};
