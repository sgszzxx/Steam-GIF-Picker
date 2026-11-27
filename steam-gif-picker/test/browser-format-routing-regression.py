from pathlib import Path
from io import BytesIO
import os,base64
from PIL import Image
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
HTML='''<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px">draft</textarea><button type="submit" aria-label="发送消息">发送</button></form></div><script>window.uploads=[];window.confirmed=0;window.sent=[];const e=document.querySelector('textarea');e.onpaste=ev=>{ev.preventDefault();const f=ev.clipboardData.files[0];uploads.push(f.type);const d=document.createElement('div');d.style.cssText='position:fixed;left:10px;top:200px;width:320px;height:140px;background:#ddd';d.innerHTML='<span></span><button>上传</button><button>×</button><label><input type=checkbox>标记为剧透</label>';d.querySelector('span').textContent=f.name;d.querySelector('button').onclick=()=>{confirmed++;d.remove()};document.body.append(d)};document.querySelector('button').onclick=()=>{sent.push(e.value);e.value=''};document.querySelector('form').onsubmit=ev=>{ev.preventDefault();sent.push(e.value);e.value=''}</script>'''
# Sizes from the user's diagnostic report; no external CDN or Steam requests.
CASES=[
    ('png','image/png','PNG','','auto',0,2,'file'),('jpg','image/jpeg','JPEG','cat','auto',0,2,'file'),
    ('gif','image/gif','GIF','','1628283724372319',1133401,2,'link'),('gif','image/gif','GIF','','2266774792073970',196663,2,'link'),
    ('gif','image/gif','GIF','cat','8843215791551597',452677,2,'link'),('gif','image/gif','GIF','','9141527582281022',2671403,2,'file'),
    ('gif','image/gif','GIF','cat','generic-large',2671403,2,'file'),('gif','image/gif','GIF','','generic-boundary',2000000,2,'file'),
    ('gif','image/gif','GIF','','generic-below',1999999,2,'link'),('gif','image/gif','GIF','','generic-custom',2671403,3,'link'),
    ('gif','image/gif','GIF','','unknown',0,2,'file'),('gif','image/gif','GIF','','file',196663,2,'file'),
    ('gif','image/gif','GIF','','original',2671403,2,'link'),('gif','image/gif','GIF','','disabled',2671403,2,'file'),
    ('gif','image/gif','GIF','','fail',2671403,2,'fail'),('gif','image/gif','GIF','','switch',2671403,2,'switch'),
    ('gif','image/gif','GIF','','wrongmime',196663,2,'file'),('gif','image/gif','GIF','','old-exception',196663,2,'link'),
    ('webp','image/gif','GIF','zmjjkk','klipy-webp',0,2,'file'),('webp','image/gif','GIF','','klipy-trending',0,2,'file'),
    ('gif','image/gif','GIF','','klipy-small',452677,2,'link'),('gif','image/gif','GIF','cat','klipy-large',2671403,2,'file'),
    ('png','image/png','PNG','','klipy-png',0,2,'file'),('webp','image/gif','GIF','','unknown-cdn',0,2,'blocked')]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for ext,mime,fmt,query,mode,size,limit,expected in CASES:
        f=BytesIO();Image.new('RGB',(32,24),'red').save(f,format=fmt);raw=f.getvalue()
        page=browser.new_page(viewport={'width':900,'height':700});page.set_default_timeout(5000);page.route('**/*',lambda route:route.fulfill(status=200,content_type=mime,body=raw));page.set_content(HTML)
        url='https://media.gifsnap.com/gifs/'+('giphy_7cT5ijGlGnFte' if mode=='original' else 'klipy_'+mode)+'.'+ext
        if mode.startswith('klipy-'):url='https://static.klipy.com/ii/fixture/1a/50/'+mode+'.'+ext
        if mode=='unknown-cdn':url='https://unapproved.example/a.webp'
        page.evaluate('''config=>{window.calls=[];const local=window.savedSettings={sgpProvider:'gifsnap',...(config.mode==='disabled'?{sgpWebpUpload:false,sgpOriginalLinkExperiment:false}:{}),sgpGifLinkLimitMB:config.limit,sgpAttachmentExceptions:[config.url]};window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});if(m.type==='SGP_INSPECT_GIF_LINK'){if(config.mode==='switch'&&!m.warm){document.querySelector('.friendsui-container').dataset.conversationId='other';}return setTimeout(()=>cb(config.size?{ok:true,mime:config.mode==='wrongmime'?'image/webp':'image/gif',size:config.size}:{ok:false}),40);}if(m.type==='SGP_PREPARE_WEBP')return cb(config.mode==='fail'?{ok:false,message:'动图下载失败。'}:{ok:true,mime:config.mime,data:config.data});const url=config.url;cb({ok:true,items:[{id:'gifsnap:'+url,title:'fixture',source:'gifsnap',sendUrl:url,directUrl:url,previewUrl:url}],count:1,hasMore:false})}}};}''',dict(ext=ext,mime=mime,data=base64.b64encode(raw).decode(),mode=mode,url=url,size=size,limit=limit))
        for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
        page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;','const HOST = "steamloopback.host";',1))
        base=page.locator('#steam-gif-picker-host');base.locator('#ball').click()
        if query:base.locator('#search').fill(query);page.wait_for_timeout(1250)
        card=base.locator('#track .card-main').first;expect(card).to_be_visible()
        if mode=='file':card.click(button='right');base.get_by_text('作为图片文件发送',exact=True).click()
        else:card.click()
        if expected=='link':
            page.wait_for_function('sent.length===1');assert page.evaluate('uploads')==[];assert page.evaluate('calls.filter(m=>m.type==="SGP_PREPARE_WEBP").length')==0
            assert page.evaluate('sent[0]')==('https://media.giphy.com/media/7cT5ijGlGnFte/giphy.gif' if mode=='original' else url)
        elif expected=='blocked':
            expect(base.locator('#loading')).to_contain_text('此媒体来源暂未支持');assert page.evaluate('sent')==[];assert page.evaluate('uploads')==[];assert page.evaluate('calls.filter(m=>m.type==="SGP_PREPARE_WEBP").length')==0
        elif expected=='fail':
            expect(base.locator('#loading')).to_contain_text('动图下载失败');assert page.evaluate('sent')==[];assert page.evaluate('uploads')==[]
        elif expected=='switch':
            expect(base.locator('#loading')).to_contain_text('聊天对象已变化');assert page.evaluate('sent')==[];assert page.evaluate('uploads')==[]
        else:
            page.wait_for_function('uploads.length===1 && confirmed===1',timeout=6500);assert page.evaluate('uploads')==[mime];assert page.evaluate('sent')==[]
            assert page.evaluate('calls.filter(m=>m.type==="SGP_PREPARE_WEBP").map(m=>m.url)')==[url]
        if mode=='original':assert page.evaluate('calls.filter(m=>m.type==="SGP_INSPECT_GIF_LINK").length')==0
        page.wait_for_timeout(80);assert page.evaluate('sent.length+uploads.length')==(0 if expected in ('fail','switch','blocked') else 1)
        print('PASS',ext,query or 'trending',mode,expected,flush=True);page.close()
    browser.close()
