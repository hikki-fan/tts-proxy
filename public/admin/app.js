const state = {
  config: null,
  voices: [],
  models: [],
  selectedLang: 'zh',
  selectedMode: 'standard',
  selectedModel: 'mimo-v2.5-tts',
  selectedVoiceId: '',
  selectedVoice: '',
  statsPeriod: 'day',
  statsMode: 'calls',
  statsData: null,
  activeTab: 'overview',
  studioTab: 'test',
  voiceTab: 'preset',
  geminiLang: 'zh',
  geminiVoiceId: '',
  geminiVoice: '',
  cacheEntries: [],
  cachePage: 1,
  cachePageSize: 20
};

// MiMo v2.5 预设音色列表
const PRESET_VOICES = [
  { value: 'mimo_default', label: 'mimo_default（默认）' },
  { value: 'default_zh',   label: 'default_zh（中文女声）' },
  { value: 'default_en',   label: 'default_en（英文女声）' },
  { value: '冰糖',          label: '冰糖（中文女声）' },
  { value: '茉莉',          label: '茉莉（中文女声）' },
  { value: '苏打',          label: '苏打（中文男声）' },
  { value: '白桦',          label: '白桦（中文男声）' },
  { value: 'Mia',          label: 'Mia（英文女声）' },
  { value: 'Chloe',        label: 'Chloe（英文女声）' },
  { value: 'Milo',         label: 'Milo（英文男声）' },
  { value: 'Dean',         label: 'Dean（英文男声）' },
];

function buildVoiceOptions(selected) {
  const presets = PRESET_VOICES;
  const presetValues = new Set(presets.map(v => v.value));
  // 补充 state.voices 中不在预设里的 voice 值（仅 MiMo 音色）
  const extras = [...new Set(
    state.voices.filter(v => v.provider !== 'gemini').map(v => v.voice).filter(v => v && v !== 'clone' && !presetValues.has(v))
  )];
  const all = [
    ...presets,
    ...extras.map(v => ({ value: v, label: v }))
  ];
  return all.map(opt =>
    `<option value="${escapeAttr(opt.value)}"${opt.value === selected ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`
  ).join('');
}

const modeMeta = {
  standard: {
    title: '标准 TTS',
    subtitle: '内置音色，稳定快速',
    marker: '麦',
    model: 'mimo-v2.5-tts'
  },
  design: {
    title: '声音设计',
    subtitle: '用文字描述声音风格',
    marker: '设',
    model: 'mimo-v2.5-tts-voicedesign'
  },
  clone: {
    title: '声音克隆',
    subtitle: '上传音频样本复刻音色',
    marker: '克',
    model: 'mimo-v2.5-tts-voiceclone'
  }
};

const $ = (selector) => document.querySelector(selector);

const _qrUrlCache = {};

function renderInlineQr(url, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!url) { container.hidden = true; return; }
  if (_qrUrlCache[containerId] === url) return; // URL 未变，保持现有内容和可见状态不变
  _qrUrlCache[containerId] = url;
  // 静默生成图片，不改变 hidden 状态（由按钮控制显隐）
  container.innerHTML = '<span class="qr-inline-loading">生成中…</span>';
  const stamp = url;
  function tryLoad(src, fallbackSrc) {
    const img = new Image();
    img.className = 'qr-inline-img';
    img.onload = () => {
      if (_qrUrlCache[containerId] !== stamp) return;
      container.innerHTML = '';
      container.appendChild(img);
    };
    img.onerror = () => {
      if (_qrUrlCache[containerId] !== stamp) return;
      if (fallbackSrc) { tryLoad(fallbackSrc, null); return; }
      container.innerHTML = '<span class="qr-inline-error">加载失败</span>';
    };
    img.src = src;
  }
  const primary = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8&chld=M|2`;
  const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&margin=8`;
  tryLoad(primary, fallback);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(localStorage.getItem('mimo_theme') || '');
  if (localStorage.getItem('mimo_sidebar_expanded') === '1') toggleSidebar(true, true);

  bindEvents();
  const savedTab = localStorage.getItem('mimo_active_tab') || 'studio';
  switchTab(savedTab);
  const savedStudio = localStorage.getItem('mimo_studio_tab') || 'test';
  switchStudioTab(savedStudio);
  await initPage();
});

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function lightenHex(hex, pct) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  r=Math.min(255,Math.round(r+(255-r)*pct/100));
  g=Math.min(255,Math.round(g+(255-g)*pct/100));
  b=Math.min(255,Math.round(b+(255-b)*pct/100));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function applyCustomAccent(hex) {
  const root = document.documentElement;
  root.dataset.theme = 'custom';
  const light = lightenHex(hex, 18);
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-2', light);
  root.style.setProperty('--accent-grad', `linear-gradient(135deg,${light},${hex})`);
  root.style.setProperty('--accent-soft', hexToRgba(hex, 0.11));
  root.style.setProperty('--shadow-accent', `0 6px 20px ${hexToRgba(hex, 0.28)}`);
  try { localStorage.setItem('mimo_theme','custom'); localStorage.setItem('mimo_custom_accent', hex); } catch {}
  document.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
}

function applyTheme(theme) {
  if (theme === 'custom') {
    const hex = localStorage.getItem('mimo_custom_accent') || '#4f6ef2';
    const colorInput = document.getElementById('customAccentColor');
    if (colorInput) colorInput.value = hex;
    applyCustomAccent(hex);
    return;
  }
  // Clear any inline custom vars
  const root = document.documentElement;
  ['--accent','--accent-2','--accent-grad','--accent-soft','--shadow-accent'].forEach(v => root.style.removeProperty(v));
  root.dataset.theme = theme || '';
  document.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', (b.dataset.theme || '') === (theme || '')));
  try { localStorage.setItem('mimo_theme', theme || ''); } catch {}
}

function toggleSidebar(forceExpand, silent) {
  const sidebar = document.querySelector('.sidebar');
  const shell = document.querySelector('.shell');
  const icon = document.getElementById('sidebarToggleIcon');
  const isExpanded = forceExpand !== undefined ? forceExpand : !sidebar.classList.contains('expanded');

  sidebar.classList.toggle('expanded', isExpanded);
  shell.classList.toggle('sidebar-expanded', isExpanded);

  if (icon) {
    // 展开时显示"收起"左箭头，收缩时显示"展开"右箭头
    icon.innerHTML = isExpanded
      ? '<polyline points="12 4 6 10 12 16"/>'  // ‹ 收起
      : '<polyline points="8 4 14 10 8 16"/>';  // › 展开
  }
  const btn = document.getElementById('sidebarToggle');
  if (btn) btn.title = isExpanded ? '收起侧边栏' : '展开侧边栏';

  if (!silent) {
    try { localStorage.setItem('mimo_sidebar_expanded', isExpanded ? '1' : ''); } catch {}
  }
}

