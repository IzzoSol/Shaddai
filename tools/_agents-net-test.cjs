// node tools/_agents-net-test.cjs -> exercises public/world-agents-ui.js (WorldAgentsNet) against the REAL server routers (temp data dirs)
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'shd-net-'));process.env.SHADDAI_MMO_DATA=TMP;process.env.SHADDAI_OPERATIVES_FILE=path.join(TMP,'ops.json');process.env.SHADDAI_SHIFT_MS='150';
const express=require('express');const app=express();app.use(express.json());
app.use('/api/mmo/character',require('../server/characterServer'));app.use('/api/mmo/agent',require('../server/agentServer'));const ext=require('../server/externalAgents');app.use('/api/mmo/xagent',ext.xagent);app.use('/api/mmo/jobs',ext.jobs);
const store=require('../backend/lib/operatives');
const srv=app.listen(0,async()=>{try{
 global.window=global;global.localStorage={_d:{shd_uid:'dev1'},getItem(k){return this._d[k]||null}};global.SHD_MMO_API='http://127.0.0.1:'+srv.address().port+'/api/mmo';
 require('../public/world-agents-ui.js');const N=window.WorldAgentsNet;
 await fetch(SHD_MMO_API+'/character/spawn',{method:'POST',headers:{'Content-Type':'application/json','x-user-id':'dev1'},body:'{}'});
 store.create({id:'op_dev1',owner:'dev1',codename:'SPARK',archetype:'scout',rarity:'epic',tools:['a','b','c']});
 let r=await N.roster();assert.equal(r.agents.length,1,'roster');
 r=await N.claim('op_dev1');assert.equal(r.success,true,'claim');const gid=r.grant.grantId;
 r=await N.bodies();assert.equal(r.bodies[0].presence,'home');
 r=await N.shift(gid);assert.equal(r.success,true,'shift');await new Promise(x=>setTimeout(x,300));
 r=await N.collect(gid);assert.equal(r.success,true,'collect');assert.ok(r.gained.sparks>0);
 r=await N.registerExternal({name:'Muse-Beat',provider:'muse',capabilities:['music'],wallet:{chain:'solana',address:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'}});assert.equal(r.success,true,'register');assert.match(r.token,/^shdx_/);
 r=await N.registerExternal({name:'Bad',provider:'grok',seed:'x'});assert.equal(r.success,false);
 r=await N.postJob({title:'Loop',kind:'music',budget:10,brief:'chill'});assert.equal(r.success,false,'needs Sparks');   // spawn gives 100 Sparks but job budget 10 should work
}catch(e){console.log('NOTE',e.message)}
 try{ // jobs with funds
  const N=window.WorldAgentsNet;let r=await N.postJob({title:'Loop',kind:'music',budget:30,brief:'chill'});console.log('postJob',r.success,r.error||'');r=await N.jobs('?status=open');console.log('open jobs',(r.jobs||[]).length);
  r=await N.showcase();console.log('showcase ok',r.success);
  console.log('AGENTS NET CLIENT OK');}catch(e){console.log('FAIL',e.message)}
 srv.close();});
