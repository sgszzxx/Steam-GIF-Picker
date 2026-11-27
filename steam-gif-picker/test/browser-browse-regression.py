"""Regression tests for result card stability, wheel settling and search UI.
Synthetic Steam DOM; no network or credentials. Requires Playwright + Chromium.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML='''<!doctype html><div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div><script>window.sent=[];const e=document.querySelector('textarea');document.querySelector('button').onclick=()=>{sent.push(e.value);e.value=''};document.querySelector('form').onsubmit=ev=>{ev.preventDefault();sent.push(e.value);e.value=''}</script>'''
STUB='''window.pendingPage=false;window.local={giphyApiKey:'test-only',sgpSearchHistory:[{query:'cat',searchedAt:1}]};window.chrome={storage:{local:{get:(keys,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{const items=Array.from({length:20},(_,i)=>({id:`${m.query||'hot'}-${m.offset+i}`,title:`Fixture ${i}`,sendUrl:`https://giphy.com/gifs/${m.query||'hot'}-${m.offset+i}`,previewUrl:'https://giphy.com/fixture.gif'}));if(m.offset){pendingPage=true;setTimeout(()=>{pendingPage=false;cb({ok:true,items,hasMore:false})},500)}else cb({ok:true,items,hasMore:true})}}};'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700}); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda route:route.abort());page.set_content(HTML);page.evaluate(STUB)
    page.add_script_tag(path=str(ROOT/'api-guide.js'));page.add_script_tag(path=str(ROOT/'network-ui.js'))
    source=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1)
    # In-memory test hook only, not shipped in the extension's runtime code.
    source=source.replace('  initialize().catch', '  window.__testScroll = () => ({running: Boolean(smoothFrame), guard: lastScrollAt});\n  initialize().catch',1)
    page.add_script_tag(content=source)
    base=page.locator('#steam-gif-picker-host');ball=base.locator('#ball');track=base.locator('#track');search=base.locator('#search')
    def open_panel():
        ball.click();track.locator('.card-main').first.wait_for(state='visible');page.wait_for_timeout(350)
    open_panel();track.hover();page.mouse.wheel(0,101);page.wait_for_timeout(850)
    assert page.evaluate('window.__testScroll()')=={'running':False,'guard':0},page.evaluate('window.__testScroll()')
    print('PASS wheel animation settles and releases click guard')
    # Trigger delayed pagination; keep the pointer held on an existing card until the API returns.
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');page.wait_for_function('window.pendingPage')
    card=track.locator('[data-gif-id="hot-18"] .card-main');card.hover();box=card.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    card.evaluate('e=>window.originalCard=e');page.mouse.down();page.wait_for_function('!window.pendingPage');page.wait_for_timeout(100)
    assert card.evaluate('e=>e===window.originalCard'), 'pagination replaced the pressed card'
    page.mouse.up();page.wait_for_function('window.sent.length===1');assert page.evaluate('sent')==['https://giphy.com/gifs/hot-18']
    print('PASS delayed pagination preserves pressed card and sends exactly once')
    page.wait_for_timeout(850);open_panel();search.fill('cat');assert search.get_attribute('type')=='text';assert base.locator('#clearSearch').is_visible();page.wait_for_timeout(1200)
    track.locator('[data-gif-id="cat-0"] .card-main').click();page.wait_for_function('window.sent.length===2');assert page.evaluate('sent[1]')=='https://giphy.com/gifs/cat-0'
    print('PASS direct search result sends once without manual editor focus')
    page.wait_for_timeout(850);open_panel();base.locator('#clearSearch').click();search.focus();remove=base.locator('.history-item .remove').first;remove.wait_for();assert remove.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)';remove.click();assert base.locator('.history-item .remove').count()==0
    print('PASS single search clear control and styled history deletion')
    assert not errors,errors
    browser.close()