function switchTab(tabId) {
  document.querySelectorAll('main.main > section').forEach((s) => { s.hidden = true; });
  const target = document.getElementById(tabId);
  if (target) target.hidden = false;
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#${tabId}`);
  });
  state.activeTab = tabId;
  try { localStorage.setItem('mimo_active_tab', tabId); } catch {}
  if (tabId === 'cache') loadCacheDetail();
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-panel').forEach(p => {
    p.hidden = p.id !== `settingsPanel${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
  });
  document.querySelectorAll('.settings-tab-card').forEach(c => {
    c.classList.toggle('active', c.dataset.stab === tab);
  });
}

function switchStudioTab(tab) {
  const validTabs = ['test', 'gemini'];
  const t = validTabs.includes(tab) ? tab : 'test';
  ['test', 'gemini'].forEach((name) => {
    const panel = document.getElementById(`studio${name.charAt(0).toUpperCase() + name.slice(1)}`);
    if (panel) panel.hidden = name !== t;
  });
  document.querySelectorAll('.studio-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.studio === t);
  });
  state.studioTab = t;
  try { localStorage.setItem('mimo_studio_tab', t); } catch {}
}

async function initPage() {
  try {
    const { adminProtected } = await fetch('/api/admin/auth-status').then((r) => r.json());
    const hasToken = Boolean(localStorage.getItem('mimo_admin_token'));
    if (adminProtected && !hasToken) {
      showLoginOverlay();
      return;
    }
  } catch {
    // ignore auth-status errors
  }
  await loadConfig(false);
}

function showLoginOverlay() {
  $('#loginOverlay').hidden = false;
  setTimeout(() => $('#loginToken')?.focus(), 50);
}

function hideLoginOverlay() {
  $('#loginOverlay').hidden = true;
}

function bindEvents() {
  // Tab 导航
  document.querySelectorAll('.nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('href').replace('#', '');
      switchTab(tabId);
    });
  });

  $('#refreshBtn').addEventListener('click', () => loadConfig(true));

  // 主题切换
  document.getElementById('themeBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('themeMenu');
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('themeMenu');
    if (menu && !menu.contains(e.target)) menu.hidden = true;
  });
  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const theme = btn.dataset.theme || '';
      applyTheme(theme);
      document.getElementById('themeMenu').hidden = true;
    });
  });

  // 侧边栏展开/收缩
  document.getElementById('sidebarToggle').addEventListener('click', () => toggleSidebar());

  // JS tooltip（固定定位，展开时不显示）
  let _tip = null;
  document.querySelectorAll('.nav a[data-label]').forEach((link) => {
    link.addEventListener('mouseenter', () => {
      if (document.querySelector('.sidebar.expanded')) return;
      _tip = document.createElement('div');
      _tip.className = 'nav-tooltip';
      _tip.textContent = link.dataset.label;
      document.body.appendChild(_tip);
      const r = link.getBoundingClientRect();
      _tip.style.top = (r.top + r.height / 2) + 'px';
      _tip.style.left = (r.right + 10) + 'px';
    });
    link.addEventListener('mouseleave', () => { _tip?.remove(); _tip = null; });
  });

  // 自定义颜色选择器
  document.getElementById('customAccentColor').addEventListener('input', (e) => {
    applyCustomAccent(e.target.value);
  });

  // 关于弹窗
  document.getElementById('aboutBtn').addEventListener('click', () => {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.hidden = false;
    const portEl = document.getElementById('aboutPort');
    if (portEl && state.config) portEl.textContent = state.config.service?.port || '3000';
  });
  document.getElementById('closeAboutBtn').addEventListener('click', () => {
    document.getElementById('aboutModal').hidden = true;
  });
  document.getElementById('aboutModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });

  // Token 清空按钮
  document.querySelectorAll('.clear-token-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const checkbox = document.getElementById(btn.dataset.clear);
      const input = document.getElementById(btn.dataset.input);
      if (!checkbox) return;
      checkbox.checked = !checkbox.checked;
      const isClearing = checkbox.checked;
      btn.textContent = isClearing ? '取消清空' : '清空';
      btn.classList.toggle('clear-token-active', isClearing);
      if (input) input.placeholder = isClearing ? '保存后将清除此 Token' : '留空不修改';
    });
  });
  $('#logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('mimo_admin_token');
    showLoginOverlay();
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#loginToken').value.trim();
    if (!token) return;
    $('#loginError').hidden = true;
    localStorage.setItem('mimo_admin_token', token);
    try {
      await loadConfig(false);
      hideLoginOverlay();
      $('#loginToken').value = '';
    } catch (err) {
      localStorage.removeItem('mimo_admin_token');
      $('#loginError').hidden = false;
    }
  });

  $('#clearCacheBtn').addEventListener('click', clearCache);
  $('#cacheDetailRefreshBtn').addEventListener('click', loadCacheDetail);
  $('#cacheDetailDeleteBtn').addEventListener('click', deleteCacheSelected);
  $('#cacheDownloadBtn')?.addEventListener('click', downloadCacheList);
  document.getElementById('cacheDetailSelectAll')?.addEventListener('change', (e) => {
    document.querySelectorAll('#cacheDetailRows .cache-row-check').forEach(cb => {
      cb.checked = e.target.checked;
      cb.closest('tr').classList.toggle('selected', cb.checked);
    });
    updateCacheDetailSelCount();
  });
  $('#saveSubscriptionVoicesBtn').addEventListener('click', saveSubscriptionVoices);
  document.getElementById('subscriptionVoiceList')?.addEventListener('change', updateSubscriptionVoiceCount);
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#addMimoVoiceBtn').addEventListener('click', () => addMimoVoiceRow());
  $('#saveMimoVoicesBtn').addEventListener('click', saveVoices);
  $('#saveDesignVoiceBtn').addEventListener('click', saveDesignVoice);

  // QR 按钮（事件委托）— 切换内嵌二维码显示/隐藏
  document.body.addEventListener('click', (e) => {
    const qrBtn = e.target.closest('.qr-btn[data-qr-toggle]');
    if (qrBtn) {
      const containerId = qrBtn.dataset.qrToggle;
      const container = document.getElementById(containerId);
      if (!container) return;
      const willShow = container.hidden;
      container.hidden = !willShow;
      qrBtn.classList.toggle('qr-btn-active', willShow);
      qrBtn.title = willShow ? '隐藏二维码' : '显示二维码';
      return;
    }
  });

  // QR 弹窗关闭
  document.getElementById('closeQrBtn').addEventListener('click', () => {
    document.getElementById('qrModal').hidden = true;
  });
  document.getElementById('qrModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('downloadQrBtn').addEventListener('click', downloadQrImage);
  $('#testForm').addEventListener('submit', runTest);
  $('#geminiTestForm').addEventListener('submit', runGeminiTest);
  $('#geminiTestSpeed').addEventListener('input', () => {
    $('#geminiTestSpeedValue').textContent = Number($('#geminiTestSpeed').value).toFixed(1);
  });
  document.querySelectorAll('[data-lang-g]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.geminiLang = btn.dataset.langG;
      document.querySelectorAll('[data-lang-g]').forEach(b => b.classList.toggle('active', b.dataset.langG === state.geminiLang));
      renderGeminiVoiceCards();
    });
  });
  $('#testSpeed').addEventListener('input', () => {
    $('#testSpeedValue').textContent = Number($('#testSpeed').value).toFixed(1);
  });
  $('#modelSelect').addEventListener('change', () => {
    state.selectedModel = $('#modelSelect').value;
    const model = state.models.find((item) => item.id === state.selectedModel);
    if (model?.mode) state.selectedMode = model.mode;
    renderModeCards();
    renderModeFields();
  });
  $('#voiceDescription').addEventListener('input', () => {
    if (state.selectedMode === 'design') $('#testState').textContent = '待测试';
  });
  document.querySelectorAll('.voice-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchVoiceTab(btn.dataset.voiceTab));
  });
  document.getElementById('cloneAddSaveBtn').addEventListener('click', saveCloneVoice);
  document.getElementById('cloneAddCancelBtn').addEventListener('click', hideCloneAddForm);
  document.getElementById('cloneFilePick').addEventListener('click', () => {
    document.getElementById('cloneAudioInput').click();
  });
  document.getElementById('cloneAudioInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('cloneFileName').textContent = file ? file.name : '点击选择音频文件（MP3 / WAV，≤10MB）';
  });

  // Stats
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.statsPeriod = btn.dataset.period;
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadStats();
    });
  });
  document.querySelectorAll('.chart-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.statsMode = btn.dataset.mode;
      document.querySelectorAll('.chart-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.statsData) {
        renderChart(state.statsData);
        renderStatsTotal(state.statsData.total);
      }
    });
  });

  // Settings tab cards
  document.querySelectorAll('.settings-tab-card').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.stab));
  });

  // Studio sub-tabs
  document.querySelectorAll('.studio-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchStudioTab(btn.dataset.studio));
  });

  // Voice tab 已改为跟随模式卡片自动切换，不再有手动 tab 按钮

  // Emotion
  $('#saveEmotionBtn').addEventListener('click', saveEmotionSettings);
  $('#loadEmotionDefaultsBtn').addEventListener('click', loadEmotionDefaults);
  $('#toggleEmotionPrompts').addEventListener('click', () => {
    const area = document.getElementById('emotionPromptArea');
    const btn = document.getElementById('toggleEmotionPrompts');
    area.hidden = !area.hidden;
    btn.textContent = area.hidden ? '编辑提示词 ▾' : '收起提示词 ▴';
  });

  // Voice filter
  $('#mimoVoiceFilter').addEventListener('input', filterMimoVoiceRows);
  $('#showAdvancedCols').addEventListener('change', toggleAdvancedCols);
  document.getElementById('mimoVoiceFilterLang')?.addEventListener('change', filterMimoVoiceRows);
  document.getElementById('mimoVoiceFilterGender')?.addEventListener('change', filterMimoVoiceRows);
  document.getElementById('mimoVoiceFilterModel')?.addEventListener('change', filterMimoVoiceRows);
  document.getElementById('geminiVoiceMgmtFilter')?.addEventListener('input', filterGeminiVoiceRows);

  document.body.addEventListener('click', (event) => {
    const hintLink = event.target.closest('.hint-link');
    if (hintLink) {
      event.preventDefault();
      const href = hintLink.getAttribute('href');
      if (href?.startsWith('#')) switchTab(href.slice(1));
      return;
    }

    const copyTarget = event.target.closest('[data-copy]');
    if (copyTarget) {
      const input = document.getElementById(copyTarget.dataset.copy);
      copyText(input.value);
      return;
    }

    const lang = event.target.closest('[data-lang]');
    if (lang) {
      state.selectedLang = lang.dataset.lang;
      renderLanguageTabs();
      renderVoiceOptions();
      return;
    }

    const mode = event.target.closest('[data-mode]');
    if (mode) {
      selectMode(mode.dataset.mode);
      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;

    const row = action.closest('tr');
    if (action.dataset.action === 'delete') {
      const inGemini = Boolean(row.closest('#geminiVoiceRows'));
      row.remove();
      if (inGemini) filterGeminiVoiceRows(); else filterMimoVoiceRows();
    }
    if (action.dataset.action === 'up') moveRow(row, -1);
    if (action.dataset.action === 'down') moveRow(row, 1);
  });
}

async function loadConfig(notify = false) {
  try {
    const data = await adminJson('/api/admin/config');
    state.config = data;
    state.voices = data.voices;
    state.models = data.models || [];
    state.selectedModel = state.selectedModel || data.service.mimoModel;
    if (!state.models.some((model) => model.id === state.selectedModel)) {
      state.selectedModel = data.service.mimoModel;
    }
    const model = state.models.find((item) => item.id === state.selectedModel);
    state.selectedMode = model?.mode || state.selectedMode;
    const selected = data.voices.find((voice) => voice.id === state.selectedVoiceId);
    if (selected) {
      state.selectedVoice = selected.voice;
    } else {
      const fallback = pickDefaultVoice(data.voices, state.selectedLang);
      state.selectedVoiceId = fallback?.id || '';
      state.selectedVoice = fallback?.voice || data.service.defaultVoice;
    }

    renderConfig(data);
    renderModels();
    renderSettings(data);
    renderEmotionSettings(data.settings || {});
    renderModeCards();
    renderModeFields();
    renderLanguageTabs();
    renderVoiceOptions();
    renderGeminiVoiceCards();
    renderVoices(data.voices);
    renderSubscriptionVoices(data.voices);
    await loadStats();
    if (state.activeTab === 'cache') await loadCacheDetail();

    // 无 adminToken 时显示未保护警告
    const authWarning = document.getElementById('authWarning');
    if (authWarning) authWarning.hidden = data.service.adminProtected;

    const hasToken = Boolean(localStorage.getItem('mimo_admin_token'));
    $('#logoutBtn').hidden = !hasToken;

    if (notify) toast('已刷新');
  } catch (error) {
    if (error.status === 401) {
      showLoginOverlay();
      return;
    }
    markDisconnected(error.message);
    throw error;
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const data = await adminJson(`/api/admin/stats?period=${state.statsPeriod}`);
    state.statsData = data;
    renderStatsTotal(data.total);
    renderChart(data);
  } catch {
    // stats errors are non-fatal
  }
}

const MODEL_COLORS = { standard: '#4f6ef2', design: '#7c3aed', clone: '#0d9488', gemini: '#1a73e8' };
const MODEL_LABELS = { standard: 'MiMo 标准', design: '声音设计', clone: '声音克隆', gemini: 'Gemini' };

function renderStatsTotal(total) {
  const el = $('#statsTotals');
  if (!el) return;
  const byModel = total?.byModel || {};
  const byModelChars = total?.byModelChars || {};
  const isChars = state.statsMode === 'chars';
  const modelCounts = isChars ? byModelChars : byModel;
  el.innerHTML = `
    <div class="stat-total">
      <span>调用次数</span>
      <strong>${(total?.calls || 0).toLocaleString()}</strong>
    </div>
    <div class="stat-total">
      <span>处理字符</span>
      <strong>${(total?.chars || 0).toLocaleString()}</strong>
    </div>
    <div class="stat-model-legend">
      ${Object.entries(MODEL_LABELS).map(([k, label]) => `
        <span class="model-legend-item">
          <i style="background:${MODEL_BAR_COLORS[k]}"></i>${label}&nbsp;<b>${fmtNum(modelCounts[k] || 0)}</b>
        </span>`).join('')}
    </div>
  `;
}

const MODEL_BAR_COLORS = {
  standard: 'rgba(79,110,242,0.82)',
  design:   'rgba(13,148,136,0.82)',
  clone:    'rgba(6,182,212,0.75)',
  gemini:   'rgba(26,115,232,0.78)'
};

/* ─── Professional Chart ─────────────────────────────────────────────────── */

function niceScale(maxV) {
  if (!maxV) return { max: 10, step: 2 };
  const rough = maxV / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].find(n => n * mag >= rough) * mag;
  return { max: Math.ceil(maxV / step) * step, step };
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(0) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

function getAccentHex() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f6ef2';
}

function renderChart(data) {
  const container = document.getElementById('statsChart');
  if (!container) return;
  const { buckets, period } = data;
  const mode = state.statsMode;
  const values = buckets.map((b) => (mode === 'calls' ? b.calls : b.chars));
  const hasData = values.some((v) => v > 0);
  container.innerHTML = '';

  if (!hasData) {
    container.innerHTML = '<div class="chart-empty">暂无数据 — 工作台生成试听后将显示于此</div>';
    return;
  }

  // 响应式容器
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;user-select:none';
  container.appendChild(wrap);
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  tip.style.display = 'none';
  wrap.appendChild(tip);

  let hoverState = -1;

  function draw() {
    const W = container.clientWidth || 800;
    const H = 230;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const accent = getAccentHex();
    // hex → rgb helper
    const hr = parseInt(accent.slice(1,3),16), hg = parseInt(accent.slice(3,5),16), hb = parseInt(accent.slice(5,7),16);
    const accentRgb = `${hr},${hg},${hb}`;

    const maxV = Math.max(...values, 1);
    const scale = niceScale(maxV);
    const n = buckets.length;
    const PAD = { top: 16, right: 16, bottom: 40, left: 46 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const baseY = PAD.top + cH;
    const xLabelY = baseY + 18;

    const toX = i => PAD.left + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
    const toY = v => PAD.top + cH * (1 - v / scale.max);
    const clamp = v => Math.min(baseY, Math.max(PAD.top, v));

    const pts = values.map((v, i) => [toX(i), toY(v)]);

    // ── Grid lines & Y-axis ──────────────────────────────────────────
    const gridCount = Math.round(scale.max / scale.step);
    ctx.font = `11px "Segoe UI",Arial,sans-serif`;

    for (let i = 0; i <= gridCount; i++) {
      const v = i * scale.step;
      const y = toY(v);
      // grid line
      ctx.strokeStyle = i === 0 ? 'rgba(203,213,225,0.9)' : 'rgba(226,232,240,0.65)';
      ctx.lineWidth = i === 0 ? 1.5 : 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      // Y label
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(fmtNum(v), PAD.left - 7, y + 4);
    }

    // ── Smooth curve helper ──────────────────────────────────────────
    function smooth(pts) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0,i-1)], p1 = pts[i];
        const p2 = pts[i+1], p3 = pts[Math.min(pts.length-1,i+2)];
        const t = 0.25;
        ctx.bezierCurveTo(
          p1[0]+(p2[0]-p0[0])*t, clamp(p1[1]+(p2[1]-p0[1])*t),
          p2[0]-(p3[0]-p1[0])*t, clamp(p2[1]-(p3[1]-p1[1])*t),
          p2[0], p2[1]
        );
      }
    }

    // ── Area fill (lighter, make room for bars) ──────────────────────
    const areaGrad = ctx.createLinearGradient(0, PAD.top, 0, baseY);
    areaGrad.addColorStop(0, `rgba(${accentRgb},0.10)`);
    areaGrad.addColorStop(0.6, `rgba(${accentRgb},0.03)`);
    areaGrad.addColorStop(1, `rgba(${accentRgb},0)`);
    ctx.beginPath(); smooth(pts);
    ctx.lineTo(pts[n-1][0], baseY); ctx.lineTo(pts[0][0], baseY); ctx.closePath();
    ctx.fillStyle = areaGrad; ctx.fill();

    // ── Model stacked bars (inside chart area, semi-transparent) ──────
    const bSpacing = n > 1 ? cW / (n - 1) : cW;
    const bW = Math.max(6, Math.min(18, bSpacing * 0.55));
    ctx.save();
    ctx.beginPath(); ctx.rect(PAD.left, PAD.top, cW, cH); ctx.clip();
    ctx.globalAlpha = 0.55;
    buckets.forEach((b, i) => {
      const total = mode === 'chars' ? b.chars : b.calls;
      if (!total) return;
      let bm = mode === 'chars' ? (b.byModelChars || {}) : (b.byModel || {});
      // Fallback：旧日志无 model 字段时全归 standard
      if (!Object.values(bm).some(v => v > 0)) bm = { standard: total, design: 0, clone: 0 };
      const cx = toX(i);
      const totalH = baseY - toY(total); // curve height at this bucket
      let stackY = baseY;
      ['standard', 'design', 'clone', 'gemini'].forEach(m => {
        const cnt = bm[m] || 0;
        if (!cnt) return;
        const segH = Math.max(1, (cnt / total) * totalH);
        ctx.fillStyle = MODEL_BAR_COLORS[m];
        ctx.fillRect(cx - bW / 2, stackY - segH, bW, segH);
        stackY -= segH;
      });
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Curve line (drawn on top of bars) ────────────────────────────
    ctx.beginPath(); smooth(pts);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash([]); ctx.stroke();

    // ── X-axis labels ────────────────────────────────────────────────
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.font = `10.5px "Segoe UI",Arial,sans-serif`;
    const labelStep = period === 'month' ? 5 : period === 'day' ? 6 : 1;
    buckets.forEach((b, i) => {
      if (i % labelStep === 0) ctx.fillText(b.label, toX(i), xLabelY);
    });

    // ── Hover: dashed line + dot ─────────────────────────────────────
    if (hoverState >= 0) {
      const hx = toX(hoverState);
      const hv = values[hoverState];
      const hy = toY(hv);
      // vertical line
      ctx.strokeStyle = 'rgba(100,116,139,0.28)';
      ctx.lineWidth = 1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top+4); ctx.lineTo(hx, baseY); ctx.stroke();
      ctx.setLineDash([]);
      // dot
      if (hv > 0) {
        ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
        // peak label
        const label = fmtNum(hv);
        ctx.font = `bold 11px "Segoe UI",Arial`;
        ctx.fillStyle = accent;
        ctx.textAlign = hx > W * 0.75 ? 'right' : 'left';
        ctx.fillText(label, hx + (hx > W * 0.75 ? -9 : 9), hy - 8);
      }
    }
  }

  // ── Tooltip ────────────────────────────────────────────────────────
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const W = container.clientWidth;
    const n = buckets.length;
    const PAD_LEFT = 46, PAD_RIGHT = 16;
    const cW = W - PAD_LEFT - PAD_RIGHT;
    const toX = i => PAD_LEFT + (n <= 1 ? cW/2 : (i/(n-1))*cW);

    let closest = 0, minD = Infinity;
    buckets.forEach((_,i) => { const d = Math.abs(toX(i)-mx); if (d<minD) { minD=d; closest=i; } });

    hoverState = closest;
    const b = buckets[closest];
    const total = mode === 'calls' ? b.calls : b.chars;
    const bm = mode === 'calls' ? (b.byModel||{}) : (b.byModelChars||{});
    const rows = ['standard','design','clone','gemini']
      .filter(m => (bm[m]||0) > 0)
      .map(m => `<div class="ct-row"><i style="background:${MODEL_BAR_COLORS[m]}"></i><span>${MODEL_LABELS[m]}</span><strong>${fmtNum(bm[m]||0)}</strong></div>`)
      .join('');

    tip.innerHTML = `<div class="ct-date">${b.label}</div>${rows || '<div class="ct-row"><span style="color:var(--muted)">无数据</span></div>'}<div class="ct-row ct-total"><span>合计</span><strong>${fmtNum(total)}</strong></div>`;
    tip.style.display = 'block';

    const cx = toX(closest);
    const tipW = 160;
    tip.style.left = (cx + 14 + tipW > W ? cx - tipW - 12 : cx + 12) + 'px';
    tip.style.top = '12px';
    draw();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverState = -1;
    tip.style.display = 'none';
    draw();
  });

  // ── Initial draw + ResizeObserver ────────────────────────────────
  draw();
  if (wrap._ro) wrap._ro.disconnect();
  const ro = new ResizeObserver(() => draw());
  ro.observe(container);
  wrap._ro = ro;
}

// ─── Emotion Settings ────────────────────────────────────────────────────────

function renderEmotionSettings(settings) {
  $('#emotionEnabled').checked = Boolean(settings.emotionEnabled);
  $('#emotionSystemPrompt').value = settings.emotionSystemPrompt || '';
  $('#emotionUserTemplate').value = settings.emotionUserTemplate || '';

  const status = $('#emotionStatus');
  if (status) {
    if (settings.emotionEnabled) {
      status.textContent = '已启用';
      status.className = 'status ok';
    } else {
      status.textContent = '未启用';
      status.className = 'status';
    }
  }
}

async function saveEmotionSettings() {
  const body = {
    emotionEnabled: $('#emotionEnabled').checked,
    emotionSystemPrompt: $('#emotionSystemPrompt').value,
    emotionUserTemplate: $('#emotionUserTemplate').value
  };

  await adminJson('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  toast('情感分析配置已保存');
  await loadConfig(false);
}

async function loadEmotionDefaults() {
  try {
    const data = await adminJson('/api/admin/emotion-defaults');
    $('#emotionSystemPrompt').value = data.systemPrompt || '';
    $('#emotionUserTemplate').value = data.userTemplate || '';
    toast('已加载默认提示词');
  } catch (err) {
    toast(err.message);
  }
}

// ─── Voice Table ──────────────────────────────────────────────────────────────

function filterMimoVoiceRows() {
  const text = ($('#mimoVoiceFilter')?.value || '').toLowerCase().trim();
  const lang = $('#mimoVoiceFilterLang')?.value || '';
  const gender = $('#mimoVoiceFilterGender')?.value || '';
  const modelFilter = $('#mimoVoiceFilterModel')?.value || '';

  document.querySelectorAll('#mimoVoiceRows tr').forEach((row) => {
    const id = (row.querySelector('[data-field="id"]')?.value || '').toLowerCase();
    const name = (row.querySelector('[data-field="name"]')?.value || '').toLowerCase();
    const voice = (row.querySelector('[data-field="voice"]')?.value || '').toLowerCase();
    const rowLang = row.querySelector('[data-field="language"]')?.value || '';
    const rowGender = row.querySelector('[data-field="gender"]')?.value || '';
    const rowModel = row.querySelector('[data-field="model"]')?.value || '';

    const modeMatch = () => {
      if (!modelFilter) return true;
      if (modelFilter === 'standard') return !rowModel.includes('voicedesign') && !rowModel.includes('voiceclone');
      if (modelFilter === 'design') return rowModel.includes('voicedesign');
      if (modelFilter === 'clone') return rowModel.includes('voiceclone');
      return true;
    };

    row.hidden = !(
      (!text || id.includes(text) || name.includes(text) || voice.includes(text)) &&
      (!lang || rowLang === lang) &&
      (!gender || rowGender === gender) &&
      modeMatch()
    );
  });
}

function filterGeminiVoiceRows() {
  const text = ($('#geminiVoiceMgmtFilter')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#geminiVoiceRows tr').forEach((row) => {
    const id = (row.querySelector('[data-field="id"]')?.value || '').toLowerCase();
    const name = (row.querySelector('[data-field="name"]')?.value || '').toLowerCase();
    const voice = (row.querySelector('[data-field="voice"]')?.value || '').toLowerCase();
    row.hidden = Boolean(text && !id.includes(text) && !name.includes(text) && !voice.includes(text));
  });
}

function updateVoiceDatalist() {
  const dl = document.getElementById('voiceDatalist');
  if (!dl) return;
  const seen = new Set();
  dl.innerHTML = state.voices
    .map(v => v.voice).filter(v => v && v !== 'clone' && !seen.has(v) && seen.add(v))
    .map(v => `<option value="${escapeAttr(v)}">`)
    .join('');
}

function toggleAdvancedCols() {
  const show = $('#showAdvancedCols').checked;
  document.querySelectorAll('.col-advanced').forEach((el) => {
    el.hidden = !show;
  });
}

// ─── Existing Logic ───────────────────────────────────────────────────────────

function renderConfig(data) {
  $('#baseUrl').textContent = data.service.baseUrl;
  $('#cacheCount').textContent = data.cache.count || 0;
  $('#cacheBytes').textContent = formatBytes(data.cache.bytes || 0);
  $('#sourceUrlLocal').value = data.endpoints.voiceSourcesLocal
    || `http://127.0.0.1:${data.service.port}/api/reader/tts-configs.json`;

  const rawPub = data.endpoints.voiceSourcesPublic
    || (data.endpoints.voiceSources
      ? data.endpoints.voiceSources.replace(/(\/api\/reader\/tts-configs)(\.json)?$/, '$1.json')
      : '')
    || (data.service.baseUrl
      ? `${data.service.baseUrl.replace(/\/+$/, '')}/api/reader/tts-configs.json`
      : '');
  $('#sourceUrlPublic').value = rawPub;
  $('#sourceUrlPublicHint').hidden = Boolean(rawPub);
  renderInlineQr(rawPub, 'qrSourceUrlPublic');

  const rawPubV2 = data.endpoints.voiceSourcesV2 || '';
  $('#sourceUrlPublicV2').value = rawPubV2;
  renderInlineQr(rawPubV2, 'qrSourceUrlPublicV2');
  $('#testFormat').value = data.service.defaultFormat || 'mp3';

  setStatus($('#mimoStatus'), data.service.mimoConfigured ? 'MiMo 已配置' : 'MiMo 未配置', data.service.mimoConfigured);
  setStatus($('#cacheStatus'), data.cache.enabled ? `缓存 ${data.cache.count}` : '缓存关闭', data.cache.enabled);
  const geminiStatus = $('#geminiStatus');
  if (geminiStatus) setStatus(geminiStatus, data.service.geminiConfigured ? 'Gemini 已配置' : 'Gemini 未配置', data.service.geminiConfigured);
  updateSelectedVoiceField();
}

