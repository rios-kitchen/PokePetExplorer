/* PokePet Explorer – chat window for the optional AI conversation with the pet. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const $ = (sel) => document.querySelector(sel);
  let view = { history: [], busy: false, name: '', lang: 'en' };
  const t = (k, v) => I18N.t(view.lang, k, v);

  function render() {
    document.title = t('chat.title', { name: view.name });
    $('#title').textContent = t('chat.title', { name: view.name });
    $('#clear').textContent = t('chat.clear');
    $('#text').placeholder = t('chat.placeholder', { name: view.name });
    $('#send').textContent = t('chat.send');
    $('#send').disabled = view.busy;
    const log = $('#log');
    const items = view.history.map((m) => {
      const d = document.createElement('div');
      d.className = `msg ${m.role}`;
      d.textContent = m.content;
      return d;
    });
    if (view.busy) {
      const d = document.createElement('div');
      d.className = 'msg assistant typing';
      d.textContent = '…';
      items.push(d);
    }
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = t('chat.empty', { name: view.name });
      items.push(p);
    }
    log.replaceChildren(...items);
    log.scrollTop = log.scrollHeight;
  }

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#text').value.trim();
    if (!text || view.busy) return;
    $('#text').value = '';
    $('#note').textContent = '';
    const res = await api.invoke('ai:chat', text);
    if (!res.ok && res.error !== 'busy') {
      $('#note').textContent = t(`chat.error.${res.error}`) || t('chat.error.other');
      $('#text').value = text;
    }
  });
  $('#clear').addEventListener('click', () => api.send('ai:clear'));

  api.on('chat', (v) => { view = v; render(); });
  (async () => { view = await api.invoke('ai:history'); render(); $('#text').focus(); })();
})();
