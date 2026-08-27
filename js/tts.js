/* App.TTS – read aloud through the Web Speech API, sentence chunks plus a Chrome keep-alive */
window.App = window.App || {};

App.TTS = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_CHUNK = 250;

  const synth = window.speechSynthesis || null;
  let voices = [];
  let queue = [];        // [{ text, el }]
  let idx = 0;
  let playing = false;
  let paused = false;
  let keepAlive = null;
  let activeEl = null;

  function supported() { return !!synth; }

  function activeReader() {
    const b = App.state.currentBook;
    if (!b) return null;
    return b.format === 'pdf' ? App.PdfReader : App.EpubReader;
  }

  /* ── Voices ── */

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices();
    const sel = $('tts-voice');
    const saved = App.Store.getData() ? App.Store.settings().tts.voiceURI : null;
    sel.innerHTML = '';
    voices.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(o);
    });
    const pick = pickVoice();
    if (saved && voices.some((v) => v.voiceURI === saved)) {
      sel.value = saved;
    } else if (pick) {
      sel.value = pick.voiceURI;
    }
  }

  function pickVoice() {
    const b = App.state.currentBook;
    const wanted = (b && b.language) || App.I18n.language();
    return voices.find((v) => v.lang.toLowerCase().startsWith(wanted)) ||
      voices.find((v) => v.default) || voices[0] || null;
  }

  function selectedVoice() {
    const uri = $('tts-voice').value ||
      (App.Store.getData() ? App.Store.settings().tts.voiceURI : null);
    return voices.find((v) => v.voiceURI === uri) || pickVoice();
  }

  /* ── Text chunks (Chrome cuts off long utterances) ── */

  function chunkText(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [clean];
    const chunks = [];
    sentences.forEach((s) => {
      s = s.trim();
      while (s.length > MAX_CHUNK) {
        let cut = s.lastIndexOf(',', MAX_CHUNK);
        if (cut < 80) cut = s.lastIndexOf(' ', MAX_CHUNK);
        if (cut < 40) cut = MAX_CHUNK;
        chunks.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) chunks.push(s);
    });
    return chunks;
  }

  async function buildQueue() {
    const reader = activeReader();
    queue = [];
    idx = 0;
    if (!reader) return;
    const blocks = await reader.getTtsBlocks();
    (blocks || []).forEach((b) => {
      chunkText(b.text).forEach((c) => queue.push({ text: c, el: b.el || null }));
    });
  }

  /* ── Playback ── */

  async function start() {
    if (!supported()) {
      App.Utils.toast(App.I18n.t('tts.unsupported'), 'error');
      return;
    }
    stop(true);
    if (!voices.length) loadVoices();
    await buildQueue();
    if (!queue.length) {
      App.Utils.toast(App.I18n.t('tts.noText'));
      return;
    }
    playing = true;
    paused = false;
    speakCurrent();
    startKeepAlive();
    updateUI();
  }

  function speakCurrent() {
    if (!playing) return;
    if (idx >= queue.length) {
      advanceSection();
      return;
    }
    const item = queue[idx];
    const u = new SpeechSynthesisUtterance(item.text);
    const settings = App.Store.getData() ? App.Store.settings().tts : { rate: 1 };
    u.rate = settings.rate || 1;
    const voice = selectedVoice();
    if (voice) u.voice = voice;
    u.onend = () => {
      unhighlight();
      if (u._cancelled) return;
      if (playing && !paused) {
        idx += 1;
        speakCurrent();
      }
    };
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('TTS error', e.error);
      if (playing && !u._cancelled) {
        idx += 1;
        speakCurrent();
      }
    };
    highlight(item);
    queue[idx]._utterance = u;
    synth.speak(u);
    setStatus(App.I18n.t('tts.reading'));
  }

  async function advanceSection() {
    const reader = activeReader();
    if (!reader) { stop(); return; }
    const ok = await reader.ttsAdvance();
    if (!ok) { stop(); return; }
    await buildQueue();
    if (!queue.length) {
      // empty section (an image page, say) → keep trying
      const again = await reader.ttsAdvance();
      if (again) await buildQueue();
    }
    if (!queue.length) { stop(); return; }
    speakCurrent();
  }

  function cancelCurrent() {
    const item = queue[idx];
    if (item && item._utterance) item._utterance._cancelled = true;
    synth.cancel();
  }

  function playPause() {
    if (!supported()) {
      App.Utils.toast(App.I18n.t('tts.unsupported'), 'error');
      return;
    }
    if (!playing) {
      start();
      return;
    }
    if (paused) {
      paused = false;
      synth.resume();
      setStatus(App.I18n.t('tts.reading'));
    } else {
      paused = true;
      synth.pause();
      setStatus(App.I18n.t('tts.paused'));
    }
    updateUI();
  }

  function stop(silent) {
    if (!supported()) return;
    playing = false;
    paused = false;
    if (queue[idx] && queue[idx]._utterance) queue[idx]._utterance._cancelled = true;
    synth.cancel();
    stopKeepAlive();
    unhighlight();
    queue = [];
    idx = 0;
    if (!silent) setStatus('');
    updateUI();
  }

  function skip(dir) {
    if (!playing || !queue.length) return;
    cancelCurrent();
    idx = App.Utils.clamp(idx + dir, 0, queue.length - 1);
    paused = false;
    speakCurrent();
    updateUI();
  }

  /* Without this trick Chrome stops long playback */
  function startKeepAlive() {
    stopKeepAlive();
    keepAlive = setInterval(() => {
      if (synth.speaking && !paused) {
        synth.pause();
        synth.resume();
      }
    }, 12000);
  }

  function stopKeepAlive() {
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  }

  /* ── Highlight for the current paragraph (EPUB) ── */

  function highlight(item) {
    unhighlight();
    if (item.el) {
      item.el.classList.add('leselampe-tts-active');
      activeEl = item.el;
      try { item.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }
  }

  function unhighlight() {
    if (activeEl) {
      try { activeEl.classList.remove('leselampe-tts-active'); } catch (e) { /* ignore */ }
      activeEl = null;
    }
  }

  /* ── UI ── */

  function setStatus(text) { $('tts-status').textContent = text || ''; }

  function updateUI() {
    const playBtn = $('btn-tts-play');
    App.Utils.setIcon(playBtn.querySelector('.icon'), playing && !paused ? 'pause' : 'play');
    $('btn-tts').classList.toggle('active', playing);
  }

  function reset() {
    stop(true);
    setStatus('');
    loadVoices();
  }

  function init() {
    if (!supported()) {
      $('tts-unsupported').hidden = false;
      return;
    }
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
    $('btn-tts-play').addEventListener('click', playPause);
    $('btn-tts-stop').addEventListener('click', () => stop());
    $('btn-tts-prev').addEventListener('click', () => skip(-1));
    $('btn-tts-next').addEventListener('click', () => skip(1));
    $('tts-voice').addEventListener('change', (ev) => {
      if (App.Store.getData()) {
        App.Store.settings().tts.voiceURI = ev.target.value;
        App.Store.save();
      }
    });
    $('tts-rate').addEventListener('input', (ev) => {
      const rate = parseFloat(ev.target.value);
      $('tts-rate-label').textContent = `${rate.toFixed(1)}×`;
      if (App.Store.getData()) {
        App.Store.settings().tts.rate = rate;
        App.Store.save();
      }
    });
  }

  return { init, start, stop, playPause, skip, reset, supported };
})();