function renderModels() {
  const select = $('#modelSelect');
  const settingsSelect = $('#settingsMimoModel');
  select.innerHTML = '';
  settingsSelect.innerHTML = '';
  state.models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = `${model.name} · ${model.id}`;
    select.append(option);

    const settingsOption = option.cloneNode(true);
    settingsSelect.append(settingsOption);
  });
  select.value = state.selectedModel;
  settingsSelect.value = state.config?.service?.mimoModel || state.selectedModel;
}

function renderPublicBaseUrl(urlString) {
  try {
    const parsed = urlString ? new URL(urlString) : null;
    $('#settingsPublicProto').value = parsed?.protocol?.replace(':', '') || 'http';
    $('#settingsPublicHost').value = parsed?.hostname || '';
    $('#settingsPublicPort').value = parsed?.port || '';
  } catch {
    $('#settingsPublicHost').value = urlString || '';
    $('#settingsPublicPort').value = '';
  }
}

function assemblePublicBaseUrl() {
  const host = $('#settingsPublicHost').value.trim();
  if (!host) return '';
  const proto = $('#settingsPublicProto').value || 'http';
  const port = $('#settingsPublicPort').value.trim();
  return `${proto}://${host}${port ? `:${port}` : ''}`;
}

function renderDefaultVoiceSelect(selectedVoice) {
  const select = $('#settingsDefaultVoice');
  if (!select) return;
  const prev = select.value || selectedVoice;
  select.innerHTML = '';
  state.voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.voice;
    option.textContent = `${voice.name} · ${voice.voice}`;
    select.append(option);
  });
  select.value = prev || (state.voices[0]?.voice ?? '');
}

