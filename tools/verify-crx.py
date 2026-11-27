"""Validate locally signed CRX3, signature, ID and runtime equality. pip install cryptography."""
from pathlib import Path
import argparse, hashlib, io, json, struct, zipfile
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

def fields(data):
    i=0
    def varint():
        nonlocal i
        val=shift=0
        while True:
            b=data[i]; i+=1; val|=(b&127)<<shift
            if not b&128:return val
            shift+=7
            if shift>63:raise ValueError('invalid varint')
    out={}
    while i<len(data):
        tag=varint();assert tag&7==2,'expected length-delimited field'
        n=varint();assert i+n<=len(data)
        out.setdefault(tag>>3,[]).append(data[i:i+n]);i+=n
    return out

def verify(crx, runtime=None):
    raw=Path(crx).read_bytes(); magic,ver,n=struct.unpack('<4sII',raw[:12]); assert (magic,ver)==(b'Cr24',3)
    head=fields(raw[12:12+n]); archive=raw[12+n:]; signed=head[10000][0]; cid=fields(signed)[1][0]; assert len(cid)==16
    proof=fields(head[2][0]); pub=proof[1][0]; sig=proof[2][0]; assert hashlib.sha256(pub).digest()[:16]==cid
    key=load_der_public_key(pub); payload=b'CRX3 SignedData\0'+struct.pack('<I',len(signed))+signed+archive
    key.verify(sig,payload,padding.PKCS1v15(),hashes.SHA256())
    eid=''.join(chr(ord('a')+int(x,16)) for x in cid.hex())
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        assert z.testzip() is None
        files={i.filename for i in z.infolist() if not i.is_dir()}; assert all(not x.endswith(('.pem','.md','.cjs','.py')) and not x.startswith('test/') for x in files)
        manifest=json.loads(z.read('manifest.json'))
        if runtime:
            p=Path(runtime)
            expected={'manifest.json','api-guide.js','network-ui.js','content.js','background.js','options.html','options.css','options.js',*[f'icons/icon{x}.png' for x in (16,32,48,128)]}
            assert files==expected,(files,expected)
            for f in files:assert z.read(f)==(p/f).read_bytes(),f
    print(f'PASS CRX3 RSA signature, ZIP integrity, manifest v{manifest["version"]}, extension ID {eid}, {len(files)} runtime files')
    return eid
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('crx');p.add_argument('--runtime');args=p.parse_args();verify(args.crx,args.runtime)
