"""Real WebP files, Chromium still-image decoding with ImageDecoder disabled, Pillow verifies output; synthetic Steam composer."""
from pathlib import Path
from io import BytesIO
import os, base64, random
from PIL import Image, ImageDraw, ImageChops, ImageStat
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
CDN='https://media.gifsnap.com/gifs/'
def make_webp(animated, lossless=True):
    frames=[]
    for i in range(4 if animated else 1):
        im=Image.new('RGBA',(120,90),(0,0,0,0));d=ImageDraw.Draw(im)
        d.rectangle((5+i*12,8,45+i*12,70),fill=(250,240,220,255));d.ellipse((80,20,110,60),fill=(20,30,40,255));frames.append(im)
    f=BytesIO();frames[0].save(f,format='WEBP',save_all=animated,append_images=frames[1:],duration=[70,130,80,200] if animated else 100,loop=0,lossless=lossless);return f.getvalue()
HTML='''<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px">draft</textarea><button type="submit" aria-label="发送消息">发送</button></form></div><script>window.sent=[];window.uploads=[];window.confirmed=0;window.modalMode='popover';const e=document.querySelector('textarea');e.onpaste=ev=>{ev.preventDefault();const f=ev.clipboardData.files[0];uploads.push({type:f.type,name:f.name,size:f.size});if(modalMode!=='none'){const d=document.createElement('div');if(modalMode!=='popover')d.setAttribute('role','dialog');else d.className='fixture-attachment-popover';d.style.cssText='position:fixed;left:10px;top:200px;width:320px;height:120px;background:#ddd';d.innerHTML='<p>Upload image</p><span></span><button>Upload</button><button>Cancel</button>';if(modalMode==='popover')d.innerHTML='<span></span><button>上传</button><button>×</button><label><input type=checkbox>标记为剧透</label>';d.querySelector('span').textContent=['own','popover'].includes(modalMode)?f.name:'unrelated.png';d.querySelector('button').onclick=()=>{confirmed++;d.remove()};d.querySelectorAll('button')[1].onclick=()=>d.remove();document.body.append(d)}};document.querySelector('button').onclick=()=>{sent.push(e.value);e.value=''};document.querySelector('form').onsubmit=ev=>{ev.preventDefault();sent.push(e.value);e.value=''}</script>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':900,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/*',lambda route:route.fulfill(status=200,content_type='text/html',body=HTML));page.set_content(HTML)
    page.evaluate('''()=>{window.chrome={runtime:{onMessage:{addListener(f){window.bgHandler=f}}},storage:{local:{get:(k,cb)=>cb({sgpWebpUpload:false})}}};}''')
    page.add_script_tag(path=str(ROOT/'background.js'))
    # A noisy encoder fixture exercises all LZW dictionary widths and reset.
    encoded=page.evaluate('''()=>{const e=createGifEncoder(180,140);let s=1;const a=new Uint8Array(180*140*4);for(let i=0;i<a.length;i+=4){for(let j=0;j<3;j++){s=(Math.imul(s,1664525)+1013904223)>>>0;a[i+j]=s>>>24;}a[i+3]=255;}e.frame(a,10);e.frame(a,20);return Array.from(e.finish());}''')
    im=Image.open(BytesIO(bytes(encoded)));assert im.n_frames==2;im.seek(1);im.load();assert im.info['duration']==200
    # Objective color fidelity on a gradient-rich fixture, independently decoded by Pillow.
    quality=page.evaluate('''()=>{const w=320,h=180,a=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;a[i]=60+Math.round(x*145/(w-1));a[i+1]=25+Math.round(y*160/(h-1));a[i+2]=30+Math.round((x+y)*100/(w+h-2));a[i+3]=255;}const e=createGifEncoder(w,h);e.frame(a,10);return {src:Array.from(a),gif:Array.from(e.finish())};}''')
    original=Image.frombytes('RGBA',(320,180),bytes(quality['src'])).convert('RGB'); improved=Image.open(BytesIO(bytes(quality['gif']))).convert('RGB')
    old=Image.new('RGB',original.size);old.putdata([(round(r/51)*51,round(round(g*6/255)*255/6),round(b/51)*51) for r,g,b in original.getdata()]);err=lambda im:sum(ImageStat.Stat(ImageChops.difference(original,im)).mean)/3
    assert err(improved)<err(old)*0.65,(err(improved),err(old));print(f'PASS adaptive palette mean RGB absolute error {err(old):.2f} -> {err(improved):.2f} (synthetic gradient)')
    page.evaluate("Object.defineProperty(window, 'ImageDecoder', {value:undefined, configurable:true})")
    assert page.evaluate('typeof ImageDecoder === "undefined" && typeof createImageBitmap === "function"')
    outputs={}
    for fmt,mime,suffix in [('PNG','image/png','png'),('JPEG','image/jpeg','jpg'),('GIF','image/gif','gif')]:
        f=BytesIO();Image.new('RGB',(32,24),(124,41,211)).save(f,format=fmt);raw=f.getvalue()
        page.evaluate("b=>{window.fetch=async()=>new Response(Uint8Array.from(b),{headers:{'content-type':'application/octet-stream'}})}",list(raw))
        result=page.evaluate("url=>new Promise(r=>bgHandler({type:'SGP_PREPARE_WEBP',url},{},r))",CDN+'original.'+suffix)
        assert result['ok'] and result['mime']==mime and base64.b64decode(result['data'])==raw,result
        outputs[fmt]=result
    print('PASS original PNG, JPEG, GIF byte-for-byte passthrough')
    for kind in ['animated','static','lossy']:
        raw=make_webp(kind!='static',lossless=kind!='lossy')
        decoded=Image.open(BytesIO(raw)); frames=[]; durations=[]
        for i in range(getattr(decoded,'n_frames',1)):
            decoded.seek(i); rgba=decoded.convert('RGBA');frames.append(base64.b64encode(rgba.tobytes()).decode());durations.append(decoded.info.get('duration',100))
        page.evaluate('f=>window.fixture=f',{'w':decoded.width,'h':decoded.height,'frames':frames,'durations':durations})
        page.evaluate('''b=>{window.fetch=async()=>new Response(Uint8Array.from(b),{headers:{'content-type':'image/webp'}})}''',list(raw))
        result=page.evaluate('''url=>new Promise(r=>bgHandler({type:'SGP_PREPARE_WEBP',url},{},r))''',CDN+kind+'.webp')
        assert result.get('ok'),result
        im=Image.open(BytesIO(base64.b64decode(result['data'])))
        if kind!='static':
            assert im.format=='GIF' and im.n_frames==4,(im.format,im.n_frames)
            delays=[];frames=[]
            for i in range(im.n_frames):im.seek(i);delays.append(im.info['duration']);frames.append(im.convert('RGBA').tobytes())
            assert delays==[70,130,80,200],delays;assert len(set(frames))==4
            for i in range(4):
                im.seek(i); decoded.seek(i); a=im.convert('RGBA'); b=decoded.convert('RGBA');
                assert a.getchannel('A').tobytes()==b.getchannel('A').tobytes(), (kind,i,'alpha geometry')
        else:assert im.format=='PNG' and im.mode=='RGBA';assert im.getpixel((0,0))[3]==0
        outputs[kind]=result
        klipy=page.evaluate('''url=>new Promise(r=>bgHandler({type:'SGP_PREPARE_WEBP',url},{},r))''','https://static.klipy.com/ii/fixture/1a/50/'+kind+'.webp')
        assert klipy==result, (kind,'KLIPY real conversion differs')
        if kind!='static':
            signature=page.evaluate('''url=>fingerprintGifSnapPreview(url,new AbortController().signal)''',CDN+kind+'.webp');assert signature and len(signature['frames'])==3
    # The same missing API also affected v0.1.19's GIF visual dedup. Use real GIF frames.
    images=[]
    for i in range(4):
        im=Image.new('RGB',(120,90),'white');d=ImageDraw.Draw(im);d.rectangle((5+i*12,8,45+i*12,70),fill='black');images.append(im)
    f=BytesIO();images[0].save(f,format='GIF',save_all=True,append_images=images[1:],duration=[70,130,80,200],loop=0,disposal=1,optimize=True)
    page.evaluate("b=>{window.fetch=async()=>new Response(Uint8Array.from(b),{headers:{'content-type':'image/gif'}})}",list(f.getvalue()))
    signature=page.evaluate("url=>fingerprintGifSnapPreview(url,new AbortController().signal)",CDN+'frames.gif');assert signature and len(signature['frames'])==3 and signature['frames'][0]!=signature['frames'][2]
    print('PASS actual GIF visual signature without ImageDecoder, actual WebP visual signature')
    print('PASS actual WebP decode with ImageDecoder disabled, real Canvas, GIF frame durations and LZW dictionary, PNG transparency')
    print('PASS KLIPY CDN real WebP decode, identical output')
    rejected=page.evaluate('''url=>new Promise(r=>bgHandler({type:'SGP_PREPARE_WEBP',url},{},r))''','https://example.org/a.webp');assert not rejected['ok']
    page.evaluate('''outputs=>{window.outputs=outputs;window.local={sgpWebpUpload:false,sgpProvider:'gifsnap'};window.calls=[];window.fail=false;window.delay=30;window.itemUrl='https://media.gifsnap.com/gifs/animated.webp';window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{calls.push({...m});if(m.type==='SGP_PREPARE_WEBP'){setTimeout(()=>cb(fail?{ok:false,message:'fixture failure'}:(m.url.endsWith('.png')?outputs.PNG:m.url.endsWith('.jpg')?outputs.JPEG:m.url.endsWith('.gif')?outputs.GIF:outputs.animated)),delay);return;}const items=[{id:'gifsnap:test',title:'test',source:'gifsnap',sendUrl:itemUrl,directUrl:itemUrl,previewUrl:itemUrl}];cb({ok:true,items,count:1,hasMore:false});}}};}''',outputs)
    for name in ['api-guide.js','network-ui.js']:page.add_script_tag(path=str(ROOT/name))
    page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
    base=page.locator('#steam-gif-picker-host');ball=base.locator('#ball');card=base.locator('#track .card-main').first
    ball.wait_for(state='visible');ball.click();expect(card).to_be_visible();card.evaluate('e=>{e.click();e.click()}');page.wait_for_function('uploads.length===1');page.wait_for_function('confirmed===1');assert page.evaluate('calls.filter(x=>x.type==="SGP_PREPARE_WEBP").length')==1;assert page.evaluate('uploads[0].type')=='image/gif';assert page.evaluate('sent.length')==0;assert page.locator('textarea').input_value()=='draft';page.wait_for_timeout(900)
    # Unrelated fresh dialog must not be auto-confirmed even with an Upload control.
    ball.click();page.evaluate("modalMode='other'");card.click();page.wait_for_function('uploads.length===2');page.wait_for_timeout(4800);assert page.evaluate('confirmed')==1;page.evaluate("document.querySelector('[role=dialog]').remove();modalMode='own'");page.wait_for_timeout(900)
    # Switch conversation while preparation is in flight: must not hand off.
    ball.click();page.evaluate('delay=450');card.click();page.evaluate("document.querySelector('.friendsui-container').dataset.conversationId='other'");page.wait_for_timeout(750);assert page.evaluate('uploads.length')==2;assert page.evaluate('sent.length')==0
    # Failure: no attachment or link fallback.
    page.wait_for_timeout(700);page.evaluate('fail=true;delay=20');card.click();page.wait_for_timeout(300);assert page.evaluate('uploads.length')==2;assert page.evaluate('sent.length')==0;assert page.locator('textarea').input_value()=='draft';assert not errors,errors
    print('PASS screenshot-style popover without role or Cancel text auto-confirmed once; unrelated dialog ignored, draft intact, target switch cancels, failure never sends URL')
    browser.close()