function renderSettings(data) {
  const settings = data.settings || {};
  $('#settingsMimoBaseUrl').value = settings.mimoBaseUrl || '';
  $('#settingsMimoModel').value = settings.mimoModel || data.service.mimoModel;
  const geminiModelSelect = $('#settingsGeminiModel');
  if (data.service.geminiModels && data.service.geminiModels.length) {
    geminiModelSelect.innerHTML = data.service.geminiModels
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join('');
  }
  const currentGeminiModel = settings.geminiModel || data.service.geminiModel || '';
  if (currentGeminiModel && !Array.from(geminiModelSelect.options).some((o) => o.value === currentGeminiModel)) {
    geminiModelSelect.insertAdjacentHTML('beforeend', `<option value="${currentGeminiModel}">${currentGeminiModel}</option>`);
  }
  geminiModelSelect.value = currentGeminiModel;
  $('#settingsGeminiApiKey').value = '';
  $('#settingsGeminiApiKey').placeholder = settings.geminiApiKeyConfigured
    ? `已配置 ${settings.geminiApiKeyMasked}`
    : '未配置，输入后保存';
  $('#clearGeminiApiKey').checked = false;
  renderPublicBaseUrl(settings.publicBaseUrl || '');
  renderDefaultVoiceSelect(settings.defaultVoice || data.service.defaultVoice || '');
  $('#settingsDefaultFormat').value = settings.defaultFormat || data.service.defaultFormat || 'mp3';
  $('#settingsRequestTimeoutMs').value = settings.requestTimeoutMs || 120000;
  $('#settingsMimoApiKey').value = '';
  $('#settingsAccessToken').value = '';
  $('#settingsAdminToken').value = '';
  $('#settingsMimoApiKey').placeholder = settings.mimoApiKeyConfigured
    ? `已配置 ${settings.mimoApiKeyMasked}`
    : '未配置，输入后保存';
  $('#settingsAccessToken').placeholder = settings.accessTokenConfigured
    ? `已配置 ${settings.accessTokenMasked}`
    : '留空不修改';
  $('#settingsAdminToken').placeholder = settings.adminTokenConfigured
    ? `已配置 ${settings.adminTokenMasked}`
    : '留空不修改';
  $('#clearMimoApiKey').checked = false;
  $('#clearAccessToken').checked = false;
  $('#clearAdminToken').checked = false;
}

