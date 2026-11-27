const apiKey = document.getElementById('apiKey');
const rating = document.getElementById('rating');
const status = document.getElementById('status');
const provider = document.getElementById('provider');
let savedProvider = 'giphy';
const readGifLimit = v => [0.5,1,1.5,2,2.5,3,4,6,8].includes(Number(v)) ? Number(v) : 2;
function syncProvider() { document.getElementById('giphyFields').hidden = provider.value !== 'giphy'; document.getElementById('gifsnapNote').hidden = provider.value !== 'gifsnap'; document.getElementById('originalLinkFields').hidden = provider.value !== 'gifsnap'; }
provider.addEventListener('change', syncProvider);

chrome.storage.local.get(['giphyApiKey', 'giphyRating', 'sgpProvider', 'sgpGifLinkLimitMB'], (data) => {
  if (chrome.runtime.lastError) {
    status.textContent = '无法读取扩展存储。请确认扩展已正确加载。';
    status.style.color = '#ff9c9c';
    return;
  }
  apiKey.value = data.giphyApiKey || '';
  rating.value = data.giphyRating || 'pg-13';
  provider.value = savedProvider = ['giphy','gifsnap'].includes(data.sgpProvider) ? data.sgpProvider : (data.giphyApiKey ? 'giphy' : 'gifsnap');
  document.getElementById('gifLinkLimitMB').value = String(readGifLimit(data.sgpGifLinkLimitMB));
  syncProvider();
});

document.getElementById('save').addEventListener('click', () => {
  const value = apiKey.value.trim();
  const selectedRating = rating.value;
  const selectedProvider = provider.value;
  chrome.storage.local.set({ giphyApiKey: value, giphyRating: selectedRating, sgpProvider: selectedProvider, sgpGifLinkLimitMB:readGifLimit(document.getElementById('gifLinkLimitMB').value) }, () => {
    if (chrome.runtime.lastError) {
      status.textContent = `保存失败：${chrome.runtime.lastError.message}`;
      status.style.color = '#ff9c9c';
      return;
    }
    savedProvider = selectedProvider;
    status.textContent = selectedProvider === 'gifsnap' ? 'GifSnap 已保存，无需 Key。回到聊天即可搜索。' : value ? '设置已保存。回到 Steam GIF Picker 并重新加载热门内容。' : '已清除 API Key，扩展将使用演示模式。';
    status.style.color = '#a8d98a';
  });
});

SGPApiGuide.mount(document.body, document.getElementById('registerApi'), document.getElementById('apiGuideHelp'));

// Explicit connection check, using the last saved key/rating.
document.getElementById('checkNetwork').addEventListener('click', () => SGPNetwork.bind(
  document.getElementById('checkNetwork'), document.getElementById('networkStatus'),
  message => new Promise(resolve => chrome.runtime.sendMessage(message, response => {
    if (chrome.runtime.lastError) resolve({ok:false,message:'扩展后台无响应，请重新加载扩展。'});
    else resolve(response);
  })), savedProvider
));
