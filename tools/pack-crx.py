"""Pack only runtime files using Chromium; private PEM must be provided separately."""
import argparse, shutil, subprocess, tempfile, sys
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
p=argparse.ArgumentParser();p.add_argument('--chrome',required=True);p.add_argument('--key',required=True);p.add_argument('--out',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]/'steam-gif-picker';key=Path(a.key).resolve(strict=True);out=Path(a.out).resolve()
assert not out.exists(),'Choose a new output filename';assert key.is_file();
files=['manifest.json','content.js','background.js','api-guide.js','network-ui.js','options.html','options.css','options.js',*[f'icons/icon{x}.png' for x in (16,32,48,128)]]
with tempfile.TemporaryDirectory() as tmp:
    t=Path(tmp);stage=t/'runtime';stage.mkdir()
    for f in files:
        dst=stage/f;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/f,dst)
    cmd=[a.chrome,f'--user-data-dir={t/"profile"}',f'--pack-extension={stage}',f'--pack-extension-key={key}']
    subprocess.run(cmd,check=True,timeout=90)
    pkg=t/'runtime.crx';assert pkg.is_file(),'Chromium did not generate CRX'
    spec=spec_from_file_location('verify_crx',Path(__file__).with_name('verify-crx.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
    eid=mod.verify(pkg,root);assert eid=='lokafhlmojloffehiebmdmakjmlgnlaa','Wrong signing key: would change release extension ID'
    out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(pkg,out)
print('Created',out)