function renderModeCards() {
  const wrap = $('#modeCards');
  wrap.innerHTML = '';
  const modes = uniqueModes(state.models);
  modes.forEach((mode) => {
    const meta = modeMeta[mode] || modeMeta.standard;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mode-card ${state.selectedMode === mode ? 'active' : ''}`;
    button.dataset.mode = mode;
    button.innerHTML = `
      <span class="mode-icon">${escapeHtml(meta.marker)}</span>
      <strong>${escapeHtml(meta.title)}</strong>
      <small>${escapeHtml(meta.subtitle)}</small>
    `;
    wrap.append(button);
  });
}

function selectMode(mode) {
  state.selectedMode = mode;
  const current = state.models.find((item) => item.id === state.selectedModel);
  if (current?.mode !== mode) {
    const model = state.models.find((item) => item.mode === mode);
    if (model) state.selectedModel = model.id;
  }
  $('#modelSelect').value = state.selectedModel;
  renderModeCards();
  renderModeFields();
  // 克隆模式自动切到克隆音色面板，其他模式切到默认音色面板
  switchVoiceTab(mode === 'clone' ? 'clone' : 'preset');
}

function uniqueModes(models) {
  const seen = new Set();
  return models
    .map((model) => model.mode || 'standard')
    .filter((mode) => {
      if (seen.has(mode)) return false;
      seen.add(mode);
      return true;
    });
}

function renderModeFields() {
  document.querySelectorAll('[data-mode-field]').forEach((field) => {
    field.hidden = field.dataset.modeField !== state.selectedMode;
  });
}

function renderLanguageTabs() {
  document.querySelectorAll('[data-lang]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.lang === state.selectedLang);
  });
}

function switchVoiceTab(tab) {
  document.getElementById('voiceTabPreset').hidden = tab !== 'preset';
  document.getElementById('voiceTabClone').hidden = tab !== 'clone';
  document.querySelectorAll('.voice-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.voiceTab === tab);
  });
  state.voiceTab = tab;
}

function voiceAvatarColor(name) {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#0d9488','#3b82f6','#f59e0b','#ef4444','#14b8a6','#06b6d4'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function makeVoiceCard(voice, isClone) {
  const card = document.createElement('div');
  card.className = `voice-card${voice.id === state.selectedVoiceId ? ' active' : ''}`;
  card.dataset.voiceId = voice.id;
  const color = voiceAvatarColor(voice.name);
  const initial = [...voice.name][0];
  const langLabel = (voice.language === 'zh' ? '中文' : 'En') + (voice.gender === 'male' ? '·男' : '·女');

  const cloneBadge = isClone
    ? `<div class="clone-audio-badge ${voice.cloneAudioReady ? 'ready' : 'missing'}">${voice.cloneAudioReady ? '✓' : '!'}</div>`
    : '';

  card.innerHTML = `
    <div class="voice-avatar-wrap">${cloneBadge}<div class="voice-avatar" style="background:${color}">${escapeHtml(initial)}</div></div>
    <div class="voice-card-name" title="${escapeAttr(voice.name)}">${escapeHtml(voice.name)}</div>
    <div class="voice-card-lang">${escapeHtml(langLabel)}</div>
    ${isClone ? `<button type="button" class="clone-upload-btn" title="${voice.cloneAudioReady ? '重新上传音频' : '上传音频样本'}">${voice.cloneAudioReady ? '换音频' : '上传'}</button>` : ''}
  `;

  if (isClone) {
    card.querySelector('.clone-upload-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      uploadCloneAudio(voice.id);
    });
  }

  card.addEventListener('click', () => {
    applyVoiceSelection(voice);
    if (isClone) {
      selectMode('clone');
    } else if (state.selectedMode === 'clone') {
      selectMode('standard');
    }
    document.querySelectorAll('.voice-card[data-voice-id]').forEach(c => {
      c.classList.toggle('active', c.dataset.voiceId === voice.id);
    });
    updateSelectedVoiceField();
    updateVoiceSelectedBars();
  });
  return card;
}

async function uploadCloneAudio(voiceId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,audio/mp3,audio/wav,.mp3,.wav';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('文件不能超过 10MB'); return; }
    toast('上传中…');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await adminJson(`/api/admin/clone-audio/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        body: JSON.stringify({ audioData: base64 })
      });
      toast('音频样本已上传，克隆音色已就绪');
      await loadConfig(false);
    } catch (err) {
      toast(err.message);
    }
  });
  input.click();
}

function renderVoiceCards() {
  const container = document.getElementById('voiceCards');
  if (!container) return;
  const voices = state.voices
    .filter(v => v.provider !== 'gemini' && !String(v.model || '').includes('voiceclone') && v.language === state.selectedLang)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  container.innerHTML = '';
  voices.forEach(v => container.appendChild(makeVoiceCard(v, false)));
}

function renderCloneVoiceCards() {
  const container = document.getElementById('cloneVoiceCards');
  if (!container) return;
  const clones = state.voices.filter(v => String(v.model || '').includes('voiceclone'));
  container.innerHTML = '';
  clones.forEach(v => container.appendChild(makeVoiceCard(v, true)));
  // "+" add card
  const addCard = document.createElement('div');
  addCard.className = 'voice-card voice-card-add';
  addCard.innerHTML = `
    <div class="voice-avatar voice-avatar-add">+</div>
    <div class="voice-card-name">添加</div>
    <div class="voice-card-lang">克隆音色</div>
  `;
  addCard.addEventListener('click', () => {
    document.getElementById('cloneAddForm').hidden = false;
    document.getElementById('cloneAddName').focus();
  });
  container.appendChild(addCard);
}

function hideCloneAddForm() {
  const form = document.getElementById('cloneAddForm');
  if (form) form.hidden = true;
  const nameEl = document.getElementById('cloneAddName');
  const fileEl = document.getElementById('cloneAudioInput');
  const labelEl = document.getElementById('cloneFileName');
  if (nameEl) nameEl.value = '';
  if (fileEl) fileEl.value = '';
  if (labelEl) labelEl.textContent = '点击选择音频文件（MP3 / WAV，≤10MB）';
}

