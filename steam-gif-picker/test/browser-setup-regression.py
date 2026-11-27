"""First-run settings display in a synthetic Steam chat. No real credentials."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML='<div class="friendsui-container" data-conversation-id="fixture"><form><textarea aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div>'
STUB='''window.local={sgpProvider:'giphy'};window.claims=0;window.chrome={storage:{local:{get:(k,cb)=>cb(local),set:(v,cb)=>{Object.assign(local,v);cb?.()}},onChanged:{addListener(){}}},runtime:{sendMessage:(m,cb)=>{if(m.type==='SGP_SETUP_CLAIM'){claims++;cb({ok:true,show:!local.sgpSetupShown});local.sgpSetupShown=true}else cb({ok:true})}}};'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for existing in [False,True]:
        page=b.new_page(viewport={'width':900,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',lambda route:route.abort());page.set_content(HTML);page.evaluate(STUB)
        if existing: page.evaluate("local.giphyApiKey='test-only'")
        page.add_script_tag(path=str(ROOT/'api-guide.js'));page.add_script_tag(path=str(ROOT/'network-ui.js'))
        page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;',"const HOST = 'steamloopback.host';",1))
        base=page.locator('#steam-gif-picker-host');base.locator('#ball').wait_for(state='visible');page.wait_for_timeout(600)
        assert base.locator('#settings').is_visible()!=existing
        assert page.evaluate('claims')==(0 if existing else 1)
        if not existing:
            base.locator('#closeBtn').click();page.wait_for_timeout(400);page.locator('textarea').focus();page.wait_for_timeout(500)
            assert page.evaluate('claims')==1 and not base.locator('#settings').is_visible()
        assert not errors,errors
        page.close()
    print('PASS onboarding automatically shows settings once; existing key skips setup')
    b.close()
