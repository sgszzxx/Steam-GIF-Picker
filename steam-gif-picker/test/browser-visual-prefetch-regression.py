"""Chromium canvas + simulated ImageDecoder and API/CDN; never contacts Steam or GifSnap."""
from pathlib import Path
from io import BytesIO
import os, json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
CDN='https://media.gifsnap.com/gifs/'
def gif(kind, tweak=0):
    frames=[]
    for i in range(5):
        im=Image.new('RGB',(96,80),(220-tweak,210,195));d=ImageDraw.Draw(im)
        if kind=='same':
            d.rectangle((5+i*3,8,54+i*3,67),fill=(25+tweak,36,170)); d.ellipse((44,20+i,80,56+i),fill=(210,55,20))
        else:
            d.rectangle((35,1,90,75),fill=(5,180,45));d.ellipse((3+i*3,15,45+i*3,60),fill=(30,10,20))
        frames.append(im)
    f=BytesIO();frames[0].save(f,format='GIF',save_all=True,append_images=frames[1:],duration=100,loop=0);return f.getvalue()
HTML='''<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div><script>window.sent=[];const e=document.querySelector('textarea');document.querySelector('button').onclick=()=>{sent.push(e.value);e.value=''};document.querySelector('form').onsubmit=ev=>{ev.preventDefault();sent.push(e.value);e.value=''}</script>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def serve(route):
        u=route.request.url
        if u.startswith(CDN):
            name=u.split('/')[-1]; payload=gif('different' if name=='distinct.gif' else 'same',2 if name in ('alias.gif','later.gif') else 0)
            route.fulfill(status=200,content_type='image/gif',headers={'access-control-allow-origin':'*'},body=payload)
        else: route.fulfill(status=200,content_type='text/html',body=HTML)
    page.route('**/*',serve);page.set_content(HTML)
    page.evaluate(r"""() => {window.chrome={runtime:{onMessage:{addListener(f){window.bgHandler=f}}}};
    window.fetch=async url=>new Response(new Uint8Array([url.includes('distinct.gif')?2:(url.includes('alias.gif')||url.includes('later.gif'))?1:0]),{headers:{'content-type':'image/gif'}});
    window.ImageDecoder=class {constructor({data}){this.kind=data[0];this.tracks={ready:Promise.resolve(),selectedTrack:{frameCount:5}}}async decode({frameIndex:i}){const c=new OffscreenCanvas(96,80),x=c.getContext('2d');x.fillStyle='rgb(220,210,195)';x.fillRect(0,0,96,80);x.fillStyle=this.kind===2?'rgb(5,180,45)':`rgb(${25+this.kind*2},36,170)`;x.fillRect(this.kind===2?35:5+i*3,8,50,59);x.fillStyle=this.kind===2?'rgb(30,10,20)':'rgb(210,55,20)';x.fillRect(this.kind===2?3+i*3:44,20+i,36,36);const image=c.transferToImageBitmap();Object.defineProperties(image,{displayWidth:{value:96},displayHeight:{value:80}});return {image}}close(){}};}""")
    page.add_script_tag(path=str(ROOT/'background.js'))
    urls=[CDN+x+'.gif' for x in ['original','alias','distinct','later']]
    signatures=page.evaluate('urls=>new Promise(resolve=>bgHandler({type:"SGP_GIFSNAP_FINGERPRINT",urls},{},resolve))',urls)['signatures']
    assert len(signatures)==4,signatures.keys()
    page.evaluate('s=>window.testSignatures=s',signatures)
    page.evaluate(r'''window.local={};window.calls=[];window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});if(m.type==='SGP_GIFSNAP_FINGERPRINT'){cb({ok:true,signatures:Object.fromEntries(m.urls.filter(u=>testSignatures[u]).map(u=>[u,testSignatures[u]]))});return;}const item=(id,title='Same reaction')=>({id:'gifsnap:'+id,title,source:'gifsnap',sendUrl:'https://media.gifsnap.com/gifs/'+id+'.gif',directUrl:'https://media.gifsnap.com/gifs/'+id+'.gif',previewUrl:'https://media.gifsnap.com/gifs/'+id+'.gif'});const items=m.offset===0?[item('original'),item('alias'),item('f0','Unique 0'),item('f1','Unique 1'),item('distinct'),...Array.from({length:18},(_,i)=>item('f'+(i+2),'Unique '+(i+2)))]:[item('later'),item('new','New clip')];cb({ok:true,items,count:items.length,hasMore:m.offset===0,nextOffset:m.offset+25});}}};''')
    for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
    base=page.locator('#steam-gif-picker-host');track=base.locator('#track');grid=base.locator('#grid')
    base.locator('#ball').click();expect(track.locator('.card-main')).to_have_count(22);assert track.locator('[data-gif-id="gifsnap:alias"]').count()==0;assert track.locator('[data-gif-id="gifsnap:distinct"]').count()==1
    page.wait_for_timeout(250);assert grid.locator('img[src]').count()==0;assert 4<track.locator('img[src]').count()<22
    track.locator('[data-gif-id="gifsnap:original"]').evaluate('e=>window.originalCard=e')
    track.evaluate('e=>e.scrollLeft=e.scrollWidth-e.clientWidth-700');expect(track.locator('.card-main')).to_have_count(23);assert track.locator('[data-gif-id="gifsnap:later"]').count()==0
    assert track.locator('[data-gif-id="gifsnap:original"]').evaluate('e=>e===originalCard')
    assert page.evaluate('calls.filter(x=>x.type==="SGP_GIFSNAP_FETCH"&&x.offset===25).length')==1
    base.locator('#expandBtn').click();page.wait_for_timeout(300);assert track.locator('img[src]').count()==0;assert grid.locator('img[src]').count()>0
    base.locator('#closeBtn').click();page.wait_for_timeout(350);assert track.locator('img[src]').count()+grid.locator('img[src]').count()==0
    assert not errors,errors;browser.close();print('PASS simulated multi-frame decode and real canvas, visually similar variants filtered, distinct same-title retained, cross-page filtering, earlier prefetch, inactive layout and closed panel media suspension')