async function saveCloneVoice() {
  const name = document.getElementById('cloneAddName').value.trim();
  const gender = document.getElementById('cloneAddGender').value;
  const fileInput = document.getElementById('cloneAudioInput');
  const file = fileInput?.files[0];

  if (!name) { toast('请填写音色名称'); return; }
  if (!file) { toast('请选择音频文件'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('文件不能超过 10MB'); return; }

  toast('保存中…');
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const maxOrder = Math.max(0, ...state.voices.map(v => Number(v.order) || 0)) + 10;
    const newId = `clone-${Date.now().toString(36)}`;
    const newVoice = {
      id: newId, name,
      voice: 'clone',
      model: 'mimo-v2.5-tts-voiceclone',
      language: 'zh', gender,
      description: '', badge: '克隆', color: '', voiceDescription: '',
      order: maxOrder
    };

    // 1. 保存音色到列表
    const result = await adminJson('/api/admin/voices', {
      method: 'PUT',
      body: JSON.stringify({ voices: [...state.voices, newVoice] })
    });
    state.voices = result.voices || [...state.voices, newVoice];

    // 2. 上传音频样本
    await adminJson(`/api/admin/clone-audio/${encodeURIComponent(newId)}`, {
      method: 'POST',
      body: JSON.stringify({ audioData: base64 })
    });

    hideCloneAddForm();
    await loadConfig(false);
    switchVoiceTab('clone');
    const added = state.voices.find(v => v.id === newId);
    if (added) { applyVoiceSelection(added); selectMode('clone'); }
    updateSelectedVoiceField();
    updateVoiceSelectedBars();
    toast('克隆音色已添加，音频样本已就绪');
  } catch (err) {
    toast(err.message);
  }
}

function updateVoiceSelectedBars() {
  const voice = getSelectedVoiceEntry();
  const text = voice
    ? `已选择：${voice.name}（${voice.language === 'zh' ? '中文' : 'English'}${voice.gender === 'male' ? '男声' : '女声'}）`
    : '未选择';
  const b1 = document.getElementById('voiceSelectedBar');
  const b2 = document.getElementById('cloneSelectedBar');
  if (b1) b1.textContent = text;
  if (b2) b2.textContent = text;
}

function renderVoiceOptions() {
  renderVoiceCards();
  renderCloneVoiceCards();
  updateVoiceSelectedBars();
  updateSelectedVoiceField();
}

function updateSelectedVoiceField() {
  const selected = getSelectedVoiceEntry();
  const voice = selected?.voice || state.selectedVoice;
  if ($('#selectedVoice')) $('#selectedVoice').value = voice || '';
}

function getSelectedVoiceEntry() {
  return state.voices.find((voice) => voice.id === state.selectedVoiceId)
    || state.voices.find((voice) => voice.voice === state.selectedVoice)
    || null;
}

function applyVoiceSelection(voice) {
  state.selectedVoiceId = voice.id;
  state.selectedVoice = voice.voice;

  if (voice.model) {
    state.selectedModel = voice.model;
    const model = state.models.find((item) => item.id === state.selectedModel);
    state.selectedMode = model?.mode || state.selectedMode;
    $('#modelSelect').value = state.selectedModel;
    renderModeCards();
    renderModeFields();
  }

  if (voice.voiceDescription) {
    $('#voiceDescription').value = voice.voiceDescription;
  }
}

function pickDefaultVoice(voices, language) {
  return voices
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .find((voice) => voice.language === language);
}

function renderVoices(voices) {
  const mimoTbody = $('#mimoVoiceRows');
  const geminiTbody = $('#geminiVoiceRows');
  mimoTbody.innerHTML = '';
  geminiTbody.innerHTML = '';
  voices
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order))
    .forEach((voice) => {
      if (voice.provider === 'gemini') addGeminiVoiceRow(voice);
      else addMimoVoiceRow(voice);
    });
  filterMimoVoiceRows();
  filterGeminiVoiceRows();
}

function addMimoVoiceRow(voice = {}) {
  const showAdv = $('#showAdvancedCols').checked;
  const tbody = $('#mimoVoiceRows');
  const index = tbody.children.length + 1;
  const row = document.createElement('tr');
  const name = voice.name || '自定义';
  const avatarColor = voiceAvatarColor(name);
  const initial = escapeHtml([...name][0] || '?');
  const isClone = String(voice.model || '').includes('voiceclone');

  row.innerHTML = `
    <td class="td-avatar">
      <div class="voice-avatar voice-avatar-sm" style="background:${avatarColor}">${initial}</div>
    </td>
    <td><input data-field="id" value="${escapeAttr(voice.id || `mimo-custom-${index}`)}"></td>
    <td><input data-field="name" value="${escapeAttr(name)}"></td>
    <td class="td-voice">${isClone
      ? `<span class="clone-voice-cell">${voice.cloneAudioReady ? '✓ 已上传音频' : '⚠ 未上传音频'}</span><input data-field="voice" type="hidden" value="${escapeAttr(voice.voice || 'clone')}">`
      : `<select data-field="voice">${buildVoiceOptions(voice.voice || 'mimo_default')}</select>`
    }</td>
    <td class="col-advanced"${showAdv ? '' : ' hidden'}>
      <select data-field="model">
        <option value="" ${!voice.model ? 'selected' : ''}>默认模型</option>
        ${state.models.map((model) => `
          <option value="${escapeAttr(model.id)}" ${voice.model === model.id ? 'selected' : ''}>${escapeHtml(model.name)}</option>
        `).join('')}
      </select>
    </td>
    <td class="col-advanced"${showAdv ? '' : ' hidden'}><input data-field="voiceDescription" value="${escapeAttr(voice.voiceDescription || '')}" placeholder="声音设计模型必填"></td>
    <td>
      <select data-field="language">
        <option value="zh" ${voice.language !== 'en' ? 'selected' : ''}>中文</option>
        <option value="en" ${voice.language === 'en' ? 'selected' : ''}>English</option>
      </select>
    </td>
    <td>
      <select data-field="gender">
        <option value="female" ${voice.gender !== 'male' ? 'selected' : ''}>女声</option>
        <option value="male" ${voice.gender === 'male' ? 'selected' : ''}>男声</option>
      </select>
    </td>
    <td class="col-advanced"${showAdv ? '' : ' hidden'}><input data-field="badge" value="${escapeAttr(voice.badge || '')}"></td>
    <td><input data-field="order" type="number" value="${escapeAttr(voice.order || index * 10)}" style="width:60px"></td>
    <td>
      <div class="row-actions">
        <button type="button" data-action="up" title="上移" class="icon-btn">↑</button>
        <button type="button" data-action="down" title="下移" class="icon-btn">↓</button>
        <button type="button" class="icon-btn danger" data-action="delete" title="删除">🗑</button>
      </div>
    </td>
  `;
  tbody.append(row);
}

function addGeminiVoiceRow(voice = {}) {
  const tbody = $('#geminiVoiceRows');
  const index = tbody.children.length + 1;
  const row = document.createElement('tr');
  const name = voice.name || 'Gemini 音色';
  const avatarColor = voiceAvatarColor(name);
  const initial = escapeHtml([...name][0] || '?');

  row.innerHTML = `
    <td class="td-avatar">
      <div class="voice-avatar voice-avatar-sm" style="background:${avatarColor}">${initial}</div>
    </td>
    <td><input data-field="id" value="${escapeAttr(voice.id || `gemini-custom-${index}`)}"></td>
    <td><input data-field="name" value="${escapeAttr(name)}"></td>
    <td class="td-voice"><input data-field="voice" list="geminiVoiceDatalist" value="${escapeAttr(voice.voice || 'Aoede')}" placeholder="如 Aoede, Charon..."></td>
    <td>
      <select data-field="language">
        <option value="zh" ${voice.language !== 'en' ? 'selected' : ''}>中文</option>
        <option value="en" ${voice.language === 'en' ? 'selected' : ''}>English</option>
      </select>
    </td>
    <td>
      <select data-field="gender">
        <option value="female" ${voice.gender !== 'male' ? 'selected' : ''}>女声</option>
        <option value="male" ${voice.gender === 'male' ? 'selected' : ''}>男声</option>
      </select>
    </td>
    <td><input data-field="order" type="number" value="${escapeAttr(voice.order || index * 10)}" style="width:60px"></td>
    <td>
      <div class="row-actions">
        <button type="button" data-action="up" title="上移" class="icon-btn">↑</button>
        <button type="button" data-action="down" title="下移" class="icon-btn">↓</button>
        <button type="button" class="icon-btn danger" data-action="delete" title="删除">🗑</button>
      </div>
    </td>
  `;
  tbody.append(row);
}

async function saveVoices() {
  const voices = collectVoices();
  await adminJson('/api/admin/voices', {
    method: 'PUT',
    body: JSON.stringify({ voices })
  });
  toast('音色已保存');
  await loadConfig(false);
}

