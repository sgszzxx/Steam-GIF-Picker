"""Synthetic Steam chat; fixture APIs, no real GIF requests or accounts."""
from pathlib import Path
import os,base64
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
HTML='''<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div><script>window.sent=[];const e=document.querySelector('textarea');document.querySelector('button').onclick=()=>{sent.push(e.value);e.value=''};document.querySelector('form').onsubmit=ev=>{ev.preventDefault();sent.push(e.value);e.value=''}</script>'''
STUB = r"""window.local={};window.calls=[];window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});const q=m.query||'hot';const item=(id,path,contentId)=>({id:'gifsnap:'+id,title:'Title '+id,source:'gifsnap',contentId,sendUrl:'https://cdn.example.com/'+path,directUrl:'https://cdn.example.com/'+path,previewUrl:'https://cdn.example.com/shared-preview.gif'});let items,nextOffset=m.offset+25;let hasMore=true;if(q==='stall'){items=[item('stall-'+m.offset,'stall-'+m.offset+'.gif')];nextOffset=m.offset;}else if(m.offset===0){items=[item('a','a.gif','one'),item('a','a.gif','one'),item('b','b.webp','one'),item('c','a.gif',''),...Array.from({length:10},(_,i)=>item('x'+i,'x'+i+'.gif',''))];}else if(m.offset===25){items=[item('newalias','b.webp',''),item('d','d.gif','one'),item('e','e.gif','two'),item('f','e.gif',''),item('g','e.gif?v=2','')];}else{items=[item('newalias2','b.webp',''),item('newalias3','e.gif','two')];}cb({ok:true,items,count:items.length,nextOffset,hasMore});}}};"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    pixel=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
    page.route('**/*',lambda route:route.fulfill(status=200,content_type='image/gif',body=pixel));page.set_content(HTML);page.evaluate(STUB)
    for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
    base=page.locator('#steam-gif-picker-host');track=base.locator('#track');grid=base.locator('#grid');search=base.locator('#search')
    base.locator('#ball').click();expect(track.locator('.card-main')).to_have_count(11);expect(grid.locator('.card-main')).to_have_count(11)
    assert track.locator('[data-gif-id="gifsnap:a"]').count()==1
    track.locator('[data-gif-id="gifsnap:a"]').evaluate('e=>window.originalCard=e')
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');expect(track.locator('.card-main')).to_have_count(13);expect(grid.locator('.card-main')).to_have_count(13)
    assert track.locator('[data-gif-id="gifsnap:a"]').evaluate('e=>e===window.originalCard')
    assert page.evaluate('calls.some(m=>m.offset===25)')
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');expect(base.locator('#loading')).to_have_text('已经到底了');assert page.evaluate('calls.some(m=>m.offset===50)')
    expect(track.locator('.card-main')).to_have_count(13);n=page.evaluate('calls.length');track.evaluate('e=>e.dispatchEvent(new Event("scroll"))');page.wait_for_timeout(200);assert page.evaluate('calls.length')==n
    search.fill('cat');page.wait_for_timeout(1250);expect(track.locator('.card-main')).to_have_count(11);assert page.evaluate('calls.at(-1).offset')==0
    search.fill('stall');page.wait_for_timeout(1250);expect(track.locator('.card-main')).to_have_count(1);expect(base.locator('#loading')).to_have_text('已经到底了')
    assert not errors,errors;browser.close();print('PASS initial and cross-page dedupe (ID, exact URL, content_id), stable cards, raw offset, duplicate-only stop, stalled cursor, reset and distinct titles with shared preview')
