const fs = require('node:fs');
const crypto = require('node:crypto');
const api = require('./delivery-engine');
const path = require('node:path');
const raw = Buffer.from(fs.readFileSync(path.join(__dirname, '../../data/taito-network.json'), 'utf8').trimEnd()+'\n');
const data = JSON.parse(raw);
const engine = api.createEngine(data, {vehicleCount:2, minimumActiveVehicles:2});
const OUT = __dirname;
fs.mkdirSync(OUT,{recursive:true});
const parcel = {weightKg:2,litres:12};
function random(seed) {let a=seed>>>0; return ()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296;};}
function input(id){return {destinationId:id,buildingType:'apartment',elevator:'yes',receptionMethod:'handover',availability:'all'};}
const rows=[];
for(const count of [24,48]) for(let seed=1;seed<=10;seed++){
  const rng=random(seed);
  const demand=Array.from({length:count},()=>engine.destinations[Math.floor(rng()*engine.destinations.length)].id);
  const policies={};
  for(const policy of ['earliest','flexible']){
    let state=engine.baseline(),accepted=0; const rejected=[];
    for(let i=0;i<demand.length;i++){
      const quote=engine.evaluate(state,input(demand[i]),parcel);
      const option=quote.options.find(o=>o.feasible&&o.kind===policy);
      if(!option){rejected.push(i);continue;}
      state=engine.commit(state,quote,option.id); accepted++;
      const active=state.routes.filter(r=>r.length).length;
      if(active!==Math.min(2,accepted)) throw Error('Fixed active fleet violated');
      const assigned=state.routes.flat();
      if(new Set(assigned.map(o=>o.id)).size!==accepted) throw Error('Order conservation violated');
      for(const route of state.routes){const check=engine.simulate(route);if(!check.feasible)throw Error('Infeasible route');}

    }
    const m=engine.metrics(state.routes,state.profile);
    policies[policy]={accepted,rejected,usedVehicles:state.routes.filter(r=>r.length).length,distanceKm:m.distanceKm,co2Kg:m.co2Kg,activeMinutes:m.activeMinutes,workMinutes:m.workMinutes,maxWorkMinutes:m.maxWorkMinutes,
      routes:state.routes.map((stops,v)=>({vehicle:v+1,stops,run:m.runs[v]}))};
  }
  const a=policies.earliest,b=policies.flexible;
  rows.push({seed,count,demand,policies,comparable:a.accepted===count&&b.accepted===count&&a.usedVehicles===2&&b.usedVehicles===2,
    savings:{distanceKm:a.distanceKm-b.distanceKm,co2Kg:a.co2Kg-b.co2Kg,activeMinutes:a.activeMinutes-b.activeMinutes,workMinutes:a.workMinutes-b.workMinutes,maxWorkMinutes:a.maxWorkMinutes-b.maxWorkMinutes}});
}
const summary=[24,48].map(count=>{
  const all=rows.filter(r=>r.count===count),valid=all.filter(r=>r.comparable);
  const mean=(fn)=>valid.length?valid.reduce((s,r)=>s+fn(r),0)/valid.length:null;
  return {count,sequences:all.length,comparable:valid.length,
    lowerDistance:valid.filter(r=>r.savings.distanceKm>1e-8).length,
    equalDistance:valid.filter(r=>Math.abs(r.savings.distanceKm)<=1e-8).length,
    higherDistance:valid.filter(r=>r.savings.distanceKm < -1e-8).length,
    meanEarliestKm:mean(r=>r.policies.earliest.distanceKm),meanFlexibleKm:mean(r=>r.policies.flexible.distanceKm),
    meanDistanceSavingPct:mean(r=>100*r.savings.distanceKm/r.policies.earliest.distanceKm),
    meanActiveSavingMinutes:mean(r=>r.savings.activeMinutes),meanWorkSavingMinutes:mean(r=>r.savings.workMinutes),
    workWorse:valid.filter(r=>r.savings.workMinutes < -1e-8).length,
    maxIndividualWorkWorse:valid.filter(r=>r.savings.maxWorkMinutes < -1e-8).length,
    meanEarliestMaxWorkMinutes:mean(r=>r.policies.earliest.maxWorkMinutes),meanFlexibleMaxWorkMinutes:mean(r=>r.policies.flexible.maxWorkMinutes),
    meanEarliestUsedVehicles:mean(r=>r.policies.earliest.usedVehicles),meanFlexibleUsedVehicles:mean(r=>r.policies.flexible.usedVehicles)};
});
const first=engine.evaluate(engine.baseline(),input(engine.destinations[0].id),parcel);
const result={modelVersion:api.VERSION,networkSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceRawSha256:data.raw_sha256,
  design:{seeds:[1,2,3,4,5,6,7,8,9,10],counts:[24,48],destinationSampling:'Uniform with replacement over 12 fixed OSM destination candidates',parcel,input:input('sample'),fleet:{availableVehicles:2,minimumActiveVehicles:2,assignment:'First two accepted bookings fill both routes; subsequent insertions and flexible relocations must preserve two nonempty routes. Identical constraint for both policies. No equal-workload or equal-order-count constraint.'},policies:'All earliest versus all flexible, same offered order sequence; policy-specific history; only compare complete service of identical demand',interpretation:'Computational pilot, synthetic orders, no participant or causal nudge effect, no calibrated real operations'},
  firstOrder:{earliestDistanceKm:first.options.find(o=>o.kind==='earliest').additionalDistanceKm,flexibleDistanceKm:first.options.find(o=>o.kind==='flexible').additionalDistanceKm},summary,rows};
fs.writeFileSync(OUT+'/results.json',JSON.stringify(result,null,2)+'\n');
const headers=['count','seed','comparable','earliest_km','flexible_km','saved_km','saved_active_minutes','saved_work_minutes','saved_max_individual_minutes'];
const csv=[headers.join(','),...rows.map(r=>[r.count,r.seed,r.comparable,r.policies.earliest.distanceKm,r.policies.flexible.distanceKm,r.savings.distanceKm,r.savings.activeMinutes,r.savings.workMinutes,r.savings.maxWorkMinutes].join(','))].join('\n')+'\n';
fs.writeFileSync(OUT+'/results.csv',csv);
console.log(JSON.stringify({firstOrder:result.firstOrder,summary},null,2));