async function saveSettings(event) {
  event.preventDefault();
  const newAdminToken = $('#settingsAdminToken').value.trim();
  const body = {
    publicBaseUrl: assemblePublicBaseUrl(),
    mimoBaseUrl: $('#settingsMimoBaseUrl').value.trim(),
    mimoModel: $('#settingsMimoModel').value,
    geminiModel: $('#settingsGeminiModel').value.trim(),
    defaultVoice: $('#settingsDefaultVoice').value.trim(),
    defaultFormat: $('#settingsDefaultFormat').value,
    requestTimeoutMs: Number($('#settingsRequestTimeoutMs').value) || 120000,
    clearMimoApiKey: $('#clearMimoApiKey').checked,
    clearGeminiApiKey: $('#clearGeminiApiKey').checked,
    clearAccessToken: $('#clearAccessToken').checked,
    clearAdminToken: $('#clearAdminToken').checked
  };

  const mimoApiKey = $('#settingsMimoApiKey').value.trim();
  const geminiApiKey = $('#settingsGeminiApiKey').value.trim();
  const accessToken = $('#settingsAccessToken').value.trim();
  if (mimoApiKey) body.mimoApiKey = mimoApiKey;
  if (geminiApiKey) body.geminiApiKey = geminiApiKey;
  if (accessToken) body.accessToken = accessToken;
  if (newAdminToken) body.adminToken = newAdminToken;

  // 使用当前 token 发起请求（不提前更新 localStorage，避免认证失败）
  await adminJson('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  // 请求成功后再更新本地存储
  if (newAdminToken) {
    localStorage.setItem('mimo_admin_token', newAdminToken);
  }
  if (body.clearAdminToken) {
    localStorage.removeItem('mimo_admin_token');
  }

  toast('配置已保存');
  await loadConfig(false);
}

async function saveDesignVoice() {
  const selected = getSelectedVoiceEntry();
  const voiceDescription = $('#voiceDescription').value.trim();
  const name = $('#designVoiceName').value.trim() || voiceDescription.slice(0, 12) || '声音设计音色';

  if (!voiceDescription) {
    toast('请先填写声音设计描述');
    $('#voiceDescription').focus();
    return;
  }

  const result = await adminJson('/api/admin/design-voices', {
    method: 'POST',
    body: JSON.stringify({
      name,
      voice: $('#selectedVoice').value || selected?.voice || state.config?.service?.defaultVoice,
      model: state.selectedModel,
      voiceDescription,
      language: state.selectedLang,
      gender: selected?.gender || 'female'
    })
  });

  state.voices = result.voices || state.voices;
  if (result.voice) {
    state.selectedVoiceId = result.voice.id;
    state.selectedVoice = result.voice.voice;
    $('#designVoiceName').value = '';
  }
  renderVoiceOptions();
  renderVoices(state.voices);
  toast('新音色已保存到订阅源');
}

// ─── Subscription Voice Selection ────────────────────────────────────────────

function renderSubscriptionVoices(voices) {
  const container = $('#subscriptionVoiceList');
  if (!container) return;

  const mimoVoices = voices.filter(v => v.provider !== 'gemini');
  const geminiVoices = voices.filter(v => v.provider === 'gemini');

  function renderGroup(title, groupVoices) {
    if (!groupVoices.length) return '';
    return `
      <div class="sub-voice-group">
        <div class="sub-voice-group-title">${title}</div>
        <div class="sub-voice-items">
          ${groupVoices.map(v => `
            <label class="sub-voice-item">
              <input type="checkbox" data-voice-id="${escapeAttr(v.id)}" ${v.inSubscription !== false ? 'checked' : ''}>
              <span class="sub-voice-name">${escapeHtml(v.name)}</span>
              <span class="sub-voice-lang">${v.language === 'zh' ? '中文' : 'En'} · ${v.gender === 'male' ? '男' : '女'}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = renderGroup('MiMo', mimoVoices) + renderGroup('Gemini', geminiVoices);
  updateSubscriptionVoiceCount();
}

function updateSubscriptionVoiceCount() {
  const checkboxes = document.querySelectorAll('#subscriptionVoiceList input[type="checkbox"]');
  const checked = Array.from(checkboxes).filter(c => c.checked).length;
  const el = $('#subscriptionVoiceCount');
  if (el) el.textContent = `${checked} / ${checkboxes.length} 个音色将出现在订阅中`;
}

async function saveSubscriptionVoices() {
  const checkboxes = document.querySelectorAll('#subscriptionVoiceList input[type="checkbox"]');
  const selectedIds = new Set(Array.from(checkboxes).filter(c => c.checked).map(c => c.dataset.voiceId));
  const voices = state.voices.map(v => ({ ...v, inSubscription: selectedIds.has(v.id) }));
  await adminJson('/api/admin/voices', {
    method: 'PUT',
    body: JSON.stringify({ voices })
  });
  toast('订阅音色已保存');
  await loadConfig(false);
}

function collectVoices() {
  const fromTable = (tbodyId, provider) =>
    Array.from(document.querySelectorAll(`#${tbodyId} tr`)).map((row, index) => {
      const value = (field) => {
        const el = row.querySelector(`[data-field="${field}"]`);
        return el ? el.value.trim() : '';
      };
      const existing = state.voices.find((voice) => voice.id === value('id')) || {};
      return {
        id: value('id'),
        name: value('name'),
        voice: value('voice'),
        provider,
        language: value('language') || 'zh',
        gender: value('gender') || 'female',
        model: value('model'),
        voiceDescription: value('voiceDescription'),
        badge: value('badge'),
        description: existing.description || '',
        color: existing.color || '',
        order: Number(value('order')) || index + 1
      };
    });

  return [...fromTable('mimoVoiceRows', 'mimo'), ...fromTable('geminiVoiceRows', 'gemini')];
}

function moveRow(row, direction) {
  if (direction < 0 && row.previousElementSibling) {
    row.parentNode.insertBefore(row, row.previousElementSibling);
  }
  if (direction > 0 && row.nextElementSibling) {
    row.parentNode.insertBefore(row.nextElementSibling, row);
  }

  Array.from(row.parentNode.querySelectorAll('tr')).forEach((item, index) => {
    item.querySelector('[data-field="order"]').value = (index + 1) * 10;
  });
}


async function clearCache() {
  const result = await adminJson('/api/admin/cache/clear', { method: 'POST' });
  toast(`已清理 ${result.deleted} 个缓存文件`);
  await loadConfig(false);
  await loadCacheDetail();
}

async function loadCacheDetail() {
  const tbody = document.getElementById('cacheDetailRows');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="cache-detail-empty">加载中…</td></tr>';
  try {
    const data = await adminJson('/api/admin/cache/list');
    state.cacheEntries = data.entries || [];
    state.cachePage = 1;
    renderCacheDetail(state.cacheEntries);
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="cache-detail-empty">加载失败</td></tr>';
  }
}

function renderCacheDetail(entries) {
  const tbody = document.getElementById('cacheDetailRows');
  const selAll = document.getElementById('cacheDetailSelectAll');
  if (!tbody) return;

  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="cache-detail-empty">暂无缓存</td></tr>';
    renderCachePagination(0);
    updateCacheDetailSelCount();
    return;
  }

  const total = entries.length;
  const pageSize = state.cachePageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.cachePage > totalPages) state.cachePage = totalPages;
  const start = (state.cachePage - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);

  tbody.innerHTML = pageEntries.map(e => {
    const time = e.cachedAt ? new Date(e.cachedAt).toLocaleString('zh-CN', { hour12: false }) : (e.mtimeMs ? new Date(e.mtimeMs).toLocaleString('zh-CN', { hour12: false }) : '—');
    const size = formatBytes(e.size || 0);
    const model = escapeHtml(e.model || e.provider || '—');
    const voice = escapeHtml(e.voice || '—');
    const fmt = escapeHtml(e.format || '—');
    const chars = e.chars != null ? e.chars : '—';
    const preview = escapeHtml(e.textPreview || '—');
    return `<tr data-key="${escapeAttr(e.key)}" data-format="${escapeAttr(e.format || '')}" data-voice="${escapeAttr(e.voice || '')}">
      <td class="th-check"><label class="check"><input type="checkbox" class="cache-row-check"></label></td>
      <td>${model}</td>
      <td>${voice}</td>
      <td>${fmt}</td>
      <td>${chars}</td>
      <td>${size}</td>
      <td>${time}</td>
      <td class="td-preview" title="${escapeAttr(e.textPreview || '')}">${preview}</td>
      <td class="td-dl"><button type="button" class="icon-btn cache-dl-btn" title="下载音频">⬇</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.cache-row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('tr').classList.toggle('selected', cb.checked);
      updateCacheDetailSelCount();
    });
  });

  tbody.querySelectorAll('.cache-dl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      downloadCacheAudio(row.dataset.key, row.dataset.format, row.dataset.voice);
    });
  });

  if (selAll) selAll.checked = false;
  renderCachePagination(total);
  updateCacheDetailSelCount();
}

function renderCachePagination(total) {
  const el = document.getElementById('cachePagination');
  if (!el) return;
  if (total === 0) { el.innerHTML = ''; return; }
  const pageSize = state.cachePageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = state.cachePage;
  el.innerHTML = `
    <span style="display: inline-block;width: 3rem">共 ${total} 条</span>
    <button type="button" class="icon-btn" id="cachePrevBtn" ${page <= 1 ? 'disabled' : ''}>‹</button>
    <span style="display: inline-block;width: 2rem">${page} / ${totalPages}</span>
    <button type="button" class="icon-btn" id="cacheNextBtn" ${page >= totalPages ? 'disabled' : ''}>›</button>
    <select id="cachePageSizeSelect">
      <option value="20" ${pageSize === 20 ? 'selected' : ''}>20 条/页</option>
      <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 条/页</option>
      <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 条/页</option>
    </select>
  `;
  el.querySelector('#cachePrevBtn').addEventListener('click', () => {
    if (state.cachePage > 1) { state.cachePage--; renderCacheDetail(state.cacheEntries); }
  });
  el.querySelector('#cacheNextBtn').addEventListener('click', () => {
    const tp = Math.ceil(state.cacheEntries.length / state.cachePageSize);
    if (state.cachePage < tp) { state.cachePage++; renderCacheDetail(state.cacheEntries); }
  });
  el.querySelector('#cachePageSizeSelect').addEventListener('change', (e) => {
    state.cachePageSize = Number(e.target.value);
    state.cachePage = 1;
    renderCacheDetail(state.cacheEntries);
  });
}

async function downloadCacheAudio(key, format, voice) {
  try {
    const response = await fetch(`/api/admin/cache/download/${encodeURIComponent(key)}`, {
      headers: adminHeaders()
    });
    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${voice || key}.${format || 'mp3'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (err) {
    toast(err.message);
  }
}

function downloadCacheList() {
  const entries = state.cacheEntries;
  if (!entries.length) { toast('暂无缓存数据'); return; }
  const headers = ['模型', '音色', '格式', '字符数', '大小(B)', '缓存时间', '内容预览', 'Key'];
  const rows = entries.map(e => [
    e.model || e.provider || '',
    e.voice || '',
    e.format || '',
    e.chars != null ? e.chars : '',
    e.size || 0,
    e.cachedAt
      ? new Date(e.cachedAt).toLocaleString('zh-CN', { hour12: false })
      : (e.mtimeMs ? new Date(e.mtimeMs).toLocaleString('zh-CN', { hour12: false }) : ''),
    e.textPreview || '',
    e.key || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mimo-cache-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast('缓存列表已下载');
}

function updateCacheDetailSelCount() {
  const checked = document.querySelectorAll('#cacheDetailRows .cache-row-check:checked').length;
  const total = document.querySelectorAll('#cacheDetailRows .cache-row-check').length;
  const countEl = document.getElementById('cacheDetailSelCount');
  const delBtn = document.getElementById('cacheDetailDeleteBtn');
  if (countEl) countEl.textContent = total ? `已选 ${checked} / ${total}` : '';
  if (delBtn) delBtn.disabled = checked === 0;
}

async function deleteCacheSelected() {
  const rows = [...document.querySelectorAll('#cacheDetailRows tr.selected')];
  const keys = rows.map(r => r.dataset.key).filter(Boolean);
  if (!keys.length) return;
  const delBtn = document.getElementById('cacheDetailDeleteBtn');
  if (delBtn) delBtn.disabled = true;
  try {
    await adminJson('/api/admin/cache/delete', { method: 'POST', body: JSON.stringify({ keys }) });
    toast(`已删除 ${keys.length} 个缓存文件`);
    await loadConfig(false);
    await loadCacheDetail();
  } catch {
    toast('删除失败');
    updateCacheDetailSelCount();
  }
}


function renderGeminiVoiceCards() {
  const container = $('#geminiVoiceCards');
  if (!container) return;
  const voices = state.voices
    .filter(v => v.provider === 'gemini' && v.language === (state.geminiLang || 'zh'))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  container.innerHTML = '';
  voices.forEach(v => {
    const card = document.createElement('div');
    card.className = `voice-card${v.id === state.geminiVoiceId ? ' active' : ''}`;
    card.dataset.voiceId = v.id;
    const color = voiceAvatarColor(v.name);
    const initial = [...v.name][0];
    card.innerHTML = `
      <div class="voice-avatar-wrap"><div class="voice-avatar" style="background:${color}">${escapeHtml(initial)}</div></div>
      <div class="voice-card-name" title="${escapeAttr(v.name)}">${escapeHtml(v.name)}</div>
      <div class="voice-card-lang">${v.gender === 'male' ? '男声' : '女声'}</div>
    `;
    card.addEventListener('click', () => {
      state.geminiVoiceId = v.id;
      state.geminiVoice = v.voice;
      document.querySelectorAll('#geminiVoiceCards .voice-card').forEach(c => {
        c.classList.toggle('active', c.dataset.voiceId === v.id);
      });
      const bar = $('#geminiVoiceSelectedBar');
      if (bar) bar.textContent = `已选择：${v.name}`;
    });
    container.appendChild(card);
  });
  if (!state.geminiVoiceId && voices.length) {
    state.geminiVoiceId = voices[0].id;
    state.geminiVoice = voices[0].voice;
    container.querySelector('.voice-card')?.classList.add('active');
    const bar = $('#geminiVoiceSelectedBar');
    if (bar) bar.textContent = `已选择：${voices[0].name}`;
  }
}

async function runGeminiTest(event) {
  event.preventDefault();
  const stateText = $('#geminiTestState');
  stateText.textContent = '生成中';

  if (!state.geminiVoiceId) {
    stateText.textContent = '请先选择 Gemini 音色';
    return;
  }

  try {
    const response = await fetch('/api/admin/test-tts', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        voiceId: state.geminiVoiceId,
        provider: 'gemini',
        voice: state.geminiVoice,
        format: 'wav',
        speed: $('#geminiTestSpeed').value,
        text: $('#geminiTestText').value
      })
    });

    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const audio = $('#geminiTestAudio');
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(blob);
    stateText.textContent = `${formatBytes(blob.size)} · ${response.headers.get('x-cache') || 'MISS'}`;
    await audio.play().catch(() => {});
  } catch (error) {
    stateText.textContent = '失败';
    toast(error.message);
  }
}

async function runTest(event) {
  event.preventDefault();
  const stateText = $('#testState');
  stateText.textContent = '生成中';
  updateSelectedVoiceField();

  try {
    const selected = getSelectedVoiceEntry();
    const voice = $('#selectedVoice').value || state.selectedVoice;
    const voiceDescription = state.selectedMode === 'design'
      ? ($('#voiceDescription').value.trim() || selected?.voiceDescription || '')
      : '';
    if (state.selectedMode === 'design' && !voiceDescription) {
      throw new Error('声音设计模型需要填写声音设计描述');
    }
    const response = await fetch('/api/admin/test-tts', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        voiceId: selected?.id,
        model: selected?.model || state.selectedModel,
        voice,
        voiceDescription,
        format: $('#testFormat').value,
        speed: $('#testSpeed').value,
        text: $('#testText').value
      })
    });

    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const audio = $('#testAudio');
    if (audio.src) URL.revokeObjectURL(audio.src);
    audio.src = URL.createObjectURL(blob);
    stateText.textContent = `${formatBytes(blob.size)} · ${response.headers.get('x-cache') || 'MISS'}`;
    await audio.play().catch(() => {});
  } catch (error) {
    stateText.textContent = '失败';
    toast(error.message);
  }
}

async function adminJson(url, options = {}) {
  const jsonHeaders = options.body && !(options.body instanceof FormData)
    ? { 'Content-Type': 'application/json' }
    : {};
  const response = await fetch(url, {
    ...options,
    headers: adminHeaders({
      Accept: 'application/json',
      ...jsonHeaders,
      ...(options.headers || {})
    })
  });

  const data = await safeJson(response);
  if (!response.ok) {
    const err = new Error(data.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

function adminHeaders(extra = {}) {
  const headers = { ...extra };
  const token = localStorage.getItem('mimo_admin_token');
  if (token) headers['x-admin-token'] = token;
  return headers;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function setStatus(element, text, ok) {
  element.textContent = text;
  element.classList.toggle('ok', Boolean(ok));
  element.classList.toggle('warn', !ok);
}

function markDisconnected(message) {
  $('#baseUrl').textContent = message;
  setStatus($('#mimoStatus'), '连接失败', false);
  setStatus($('#cacheStatus'), '未知', false);
  toast(message);
}

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
  toast('已复制');
}

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 2400);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/* ─── QR Code ────────────────────────────────────────────────────────────── */

function showQrModal(url, label) {
  document.getElementById('qrModalTitle').textContent = `扫码${label ? ' · ' + label : ''}`;
  document.getElementById('qrModalUrl').textContent = url;

  const wrap = document.getElementById('qrImgWrap');
  wrap.innerHTML = '<div class="qr-loading">生成中…</div>';
  document.getElementById('qrModal').hidden = false;

  // 用 Google Charts API 生成 QR（客户端直接请求，无需服务端依赖）
  const qrSrc = `https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8&chld=M|2`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    wrap.innerHTML = '';
    img.className = 'qr-img';
    wrap.appendChild(img);
  };
  img.onerror = () => {
    // fallback: qrserver.com
    const img2 = new Image();
    img2.className = 'qr-img';
    img2.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}&margin=10`;
    img2.onload = () => { wrap.innerHTML = ''; wrap.appendChild(img2); };
    img2.onerror = () => { wrap.innerHTML = '<p style="color:var(--muted);font-size:13px">二维码加载失败，请检查网络</p>'; };
  };
  img.src = qrSrc;
}

function downloadQrImage() {
  const img = document.querySelector('#qrImgWrap img');
  if (!img) { toast('二维码尚未加载完成'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 280;
  canvas.height = img.naturalHeight || 280;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const a = document.createElement('a');
  a.download = 'mimo-tts-qrcode.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

/* ─── Subscription Download ─────────────────────────────────────────────── */


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
