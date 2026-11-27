/* Shared GIPHY onboarding UI, for both the floating panel and options page. */
'use strict';
const SGPApiGuide = (() => {
  const url = 'https://developers.giphy.com/dashboard/';
  const pref = 'sgpSkipApiGuide';
  function mount(root, register, help) {
    const style = document.createElement('style');
    style.textContent = `
      .sgp-guide-backdrop[hidden]{display:none!important}
      .sgp-guide-backdrop{position:fixed;inset:0;z-index:2147483647;background:#080c14b8;display:flex;align-items:center;justify-content:center;padding:14px;pointer-events:auto;box-sizing:border-box;font:13px/1.5 system-ui,sans-serif;color:#e8edf4;backdrop-filter:blur(5px)}
      .sgp-guide{box-sizing:border-box;width:min(440px,100%);max-height:calc(100vh - 28px);overflow:auto;overscroll-behavior:contain;background:#222832;border:1px solid #414c5c;border-radius:17px;padding:20px;box-shadow:0 18px 60px #000a;animation:sgpGuideIn .2s cubic-bezier(.2,.8,.2,1)}
      @keyframes sgpGuideIn{from{opacity:0;transform:translateY(7px) scale(.97)}to{opacity:1;transform:none}}
      .sgp-guide-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.sgp-guide h2{font-size:18px;margin:0;color:#f1f5fa}.sgp-guide .sgp-guide-close{margin:0;background:#343e4b;border:0;color:#dbe3ec;border-radius:8px;width:32px;height:32px;padding:0;font-size:20px;cursor:pointer}
      .sgp-guide p{font-size:12px;color:#b3bfce;margin:8px 0}.sgp-guide ol{padding-left:22px;margin:12px 0;color:#e3eaf3}.sgp-guide li{padding:3px 0 9px;font-size:13px}.sgp-guide li strong{color:#fff}.sgp-guide .sgp-guide-values{background:#151b23;border:1px solid #344050;border-radius:9px;margin:7px 0;padding:9px;color:#c6d9ef;font-size:12px;overflow-wrap:anywhere;user-select:text}.sgp-guide .sgp-guide-values span{display:block;color:#93a3b6;font-size:11px}
      .sgp-guide .sgp-guide-skip{display:flex;align-items:center;gap:8px;margin:12px 0;color:#d0d8e3;font-size:12px;cursor:pointer}.sgp-guide .sgp-guide-skip input{width:16px;height:16px;margin:0;accent-color:#438bd5;padding:0}.sgp-guide-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.sgp-guide-actions button,.sgp-guide-actions a{box-sizing:border-box;border:0;border-radius:9px;padding:9px 13px;margin:0;text-decoration:none;font:600 12px/1.4 system-ui,sans-serif;cursor:pointer}.sgp-guide-actions button{background:#384352;color:#e2e9f1}.sgp-guide-actions a{background:#397fca;color:white}.sgp-guide-actions a:hover{background:#4b91df}.sgp-guide [tabindex]:focus-visible,.sgp-guide button:focus-visible,.sgp-guide a:focus-visible{outline:2px solid #80bfff;outline-offset:2px}
      @media(prefers-reduced-motion:reduce){.sgp-guide{animation:none}}
    `;
    root.appendChild(style);
    const overlay = document.createElement('div');
    overlay.className = 'sgp-guide-backdrop';
    overlay.hidden = true;
    overlay.innerHTML = `<section class="sgp-guide" role="dialog" aria-modal="true" aria-labelledby="sgpGuideTitle" tabindex="-1">
      <div class="sgp-guide-head"><h2 id="sgpGuideTitle">申请 GIPHY API Key</h2><button type="button" class="sgp-guide-close" aria-label="关闭教程">×</button></div>
      <p>只需申请一次，即可启用真实 GIF 搜索与热门推荐。</p>
      <ol>
        <li><strong>打开控制台：</strong>点击下方“前往 GIPHY 控制台”，注册或登录 GIPHY 账号。</li>
        <li><strong>创建 API Key（第 1 步）：</strong>在控制台点击创建 API Key 的入口，选择 <b>API</b>（不要选 SDK），进入 <b>Create A New API Key 2/2</b> 页面。</li>
        <li><strong>填写申请表（第 2 步）：</strong>按页面从上到下的顺序填写以下内容。
          <div class="sgp-guide-values"><span>您的应用名称（App Name）</span>Steam GIF Picker<br><span>平台（Platform）</span>点击 Web（不要选 iOS、安卓或其他）<br><span>应用描述（App Description）</span>A personal browser extension for searching and sharing GIFs in Steam chat.</div></li>
        <li><strong>同意条款并创建：</strong>阅读 GIPHY API Terms，同意后勾选表单下方的复选框，再点击底部紫色按钮 <b>Create API Key（创建 API 密钥）</b>。</li>
        <li><strong>复制 API Key：</strong>正常情况下，点击创建后即可获得 Beta API Key，无需另外申请审核。复制创建成功后显示的 API Key（也可在控制台应用卡片中查找）。</li>
        <li><strong>返回扩展：</strong>将 Key 粘贴到 API Key 输入框，点击“保存并加载”（独立设置页为“保存设置”）。</li>
      </ol>
      <p>以上为已实测的 Beta Key 申请流程。正式生产 Key 的申请另有要求；不要把 Key 分享给他人。若 GIPHY 更新页面，以实际页面为准。</p>
      <label class="sgp-guide-skip"><input type="checkbox" class="sgp-guide-check">下次点击申请链接时不再显示教程</label>
      <div class="sgp-guide-actions"><button type="button" class="sgp-guide-cancel">返回设置</button><a class="sgp-guide-go" href="${url}" target="_blank" rel="noopener noreferrer">前往 GIPHY 控制台 ↗</a></div>
    </section>`;
    root.appendChild(overlay);
    const dialog = overlay.querySelector('.sgp-guide');
    const check = overlay.querySelector('.sgp-guide-check');
    let skip = false;
    let previousFocus = null;
    try {
      chrome.storage.local.get([pref], data => { if (!chrome.runtime.lastError) skip = data?.[pref] === true; });
      chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[pref]) skip = changes[pref].newValue === true; });
    } catch { /* default to showing help */ }
    function show(trigger) {
      previousFocus = trigger; check.checked = skip; overlay.hidden = false; dialog.focus();
    }
    function hide() {
      overlay.hidden = true; previousFocus?.focus(); previousFocus = null;
    }
    register.addEventListener('click', event => {
      if (skip) return; // native link opens directly in a new window/tab
      event.preventDefault(); show(register);
    });
    help.addEventListener('click', event => { event.preventDefault(); show(help); });
    overlay.querySelector('.sgp-guide-close').addEventListener('click', hide);
    overlay.querySelector('.sgp-guide-cancel').addEventListener('click', hide);
    overlay.addEventListener('click', event => { if (event.target === overlay) hide(); });
    overlay.querySelector('.sgp-guide-go').addEventListener('click', () => {
      const wanted = check.checked;
      try { chrome.storage.local.set({[pref]:wanted}, () => { if (!chrome.runtime.lastError) skip = wanted; }); } catch {}
      hide(); // keep native anchor default navigation and user activation
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button,input,a[href]')];
        const current = root.activeElement || document.activeElement;
        if (event.shiftKey && (current === items[0] || current === dialog)) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && current === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    });
    return { overlay, hide, isOpen: () => !overlay.hidden };
  }
  return { mount };
})();
