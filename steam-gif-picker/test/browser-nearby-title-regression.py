"""Real Chromium DOM with synthetic API responses; no real Steam/network."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
HTML='''<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div>'''
STUB=r'''window.local={sgpSearchHistory:Array.from({length:20},(_,i)=>({query:'history '+i,searchedAt:i+1})),sgpFavorites:[{id:'fav1',title:'Same',source:'gifsnap'},{id:'fav2',title:'Same',source:'gifsnap'}]};window.calls=[];window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});if(m.type!=='SGP_GIFSNAP_FETCH'){cb({ok:false});return;}const page=m.offset/25;const item=([id,title])=>({id,title,source:'gifsnap',sendUrl:'https://cdn.example.com/'+id+'.gif',previewUrl:'https://cdn.example.com/'+id+'.gif'});let data;
if(m.query==='reset')data=page===0?[['r1','B'],['r2','b'],['r3','新'],['r4','新']]:[];
else if(m.query==='bounded') data=page===0?[...Array.from({length:8},(_,i)=>['u'+i,'Unique '+i]),['b0','B'],['a0','A']]:[['blocked'+page,'A']];
else if(page===0)data=[['a1','  Ａ '],['a2','a'],['b1','B'],['a3','A'],['c1','C'],['a4','a'],['p1','GIF'],['p2','gif'],['p3',''],...Array.from({length:8},(_,i)=>['f'+i,'Fixture '+i]),['tail','Tail'],['end','End']];
else if(page===1)data=[['end2',' end '],['tail2','TAIL']];
else if(page===2)data=[['end3','END'],['tail3','tail'],['fresh','Fresh'],['end4','End'],['next','Next'],['end5','End']];else data=[];
const items=data.map(item);cb({ok:true,items,count:items.length,nextOffset:m.offset+25,hasMore:m.query==='bounded'||(!m.query&&page<2)});}}};'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',lambda route:route.abort());page.set_content(HTML);page.evaluate(STUB)
    for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
    base=page.locator('#steam-gif-picker-host');track=base.locator('#track');grid=base.locator('#grid');search=base.locator('#search');history=base.locator('#history')
    ids=lambda container:container.locator('.card').evaluate_all('es=>es.map(e=>e.dataset.gifId)')
    base.locator('#ball').click();expect(track.locator('.card')).to_have_count(17)
    first=['a1','b1','c1','a4','p1','p2','p3',*[f'f{i}' for i in range(8)],'tail','end'];assert ids(track)==ids(grid)==first
    track.locator('[data-gif-id="a1"]').evaluate('e=>window.originalCard=e')
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');expect(track.locator('.card')).to_have_count(20)
    assert ids(track)==ids(grid)==first+['fresh','next','end5'];assert track.locator('[data-gif-id="a1"]').evaluate('e=>e===originalCard')
    assert page.evaluate('calls.filter(m=>m.type==="SGP_GIFSNAP_FETCH").map(m=>m.offset)')==[0,25,50]
    print('PASS +/-2, normalization, meaningful short/CJK titles, placeholder preservation, distance 3, cross-page and title-only-page skip')
    base.locator('#expandBtn').click();expect(grid).to_be_visible();assert ids(grid)==ids(track);base.locator('#expandBtn').click()
    search.fill('reset');expect(track.locator('.card')).to_have_count(2);assert ids(track)==['r1','r3'];assert ids(grid)==ids(track)
    search.fill('bounded');expect(track.locator('.card')).to_have_count(10);track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth');expect(base.locator('#loading')).to_have_text('已经到底了');assert page.evaluate('calls.filter(m=>m.query==="bounded").map(m=>m.offset)')==[0,25,50,75]
    print('PASS bounded title-only pagination, search reset and shared expanded order')
    search.fill('');search.focus();# focus may already be present; explicitly toggle
    search.blur();search.focus();expect(history).to_be_visible()
    assert history.evaluate('e=>e.scrollHeight>e.clientHeight')
    assert history.evaluate('e=>getComputedStyle(e,"::-webkit-scrollbar").width')=='8px'
    assert history.evaluate('e=>getComputedStyle(e,"::-webkit-scrollbar-thumb").backgroundColor')=='rgb(73, 87, 103)'
    assert history.evaluate('e=>getComputedStyle(e,"::-webkit-scrollbar-track").backgroundColor')=='rgb(32, 39, 49)'
    history.hover();page.mouse.wheel(0,420);page.wait_for_timeout(250);assert history.evaluate('e=>e.scrollTop')>0
    history.locator('.remove').last.click();assert history.locator('.history-item').count()==21 # 20 old + 2 searches -1
    print('PASS dark scrollbar CSS, wheel scroll and deletion')
    base.locator('#favoritesBtn').click();expect(track.locator('.card')).to_have_count(2);assert ids(track)==['fav1','fav2']
    print('PASS same-title favorites are not filtered')
    assert not errors,errors;browser.close()
