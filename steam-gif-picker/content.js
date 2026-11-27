(() => {
  'use strict';

  const HOST = location.hostname;
  // Local mock support is available only with the development manifest.
  const IS_LOCAL_TEST = HOST === 'localhost' || HOST === '127.0.0.1';
  // Only run on Steam's internal chat surfaces. Public Community pages are intentionally excluded.
  const IS_STEAM_HOST = /(^|\.)steamloopback\.host$/i.test(HOST)
    || /(^|\.)steam-chat\.com$/i.test(HOST);

  // Keep popup matching unchanged; do not mount UI on unrelated sites or child frames.
  if (window !== window.top || (!IS_STEAM_HOST && !IS_LOCAL_TEST)) return;
  if (document.getElementById('steam-gif-picker-host')) return;

  const STORAGE_KEYS = ['sgpFavorites', 'sgpSearchHistory', 'sgpFloatingPosition', 'giphyApiKey', 'giphyRating', 'sgpProvider', 'sgpGifLinkLimitMB'];
  const DEMO_ITEMS = [
    { id: 'demo-cat', title: 'Typing cat', emoji: '🐈‍⬛', label: 'CAT MODE', color: 'linear-gradient(135deg,#263c58,#536b91)', tags: 'cat kitty typing' },
    { id: 'demo-laugh', title: 'Laughing reaction', emoji: '😂', label: 'LOL', color: 'linear-gradient(135deg,#513c65,#a56e9b)', tags: 'laugh funny lol' },
    { id: 'demo-dance', title: 'Dancing penguin', emoji: '🐧', label: 'DANCE', color: 'linear-gradient(135deg,#1d5264,#5a9aa2)', tags: 'dance penguin happy' },
    { id: 'demo-shock', title: 'Shocked reaction', emoji: '😳', label: 'WHAT', color: 'linear-gradient(135deg,#6b4831,#c28a57)', tags: 'shocked surprised what' },
    { id: 'demo-hamster', title: 'Hamster stare', emoji: '🐹', label: 'STARE', color: 'linear-gradient(135deg,#674a38,#bd9773)', tags: 'hamster stare cute' },
    { id: 'demo-dog', title: 'Happy dog', emoji: '🐶', label: 'GOOD BOY', color: 'linear-gradient(135deg,#344c3a,#81a66e)', tags: 'dog happy cute' },
    { id: 'demo-sideeye', title: 'Side eye', emoji: '🙄', label: 'SIDE EYE', color: 'linear-gradient(135deg,#3d4659,#828ca4)', tags: 'side eye cat reaction' },
    { id: 'demo-fire', title: 'This is fine', emoji: '🔥', label: 'FINE', color: 'linear-gradient(135deg,#653b2e,#b76b43)', tags: 'fire fine bruh' }
  ].map((item) => ({
    ...item,
    pageUrl: `https://example.com/steam-gif-picker-demo/${item.id}`,
    sendUrl: `https://example.com/steam-gif-picker-demo/${item.id}`,
    previewUrl: '',
    source: 'demo',
    isDemo: true
  }));

  const host = document.createElement('div');
  host.id = 'steam-gif-picker-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .sgp, .sgp button, .sgp input { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .sgp { color: #edf2f8; font-size: 13px; line-height: 1.35; }
      button { color: inherit; border: 0; cursor: pointer; }
      button:focus-visible, input:focus-visible { outline: 2px solid #78b8f5; outline-offset: 2px; }
      .ball { position: fixed; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(145deg,#398fe0,#635fda); color: #fff; font-weight: 850; font-size: 12px; letter-spacing: -.4px; box-shadow: 0 7px 24px #0008, inset 0 1px 0 #ffffff55; pointer-events: auto; user-select: none; touch-action: none; cursor: grab; border: 1px solid #ffffff33; transition: box-shadow .18s, transform .18s; }
      .ball:hover { box-shadow: 0 9px 28px #000a, inset 0 1px 0 #ffffff66; transform: translateY(-1px); }
      .ball.dragging { cursor: grabbing; transition: none; transform: scale(1.04); }
      .panel { position: fixed; width: min(460px, calc(100vw - 24px)); max-height: min(560px, calc(100vh - 24px)); display: none; flex-direction: column; gap: 10px; padding: 12px; border-radius: 17px; border: 1px solid #ffffff20; background: rgba(28,33,42,.96); color: #edf2f8; box-shadow: 0 18px 65px #000b, inset 0 1px 0 #ffffff12; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); pointer-events: auto; transform-origin: top right; opacity: 0; transform: translateY(8px) scale(.97); transition: opacity .2s ease, transform .24s cubic-bezier(.2,.8,.2,1); overflow: visible; }
      .panel.open { display: flex; }
      .panel.visible { opacity: 1; transform: translateY(0) scale(1); }
      .top { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .search-wrap { flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 10px; background: #111720; border: 1px solid #343e4b; }
      .search-icon { color: #8d9aaa; font-size: 15px; }
      .search { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #f5f8fc; font-size: 13px; }
      .search::placeholder { color: #7e8998; }
      .search::-webkit-search-cancel-button, .search::-webkit-search-decoration { -webkit-appearance: none; appearance: none; display: none; }
      .search:focus-visible { outline: none; }
      .search-wrap:focus-within { border-color: #679bd0; box-shadow: 0 0 0 2px #679bd022; }
      #clearSearch { padding: 0; border-radius: 50%; background: #303844; line-height: 1; }
      #clearSearch:hover { background: #465466; }
      .icon-btn { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; background: #303844; color: #c9d3df; display: grid; place-items: center; font-size: 17px; transition: background .15s, transform .15s; }
      .icon-btn:hover { background: #414d5d; transform: translateY(-1px); }
      .icon-btn.active { color: #ff5c63; background: #4b3037; }
      .section-row { display: flex; align-items: center; gap: 8px; min-height: 18px; }
      .section-title { color: #e2e9f1; font-size: 12px; font-weight: 700; }
      .target-status { margin-left: auto; color: #93a1b1; font-size: 10px; white-space: nowrap; }
      .target-status.locked { color: #a6d98b; }
      .track { display: flex; gap: 7px; overflow-x: auto; overflow-y: hidden; min-height: 116px; padding: 1px 1px 7px; scrollbar-width: none; overscroll-behavior: contain; touch-action: pan-x; }
      .track::-webkit-scrollbar, .grid::-webkit-scrollbar { display: none; }
      .grid { display: none; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; max-height: min(410px, calc(100vh - 230px)); overflow: auto; padding: 1px 2px 6px 1px; overscroll-behavior: contain; scrollbar-width: none; }
      .panel.expanded .track { display: none; }
      .panel.expanded .grid { display: grid; }
      .card { position: relative; flex: 0 0 112px; width: 112px; min-width: 0; height: 104px; border-radius: 10px; overflow: hidden; background: #333d4a; border: 1px solid #ffffff13; }
      .grid .card { width: 100%; height: auto; aspect-ratio: 1 / 1; }
      .card-main { display: block; width: 100%; height: 100%; padding: 0; background: transparent; text-align: left; user-select: none; -webkit-user-drag: none; }
      .card-main img { display: block; width: 100%; height: 100%; object-fit: contain; background: #141a22; pointer-events: none; user-select: none; -webkit-user-drag: none; }
      .demo-preview { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 5px; background: var(--demo-bg); }
      .demo-emoji { font-size: 39px; line-height: 1; filter: drop-shadow(0 5px 8px #0005); }
      .demo-label { color: #ffffffc9; font-size: 9px; letter-spacing: 1.5px; font-weight: 800; }
      .card-title { position: absolute; left: 6px; right: 6px; bottom: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #fff; font-size: 9px; text-shadow: 0 1px 5px #000; pointer-events: none; opacity: .9; }
      .star { position: absolute; top: 5px; right: 5px; width: 25px; height: 25px; border-radius: 50%; display: grid; place-items: center; background: #111923c9; color: #d0d7df; font-size: 16px; line-height: 1; z-index: 2; padding: 0; }
      .star.fav { color: #ff525b; }
      .star:hover { background: #111923ee; transform: scale(1.08); }
      .empty { padding: 28px 12px; text-align: center; color: #96a3b2; font-size: 12px; line-height: 1.6; }
      .footer { display: flex; justify-content: space-between; align-items: center; color: #788596; font-size: 9px; letter-spacing: .5px; min-height: 12px; }
      .history, .context-menu, .settings { position: absolute; z-index: 8; border-radius: 11px; border: 1px solid #ffffff1e; background: #202731; box-shadow: 0 12px 35px #0009; }
      .history { left: 12px; right: 95px; top: 54px; padding: 7px; max-height: 220px; overflow: auto; overscroll-behavior: contain; color-scheme: dark; }
      .history::-webkit-scrollbar { width: 8px; height: 8px; }
      .history::-webkit-scrollbar-track { background: #202731; border-radius: 8px; }
      .history::-webkit-scrollbar-thumb { background: #495767; border: 2px solid #202731; border-radius: 8px; }
      .history::-webkit-scrollbar-thumb:hover { background: #65788c; }
      .history::-webkit-scrollbar-thumb:active { background: #7890a8; }
      .history::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
      .history::-webkit-scrollbar-corner { background: #202731; }
      .history[hidden], .context-menu[hidden], .settings[hidden] { display: none; }
      .history-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 7px 7px; color: #8f9dad; font-size: 10px; }
      .history-head button { color: #8f9dad; background: transparent; font-size: 10px; padding: 2px 4px; }
      .history-item { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px 7px; border-radius: 7px; text-align: left; background: transparent; color: #d8e0e9; font-size: 12px; }
      .history-item:hover { background: #34404e; }
      .history-query { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; padding: 0; color: inherit; font-size: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .history-item .remove { margin-left: auto; width: 24px; height: 24px; flex: 0 0 24px; display: grid; place-items: center; padding: 0; border-radius: 50%; color: #9caabb; background: transparent; font-size: 16px; line-height: 1; transition: background .15s, color .15s; }
      .history-item .remove:hover { background: #485465; color: #fff; }
      .history-item .remove:active { background: #593940; color: #ff8b90; }
      .context-menu { position: fixed; min-width: 165px; padding: 5px; pointer-events: auto; }
      .menu-item { width: 100%; text-align: left; padding: 9px 10px; border-radius: 7px; background: transparent; color: #e4eaf1; font-size: 12px; }
      .menu-item:hover { background: #354252; }
      .menu-item.danger { color: #ff7a80; }
      .settings { left: 12px; right: 12px; top: 55px; padding: 12px; }
      .settings [hidden] { display: none !important; }
      .settings h3 { margin: 0 0 8px; font-size: 12px; }
      .settings p { color: #98a5b4; font-size: 10px; line-height: 1.5; margin: 0 0 8px; }
      .settings input, .settings select { width: 100%; height: 34px; border-radius: 8px; border: 1px solid #465363; background: #121820; color: #f4f7fb; padding: 0 9px; font-size: 11px; outline: none; margin-bottom: 8px; }
      .settings-actions { display: flex; gap: 7px; }
      .settings-actions-triple > button { flex: 1 1 0; min-width: 0; }
      .api-links { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin:0 0 10px; }
      .api-links a, .api-links button { color:#8ec4ff; background:transparent; padding:0; font:11px/1.4 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
      .api-links a:hover,.api-links button:hover { text-decoration:underline; }
      .settings { max-height:calc(100vh - 92px); overflow:auto; }
      .card-main:disabled { cursor:wait; }
      .panel.sending .card-main { cursor:wait; }
      .primary { background: #397fca; color: white; border-radius: 8px; padding: 8px 12px; font-weight: 700; font-size: 11px; }
      .secondary { background: #36404d; color: #dbe3ec; border-radius: 8px; padding: 8px 12px; font-size: 11px; }
      .toast { position: fixed; left: 50%; bottom: 18px; transform: translate(-50%, 8px); opacity: 0; pointer-events: none; padding: 9px 13px; border-radius: 9px; background: #101720ee; border: 1px solid #ffffff20; color: #f0f5fa; font-size: 11px; box-shadow: 0 8px 25px #0008; transition: opacity .16s, transform .16s; white-space: nowrap; max-width: calc(100vw - 30px); overflow: hidden; text-overflow: ellipsis; }
      .toast.show { opacity: 1; transform: translate(-50%,0); }
      .toast.warn { border-color: #b77d4b; }
      .toast.ok { border-color: #648e63; }
      .network-error { color: #e3b5a0; }
      .network-retry { margin-left: 7px; padding: 5px 10px; border-radius: 7px; background: #364d68; color: #e8f1ff; font-size: 11px; }
      .network-retry[hidden] { display: none; }
      #networkStatus { margin-top: 7px; overflow-wrap: anywhere; }
      .loading { color: #92a0b0; font-size: 11px; padding: 5px 2px; min-height: 14px; }
      @media (max-width: 520px) { .panel { width: calc(100vw - 18px); } .card { flex-basis: 96px; width: 96px; height: 96px; } .settings-actions-triple { gap: 6px; } .settings-actions-triple > button { padding: 8px 9px; font-size: 10px; } }
      @media (prefers-reduced-motion: reduce) { .panel, .ball, .toast, .icon-btn { transition: none !important; } }
    </style>
    <div class="sgp">
      <button class="ball" id="ball" aria-label="打开 GIF 选择器" title="Steam GIF Picker">GIF</button>
      <section class="panel" id="panel" aria-label="GIF 选择器">
        <div class="top">
          <div class="search-wrap">
            <span class="search-icon">⌕</span>
            <input class="search" id="search" type="text" inputmode="search" placeholder="搜索 GIF..." autocomplete="off" spellcheck="false" aria-label="搜索 GIF">
            <button class="icon-btn" id="clearSearch" title="清空搜索" style="display:none;width:24px;height:24px;flex-basis:24px;font-size:13px">×</button>
          </div>
          <button class="icon-btn" id="favoritesBtn" title="我的收藏" aria-label="我的收藏">☆</button>
          <button class="icon-btn" id="settingsBtn" title="设置" aria-label="设置">⚙</button>
          <button class="icon-btn" id="expandBtn" title="展开三列" aria-label="展开三列">⤢</button>
          <button class="icon-btn" id="closeBtn" title="关闭" aria-label="关闭">×</button>
        </div>
        <div class="history" id="history" hidden></div>
        <div class="settings" id="settings" hidden>
          <h3>GIF 数据源设置</h3>
          <select id="provider" aria-label="GIF 数据源"><option value="gifsnap">GifSnap（无需 Key）</option><option value="giphy">GIPHY（API Key）</option></select>
          <p id="gifsnapNote" hidden>无需注册或申请 Key，直接在当前悬浮窗搜索。公共服务不保证可用；不支持 GIPHY 内容分级。</p>
          <div id="originalLinkFields" hidden><label for="gifLinkLimitMB">GIF 链接体积阈值（实验）</label><select id="gifLinkLimitMB"><option value="0.5">0.5 MB</option><option value="1">1 MB</option><option value="1.5">1.5 MB</option><option value="2">2 MB</option><option value="2.5">2.5 MB</option><option value="3">3 MB</option><option value="4">4 MB</option><option value="6">6 MB</option><option value="8">8 MB</option></select><p>默认 2 MB（2,000,000 字节），不是 Steam 官方限制。右键仍可仅本次作为图片文件发送。</p></div>
          <div id="giphyFields">
          <p>填写自己的 GIPHY API Key 后启用真实热门与搜索。Key 保存在本地扩展存储中。</p>
          <input id="apiKey" type="password" placeholder="GIPHY API Key" autocomplete="off">
          <div class="api-links"><a id="registerApi" href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener noreferrer">申请 API Key ↗</a><button type="button" id="apiGuideHelp">查看申请教程</button></div>
          <select id="rating" aria-label="内容分级">
            <option value="g">G</option><option value="pg">PG</option><option value="pg-13">PG-13</option><option value="r">R</option>
          </select>
          </div>
          <div class="settings-actions settings-actions-triple"><button class="primary" id="saveSettings">保存并加载</button><button class="secondary" id="openOptions">更多设置</button><button type="button" class="secondary" id="checkNetwork">检测网络连接</button></div>
          <p id="networkStatus" role="status" aria-live="polite">分别检测已保存的数据源 API 和图片 CDN。</p>
        </div>
        <div class="section-row">
          <span class="section-title" id="sectionTitle">🔥 热门 GIF</span>
          <span class="target-status" id="targetStatus">发送目标未锁定</span>
        </div>
        <div class="track" id="track" aria-label="横向 GIF 列表"></div>
        <div class="grid" id="grid" aria-label="GIF 网格"></div>
        <div class="loading" aria-live="polite"><span id="loading"></span><button type="button" id="retryNetwork" class="network-retry" hidden>重试</button></div>
        <div class="footer"><span id="sourceLabel">演示模式 · 配置 API Key 启用实时数据</span><span id="branding">DEMO PREVIEW</span></div>
      </section>
      <div class="context-menu" id="contextMenu" hidden></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>
  `;

  const $ = (selector) => shadow.querySelector(selector);
  const ball = $('#ball');
  const panel = $('#panel');
  const searchInput = $('#search');
  const track = $('#track');
  const grid = $('#grid');
  const loading = $('#loading');
  const toast = $('#toast');
  const contextMenu = $('#contextMenu');
  const historyBox = $('#history');
  const settingsBox = $('#settings');
  const apiGuide = SGPApiGuide.mount(shadow, $('#registerApi'), $('#apiGuideHelp'));
  // The ball is only shown while an actual chat composer is detected.
  ball.style.display = 'none';
  let sending = false;
  let sendCooldownUntil = 0;

  let favorites = [];
  let searchHistory = [];
  let currentItems = [];
  const seenResultKeys = new Set();
  const visualSignatures = new Map();
  const visualChecked = new Set();
  let previewFrame = 0;
  let prefetchTimer = 0;
  let currentSource = 'trending';
  let currentQuery = '';
  let viewMode = 'compact';
  let favoritesMode = false;
  let offset = 0;
  let hasMore = false;
  let isLoading = false;
  let searchState = 'idle';
  let searchError = null;
  let pageError = null;
  let retryAction = null;
  let apiKey = '';
  const GIF_LIMIT_CHOICES = [0.5,1,1.5,2,2.5,3,4,6,8];
  function readGifLimit(value) {return GIF_LIMIT_CHOICES.includes(Number(value)) ? Number(value) : 2;}
  let gifLinkLimitMB = 2;
  let warmProbeActive = false;
  const warmProbeAttempts = new Map();
  let provider = 'giphy'; // initialized from storage before UI becomes usable
  function selectProvider(stored, key) { return ['giphy','gifsnap'].includes(stored) ? stored : (key || IS_LOCAL_TEST ? 'giphy' : 'gifsnap'); }
  function hasLiveSource() { return provider === 'gifsnap' || Boolean(apiKey); }
  function fetchType() { return provider === 'gifsnap' ? 'SGP_GIFSNAP_FETCH' : 'SGP_GIPHY_FETCH'; }
  function favoriteItems() { return favorites.filter(item => provider === 'gifsnap' ? item.source === 'gifsnap' : item.source !== 'gifsnap'); }
  function syncProviderFields() { const isSnap = $('#provider').value === 'gifsnap'; $('#giphyFields').hidden = isSnap; $('#gifsnapNote').hidden = !isSnap; $('#originalLinkFields').hidden = !isSnap; }
  let settingsReady = false;
  let setupChecked = false;
  let rating = 'pg-13';
  let searchTimer = null;
  let composing = false;
  let requestSequence = 0;
  let lastScrollAt = 0;
  let scrollResetTimer = null;
  let smoothTarget = 0;
  let smoothFrame = 0;
  let toastTimer = null;
  let activeTarget = null;
  let suppressBallClick = false;
  let floatingPosition = { edge: 'right', yRatio: 0.65 };
  let dragState = null;

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.local) return resolve({});
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime?.lastError) return resolve({});
          resolve(result || {});
        });
      } catch { resolve({}); }
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      try {
        if (!chrome?.storage?.local) return resolve(false);
        chrome.storage.local.set(values, () => resolve(!chrome.runtime?.lastError));
      } catch { resolve(false); }
    });
  }

  const COMPOSER_SELECTOR = 'textarea, [contenteditable="true"], [role="textbox"], input:not([type]), input[type="text"]';

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4 || rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    // A child can have its own opacity while an ancestor is hidden; check the whole chain.
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
    }
    return true;
  }

  function composerMeta(element) {
    return [
      element.getAttribute('placeholder'), element.getAttribute('aria-label'), element.getAttribute('aria-placeholder'),
      element.getAttribute('title'), element.getAttribute('data-placeholder'), element.getAttribute('data-testid'),
      element.id, element.className
    ].map(value => typeof value === 'string' ? value : '').join(' ').toLowerCase();
  }

  function getChatRoot(element) {
    if (!element) return null;
    if (IS_LOCAL_TEST) return element.closest('[data-conversation-id], .app') || document.body;
    // SFP's Steam UI selector identifies .friendsui-container as the Friends & Chat surface.
    return element.closest('.friendsui-container')
      || element.closest('[class*="ChatWindow"], [class*="chatWindow"], [class*="ChatRoom"], [class*="chatRoom"]');
  }

  function closestComposer(target) {
    if (!(target instanceof Element)) return null;
    const candidate = target.matches(COMPOSER_SELECTOR) ? target : target.closest(COMPOSER_SELECTOR);
    if (!candidate || host.contains(candidate) || !isVisible(candidate)) return null;
    if (candidate.getAttribute('aria-disabled') === 'true' || candidate.hasAttribute('disabled')) return null;
    const tag = candidate.tagName.toLowerCase();
    const meta = composerMeta(candidate);
    if (/search|搜索|查找|filter|筛选|find friends/.test(meta)) return null;
    const strongChatHint = /message|chat|发送|消息|回复|聊天|type a message|write a message/.test(meta);
    const root = getChatRoot(candidate);
    // On Steam's Friends & Chat surface, a visible textarea/contenteditable is a composer;
    // generic text inputs still need an explicit chat/message hint to avoid search boxes.
    if (!root && !strongChatHint && !IS_LOCAL_TEST) return null;
    if (tag === 'input' && !strongChatHint) return null;
    if (!['textarea', 'input'].includes(tag) && !candidate.isContentEditable && candidate.getAttribute('role') !== 'textbox') return null;
    return candidate;
  }

  function composerScore(element) {
    const meta = composerMeta(element);
    const root = getChatRoot(element);
    let score = 0;
    if (root?.matches?.('.friendsui-container')) score += 12;
    if (/message|chat|发送|消息|回复|聊天|type a message|write a message/.test(meta)) score += 14;
    if (element.tagName === 'TEXTAREA') score += 7;
    if (element.isContentEditable) score += 6;
    if (element.getAttribute('role') === 'textbox') score += 4;
    if (element === document.activeElement) score += 100;
    let node = element;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const cls = typeof node.className === 'string' ? node.className.toLowerCase() : '';
      if (/chat|conversation|message|composer|entry/.test(cls)) score += 3;
      if (['data-chat-id', 'data-conversation-id', 'data-steamid', 'data-partner-id'].some(attr => node.hasAttribute?.(attr))) score += 8;
      if (node.getAttribute?.('aria-selected') === 'true' || node.getAttribute?.('data-active') === 'true') score += 5;
    }
    return score;
  }

  function setChatUiVisible(visible) {
    ball.style.display = visible ? '' : 'none';
    if (!visible && panel.classList.contains('open')) closePanel();
  }

  // Automatically resolve the visible Steam chat composer; no manual focus/click is required.
  function discoverActiveComposer() {
    const candidates = [...document.querySelectorAll(COMPOSER_SELECTOR)]
      .map(element => closestComposer(element))
      .filter(Boolean);
    if (!candidates.length) {
      if (activeTarget?.element?.isConnected && isVisible(activeTarget.element)) {
        setChatUiVisible(true);
        updateTargetStatus();
        return activeTarget.element;
      }
      clearActiveTarget();
      return null;
    }

    const ranked = candidates.map(element => ({ element, score: composerScore(element) }))
      .sort((a, b) => b.score - a.score);
    let chosen = null;
    if (ranked[0].element === document.activeElement) chosen = ranked[0].element;
    else if (ranked.length === 1 || ranked[0].score >= ranked[1].score + 3) chosen = ranked[0].element;

    if (!chosen) {
      // Ambiguous multiple visible editors: hide rather than risk sending to the wrong chat.
      clearActiveTarget();
      return null;
    }
    setActiveTarget(chosen, chosen === document.activeElement ? 'focus' : 'auto');
    setChatUiVisible(true);
    maybeShowFirstRunSetup();
    return chosen;
  }

  let targetDiscoveryTimer = 0;
  function scheduleTargetDiscovery(delay = 140) {
    clearTimeout(targetDiscoveryTimer);
    targetDiscoveryTimer = setTimeout(discoverActiveComposer, delay);
  }

  function readComposerValue(element) {
    if (!element) return '';
    if (!['TEXTAREA', 'INPUT'].includes(element.tagName) && (element.isContentEditable || element.getAttribute('role') === 'textbox')) return element.innerText ?? element.textContent ?? '';
    return String(element.value ?? '');
  }

  function setComposerValue(element, value) {
    if (!element || !element.isConnected) return false;
    const text = String(value);
    try {
      if (!['TEXTAREA', 'INPUT'].includes(element.tagName) && (element.isContentEditable || element.getAttribute('role') === 'textbox')) {
        element.focus();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        const inserted = document.execCommand?.('insertText', false, text);
        // execCommand already emits input on success; do not dispatch a second event.
        if (!inserted) {
          element.textContent = text;
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
      } else {
        const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) descriptor.set.call(element, text);
        else element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        // React-controlled inputs need input; avoid an extra change event.
      }
      return true;
    } catch (error) {
      console.warn('[Steam GIF Picker] set composer failed', error);
      return false;
    }
  }

  function conversationFingerprint(element) {
    const parts = [`${location.origin}${location.pathname}${location.search}${location.hash}`];
    let node = element;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      for (const attr of ['data-conversation-id', 'data-chat-id', 'data-steamid', 'data-partner-id', 'data-friend-id']) {
        const value = node.getAttribute?.(attr);
        if (value) return `${parts[0]}|${attr}:${value}`;
      }
    }
    node = element;
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      const headings = node.querySelectorAll?.('header, [role="heading"], h1, h2, [class*="title"], [class*="Title"]') || [];
      for (const heading of headings) {
        if (!isVisible(heading)) continue;
        const text = String(heading.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length <= 90) return `${parts[0]}|heading:${text}`;
      }
    }
    return `${parts[0]}|composer:${getElementId(element)}`;
  }

  const elementIds = new WeakMap();
  let nextElementId = 1;
  function getElementId(element) {
    if (!elementIds.has(element)) elementIds.set(element, nextElementId++);
    return elementIds.get(element);
  }

  function setActiveTarget(element, source = 'auto') {
    if (!element) return;
    const fingerprint = conversationFingerprint(element);
    if (activeTarget?.element === element && activeTarget.fingerprint === fingerprint) {
      activeTarget.source = source;
    } else {
      activeTarget = { element, fingerprint, capturedAt: Date.now(), source };
    }
    setChatUiVisible(true);
    updateTargetStatus();
  }

  function clearActiveTarget() {
    activeTarget = null;
    setChatUiVisible(false);
    updateTargetStatus();
  }

  function getValidTarget() {
    if (!activeTarget) return null;
    const { element, fingerprint } = activeTarget;
    if (!element?.isConnected || !isVisible(element)) {
      clearActiveTarget();
      return null;
    }
    if (conversationFingerprint(element) !== fingerprint) {
      clearActiveTarget();
      return null;
    }
    return element;
  }

  function updateTargetStatus() {
    const target = getTargetStatusOnly();
    const status = $('#targetStatus');
    if (!status) return;
    status.textContent = target ? '● 已自动识别当前聊天' : '等待打开聊天窗口';
    status.classList.toggle('locked', Boolean(target));
  }

  function getTargetStatusOnly() {
    if (!activeTarget) return false;
    const el = activeTarget.element;
    return Boolean(el?.isConnected && isVisible(el) && conversationFingerprint(el) === activeTarget.fingerprint);
  }

  document.addEventListener('focusin', (event) => {
    const composer = closestComposer(event.target);
    if (composer) setActiveTarget(composer, 'focus');
    else scheduleTargetDiscovery(80);
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (host.contains(event.target)) return;
    const composer = closestComposer(event.target);
    if (composer) setActiveTarget(composer, 'focus');
    else scheduleTargetDiscovery(120);
  }, true);

  // Steam's Friends & Chat is a React SPA. Observe chat-tab/window changes so the
  // picker follows the currently visible composer without requiring a manual click.
  const chatObserver = new MutationObserver((records) => {
    if (records.every(record => host.contains(record.target))) return;
    scheduleTargetDiscovery(180);
  });
  chatObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden', 'aria-selected', 'contenteditable', 'placeholder', 'data-active', 'data-chat-id', 'data-conversation-id']
  });
  window.addEventListener('focus', () => scheduleTargetDiscovery(100));
  window.addEventListener('popstate', () => scheduleTargetDiscovery(100));
  window.addEventListener('hashchange', () => scheduleTargetDiscovery(100));
  document.addEventListener('click', (event) => {
    if (!host.contains(event.target)) scheduleTargetDiscovery(100);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleTargetDiscovery(100);
  });

  function showToast(message, kind = '') {
    toast.textContent = message;
    toast.className = `toast show ${kind}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2500);
  }

  function closeTransientLayers() {
    historyBox.hidden = true;
    settingsBox.hidden = true;
    contextMenu.hidden = true;
  }

  function positionPanel() {
    const ballRect = ball.getBoundingClientRect();
    const panelWidth = Math.min(460, window.innerWidth - 24);
    const panelHeight = Math.min(panel.scrollHeight || 360, window.innerHeight - 24);
    const top = Math.max(12, Math.min(window.innerHeight - panelHeight - 12, ballRect.top + ballRect.height / 2 - Math.min(panelHeight / 2, 180)));
    panel.style.top = `${top}px`;
    panel.style.width = `${panelWidth}px`;
    if (floatingPosition.edge === 'right') {
      panel.style.left = 'auto';
      panel.style.right = `${Math.max(12, window.innerWidth - ballRect.left + 10)}px`;
      panel.style.transformOrigin = 'top right';
    } else {
      panel.style.right = 'auto';
      panel.style.left = `${Math.max(12, ballRect.right + 10)}px`;
      panel.style.transformOrigin = 'top left';
    }
    requestAnimationFrame(() => {
      const rect = panel.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) panel.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`, panel.style.right = 'auto';
      if (rect.left < 8) panel.style.left = '8px', panel.style.right = 'auto';
    });
  }

  function setBallPosition() {
    const y = Math.max(48, Math.min(window.innerHeight - 48, floatingPosition.yRatio * window.innerHeight));
    ball.style.top = `${y - 22}px`;
    if (floatingPosition.edge === 'right') {
      ball.style.left = 'auto';
      ball.style.right = '16px';
    } else {
      ball.style.right = 'auto';
      ball.style.left = '16px';
    }
  }

  async function maybeShowFirstRunSetup() {
    if (!settingsReady || setupChecked || !IS_STEAM_HOST || provider !== 'giphy' || apiKey || document.hidden || !document.hasFocus()) return;
    setupChecked = true;
    const result = await runtimeMessage({ type: 'SGP_SETUP_CLAIM' });
    if (result?.show !== true) return;
    if (!getValidTarget() || provider !== 'giphy' || apiKey || document.hidden || !document.hasFocus()) {
      await runtimeMessage({ type: 'SGP_SETUP_RELEASE' });
      setupChecked = false;
      return;
    }
    openPanel();
    if (settingsBox.hidden) $('#settingsBtn').click();
  }

  function openPanel() {
    discoverActiveComposer();
    if (!getValidTarget()) { showToast('请先打开一个好友聊天窗口。', 'warn'); return; }
    panel.classList.add('open');
    positionPanel();
    requestAnimationFrame(() => { panel.classList.add('visible'); schedulePreviewWarmup(); });
    updateTargetStatus();
    if (!favoritesMode && ((!currentItems.length && !isLoading && searchState !== 'error') || (hasLiveSource() && currentItems.some((item) => item.isDemo)))) runSearch(searchInput.value.trim());
    else if (favoritesMode || searchError || pageError) restoreBrowseStatus();
  }

  function closePanel() {
    closeTransientLayers();
    panel.classList.remove('visible');
    schedulePreviewWarmup();
    stopTrackAnimation();
    setTimeout(() => panel.classList.remove('open'), 210);
  }

  function togglePanel() {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  ball.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = ball.getBoundingClientRect();
    dragState = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
    ball.setPointerCapture?.(event.pointerId);
  });
  ball.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.id !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > 5) {
      dragState.moved = true;
      ball.classList.add('dragging');
    }
    if (!dragState.moved) return;
    const x = Math.max(6, Math.min(window.innerWidth - 50, event.clientX - dragState.offsetX));
    const y = Math.max(6, Math.min(window.innerHeight - 50, event.clientY - dragState.offsetY));
    ball.style.left = `${x}px`;
    ball.style.right = 'auto';
    ball.style.top = `${y}px`;
  });
  function finishBallDrag(event) {
    if (!dragState || dragState.id !== event.pointerId) return;
    if (dragState.moved) {
      const rect = ball.getBoundingClientRect();
      floatingPosition = {
        edge: rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right',
        yRatio: Math.max(.06, Math.min(.94, (rect.top + rect.height / 2) / window.innerHeight))
      };
      setBallPosition();
      storageSet({ sgpFloatingPosition: floatingPosition });
      suppressBallClick = true;
      setTimeout(() => { suppressBallClick = false; }, 80);
      if (panel.classList.contains('open')) positionPanel();
    }
    dragState = null;
    ball.classList.remove('dragging');
  }
  ball.addEventListener('pointerup', finishBallDrag);
  ball.addEventListener('pointercancel', finishBallDrag);
  ball.addEventListener('click', (event) => {
    event.preventDefault();
    if (suppressBallClick) return;
    togglePanel();
  });

  $('#closeBtn').addEventListener('click', closePanel);
  $('#expandBtn').addEventListener('click', () => {
    stopTrackAnimation();
    viewMode = viewMode === 'compact' ? 'expanded' : 'compact';
    panel.classList.toggle('expanded', viewMode === 'expanded');
    $('#expandBtn').textContent = viewMode === 'expanded' ? '↙' : '⤢';
    $('#expandBtn').title = viewMode === 'expanded' ? '收起为横向队列' : '展开三列';
    $('#expandBtn').setAttribute('aria-label', $('#expandBtn').title);
    closeTransientLayers();
    if (viewMode === 'expanded') grid.scrollTop = 0;
    positionPanel();
    schedulePreviewWarmup();
  });

  function normalizeWheelDelta(event, element) {
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? Math.max(120, element.clientWidth) : 1;
    return { x: event.deltaX * unit, y: event.deltaY * unit };
  }

  function markScrolling() {
    lastScrollAt = performance.now();
    clearTimeout(scrollResetTimer);
    scrollResetTimer = setTimeout(() => { lastScrollAt = 0; }, 180);
  }

  function stopTrackAnimation() {
    if (smoothFrame) cancelAnimationFrame(smoothFrame);
    smoothFrame = 0;
    smoothTarget = track.scrollLeft;
  }

  function animateTrackScroll() {
    if (smoothFrame) return;
    const step = () => {
      if (viewMode !== 'compact' || !panel.classList.contains('visible')) { stopTrackAnimation(); return; }
      const current = track.scrollLeft;
      const max = Math.max(0, track.scrollWidth - track.clientWidth);
      smoothTarget = Math.max(0, Math.min(max, smoothTarget));
      const diff = smoothTarget - current;
      // Chromium/CEF can round scrollLeft to whole pixels. Snap the last few pixels
      // and stop if the DOM did not move, rather than renewing the click guard forever.
      if (Math.abs(diff) <= 2) {
        track.scrollLeft = smoothTarget;
        if (track.scrollLeft !== current) markScrolling();
        smoothFrame = 0;
        smoothTarget = track.scrollLeft;
        return;
      }
      track.scrollLeft = current + diff * .34;
      if (track.scrollLeft === current) {
        track.scrollLeft = smoothTarget;
        if (track.scrollLeft !== current) markScrolling();
        smoothFrame = 0;
        smoothTarget = track.scrollLeft;
        return;
      }
      markScrolling();
      smoothFrame = requestAnimationFrame(step);
    };
    smoothFrame = requestAnimationFrame(step);
  }

  track.addEventListener('wheel', (event) => {
    if (event.ctrlKey || viewMode !== 'compact') return;
    const delta = normalizeWheelDelta(event, track);
    const preferred = Math.abs(delta.x) > 1 ? delta.x : delta.y;
    if (Math.abs(preferred) < 1) return;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const next = Math.max(0, Math.min(max, (smoothFrame ? smoothTarget : track.scrollLeft) + preferred));
    if (Math.abs(next - track.scrollLeft) < .5) { if (preferred > 0) scheduleHorizontalPrefetch(); return; }
    event.preventDefault();
    markScrolling();
    smoothTarget = next;
    animateTrackScroll();
  }, { passive: false });

  track.addEventListener('scroll', () => {
    schedulePreviewWarmup();
    if (track.scrollLeft <= 0) return; // search/layout reset is not user browsing
    if (viewMode === 'compact' && panel.classList.contains('visible') && track.scrollWidth - track.scrollLeft - track.clientWidth < 260) loadMore();
    else scheduleHorizontalPrefetch();
  }, { passive: true });
  grid.addEventListener('scroll', () => {
    schedulePreviewWarmup();
    if (viewMode === 'expanded' && panel.classList.contains('visible') && grid.scrollHeight - grid.scrollTop - grid.clientHeight < 300) loadMore();
  }, { passive: true });

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  }

  function makeDemoPreview(item) {
    const node = document.createElement('div');
    node.className = 'demo-preview';
    node.style.setProperty('--demo-bg', item.color);
    const emoji = document.createElement('span');
    emoji.className = 'demo-emoji';
    emoji.textContent = item.emoji;
    const label = document.createElement('span');
    label.className = 'demo-label';
    label.textContent = item.label;
    node.append(emoji, label);
    return node;
  }

  function isFavorite(id) {
    return favorites.some((item) => item.id === id);
  }

  function saveFavorites() {
    return storageSet({ sgpFavorites: favorites });
  }

  function toggleFavorite(item) {
    if (isFavorite(item.id)) favorites = favorites.filter((entry) => entry.id !== item.id);
    else favorites = [{ ...item, addedAt: Date.now() }, ...favorites];
    saveFavorites();
    updateSectionTitle();
    renderResults();
    showToast(isFavorite(item.id) ? '已添加到红星收藏' : '已取消收藏', 'ok');
  }

  // Load only the active layout and a small look-ahead window. No detached image
  // downloads or persistent cache. Both layouts keep their stable card buttons.
  function schedulePreviewWarmup() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      const active = viewMode === 'expanded' ? grid : track;
      const inactive = active === grid ? track : grid;
      const opened = panel.classList.contains('open') && panel.classList.contains('visible');
      for (const container of opened ? [inactive] : [track, grid]) {
        for (const img of container.querySelectorAll('img[data-preview]')) {
          if (img.hasAttribute('src')) img.removeAttribute('src');
        }
      }
      if (!opened) return;
      const bounds = active.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const horizontal = active === track;
      // Load nearby cards before they enter view; limit simultaneous animation.
      const before = horizontal ? 120 : 100;
      const after = horizontal ? 760 : 280;
      for (const img of active.querySelectorAll('img[data-preview]')) {
        const rect = img.getBoundingClientRect();
        const start = horizontal ? rect.left : rect.top;
        const end = horizontal ? rect.right : rect.bottom;
        const low = horizontal ? bounds.left : bounds.top;
        const high = horizontal ? bounds.right : bounds.bottom;
        const nearby = end >= low-before && start <= high+after;
        if (nearby && end >= low && start <= high && img.dataset.probeUrl) warmProbe(img.dataset.probeUrl);
        if (nearby && img.dataset.preview && !img.hasAttribute('src')) { img.src = img.dataset.preview; }
        else if (!nearby && (end < low-before-900 || start > high+after+900) && img.hasAttribute('src')) img.removeAttribute('src');
      }
    });
  }
  function scheduleHorizontalPrefetch() {
    if (prefetchTimer) return;
    prefetchTimer = setTimeout(() => {
      prefetchTimer = 0;
      if (viewMode !== 'compact' || !panel.classList.contains('visible')) return;
      const remaining = track.scrollWidth - track.scrollLeft - track.clientWidth;
      // Earlier request, with no extra request when the user is far from the edge.
      if (remaining < Math.max(900, track.clientWidth * 2)) loadMore();
    }, 70);
  }

  function createCard(item) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.gifId = item.id;
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'card-main';
    main.title = (item.title || '发送 GIF') + (item.source === 'gifsnap' ? ` · GifSnap${item.sourceMetadata ? ' · ' + item.sourceMetadata : ''}` : '');
    main.setAttribute('aria-label', `发送 ${item.title || 'GIF'}`);
    main.draggable = false;
    if (item.isDemo) {
      main.appendChild(makeDemoPreview(item));
    } else {
      const img = document.createElement('img');
      img.loading = 'eager'; // assigned only by the active-layout look-ahead scheduler
      img.decoding = 'async';
      img.draggable = false;
      img.alt = item.title || 'GIF';
      img.referrerPolicy = 'no-referrer';
      img.dataset.preview = safeUrl(item.previewUrl) || '';
      const media=attachmentMediaUrl(item);
      if(media && /\.gif$/i.test(media.pathname) && !originalGiphyCandidate(item)) img.dataset.probeUrl=media.href;
      const tried = new Set();
      img.addEventListener('error', () => {
        if (!img.hasAttribute('src')) return;
        tried.add(img.src);
        if (item.source === 'gifsnap') {
          const next = [item.directUrl, item.posterUrl].map(safeUrl).find(url => url && !tried.has(url));
          if (next) { tried.add(next); img.dataset.preview = next; img.src = next; return; }
        }
        img.replaceWith(makeDemoPreview({ emoji: 'GIF', label: '预览加载失败', color: 'linear-gradient(135deg,#38485c,#5b6b7e)' }));
      });
      main.appendChild(img);
    }
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = item.title || 'GIF';
    main.appendChild(title);
    main.addEventListener('dragstart', (event) => event.preventDefault());

    let press = null;
    main.addEventListener('pointerdown', (event) => { press = { x: event.clientX, y: event.clientY }; });
    main.addEventListener('pointerup', (event) => {
      if (!press) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6;
      if (moved || (lastScrollAt > 0 && performance.now() - lastScrollAt < 180)) card.dataset.blockClick = '1';
      setTimeout(() => { delete card.dataset.blockClick; }, 220);
      press = null;
    });
    main.addEventListener('pointercancel', () => { press = null; card.dataset.blockClick = '1'; setTimeout(() => delete card.dataset.blockClick, 220); });
    main.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (card.dataset.blockClick === '1' || (lastScrollAt > 0 && performance.now() - lastScrollAt < 150)) {

        showToast('滚动保护：停止滚动后再点击发送。', 'warn');
        return;
      }
      sendItem(item);
    });

    const star = document.createElement('button');
    star.type = 'button';
    star.className = `star${isFavorite(item.id) ? ' fav' : ''}`;
    star.innerHTML = isFavorite(item.id) ? '★' : '☆';
    star.title = isFavorite(item.id) ? '取消收藏' : '收藏';
    star.setAttribute('aria-label', star.title);
    star.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(item);
    });

    card.append(main, star);
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showContextMenu(item, event.clientX, event.clientY);
    });
    return card;
  }

  function renderResults() {
    const items = favoritesMode ? favoriteItems() : currentItems;
    // Keep existing card nodes on pagination and storage updates. Replacing a button
    // between pointerdown and pointerup loses the real click in Chromium.
    for (const container of [track, grid]) {
      const desired = new Set(items.map(item => String(item.id)));
      const existing = new Map();
      for (const child of [...container.children]) {
        const id = child.dataset.gifId;
        if (!desired.has(id) || existing.has(id)) child.remove();
        else existing.set(id, child);
      }
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = favoritesMode ? '还没有收藏 GIF。点击图片上的星星，或右键图片添加收藏。'
          : searchState === 'error' ? 'GIF 服务暂时无法加载。请查看下方原因。'
          : searchState === 'loading' ? '正在连接 GIF 服务…'
          : searchState === 'idle' ? '打开面板后加载 GIF。' : '没有找到 GIF。试试其他关键词。';
        container.appendChild(empty);
        continue;
      }
      let cursor = container.firstElementChild;
      for (const item of items) {
        const id = String(item.id);
        const card = existing.get(id) || createCard(item);
        const star = card.querySelector('.star');
        const fav = isFavorite(item.id);
        star.classList.toggle('fav', fav);
        star.textContent = fav ? '★' : '☆';
        star.title = fav ? '取消收藏' : '收藏';
        star.setAttribute('aria-label', star.title);
        if (card !== cursor) container.insertBefore(card, cursor);
        cursor = card.nextElementSibling;
      }
    }
    schedulePreviewWarmup();
  }

  function updateSectionTitle() {
    const title = $('#sectionTitle');
    if (favoritesMode) title.textContent = `★ 我的收藏 (${favoriteItems().length})`;
    else if (currentQuery) title.textContent = `搜索：${currentQuery}`;
    else title.textContent = '🔥 热门 GIF';
    $('#favoritesBtn').classList.toggle('active', favoritesMode);
    $('#favoritesBtn').textContent = favoritesMode ? '★' : '☆';
  }

  function updateSourceLabel() {
    if (provider === 'gifsnap') { $('#sourceLabel').textContent = 'GifSnap · 无需 Key'; $('#branding').textContent = 'POWERED BY GIFSNAP'; return; }
    $('#sourceLabel').textContent = apiKey ? 'GIPHY 实时数据' : (IS_LOCAL_TEST ? '本地演示模式 · 不是真实 GIF' : '演示模式 · 配置 API Key 启用实时数据');
    $('#branding').textContent = apiKey ? 'POWERED BY GIPHY' : 'DEMO PREVIEW';
  }

  function setLoading(message) {
    loading.textContent = message || '';
    loading.classList.remove('network-error');
    $('#retryNetwork').hidden = true;
    retryAction = null;
  }
  function showNetworkError(error, action) {
    setLoading(error?.message || 'GIF 加载失败，请检查网络或设置。');
    loading.classList.add('network-error');
    // Quota and authentication errors require waiting or changing settings, not hammering the service.
    if (!['API_AUTH','RATE_LIMIT','NO_API_KEY','BAD_REQUEST'].includes(error?.code)) {
      retryAction = action;
      $('#retryNetwork').hidden = false;
    }
  }
  function restoreBrowseStatus() {
    if (favoritesMode) { setLoading('本地收藏 · 点击星星可取消收藏'); return; }
    if (searchError) { showNetworkError(searchError, () => runSearch(currentQuery, { recordHistory: false })); return; }
    if (pageError) { showNetworkError(pageError, () => { pageError = null; loadMore(); }); return; }
    if (isLoading) { setLoading('正在连接 GIF 服务…'); return; }
    setLoading(currentItems.length ? (hasMore ? '滚动到末尾加载更多' : '已经到底了') : '');
  }
  $('#retryNetwork').addEventListener('click', () => { const action = retryAction; if (action) action(); });
  $('#checkNetwork').addEventListener('click', () => SGPNetwork.bind($('#checkNetwork'), $('#networkStatus'), runtimeMessage, provider));

  function addHistory(query) {
    const value = String(query || '').trim();
    if (!value) return;
    const key = value.toLocaleLowerCase();
    searchHistory = [{ query: value, searchedAt: Date.now() }, ...searchHistory.filter((item) => String(item.query).toLocaleLowerCase() !== key)].slice(0, 50);
    storageSet({ sgpSearchHistory: searchHistory });
  }

  function renderHistory() {
    historyBox.replaceChildren();
    const head = document.createElement('div');
    head.className = 'history-head';
    const label = document.createElement('span');
    label.textContent = '最近搜索';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '清空';
    clear.addEventListener('click', () => {
      searchHistory = [];
      storageSet({ sgpSearchHistory: [] });
      renderHistory();
    });
    head.append(label, clear);
    historyBox.appendChild(head);
    if (!searchHistory.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '暂无搜索记录';
      historyBox.appendChild(empty);
      return;
    }
    for (const entry of searchHistory) {
      const row = document.createElement('div');
      row.className = 'history-item';
      const query = document.createElement('button');
      query.type = 'button';
      query.className = 'history-query';
      query.textContent = `◷  ${entry.query}`;
      query.addEventListener('click', () => {
        searchInput.value = entry.query;
        historyBox.hidden = true;
        runSearch(entry.query, { immediate: true });
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = '删除这条记录';
      remove.setAttribute('aria-label', '删除此搜索记录');
      remove.addEventListener('click', () => {
        searchHistory = searchHistory.filter((item) => item.searchedAt !== entry.searchedAt);
        storageSet({ sgpSearchHistory: searchHistory });
        renderHistory();
      });
      row.append(query, remove);
      historyBox.appendChild(row);
    }
  }

  function showHistory() {
    renderHistory();
    historyBox.hidden = false;
    settingsBox.hidden = true;
  }

  function filterDemo(query) {
    const normalized = query.toLocaleLowerCase();
    if (!normalized) return DEMO_ITEMS.slice();
    const matches = DEMO_ITEMS.filter((item) => `${item.title} ${item.tags} ${item.label}`.toLocaleLowerCase().includes(normalized));
    return matches;
  }

  function runtimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime?.lastError) resolve({ ok: false, code: 'RUNTIME_ERROR', message: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, code: 'NO_RESPONSE', message: '扩展后台没有返回结果。' });
        });
      } catch (error) {
        resolve({ ok: false, code: 'RUNTIME_ERROR', message: error?.message || '无法调用扩展后台。' });
      }
    });
  }

  // Preserve first-seen order and original media URLs. GifSnap provides a verified
  // content identity for alternate encodings; never guess from title or poster.
  function uniqueResultItems(items) {
    const unique = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || item.id == null || String(item.id) === '') continue;
      const keys = ['id:' + String(item.id)];
      if (provider === 'gifsnap') {
        if (typeof item.contentId === 'string' && item.contentId) keys.push('content:' + item.contentId);
        for (const url of [item.directUrl, item.sendUrl]) {
          if (typeof url === 'string' && url) keys.push('media:' + url);
        }
      }
      const repeated = keys.some(key => seenResultKeys.has(key));
      for (const key of keys) seenResultKeys.add(key);
      if (!repeated) unique.push(item);
    }
    return unique;
  }

  function meaningfulTitle(item) {
    const title = String(item.title || '').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
    // Provider fallback labels do not identify a real title.
    return title && !['gif','untitled','unknown','animation','无标题','未知'].includes(title) ? title : '';
  }
  function visualKey(item) {
    const title = meaningfulTitle(item);
    return title.length >= 3 ? title : '';
  }
  // Keep server order; compare against the last two DISPLAYED cards, not raw API indices.
  // This enforces both directions of the +/-2 rule, including across page boundaries.
  function filterNearbyTitles(incoming, previous) {
    const recent = previous.slice(-2).map(meaningfulTitle);
    const kept = [];
    for (const item of incoming) {
      const title = meaningfulTitle(item);
      if (title && recent.includes(title)) continue;
      kept.push(item);
      recent.push(title);
      if (recent.length > 2) recent.shift();
    }
    return kept;
  }
  function fingerprintUrl(item) {
    try {
      const url = new URL(item.previewUrl || item.directUrl);
      return url.origin === 'https://media.gifsnap.com' && /\.(gif|webp)$/i.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  }
  function visuallySame(a,b) {
    if (!a || !b || !a.ratio || !b.ratio || Math.abs(Math.log(a.ratio/b.ratio)) > .10 || a.frames?.length !== 3 || b.frames?.length !== 3) return false;
    return a.frames.every((frame,i) => {
      const other = b.frames[i];
      if (frame.length !== 768 || other?.length !== 768) return false;
      let total=0, outliers=0;
      for (let j=0;j<frame.length;j++) { const diff=Math.abs(frame[j]-other[j]); total+=diff; if(diff>32) outliers++; }
      return total/frame.length <= 9 && outliers/frame.length <= .035;
    });
  }
  async function filterVisualDuplicates(incoming, previous, sequence) {
    if (provider !== 'gifsnap' || !incoming.length) return incoming;
    const groups = new Map();
    // A bounded window avoids an unbounded comparison cost during long browsing.
    for (const item of [...previous.slice(-160), ...incoming]) {
      const key=visualKey(item), url=fingerprintUrl(item);
      if (!key || !url) continue;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(url);
    }
    const urls = [];
    for (const item of incoming) {
      const key=visualKey(item), url=fingerprintUrl(item), group=groups.get(key);
      if (!url || !group || new Set(group).size < 2) continue;
      for (const candidate of group) if (!visualChecked.has(candidate) && !urls.includes(candidate) && urls.length < 12) urls.push(candidate);
    }
    if (urls.length) {
      let timer;
      const response = await Promise.race([runtimeMessage({type:'SGP_GIFSNAP_FINGERPRINT',urls}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1150);})]);
      clearTimeout(timer);
      if (sequence !== requestSequence) return incoming;
      for (const url of urls) { visualChecked.add(url); if (response?.signatures?.[url]) visualSignatures.set(url,response.signatures[url]); }
    }
    const kept = [];
    for (const item of incoming) {
      const sig = visualSignatures.get(fingerprintUrl(item));
      const key = visualKey(item);
      const repeated = sig && key && [...previous.slice(-160), ...kept].some(other => visualKey(other)===key && visuallySame(visualSignatures.get(fingerprintUrl(other)),sig));
      if (!repeated) kept.push(item);
    }
    return kept;
  }

  // Advance by raw server pagination, never by visible (deduplicated) count.
  function advanceResultsPage(response, previousOffset, addedCount) {
    const next = Number.isFinite(response.nextOffset) ? response.nextOffset
      : previousOffset + (Number.isFinite(response.count) ? response.count : (response.items || []).length);
    const advances = Number.isFinite(next) && next > previousOffset;
    if (advances) offset = next;
    // The documented picker behavior stops on duplicate-only or stalled pages.
    hasMore = Boolean(response.hasMore) && advances && addedCount > 0;
  }

  async function runSearch(query, options = {}) {
    const value = String(query || '').trim();
    clearTimeout(prefetchTimer); prefetchTimer = 0;
    currentQuery = value;
    currentSource = value ? 'search' : 'trending';
    favoritesMode = false;
    offset = 0;
    hasMore = false;
    currentItems = [];
    seenResultKeys.clear(); visualSignatures.clear(); visualChecked.clear();
    searchState = 'loading';
    searchError = pageError = null;
    isLoading = false;
    requestSequence += 1;
    const sequence = requestSequence;
    stopTrackAnimation();
    track.scrollLeft = 0;
    smoothTarget = 0;
    grid.scrollTop = 0;
    updateSectionTitle();
    $('#clearSearch').style.display = value ? 'grid' : 'none';

    if (!hasLiveSource()) {
      currentItems = filterDemo(value);
      searchState = 'success';
      hasMore = false;
      renderResults();
      updateSourceLabel();
      setLoading(IS_LOCAL_TEST ? '演示卡片可用于测试本地模拟发送。' : '演示模式：配置 GIPHY API Key 后可发送真实 GIF。');
      if (value && options.recordHistory !== false) addHistory(value);
      return;
    }

    if (value && options.recordHistory !== false) addHistory(value);
    setLoading(value ? '正在搜索… 网络不稳定时将自动重试一次。' : '正在加载热门 GIF… 网络不稳定时将自动重试一次。');
    isLoading = true;
    renderResults();
    const response = await runtimeMessage({ type: fetchType(), query: value, offset: 0, limit: 25 });
    if (sequence !== requestSequence) return;
    if (!response?.ok) {
      isLoading = false;
      searchState = 'error';
      searchError = response || {};
      if (!favoritesMode) showNetworkError(searchError, () => runSearch(currentQuery, { recordHistory: false }));
      renderResults();
      return;
    }
    const visual = await filterVisualDuplicates(uniqueResultItems(response.items), [], sequence);
    const filtered = filterNearbyTitles(visual, []);
    if (sequence !== requestSequence) return;
    isLoading = false;
    searchState = 'success';
    currentItems = filtered;
    advanceResultsPage(response, 0, currentItems.length);
    renderResults();
    if (!favoritesMode) setLoading(currentItems.length ? (hasMore ? '滚动到末尾加载更多' : '已经到底了') : '没有找到结果。');
  }

  async function loadMore() {
    if (favoritesMode || !hasLiveSource() || !hasMore || isLoading || pageError || !currentItems.length) return;
    isLoading = true;
    setLoading('正在加载更多…');
    const sequence = requestSequence;
    let nextItems = [];
    // A page may contain only nearby title collisions. Skip at most two extra raw
    // pages in one load, but preserve the existing exact/visual-duplicate stop.
    for (let attempt = 0; attempt < 3; attempt++) {
      const pageOffset = offset;
      const response = await runtimeMessage({ type: fetchType(), query: currentQuery, offset: pageOffset, limit: 25 });
      if (sequence !== requestSequence) return;
      if (!response?.ok) {
        isLoading = false;
        pageError = response || {};
        if (!favoritesMode) showNetworkError(pageError, () => { pageError = null; loadMore(); });
        return;
      }
      const visual = await filterVisualDuplicates(uniqueResultItems(response.items), currentItems, sequence);
      if (sequence !== requestSequence) return;
      nextItems = filterNearbyTitles(visual, currentItems);
      const skipTitleOnlyPage = visual.length > 0 && nextItems.length === 0 && attempt < 2;
      advanceResultsPage(response, pageOffset, skipTitleOnlyPage ? visual.length : nextItems.length);
      if (!skipTitleOnlyPage || !hasMore) break;
    }
    isLoading = false;
    currentItems = currentItems.concat(nextItems);
    const oldTrackLeft = track.scrollLeft;
    const oldGridTop = grid.scrollTop;
    renderResults();
    track.scrollLeft = oldTrackLeft;
    grid.scrollTop = oldGridTop;
    if (!favoritesMode) setLoading(hasMore ? '' : '已经到底了');
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    if (composing) return;
    const value = searchInput.value.trim();
    if (!value) {
      runSearch('', { immediate: true });
      return;
    }
    searchTimer = setTimeout(() => runSearch(value), 1000);
  }

  searchInput.addEventListener('input', () => {
    favoritesMode = false;
    historyBox.hidden = true;
    $('#clearSearch').style.display = searchInput.value ? 'grid' : 'none';
    scheduleSearch();
  });
  searchInput.addEventListener('compositionstart', () => { composing = true; clearTimeout(searchTimer); });
  searchInput.addEventListener('compositionend', () => { composing = false; scheduleSearch(); });
  searchInput.addEventListener('focus', () => { if (!searchInput.value.trim()) showHistory(); });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !composing && !event.isComposing) {
      event.preventDefault();
      clearTimeout(searchTimer);
      historyBox.hidden = true;
      runSearch(searchInput.value, { immediate: true });
    }
  });
  $('#clearSearch').addEventListener('click', () => {
    searchInput.value = '';
    $('#clearSearch').style.display = 'none';
    historyBox.hidden = true;
    runSearch('');
  });

  $('#favoritesBtn').addEventListener('click', () => {
    clearTimeout(searchTimer);
    stopTrackAnimation();
    favoritesMode = !favoritesMode;
    historyBox.hidden = true;
    settingsBox.hidden = true;
    updateSectionTitle();
    if (!favoritesMode && searchState === 'idle') runSearch(searchInput.value.trim(), { recordHistory: false });
    else { restoreBrowseStatus(); renderResults(); }
  });

  $('#provider').addEventListener('change', syncProviderFields);
  $('#settingsBtn').addEventListener('click', async () => {
    settingsBox.hidden = !settingsBox.hidden;
    historyBox.hidden = true;
    if (!settingsBox.hidden) {
      const stored = await storageGet(['giphyApiKey', 'giphyRating', 'sgpProvider', 'sgpGifLinkLimitMB']);
      $('#provider').value = selectProvider(stored.sgpProvider, stored.giphyApiKey);
      syncProviderFields();
      $('#apiKey').value = stored.giphyApiKey || '';
      $('#rating').value = stored.giphyRating || 'pg-13';
      $('#gifLinkLimitMB').value = String(readGifLimit(stored.sgpGifLinkLimitMB));
      if (!$('#checkNetwork').disabled) $('#networkStatus').textContent = '分别检测已保存的数据源 API 和图片 CDN。';

    }
  });
  $('#saveSettings').addEventListener('click', async () => {
    const previous = {apiKey, rating, provider, gifLinkLimitMB};
    apiKey = $('#apiKey').value.trim();
    rating = $('#rating').value;
    provider = $('#provider').value;
    gifLinkLimitMB = readGifLimit($('#gifLinkLimitMB').value);
    const saved = await storageSet({ giphyApiKey: apiKey, giphyRating: rating, sgpProvider: provider, sgpGifLinkLimitMB:gifLinkLimitMB });
    if (!saved) { ({apiKey, rating, provider, gifLinkLimitMB} = previous); showToast('保存失败，请重新加载扩展后再试。', 'warn'); return; }
    settingsBox.hidden = true;
    updateSourceLabel();
    showToast(provider === 'gifsnap' ? '已切换 GifSnap，正在加载…' : apiKey ? 'GIPHY 设置已保存，正在加载…' : '已切换到演示模式', 'ok');
    runSearch(searchInput.value.trim());
  });
  $('#openOptions').addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); }
    catch { showToast('请从 chrome://extensions 打开扩展详情，再进入选项页面。', 'warn'); }
  });

  function showContextMenu(item, x, y) {
    contextMenu.replaceChildren();
    const actions = [
      { label: isFavorite(item.id) ? '★ 取消收藏' : '☆ 添加到收藏', action: () => toggleFavorite(item) },
      { label: '发送 GIF', action: () => sendItem(item) },
      { label: '复制 GIF 链接', action: () => copyLink(item.sendUrl) },
      { label: item.source === 'gifsnap' ? '打开原始动图' : '打开 GIPHY 页面', action: () => openPage(item.pageUrl) }
    ];
    if(attachmentMediaUrl(item)) actions.splice(2,0,{label:'作为图片文件发送',action:()=>sendItem(item,true)});
    const candidate = originalGiphyCandidate(item);
    if (candidate) actions.splice(3, 0, { label: '复制 GIPHY 原站候选链接', action: () => copyLink(candidate) });
    for (const entry of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-item';
      button.textContent = entry.label;
      button.addEventListener('click', () => { contextMenu.hidden = true; entry.action(); });
      contextMenu.appendChild(button);
    }
    contextMenu.hidden = false;
    const width = 180;
    const height = actions.length * 36 + 10;
    contextMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y))}px`;
  }

  async function copyLink(value) {
    const url = safeUrl(value);
    if (!url) return showToast('没有可复制的有效 HTTPS 链接。', 'warn');
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const temp = document.createElement('textarea');
        temp.value = url;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        shadow.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        temp.remove();
        if (!ok) throw new Error('clipboard denied');
      }
      showToast('GIF 链接已复制', 'ok');
    } catch {
      showToast('复制失败，请检查剪贴板权限。', 'warn');
    }
  }

  function openPage(value) {
    const url = safeUrl(value);
    if (!url) return showToast('链接无效。', 'warn');
    try { window.open(url, '_blank', 'noopener,noreferrer'); }
    catch { showToast('无法打开新标签页，请复制链接。', 'warn'); }
  }

  function findSendButton(composer) {
    const selector = 'button, [role="button"], input[type="submit"]';
    const available = button => !host.contains(button) && isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    const named = button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''} ${button.getAttribute('class') || ''}`.toLowerCase();
      return /send|发送|发出/.test(label) && !/voice|语音|invite|邀请|gift|礼物|file|文件|image|图片|emoticon|表情/.test(label);
    };
    // Never search outside the current editor neighborhood or select unrelated controls.
    for (let node = composer.parentElement, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      const editors = [...node.querySelectorAll(COMPOSER_SELECTOR)].filter(el => closestComposer(el));
      if (editors.some(el => el !== composer)) break;
      const buttons = [...node.querySelectorAll(selector)].filter(available);
      const matches = buttons.filter(named);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return null;
      if (node === composer.form || node === composer.closest('form')) {
        const submitters = buttons.filter(button => button.type === 'submit' && button.form === node);
        if (submitters.length === 1) return submitters[0];
      }
      if (node === getChatRoot(composer)) break;
    }
    return null;
  }

  function waitForComposerClear(composer, timeoutMs = 1800, fingerprint = null) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (!composer.isConnected || (fingerprint && conversationFingerprint(composer) !== fingerprint)) return resolve(false);
        if (!readComposerValue(composer).trim()) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function triggerSendOnce(composer) {
    const button = findSendButton(composer);
    const form = composer.form || composer.closest('form');
    const sameForm = Boolean(button && form && button.form === form);

    // Local mock chat is a conventional submit-only form. Steam's application can
    // instead listen to the click itself. Do not replace its click with requestSubmit.
    if (IS_LOCAL_TEST && form) {
      if (!form?.requestSubmit) return '';

      if (sameForm && button.type === 'submit') form.requestSubmit(button);
      else form.requestSubmit();
      return 'form-submit';
    }
    if (button) {
      // Preserve the application click handler, but cancel the native default
      // submit on this one event. Never send a second event as a fallback.
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1, view: window });
      const cancelDefault = button.type === 'submit' && Boolean(button.form);
      if (cancelDefault) event.preventDefault();

      button.dispatchEvent(event);
      return cancelDefault ? 'button-click-no-submit' : 'button-click';
    }

    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
    return 'keyboard';
  }

  async function sendUrlToTarget(url, expectedComposer) {
    const composer = getValidTarget();
    if (composer !== expectedComposer) return { status: 'failed', message: '聊天对象发生变化，已取消发送。' };
    if (!composer) return { status: 'failed', message: '没有检测到当前打开的好友聊天。请打开聊天窗口后再选择 GIF。' };
    if (!safeUrl(url)) return { status: 'failed', message: 'GIF 链接不是有效的 HTTPS 地址。' };

    const originalDraft = readComposerValue(composer);
    const targetFingerprint = activeTarget.fingerprint;

    composer.focus({ preventScroll: true });
    if (getValidTarget() !== composer || conversationFingerprint(composer) !== targetFingerprint) return { status: 'failed', message: '聊天对象发生变化，已取消发送。' };
    const inserted = setComposerValue(composer, url);

    if (!inserted) return { status: 'failed', message: '无法向当前聊天输入框填入链接。' };

    await new Promise((resolve) => setTimeout(resolve, 70));
    if (getValidTarget() !== composer || conversationFingerprint(composer) !== targetFingerprint) {
      if (composer.isConnected && conversationFingerprint(composer) === targetFingerprint && readComposerValue(composer) === url) setComposerValue(composer, originalDraft);
      return { status: 'failed', message: '聊天对象发生变化，已取消发送。' };
    }

    if (readComposerValue(composer) !== url) {
      return { status: 'unknown', message: '输入框内容已变化，未再次触发发送；请检查聊天记录。' };
    }

    let triggerMethod = '';
    try {
      triggerMethod = triggerSendOnce(composer);
    } catch (error) {
      console.warn('[Steam GIF Picker] send trigger failed', error);
    }

    if (!triggerMethod) {
      if (composer.isConnected && conversationFingerprint(composer) === targetFingerprint && readComposerValue(composer) === url) setComposerValue(composer, originalDraft);
      return { status: 'unknown', message: '发送触发异常，请检查聊天记录与草稿；不会自动重试。' };
    }

    const cleared = await waitForComposerClear(composer, 1800, targetFingerprint);

    if (cleared) {
      if (originalDraft && composer.isConnected && conversationFingerprint(composer) === targetFingerprint && !readComposerValue(composer)) setComposerValue(composer, originalDraft);
      return { status: 'confirmed', message: '已检测到聊天输入框清空。' };
    }

    if (composer.isConnected && conversationFingerprint(composer) === targetFingerprint && readComposerValue(composer) === url) {
      setComposerValue(composer, originalDraft);
    }
    return { status: 'unknown', message: '已触发一次发送，但无法确认 Steam 是否成功发送。请检查聊天记录与草稿；不会自动重试。' };
  }

  // Experimental share-link candidate, not a documented GifSnap mapping. Never change stored URLs.
  function originalGiphyCandidate(item) {
    if (item?.source !== 'gifsnap' || item.isDemo) return '';
    const source = String(item.sourceMetadata || '').trim().toLowerCase();
    if (source && source !== 'giphy') return '';
    const raw = item.directUrl || item.sendUrl || '';
    const match = /^https:\/\/media\.gifsnap\.com\/gifs\/giphy_([A-Za-z0-9]{5,80})\.gif$/.exec(raw);
    return match ? `https://media.giphy.com/media/${match[1]}/giphy.gif` : '';
  }

  // Steam's server decides the actual preview. Local headers provide only a heuristic.
  function attachmentMediaUrl(item) {
    if (item?.source !== 'gifsnap' || item.isDemo) return null;
    try {
      const u = new URL(item.directUrl || item.sendUrl || '');
      return !u.username && !u.password && ((u.origin === 'https://media.gifsnap.com' && /^\/gifs\//.test(u.pathname)) || (u.origin === 'https://static.klipy.com' && /^\/ii\//.test(u.pathname))) ? u : null;
    } catch { return null; }
  }
  function warmProbe(url) {
    if (!url || sending || warmProbeActive || Date.now()-(warmProbeAttempts.get(url)||0)<300000) return;
    warmProbeActive = true;
    warmProbeAttempts.set(url,Date.now());
    while(warmProbeAttempts.size>128)warmProbeAttempts.delete(warmProbeAttempts.keys().next().value);
    // One nearby item at a time; never walk the full library or persist metadata.
    runtimeMessage({type:'SGP_INSPECT_GIF_LINK',url,warm:true}).finally(()=>{warmProbeActive=false;});
  }
  async function shouldPrepareAttachment(item, originalCandidate) {
    if (originalCandidate) return false;
    const u = attachmentMediaUrl(item);
    if (!u) {
      // Do not silently send known incompatible external media as plain text.
      if (item?.source === 'gifsnap' && !item.isDemo) {
        let external; try { external = new URL(item.directUrl || item.sendUrl || ''); } catch {}
        if (external && !/\.gif$/i.test(external.pathname)) return null;
      }
      return false;
    }
    if (!/\.gif$/i.test(u.pathname)) return true;
    setLoading('正在本地检测 GIF 链接兼容性…');
    let timer;
    const probe=await Promise.race([runtimeMessage({type:'SGP_INSPECT_GIF_LINK',url:u.href}),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false}),5500);})]).finally(()=>clearTimeout(timer));
    return !(probe?.ok && probe.mime === 'image/gif' && Number.isSafeInteger(probe.size) && probe.size>0 && probe.size < gifLinkLimitMB*1000000);
  }

  const UPLOAD_DIALOG_SELECTOR = '[role="dialog"], dialog[open], [class*="ModalDialog"], [class*="DialogContent"]';
  function visibleUploadDialogs() {
    return [...document.querySelectorAll(UPLOAD_DIALOG_SELECTOR)].filter(el=>!host.contains(el)&&isVisible(el));
  }
  const UPLOAD_LABEL = /^(upload|upload image|upload file|上传|上传图片|上传图像|上传文件|上傳|上傳圖片|上傳檔案)$/;
  const UPLOAD_CONTROLS = 'button,[role="button"],input[type="button"],input[type="submit"]';
  function visibleUploadButtons(root = document) {
    return [...root.querySelectorAll(UPLOAD_CONTROLS)].filter(el=>!host.contains(el)&&isVisible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&UPLOAD_LABEL.test(uploadControlLabel(el)));
  }
  // Steam also uses a small attachment popover, not necessarily a modal dialog.
  // Require the unique generated filename and the native spoiler affordance.
  function ownAttachmentPopover(button, file) {
    for(let node=button.parentElement,depth=0;node&&node!==document.body&&depth<8;node=node.parentElement,depth++) {
      if(node.querySelector('textarea,[contenteditable="true"],[role="textbox"]'))break;
      const text=String(node.textContent||'');
      const own=text.includes(file.name)||[...node.querySelectorAll('[title],[alt]')].some(el=>el.getAttribute('title')===file.name||el.getAttribute('alt')===file.name);
      if(!own||!/(标记为剧透|標記為劇透|mark as spoiler)/i.test(text))continue;
      if(visibleUploadButtons(node).length===1)return node;
    }
    return null;
  }
  function uploadControlLabel(el) { return String(el.getAttribute('aria-label') || el.value || el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase(); }
  async function confirmOwnAttachment(before, beforeButtons, file, sameTarget) {
    const end=performance.now()+4500; let cancelled=false;
    const cancel=e=>{if(e.isTrusted)cancelled=true;};
    // If the user takes over the confirmation, never issue a delayed second click.
    document.addEventListener('pointerdown',cancel,true);document.addEventListener('keydown',cancel,true);
    const originalBytes=new Uint8Array(await file.arrayBuffer());
    try {
      while(performance.now()<end&&!cancelled&&sameTarget()) {
        const candidates=new Map();
        for(const button of visibleUploadButtons()) {
          if(beforeButtons.has(button))continue;
          const popover=ownAttachmentPopover(button,file);
          if(popover)candidates.set(button,popover);
        }
        for(const dialog of visibleUploadDialogs()) {
          if(before.has(dialog))continue;
          const controls=[...dialog.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')].filter(el=>isVisible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true');
          const uploads=controls.filter(el=>/^(upload|upload image|upload file|上传|上传图片|上传图像|上传文件|上傳|上傳圖片|上傳檔案)$/.test(uploadControlLabel(el)));
          const cancels=controls.filter(el=>/^(cancel|取消)$/.test(uploadControlLabel(el)));
          if(uploads.length!==1||cancels.length!==1)continue;
          const text=String(dialog.textContent||'');
          const isOwnName=text.includes(file.name)||[...dialog.querySelectorAll('[title],[alt]')].some(el=>el.getAttribute('title')===file.name||el.getAttribute('alt')===file.name);
          const previews=[...dialog.querySelectorAll('img')].filter(el=>isVisible(el)&&/^(blob:|data:image\/)/i.test(el.currentSrc||el.src));
          if(previews.length>1)continue;
          if(!isOwnName&&!previews.length)continue;
          // A filename token is unique to this click; alternatively compare exact local preview bytes.
          let matches=isOwnName;
          if(!matches&&previews.length===1){try{const res=await fetch(previews[0].currentSrc||previews[0].src);const blob=await res.blob();if(blob.size===file.size){const bytes=new Uint8Array(await blob.arrayBuffer());matches=bytes.every((v,i)=>v===originalBytes[i]);}}catch{}}
          if(matches&&!beforeButtons.has(uploads[0]))candidates.set(uploads[0],dialog);
        }
        if(candidates.size===1&&!cancelled&&sameTarget()){
          const [button,dialog]=candidates.entries().next().value;
          if(button.isConnected&&isVisible(button)&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'&&dialog.contains(button)){
            button.click();return true;
          }
        }
        if(candidates.size>1)return false;
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      return false;
    }finally{document.removeEventListener('pointerdown',cancel,true);document.removeEventListener('keydown',cancel,true);}
  }

  // File upload is a single native handoff, not a confirmed message. Never
  // trigger Enter, a second paste/drop, or link fallback after this handoff.
  async function uploadWebpToTarget(url, composer, fingerprint) {
    const sameTarget = () => getValidTarget() === composer && conversationFingerprint(composer) === fingerprint;
    if (!sameTarget()) return {status:'failed',message:'聊天对象已变化，已取消。'};
    setLoading('正在获取并准备图片附件…');
    let timer;
    const result = await Promise.race([runtimeMessage({type:'SGP_PREPARE_WEBP',url}),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,message:'转换超时，未发送。'}),35000);})]).finally(()=>clearTimeout(timer));
    if (!result?.ok) return {status:'failed',message:result?.message || '动图准备失败，未发送。'};
    if (!sameTarget()) return {status:'failed',message:'转换期间切换了聊天，已取消上传。'};
    if (!['image/gif','image/png','image/jpeg'].includes(result.mime) || typeof result.data !== 'string' || result.data.length > 12*1024*1024) return {status:'failed',message:'转换结果无效，未发送。'};
    const binary=atob(result.data); const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if (!bytes.length || bytes.length>8*1024*1024) return {status:'failed',message:'转换文件过大或为空，未发送。'};
    const file=new File([bytes],`steam-gif-picker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}.${result.mime==='image/gif'?'gif':result.mime==='image/jpeg'?'jpg':'png'}`,{type:result.mime});
    const data=new DataTransfer(); data.items.add(file);
    composer.focus({preventScroll:true});
    if (!sameTarget()) return {status:'failed',message:'聊天对象已变化，已取消上传。'};
    setLoading('正在提交 Steam 原生附件…');
    const before=new Set(visibleUploadDialogs());
    const beforeButtons=new Set(visibleUploadButtons());
    // A pre-existing dialog is not ours and could belong to a different upload.
    if(before.size||beforeButtons.size) return {status:'failed',message:'请先关闭已打开的 Steam 弹窗，再选择 GIF。'};
    try {
      const root=composer.form || composer.closest('form');
      const inputs=root ? [...root.querySelectorAll('input[type="file"]')].filter(el=>!el.disabled && /image|\.gif|\.png/i.test(el.accept||'')) : [];
      // Only use a file input when the composer form has one unique active composer and one
      // explicit image input. Otherwise hand off a file-only paste to the composer.
      const editors=root ? [...new Set([...root.querySelectorAll(COMPOSER_SELECTOR)].map(closestComposer).filter(Boolean))] : [];
      if (inputs.length===1 && editors.length===1 && editors[0]===composer) {
        inputs[0].files=data.files;
        inputs[0].dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      } else {
        composer.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true,composed:true}));
      }
    } catch { return {status:'unknown',message:'附件提交异常，请检查聊天；不会自动重试。'}; }
    setLoading('正在等待 Steam 附件确认…');
    const confirmed=await confirmOwnAttachment(before,beforeButtons,file,sameTarget);
    return {status:'handoff',message:confirmed?'已自动确认本次附件上传，请查看聊天记录。':'已提交附件；如 Steam 仍显示确认窗口，请手动确认。不会自动重发。'};
  }

  async function sendItem(item, forceFile = false) {
    if (sending || performance.now() < sendCooldownUntil) return;

    clearTimeout(searchTimer);

    discoverActiveComposer();
    if (!IS_STEAM_HOST && !IS_LOCAL_TEST) {
      showToast('非 Steam 页面禁用发送。', 'warn');
      return;
    }
    if (item.isDemo && !IS_LOCAL_TEST) {
      showToast('当前是演示数据，不能发送。请先配置 GIPHY API Key。', 'warn');
      return;
    }
    const target = getValidTarget();
    if (!target) {

      showToast('没有检测到当前聊天窗口。请先打开要发送的好友聊天。', 'warn');
      return;
    }
    const originalCandidate = originalGiphyCandidate(item);
    const url = originalCandidate || item.sendUrl || item.pageUrl;
    if (!url) return showToast('这张 GIF 没有可用的唯一链接。', 'warn');
    // Acquire synchronously, before the first await; covers left-click and menu actions.
    sending = true;
    panel.classList.add('sending');
    try {
      setLoading('正在发送所选 GIF…');
      const fileUrl = item.directUrl || item.sendUrl;
      // Capture identity before asynchronous metadata checks, even if Steam reuses the same editor.
      const fingerprint = conversationFingerprint(target);
      const asFile = forceFile || await shouldPrepareAttachment(item, originalCandidate);
      const result = asFile === null ? {status:'failed',message:'此媒体来源暂未支持自动上传，未发送。'} : getValidTarget() !== target || conversationFingerprint(target) !== fingerprint
        ? {status:'failed',message:'检测期间聊天对象已变化，已取消发送。'}
        : asFile ? await uploadWebpToTarget(fileUrl,target,fingerprint) : await sendUrlToTarget(url,target);

      if (result.status === 'handoff') {
        setLoading('');
        showToast(result.message, 'ok');
        closePanel();
      } else if (result.status === 'confirmed') {
        setLoading('');
        showToast('GIF 链接已提交给当前聊天', 'ok');
        closePanel();
      } else if (result.status === 'unknown') {
        setLoading('发送状态未知，请检查聊天记录；不要立即重试。');
        showToast(result.message, 'warn');
      } else {
        setLoading(result.message);
        showToast(result.message, 'warn');
      }
    } catch (error) {

      console.warn('[Steam GIF Picker] send failed', error);
      showToast('发送状态未知，请检查聊天记录；不会自动重试。', 'warn');
    } finally {
      sendCooldownUntil = performance.now() + 650;
      sending = false;
      panel.classList.remove('sending');
    }
  }


  shadow.addEventListener('pointerdown', (event) => {
    const path = event.composedPath();
    if (path.includes(apiGuide.overlay)) return;
    if (!path.includes(contextMenu)) contextMenu.hidden = true;
    if (!path.includes(historyBox) && event.target !== searchInput) historyBox.hidden = true;
    if (!path.includes(settingsBox) && event.target !== $('#settingsBtn')) settingsBox.hidden = true;
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (!panel.classList.contains('open')) return;
    if (host.contains(event.target)) return;
    closeTransientLayers();
    closePanel();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (apiGuide.isOpen()) return;
      closeTransientLayers();
      closePanel();
    }
  }, true);
  window.addEventListener('resize', () => {
    setBallPosition();
    if (panel.classList.contains('open')) positionPanel();
  });
  window.addEventListener('scroll', () => {
    if (panel.classList.contains('open')) positionPanel();
  }, { passive: true });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.sgpGifLinkLimitMB) gifLinkLimitMB = readGifLimit(changes.sgpGifLinkLimitMB.newValue);
      if (changes.sgpFavorites) {
        favorites = Array.isArray(changes.sgpFavorites.newValue) ? changes.sgpFavorites.newValue : [];
        renderResults();
        updateSectionTitle();
      }
      if (changes.sgpSearchHistory) {
        searchHistory = Array.isArray(changes.sgpSearchHistory.newValue) ? changes.sgpSearchHistory.newValue : [];
      }
      if (changes.giphyApiKey || changes.giphyRating || changes.sgpProvider) {
        const nextKey = changes.giphyApiKey ? String(changes.giphyApiKey.newValue || '').trim() : apiKey;
        const nextRating = changes.giphyRating ? changes.giphyRating.newValue || 'pg-13' : rating;
        const nextProvider = changes.sgpProvider ? selectProvider(changes.sgpProvider.newValue, nextKey) : provider;
        const changed = nextKey !== apiKey || nextRating !== rating || nextProvider !== provider;
        apiKey = nextKey; rating = nextRating; provider = nextProvider;
        updateSourceLabel();
        if (changed) {
          requestSequence++; isLoading = false; searchError = pageError = null; searchState = 'idle';
          currentItems = []; seenResultKeys.clear(); visualSignatures.clear(); visualChecked.clear(); hasMore = false; offset = 0;
          if (panel.classList.contains('open') && !favoritesMode) runSearch(searchInput.value.trim(), { recordHistory: false });
          else { updateSectionTitle(); renderResults(); }
        }
      }
      if (changes.sgpFloatingPosition && changes.sgpFloatingPosition.newValue) {
        floatingPosition = changes.sgpFloatingPosition.newValue;
        setBallPosition();
      }
    });
  }

  async function initialize() {
    const stored = await storageGet(STORAGE_KEYS);
    favorites = Array.isArray(stored.sgpFavorites) ? stored.sgpFavorites : [];
    searchHistory = Array.isArray(stored.sgpSearchHistory) ? stored.sgpSearchHistory : [];
    floatingPosition = stored.sgpFloatingPosition || floatingPosition;
    apiKey = String(stored.giphyApiKey || '').trim();
    rating = stored.giphyRating || 'pg-13';
    provider = selectProvider(stored.sgpProvider, apiKey);
    gifLinkLimitMB = readGifLimit(stored.sgpGifLinkLimitMB);
    settingsReady = true;
    setBallPosition();
    scheduleTargetDiscovery(80);
    updateSourceLabel();
    updateTargetStatus();
    updateSectionTitle();
    renderResults();
    setLoading(hasLiveSource() ? '打开面板后加载热门 GIF。' : '演示模式已就绪。配置 API Key 后加载真实 GIF。');
  }

  initialize().catch((error) => {
    console.error('[Steam GIF Picker] initialize failed', error);
  });
})();
