// Twitch : chat + alertes (sub, gift, bits, raid) par le chat public, sans compte.
// Follows : EventSub, nécessite une connexion Twitch (Client ID + autorisation).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALERT_DEFAULTS = { follow: true, sub: true, gift: true, bits: true, raid: true };

module.exports = function createTwitch({ dataDir, broadcast, getConfig }) {
  const TOKEN_FILE = path.join(dataDir, 'twitch-token.json');
  const status = { chat: 'off', follows: 'off', channel: '', login: '', chatError: '', followsError: '' };
  const recent = [];
  let channel = '';

  const setStatus = p => { Object.assign(status, p); broadcast('twitch', status); };
  const cfg = () => getConfig() || {};
  const alertOn = type => ({ ...ALERT_DEFAULTS, ...(cfg().alerts || {}) })[type] !== false;
  function alert(t) {
    if (!alertOn(t.type)) return;
    broadcast('trigger', { kind: 'alert', source: 'twitch', ...t, at: Date.now() });
  }
  const cleanChannel = c => String(c || '').trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/^#/, '').replace(/[^a-z0-9_]/g, '');

  /* ---------------- Chat (IRC anonyme) ---------------- */
  let irc = null, ircTimer, joinTimer, ircRetry = 0;

  function ircConnect() {
    clearTimeout(ircTimer); clearTimeout(joinTimer);
    if (irc) { const old = irc; irc = null; try { old.close(); } catch {} }
    if (!channel) return setStatus({ chat: 'off', channel: '', chatError: '' });
    if (typeof WebSocket === 'undefined') return setStatus({ chat: 'error', chatError: 'Node.js 22 ou plus requis' });
    setStatus({ chat: 'connecting', channel, chatError: '' });
    const ws = irc = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000)));
      ws.send('JOIN #' + channel);
      joinTimer = setTimeout(() => { if (irc === ws) setStatus({ chat: 'error', chatError: 'Chaîne introuvable' }); }, 10000);
    };
    ws.onmessage = e => String(e.data).split('\r\n').forEach(l => { if (l) try { onIrc(ws, parse(l)); } catch (err) { console.error('  Twitch :', err.message); } });
    ws.onclose = () => {
      if (irc !== ws) return;
      irc = null; clearTimeout(joinTimer);
      setStatus({ chat: 'connecting' });
      ircTimer = setTimeout(ircConnect, Math.min(30000, 1000 * 2 ** ircRetry++));
    };
    ws.onerror = () => {};
  }

  const unesc = v => v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] ?? c));
  function parse(line) {
    const tags = {}; let prefix = '', rest = line, trailing = null;
    if (rest[0] === '@') {
      const i = rest.indexOf(' ');
      for (const kv of rest.slice(1, i).split(';')) { const j = kv.indexOf('='); if (j > 0) tags[kv.slice(0, j)] = unesc(kv.slice(j + 1)); }
      rest = rest.slice(i + 1);
    }
    if (rest[0] === ':') { const i = rest.indexOf(' '); prefix = rest.slice(1, i); rest = rest.slice(i + 1); }
    const t = rest.indexOf(' :');
    if (t >= 0) { trailing = rest.slice(t + 2); rest = rest.slice(0, t); }
    const params = rest.split(' ').filter(Boolean);
    return { tags, prefix, command: params.shift(), params, trailing };
  }

  // Découpe le texte en morceaux texte / emote (positions Twitch en caractères Unicode)
  function splitEmotes(text, tag) {
    const chars = Array.from(text), ranges = [];
    if (tag) for (const part of tag.split('/')) {
      const [id, pos] = part.split(':');
      if (!pos || !/^[\w-]+$/.test(id)) continue;
      for (const r of pos.split(',')) { const [a, b] = r.split('-').map(Number); if (b >= a) ranges.push([a, b, id]); }
    }
    ranges.sort((x, y) => x[0] - y[0]);
    const out = []; let i = 0;
    for (const [a, b, id] of ranges) {
      if (a < i) continue;
      if (a > i) out.push({ t: chars.slice(i, a).join('') });
      out.push({ e: id, t: chars.slice(a, b + 1).join('') }); i = b + 1;
    }
    if (i < chars.length) out.push({ t: chars.slice(i).join('') });
    return out;
  }

  function onIrc(ws, m) {
    const tg = m.tags;
    switch (m.command) {
      case 'PING': ws.send('PONG :' + (m.trailing || 'tmi.twitch.tv')); break;
      case 'RECONNECT': ws.close(); break;
      case 'ROOMSTATE': clearTimeout(joinTimer); ircRetry = 0; setStatus({ chat: 'connected', chatError: '' }); break;
      case 'NOTICE': if (/suspend|does not exist|banned/i.test(m.trailing || '')) setStatus({ chat: 'error', chatError: m.trailing }); break;
      case 'PRIVMSG': {
        const login = m.prefix.split('!')[0], user = tg['display-name'] || login;
        let text = m.trailing || '', action = false;
        const am = text.match(/^\x01ACTION (.*)\x01$/); if (am) { text = am[1]; action = true; }
        if (Number(tg.bits) > 0) alert({ type: 'bits', user, amount: Number(tg.bits), message: text.replace(/\b[a-z]+\d+\b/gi, '').replace(/\s+/g, ' ').trim() });
        const c = cfg();
        if ((c.ignore || []).some(x => String(x).trim().toLowerCase() === login)) break;
        if (c.hideCommands !== false && text.startsWith('!')) break;
        const badges = (tg.badges || '').split(',').map(b => b.split('/')[0]).filter(b => ['broadcaster', 'moderator', 'vip', 'subscriber'].includes(b));
        const msg = { id: tg.id || crypto.randomUUID(), login, user, color: tg.color || '', badges, action, parts: splitEmotes(text, tg.emotes), at: Date.now() };
        recent.push(msg); if (recent.length > 50) recent.shift();
        broadcast('chat', msg);
        break;
      }
      case 'USERNOTICE': {
        const id = tg['msg-id'], user = tg['display-name'] || tg.login || '';
        if (id === 'sub' || id === 'resub') alert({ type: 'sub', user, amount: Number(tg['msg-param-cumulative-months']) || 1, message: m.trailing || '' });
        else if (id === 'subgift' && !tg['msg-param-community-gift-id']) alert({ type: 'gift', user, amount: 1 });
        else if (id === 'submysterygift') alert({ type: 'gift', user, amount: Number(tg['msg-param-mass-gift-count']) || 1 });
        else if (id === 'raid') alert({ type: 'raid', user: tg['msg-param-displayName'] || user, amount: Number(tg['msg-param-viewerCount']) || 0 });
        break;
      }
      case 'CLEARCHAT': {
        const login = m.trailing ? m.trailing.toLowerCase() : null;
        for (let i = recent.length - 1; i >= 0; i--) if (!login || recent[i].login === login) recent.splice(i, 1);
        broadcast('chat-clear', { login });
        break;
      }
      case 'CLEARMSG': {
        const id = tg['target-msg-id'];
        const i = recent.findIndex(x => x.id === id); if (i >= 0) recent.splice(i, 1);
        broadcast('chat-clear', { id });
        break;
      }
    }
  }

  /* ---------------- Follows (EventSub) ---------------- */
  let token = '';
  try { token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token || ''; } catch {}
  let me = null, es = null, esGen = 0, esWatch, esRetry = 0, esTimer;
  let pendingState = null; // { value, until } : protège le retour d'autorisation Twitch

  function closeEs() { esGen++; clearTimeout(esWatch); clearTimeout(esTimer); if (es) { try { es.close(); } catch {} es = null; } }

  async function followsConnect() {
    closeEs();
    const gen = esGen;
    if (!token) return setStatus({ follows: 'off', login: '' });
    if (!channel) return setStatus({ follows: 'waiting' });
    if (typeof WebSocket === 'undefined') return setStatus({ follows: 'error', followsError: 'Node.js 22 ou plus requis' });
    try {
      const v = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + token } });
      if (gen !== esGen) return;
      if (v.status === 401) { saveToken(''); return setStatus({ follows: 'expired', login: '' }); }
      const info = await v.json();
      if (!(info.scopes || []).includes('moderator:read:followers')) return setStatus({ follows: 'error', followsError: 'Autorisation incomplète, reconnecte Twitch' });
      me = { clientId: info.client_id, userId: info.user_id, login: info.login };
      let broadcasterId = me.userId;
      if (channel !== me.login) {
        const r = await helix('/users?login=' + encodeURIComponent(channel));
        broadcasterId = r?.data?.[0]?.id;
        if (!broadcasterId) return setStatus({ follows: 'error', login: me.login, followsError: 'Chaîne introuvable' });
      }
      if (gen !== esGen) return;
      setStatus({ follows: 'connecting', login: me.login });
      openEs('wss://eventsub.wss.twitch.tv/ws', gen, broadcasterId, true);
    } catch (e) {
      if (gen !== esGen) return;
      setStatus({ follows: 'connecting' });
      esTimer = setTimeout(followsConnect, Math.min(60000, 2000 * 2 ** esRetry++));
    }
  }

  async function helix(url, opts = {}) {
    const r = await fetch('https://api.twitch.tv/helix' + url, {
      ...opts, headers: { 'Client-Id': me.clientId, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(body.message || 'HTTP ' + r.status); err.status = r.status; throw err; }
    return body;
  }

  function openEs(url, gen, broadcasterId, subscribe) {
    const ws = new WebSocket(url);
    let keepalive = 15;
    const watch = () => { clearTimeout(esWatch); esWatch = setTimeout(() => { if (gen === esGen) followsConnect(); }, (keepalive + 10) * 1000); };
    ws.onmessage = async e => {
      if (gen !== esGen) return ws.close();
      watch();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const type = m.metadata?.message_type;
      if (type === 'session_welcome') {
        keepalive = m.payload.session.keepalive_timeout_seconds || 15; watch();
        const old = es; es = ws; if (old && old !== ws) try { old.close(); } catch {}
        if (!subscribe) return setStatus({ follows: 'connected', followsError: '' });
        try {
          await helix('/eventsub/subscriptions', { method: 'POST', body: JSON.stringify({
            type: 'channel.follow', version: '2',
            condition: { broadcaster_user_id: broadcasterId, moderator_user_id: me.userId },
            transport: { method: 'websocket', session_id: m.payload.session.id }
          }) });
          esRetry = 0;
          setStatus({ follows: 'connected', followsError: '' });
        } catch (err) {
          setStatus({ follows: 'error', followsError: err.status === 403 ? `Le compte ${me.login} doit être modérateur de ${channel}` : err.message });
          closeEs();
        }
      } else if (type === 'notification' && m.payload.subscription?.type === 'channel.follow') {
        alert({ type: 'follow', user: m.payload.event.user_name || m.payload.event.user_login });
      } else if (type === 'session_reconnect') {
        openEs(m.payload.session.reconnect_url, gen, broadcasterId, false);
      } else if (type === 'revocation') {
        setStatus({ follows: 'error', followsError: 'Accès retiré par Twitch, reconnecte Twitch' });
        closeEs();
      }
    };
    ws.onclose = () => {
      if (gen !== esGen || es !== ws) return;
      es = null; setStatus({ follows: 'connecting' });
      esTimer = setTimeout(followsConnect, Math.min(60000, 2000 * 2 ** esRetry++));
    };
    ws.onerror = () => {};
    if (!es) es = ws;
  }

  function saveToken(t) {
    token = t;
    if (t) fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: t }));
    else try { fs.unlinkSync(TOKEN_FILE); } catch {}
  }

  /* ---------------- API pour server.js ---------------- */
  return {
    configure() {
      const next = cleanChannel(cfg().channel);
      if (next === channel) return;
      channel = next;
      recent.length = 0;
      ircConnect();
      followsConnect();
    },
    status: () => status,
    recent: () => recent,
    newState() {
      pendingState = { value: crypto.randomBytes(16).toString('hex'), until: Date.now() + 10 * 60000 };
      return pendingState.value;
    },
    async setToken(t, state) {
      if (!pendingState || state !== pendingState.value || Date.now() > pendingState.until) return false;
      pendingState = null;
      saveToken(String(t || ''));
      await followsConnect();
      return true;
    },
    async logout() {
      const t = token, id = me?.clientId;
      saveToken(''); me = null; closeEs();
      setStatus({ follows: 'off', login: '', followsError: '' });
      if (t && id) fetch('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: id, token: t }) }).catch(() => {});
    }
  };
};
