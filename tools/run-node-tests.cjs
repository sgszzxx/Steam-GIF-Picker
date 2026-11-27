const {readdirSync} = require('node:fs');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const root=join(__dirname,'..','steam-gif-picker');
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
for(const name of readdirSync(root).filter(x=>x.endsWith('.js')).sort())run(['--check',join(root,name)]);
for(const name of readdirSync(join(root,'test')).filter(x=>x.endsWith('.cjs')).sort())run([join(root,'test',name)]);
