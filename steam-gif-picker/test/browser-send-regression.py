"""Chromium integration tests against a synthetic Steam-like DOM, not live Steam.
Requires Python Playwright and a local Chromium installation. No network or credentials.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
URL = 'https://giphy.com/gifs/test-fixture'
STUB = '''window.chrome = {storage:{local:{get:(keys, cb)=>cb({giphyApiKey:'test-only',sgpSendMode:window.testMode}),set:(v,cb)=>cb?.()},onChanged:{addListener(){}}},runtime:{sendMessage:(msg,cb)=>cb({ok:true,items:[{id:'fixture',title:'Fixture GIF',sendUrl:'https://giphy.com/gifs/test-fixture',previewUrl:'https://giphy.com/test-preview.gif'}],hasMore:false})}};'''
HTML = '''<!doctype html><html><body><div class="friendsui-container" data-conversation-id="test-conversation"><div class="chatEntry"><form><textarea role="textbox" aria-label="聊天消息" style="width:400px;height:70px"></textarea><button type="submit" aria-label="发送消息">发送</button></form></div></div><script>
window.sent=[];window.events=[];const editor=document.querySelector('textarea');const button=document.querySelector('button');const form=document.querySelector('form');
function send(){window.sent.push(editor.value);editor.value='';}
form.addEventListener('submit',e=>{e.preventDefault();window.events.push('submit');if(window.testMode==='form'||window.testMode==='auto')send()});
button.addEventListener('click',e=>{window.events.push('click');send()});
editor.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.events.push('keydown');if(window.testMode==='enter')send()}});
</script></body></html>'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/lib/chromium/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for mode,expected in [('auto','click'),('enter','click'),('form','click')]:
        page=b.new_page(viewport={'width':900,'height':700}); errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
        page.route('**/*',lambda route:route.abort())
        page.evaluate(f'window.testMode={mode!r}')
        page.set_content(HTML)
        page.evaluate(STUB)
        page.add_script_tag(path=str(ROOT/'api-guide.js'));page.add_script_tag(path=str(ROOT/'network-ui.js'));page.add_script_tag(content=(ROOT/'content.js').read_text().replace('const HOST = location.hostname;', "const HOST = 'steamloopback.host'; // mock host only", 1))
        page.locator('textarea').evaluate("e=>e.value='draft preserved'")
        assert page.evaluate('document.activeElement.tagName') != 'TEXTAREA'
        page.locator('#steam-gif-picker-host #ball').click(timeout=5000)
        assert page.locator('#steam-gif-picker-host #ball').inner_text()=='GIF'
        assert page.locator('#steam-gif-picker-host #sendMode').count()==0
        card=page.locator('#steam-gif-picker-host #track .card-main').first
        card.wait_for(state='visible');page.wait_for_timeout(400)
        # Two closely spaced click handlers must not produce a second submission.
        card.click(); card.evaluate('(e)=>e.click()')
        page.wait_for_function('window.sent.length>0',timeout=3500);page.wait_for_timeout(900)
        assert page.evaluate('window.sent')==[URL], (mode,page.evaluate('window.sent'),errors)
        assert page.evaluate('window.events')==[expected], (mode,page.evaluate('window.events'))
        assert page.locator('textarea').input_value()=='draft preserved'
        assert not errors, errors
        print('PASS Chromium mock:',mode,'one message, single event, draft preserved, no manual focus')
        page.close()
    b.close()
