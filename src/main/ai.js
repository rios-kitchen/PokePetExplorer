// Optional AI chat with the pet. Off by default; the user brings their own API key.
//
// Claude goes through the official Anthropic SDK. Every other provider here speaks the
// OpenAI-compatible chat-completions protocol, so they share one small HTTP client – including
// local servers (Ollama, LM Studio). Only the pet's current state and the conversation are sent:
// no clipboard, no window titles, nothing else from the computer.
const { net, safeStorage } = require('electron');

const PROVIDERS = {
  anthropic:   { kind: 'anthropic', url: 'https://api.anthropic.com',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'] },
  openai:      { kind: 'openai', url: 'https://api.openai.com/v1' },
  gemini:      { kind: 'openai', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  deepseek:    { kind: 'openai', url: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  moonshot:    { kind: 'openai', url: 'https://api.moonshot.cn/v1' },
  qwen:        { kind: 'openai', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  zhipu:       { kind: 'openai', url: 'https://open.bigmodel.cn/api/paas/v4' },
  siliconflow: { kind: 'openai', url: 'https://api.siliconflow.cn/v1' },
  openrouter:  { kind: 'openai', url: 'https://openrouter.ai/api/v1' },
  groq:        { kind: 'openai', url: 'https://api.groq.com/openai/v1' },
  mistral:     { kind: 'openai', url: 'https://api.mistral.ai/v1' },
  xai:         { kind: 'openai', url: 'https://api.x.ai/v1' },
  ollama:      { kind: 'openai', url: 'http://localhost:11434/v1', noKey: true },
  lmstudio:    { kind: 'openai', url: 'http://localhost:1234/v1', noKey: true },
  custom:      { kind: 'openai', url: '' }
};

// Claude models with server-side refusal fallbacks (Haiku has none)
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** https everywhere; plain http only for a server on this computer. */
function checkUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw Object.assign(new Error('bad-url'), { code: 'bad-url' }); }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname))) return u.href.replace(/\/+$/, '');
  throw Object.assign(new Error('bad-url'), { code: 'bad-url' });
}

// ---------------------------------------------------------------- API key (OS keychain when possible)
function encryptKey(key) {
  if (!key) return null;
  if (safeStorage.isEncryptionAvailable()) return { enc: safeStorage.encryptString(key).toString('base64') };
  return { plain: key };
}
function decryptKey(stored) {
  if (!stored) return '';
  if (stored.enc) { try { return safeStorage.decryptString(Buffer.from(stored.enc, 'base64')); } catch { return ''; } }
  return stored.plain || '';
}

// ---------------------------------------------------------------- persona
/** The pet's character for this conversation, from its live state. */
function persona(p) {
  const zh = p.lang === 'zh';
  const lines = [
    `You are ${p.name}, a ${p.species || 'Pokémon'} living on your trainer's computer desktop as a small pixel pet (a fan-made app).`,
    p.egg ? 'You are still an egg and have not hatched: answer only with tiny wobbly sounds and very short feelings.' : null,
    `Right now: level ${p.level}, mood ${p.mood}/100, fullness ${p.hunger}/100, cleanliness ${p.clean}/100, health ${p.health}/100.`,
    p.status ? `You have a status condition: ${p.status}.` : null,
    p.fainted ? 'You have fainted and can barely talk.' : null,
    `Contest stats: cool ${p.attrs.cool}, cute ${p.attrs.cute}, smart ${p.attrs.smart}, tough ${p.attrs.tough}.`,
    p.focus ? 'Your trainer is in a focus session right now – keep it very short and encourage them to keep focusing.' : null,
    'Talk like a cheerful little Pokémon companion: 1–3 short sentences, warm and playful, sometimes saying your own name.',
    'Let your mood, hunger and health colour what you say. Never claim to do things outside this chat.',
    zh ? 'Always reply in Simplified Chinese.' : 'Always reply in English.'
  ];
  return lines.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- calls
let anthropicClient = null, anthropicKey = null;
function anthropic(key) {
  if (!anthropicClient || anthropicKey !== key) {
    const mod = require('@anthropic-ai/sdk');
    const Anthropic = mod.Anthropic || mod.default;
    anthropicClient = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 });
    anthropicKey = key;
  }
  return anthropicClient;
}

async function askAnthropic(cfg, key, system, messages) {
  const model = cfg.model || PROVIDERS.anthropic.models[0];
  const params = {
    model,
    max_tokens: 4000,
    system,
    messages,
    output_config: { effort: 'low' }   // chat: short and quick
  };
  const client = anthropic(key);
  let res;
  try {
    res = FALLBACK_MODELS.has(model)
      // if a safety classifier declines, the API re-runs the request on a fallback model
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (e) {
    const mod = require('@anthropic-ai/sdk');
    const A = mod.Anthropic || mod.default;
    if (e instanceof A.AuthenticationError || e instanceof A.PermissionDeniedError) throw Object.assign(e, { code: 'auth' });
    if (e instanceof A.RateLimitError) throw Object.assign(e, { code: 'rate' });
    if (e instanceof A.NotFoundError || e instanceof A.BadRequestError) throw Object.assign(e, { code: 'model' });
    if (e instanceof A.APIConnectionError) throw Object.assign(e, { code: 'net' });
    throw Object.assign(e, { code: 'other' });
  }
  if (res.stop_reason === 'refusal') return { text: null, refused: true };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return { text };
}

async function askOpenAI(cfg, key, system, messages) {
  const base = checkUrl(cfg.baseUrl || PROVIDERS[cfg.provider]?.url || '');
  const res = await net.fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: cfg.model, max_tokens: 400, messages: [{ role: 'system', content: system }, ...messages] })
  }).catch((e) => { throw Object.assign(e, { code: 'net' }); });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'auth' });
  if (res.status === 429) throw Object.assign(new Error('HTTP 429'), { code: 'rate' });
  if (res.status === 404 || res.status === 400) throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'model' });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'other' });
  const json = await res.json();
  const text = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
  return { text: String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim() };   // some models inline their reasoning
}

/** One chat turn. history: [{ role: 'user'|'assistant', content }] (the new user message last). */
async function chat(cfg, key, petState, history) {
  const p = PROVIDERS[cfg.provider];
  if (!p) throw Object.assign(new Error('provider'), { code: 'provider' });
  if (!key && !p.noKey) throw Object.assign(new Error('no key'), { code: 'auth' });
  if (!cfg.model && p.kind !== 'anthropic') throw Object.assign(new Error('no model'), { code: 'model' });
  const system = persona(petState);
  const messages = history.slice(-20).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  return p.kind === 'anthropic' ? askAnthropic(cfg, key, system, messages) : askOpenAI(cfg, key, system, messages);
}

/** Models the endpoint offers (OpenAI-compatible /models, or Claude's model list). */
async function listModels(cfg, key) {
  const p = PROVIDERS[cfg.provider];
  if (!p) return [];
  if (p.kind === 'anthropic') {
    try {
      const page = await anthropic(key).models.list();
      return page.data.map((m) => m.id);
    } catch { return p.models; }
  }
  const base = checkUrl(cfg.baseUrl || p.url);
  const res = await net.fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status === 401 ? 'auth' : 'other' });
  const json = await res.json();
  return (json.data || json.models || []).map((m) => m.id || m.name).filter(Boolean).slice(0, 200);
}

module.exports = { PROVIDERS, checkUrl, encryptKey, decryptKey, persona, chat, listModels };
