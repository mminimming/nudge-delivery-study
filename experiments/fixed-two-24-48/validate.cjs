const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const api=require('./delivery-engine');
const root=__dirname;
const raw=Buffer.from(fs.readFileSync(path.join(root,'../../data/taito-network.json'),'utf8').trimEnd()+'\n');
const network=JSON.parse(raw);
const r=JSON.parse(fs.readFileSync(path.join(root,'results.json')));
const provenance=JSON.parse(fs.readFileSync(path.join(root,'provenance.json')));
const e=api.createEngine(network,{vehicleCount:2,minimumActiveVehicles:2});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
assert.equal(hash(raw),r.networkSha256);
assert.equal(hash(raw),provenance.network_normalized_sha256);
assert.equal(hash(fs.readFileSync(path.join(root,'delivery-engine.js'))),provenance.engine_sha256);
assert.equal(r.modelVersion,api.VERSION);
assert.deepEqual(r.design.counts,[24,48]);
assert.equal(r.rows.length,20);
for(const row of r.rows){
  assert.ok(row.comparable);
  const short=r.rows.find(x=>x.count===24&&x.seed===row.seed);
  assert.deepEqual(row.demand.slice(0,24),short.demand);
  for(const policy of ['earliest','flexible']){
    const p=row.policies[policy];
    assert.equal(p.accepted,row.count);assert.deepEqual(p.rejected,[]);
    assert.equal(p.usedVehicles,2);assert.equal(p.routes.length,2);
    assert.ok(p.routes.every(x=>x.stops.length>0));
    const stops=p.routes.flatMap(x=>x.stops);
    assert.equal(new Set(stops.map(x=>x.id)).size,row.count);
    assert.deepEqual(stops.map(x=>network.points[x.point].id).sort(),[...row.demand].sort());
    const metrics=e.metrics(p.routes.map(x=>x.stops),'normal');
    for(const key of ['distanceKm','co2Kg','activeMinutes','workMinutes','maxWorkMinutes'])close(metrics[key],p[key]);
    let km=0;
    for(const route of p.routes){
      const seq=route.run.pointSequence;
      assert.deepEqual(seq,[0,...route.stops.map(x=>x.point),0]);
      const recomputed=e.simulate(route.stops);assert.ok(recomputed.feasible);
      assert.deepEqual(recomputed,route.run);
      km+=seq.slice(1).reduce((s,b,i)=>s+network.matrix[seq[i]][b].distance_km,0);
      for(let i=0;i<seq.length-2;i++)assert.equal(network.matrix[seq[i]][seq[i+1]].nodes.at(-1),network.matrix[seq[i+1]][seq[i+2]].nodes[0]);
    }
    close(km,p.distanceKm);
  }
  for(const key of ['distanceKm','co2Kg','activeMinutes','workMinutes','maxWorkMinutes'])close(row.savings[key],row.policies.earliest[key]-row.policies.flexible[key]);
}
for(const summary of r.summary){
  const rows=r.rows.filter(x=>x.count===summary.count);
  const mean=f=>rows.reduce((s,x)=>s+f(x),0)/rows.length;
  assert.equal(summary.comparable,10);
  close(summary.meanEarliestKm,mean(x=>x.policies.earliest.distanceKm));
  close(summary.meanFlexibleKm,mean(x=>x.policies.flexible.distanceKm));
  close(summary.meanWorkSavingMinutes,mean(x=>x.savings.workMinutes));
  close(summary.meanDistanceSavingPct,mean(x=>100*x.savings.distanceKm/x.policies.earliest.distanceKm));
}
const csv=fs.readFileSync(path.join(root,'results.csv'),'utf8').trim().split('\n');
assert.equal(csv.length,21);
console.log('PASS: 20 full-demand paired streams; two active vehicles; order identity, route geometry, capacities, delivery windows, shifts, summaries, and provenance.');
