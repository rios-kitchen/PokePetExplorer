// Weather and holiday greetings.
// Weather is off by default; when on, the user types a city (never located by IP) and the free Open-Meteo
// API (no key) is asked at most every couple of hours. Holidays come from a local table – no network.
const { fetchAllowed } = require('./sources');

// ---------------------------------------------------------------- holidays
const FIXED = {
  '01-01': 'newYear', '02-14': 'valentine', '02-27': 'pokemonDay', '06-01': 'childrensDay',
  '10-31': 'halloween', '12-24': 'christmasEve', '12-25': 'christmas', '12-31': 'newYearsEve'
};
// lunar holidays by year (Gregorian dates)
const LUNAR = {
  springFestival: ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'],
  lantern:        ['2026-03-03', '2027-02-20', '2028-02-09', '2029-02-27', '2030-02-17'],
  dragonBoat:     ['2026-06-19', '2027-06-09', '2028-05-28', '2029-06-16', '2030-06-05'],
  midAutumn:      ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12']
};
const HOLIDAY_GIFT = 3;   // berries

/** The holiday on a day ("YYYY-MM-DD"), or null. */
function holidayOn(day) {
  for (const [name, dates] of Object.entries(LUNAR)) if (dates.includes(day)) return name;
  return FIXED[day.slice(5)] || null;
}

/** Days since a timestamp, counted in local calendar days. */
function daysSince(ts, day) {
  if (!ts) return null;
  const a = new Date(ts); a.setHours(0, 0, 0, 0);
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - a) / 86400000);
}

/** A partner anniversary today: { days } for day 100, { years } on each yearly date – or null. */
function anniversary(hatchedAt, day) {
  const n = daysSince(hatchedAt, day);
  if (!n || n < 0) return null;
  if (n === 100) return { days: 100 };
  const a = new Date(hatchedAt);
  const [y, m, d] = day.split('-').map(Number);
  if (a.getMonth() + 1 === m && a.getDate() === d && y > a.getFullYear()) return { years: y - a.getFullYear() };
  return null;
}

// ---------------------------------------------------------------- weather
/** WMO weather code → clear | cloudy | fog | rain | snow | storm */
function kindOf(code) {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';   // drizzle, rain, showers (51–67, 80–82)
}

/** Look a city up by name → { name, country, lat, lon } (throws code 'not-found'). */
async function findCity(query, lang) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${lang === 'zh' ? 'zh' : 'en'}&format=json`;
  const res = await fetchAllowed(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = ((await res.json()).results || [])[0];
  if (!r) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  return { name: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude };
}

/** Current weather → { kind, temp (°C), isDay } */
async function current(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(3)}&longitude=${Number(lon).toFixed(3)}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const res = await fetchAllowed(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const c = (await res.json()).current || {};
  return { kind: kindOf(Number(c.weather_code) || 0), temp: Math.round(Number(c.temperature_2m)), isDay: !!c.is_day, at: Date.now() };
}

/** The next few hours: [{ kind, temp, pop (chance of rain %) }], hour by hour from the next full hour. */
async function forecast(lat, lon, hours = 3) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(3)}&longitude=${Number(lon).toFixed(3)}&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=${hours + 1}&timezone=auto`;
  const res = await fetchAllowed(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const h = (await res.json()).hourly || {};
  return (h.time || []).slice(1, hours + 1).map((_, i) => ({
    kind: kindOf(Number(h.weather_code[i + 1]) || 0), temp: Math.round(Number(h.temperature_2m[i + 1])),
    pop: Math.round(Number((h.precipitation_probability || [])[i + 1]) || 0)
  }));
}

const WET = ['rain', 'snow', 'storm'];
/**
 * What the pet says about the coming hours: { line, vars } – rain / snow / a storm on its way (in h hours),
 * clearing up, still raining, or else hot / cold / sunny / cloudy, with the temperature range and chance of rain.
 * now: the current weather ({ kind, temp }), next: forecast() hours.
 */
function forecastRemark(now, next) {
  if (!next || !next.length) return null;
  const temps = next.map((x) => x.temp);
  const vars = { lo: Math.min(...temps), hi: Math.max(...temps), pop: Math.max(...next.map((x) => x.pop || 0)), h: 1 };
  const wetNow = now && WET.includes(now.kind);
  const firstWet = next.findIndex((x) => WET.includes(x.kind));
  if (!wetNow && firstWet >= 0) {
    const kind = next[firstWet].kind;
    return { line: kind === 'storm' ? 'forecastStormSoon' : kind === 'snow' ? 'forecastSnowSoon' : 'forecastRainSoon', vars: { ...vars, h: firstWet + 1 } };
  }
  if (wetNow && firstWet < 0) {
    return { line: 'forecastClearing', vars };
  }
  if (wetNow) return { line: next.some((x) => x.kind === 'snow') ? 'forecastStillSnow' : 'forecastStillRain', vars };
  if (vars.hi >= 32) return { line: 'forecastHot', vars };
  if (vars.lo <= 0) return { line: 'forecastCold', vars };
  if (next.every((x) => x.kind === 'clear')) return { line: 'forecastSunny', vars };
  return { line: 'forecastCloudy', vars };
}

/** What the pet says about the weather (a line key), or null when it's unremarkable. */
function remark(w) {
  if (!w) return null;
  if (w.kind === 'storm') return 'weatherStorm';
  if (w.kind === 'snow') return 'weatherSnow';
  if (w.kind === 'rain') return 'weatherRain';
  if (w.temp >= 32) return 'weatherHot';
  if (w.temp <= 0) return 'weatherCold';
  if (w.kind === 'fog') return 'weatherFog';
  if (w.kind === 'clear' && w.isDay) return 'weatherSunny';
  return 'weatherCloudy';
}

module.exports = { FIXED, LUNAR, HOLIDAY_GIFT, holidayOn, anniversary, kindOf, findCity, current, forecast, forecastRemark, remark };
