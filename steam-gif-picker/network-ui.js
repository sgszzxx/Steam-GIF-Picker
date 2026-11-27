/* Explicit connection probe, using saved settings; no media cache or proxy. */
const SGPNetwork = (() => {
  function probeImage(url) {
    return new Promise(resolve => {
      let safe;
      try { safe = new URL(url); if (safe.protocol !== 'https:') throw new Error(); }
      catch { resolve('unavailable'); return; }
      const image = new Image();
      let timer;
      function finish(result) { clearTimeout(timer); image.onload = image.onerror = null; image.removeAttribute('src'); resolve(result); }
      image.referrerPolicy = 'no-referrer';
      image.onload = () => finish('ok');
      image.onerror = () => finish('failed');
      timer = setTimeout(() => finish('timeout'), 8000);
      image.src = safe.href;
    });
  }
  async function checkConnection(send, report, provider = 'giphy') {
    report(`正在检测 ${provider === 'gifsnap' ? 'GifSnap' : 'GIPHY'} API…`);
    const response = await send({ type: provider === 'gifsnap' ? 'SGP_GIFSNAP_FETCH' : 'SGP_GIPHY_FETCH', query: '', offset: 0, limit: 1 });
    if (!response?.ok) {
      report(`API：失败。${response?.message || '后台无响应。'} 图片 CDN：未检测。`);
      return { api: 'failed', cdn: 'not-tested' };
    }
    const preview = response.items?.[0]?.previewUrl;
    if (!preview) { report('API：正常。图片 CDN：没有可用预览，未检测。'); return { api: 'ok', cdn: 'not-tested' }; }
    report('API：正常。正在检测图片 CDN…');
    const cdn = await probeImage(preview);
    report(`API：正常。图片 CDN：${cdn === 'ok' ? '正常（本次预览可加载）' : cdn === 'timeout' ? '超时' : '加载失败'}。`);
    return { api: 'ok', cdn };
  }
  async function bind(button, status, send, provider = 'giphy') {
    if (button.disabled) return;
    button.disabled = true;
    try { await checkConnection(send, message => { status.textContent = message; }, provider); }
    catch { status.textContent = '连接检测失败，请稍后再试。'; }
    finally { button.disabled = false; }
  }
  return { checkConnection, bind };
})();
