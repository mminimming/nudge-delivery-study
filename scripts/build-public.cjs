const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const name of fs.readdirSync(root))if(/\.(html|css)$/.test(name)||['config.js','japan-app.js','delivery-engine.js','delivery-ui.js','routing-api.js','routing-lab.js'].includes(name))fs.copyFileSync(path.join(root,name),path.join(out,name));
for(const name of ['assets','docs'])fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true});
fs.mkdirSync(path.join(out,'data'),{recursive:true});fs.copyFileSync(path.join(root,'data/taito-network.json'),path.join(out,'data/taito-network.json'));
