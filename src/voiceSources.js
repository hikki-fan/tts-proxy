function getOrigin(req, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '');

  const forwardedProto = req.get('x-forwarded-proto');
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function makeTtsUrl(origin, voice, options) {
  const params = new URLSearchParams();
  const provider = voice.provider === 'gemini' ? 'gemini' : 'mimo';
  const format = provider === 'gemini' ? 'wav' : options.format;
  params.set('voiceId', voice.id);
  params.set('voice', voice.voice);
  params.set('provider', provider);
  params.set('model', provider === 'gemini'
    ? (voice.model || options.geminiModel || '')
    : (voice.model || options.model));
  params.set('speed', '{{speakSpeed}}');
  params.set('format', format);
  if (voice.voiceDescription) params.set('voiceDescription', voice.voiceDescription);
  params.set('text', '{{java.encodeURI(java.encodeURI(speakText))}}');
  if (options.accessToken) params.set('token', options.accessToken);

  return `${origin}/api/tts?${params.toString()}`.replace(
    '%7B%7Bjava.encodeURI%28java.encodeURI%28speakText%29%29%7D%7D',
    '{{java.encodeURI(java.encodeURI(speakText))}}'
  ).replace('%7B%7BspeakSpeed%7D%7D', '{{speakSpeed}}');
}

function makeVoiceSource(origin, voice, options) {
  const now = String(options.now || Date.now());
  const effectiveFormat = voice.provider === 'gemini' ? 'wav' : options.format;
  const contentType = effectiveFormat === 'wav'
    ? 'audio/wav'
    : effectiveFormat === 'aac'
      ? 'audio/aac'
      : 'audio/mpeg';
  const common = {
    id: voice.id,
    name: voice.name,
    api: 'http',
    url: makeTtsUrl(origin, voice, options),
    contentType,
    customOrder: String(voice.order),
    concurrentRate: String(options.concurrentRate || 1),
    enabledCookieJar: options.legacy ? '0' : false,
    header: '',
    loginUrl: '',
    loginUi: '',
    loginCheckJs: '',
    lastUpdateTime: now
  };

  if (options.legacy) {
    return {
      id: common.id,
      name: common.name,
      api: common.api,
      url: common.url,
      customOrder: common.customOrder,
      concurrentRate: common.concurrentRate,
      enabledCookieJar: '0',
      lastUpdateTime: common.lastUpdateTime
    };
  }

  return common;
}

function makeVoiceSources(req, config, options = {}) {
  const origin = getOrigin(req, config.publicBaseUrl);
  return config.voices
    .filter(v => v.inSubscription !== false)
    .sort((a, b) => a.order - b.order)
    .map((voice) => makeVoiceSource(origin, voice, {
      accessToken: config.accessToken,
      concurrentRate: options.concurrentRate || 1,
      format: options.format || config.defaultFormat,
      legacy: options.legacy,
      geminiModel: options.geminiModel || config.geminiModel,
      model: options.model || config.mimoModel,
      now: options.now
    }));
}

function makeImportUrl(req, config, path = '/api/reader/tts-configs.json') {
  const origin = getOrigin(req, config.publicBaseUrl);
  return `legado://import/httpTTS?src=${encodeURIComponent(`${origin}${path}`)}`;
}

module.exports = {
  getOrigin,
  makeVoiceSources,
  makeImportUrl
};
