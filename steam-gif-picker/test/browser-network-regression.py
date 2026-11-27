"""Network UX in synthetic Steam DOM. No real API or account access."""
from pathlib import Path
import os, base64
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
HTML='<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div>'
STUB='''window.local={giphyApiKey:'fixture'};window.calls=[];window.failure='TIMEOUT';window.cdnFails=false;window.pageFails=true;window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});const items=Array.from({length:m.limit===1?1:12},(_,i)=>({id:`${m.query||'hot'}-${m.offset+i}`,title:`Fixture ${i}`,sendUrl:`https://giphy.com/gifs/fixture-${i}`,previewUrl:'https://media.giphy.com/fixture.gif'}));if(failure){cb({ok:false,code:failure,message:failure==='RATE_LIMIT'?'配额已达上限':'GIPHY 请求超时，请检查网络后重试。'})}else if(m.query==='empty'){cb({ok:true,items:[],hasMore:false})}else if(m.offset&&pageFails){cb({ok:false,code:'NETWORK_ERROR',message:'网络错误'})}else cb({ok:true,items,hasMore:m.offset===0&&m.limit!==1,count:items.length})}}};'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700}); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    pixel=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
    state={'cdn':True}
    page.route('**/*',lambda route: route.fulfill(status=200,content_type='image/gif',body=pixel) if state['cdn'] else route.abort())
    page.set_content(HTML);page.evaluate(STUB)
    for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
    base=page.locator('#steam-gif-picker-host');ball=base.locator('#ball');track=base.locator('#track');retry=base.locator('#retryNetwork');loading=base.locator('#loading')
    ball.click();expect(retry).to_be_visible();expect(track.locator('.empty')).to_contain_text('暂时无法加载');expect(loading).to_contain_text('超时')
    page.evaluate('failure=null');retry.click();expect(track.locator('.card-main').first).to_be_visible();expect(retry).to_be_hidden()
    print('PASS timeout shows error not empty results; retry restores GIFs')
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');expect(retry).to_be_visible();expect(track.locator('.card-main')).to_have_count(12)
    before=page.evaluate('calls.length');track.evaluate("e=>{for(let i=0;i<10;i++)e.dispatchEvent(new Event('scroll'))}");page.wait_for_timeout(300);assert page.evaluate('calls.length')==before
    page.evaluate('pageFails=false');retry.click();expect(track.locator('.card-main')).to_have_count(24);expect(retry).to_be_hidden()
    print('PASS pagination failure preserves cards, no scroll retry storm, manual retry appends')
    search=base.locator('#search');page.evaluate("failure='RATE_LIMIT'");search.fill('quota');search.press('Enter');expect(loading).to_contain_text('配额');expect(retry).to_be_hidden();expect(track.locator('.empty')).to_contain_text('暂时无法加载')
    page.evaluate('failure=null');search.fill('empty');search.press('Enter');expect(track.locator('.empty')).to_contain_text('没有找到');expect(retry).to_be_hidden()
    print('PASS quota error distinct from genuine empty search')
    base.locator('#settingsBtn').click();check=base.locator('#checkNetwork');status=base.locator('#networkStatus');check.click();expect(status).to_contain_text('图片 CDN：正常');state['cdn']=False;check.click();expect(status).to_contain_text('图片 CDN：加载失败');page.evaluate("failure='TIMEOUT'");check.click();expect(status).to_contain_text('图片 CDN：未检测')
    print('PASS connection test distinguishes API success, CDN failure and API failure')
    assert not errors,errors
    browser.close()
