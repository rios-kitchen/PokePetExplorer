/* PokePet Explorer – choosing the first Pokémon at the professor's: Bulbasaur, Charmander or Squirtle.
 * The cards start as closed Poké Balls; clicking one lets its Pokémon out. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const STARTERS = [
    { id: 'bulbasaur', type: 'grass' },
    { id: 'charmander', type: 'fire' },
    { id: 'squirtle', type: 'water' }
  ];
  let lang = 'en';
  let chosen = null;
  const t = (k, v) => I18N.t(lang, k, v);

  function draw(cv, img) {
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const k = Math.min(cv.width / img.width, cv.height / img.height);
    g.drawImage(c, (cv.width - img.width * k) / 2, (cv.height - img.height * k) / 2, img.width * k, img.height * k);
  }

  function render() {
    document.title = t('starter.title');
    $('#profName').textContent = t('starter.prof');
    $('#profText').textContent = t('starter.intro');
    $('#choose').textContent = chosen ? t('starter.choose', { name: I18N.t(lang, `starter.name.${chosen}`) }) : t('starter.pickFirst');
    $('#choose').disabled = !chosen;
    $('#pick').textContent = chosen ? t(`starter.about.${chosen}`) : t('starter.hint');
    $('#cards').replaceChildren(...STARTERS.map((s) => {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      const open = chosen === s.id;
      draw(cv, open ? SP.rgba(s.id, 'open', true) : SP.ballRgba(0, 0));
      const card = document.createElement('div');
      card.className = `card${open ? ' selected' : ''}`;
      const name = document.createElement('b');
      name.textContent = open ? t(`starter.name.${s.id}`) : '？';
      const type = document.createElement('span');
      type.className = `type ${s.type}`;
      type.textContent = t(`starter.type.${s.type}`);
      card.append(cv, name, type);
      card.addEventListener('click', () => { chosen = s.id; Sound.play('pat'); render(); });
      return card;
    }));
  }

  $('#choose').addEventListener('click', async () => {
    if (!chosen) return;
    $('#choose').disabled = true;
    Sound.play('fanfare');
    await api.invoke('starter:choose', chosen);
  });

  (async () => {
    const state = await api.invoke('state:get');
    lang = state.settings.lang;
    Sound.setEnabled(state.settings.sound);
    render();
  })();
})();
