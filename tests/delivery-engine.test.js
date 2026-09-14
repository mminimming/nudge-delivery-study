const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../delivery-engine');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/taito-network.json')));
const engine = api.createEngine(data);
const baseline = engine.baseline();
const input = { destinationId:'asakusa-02', buildingType:'apartment', elevator:'yes', receptionMethod:'handover', availability:'all' };
const parcel = {weightKg:2,litres:12};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);

test('real OSM matrix has 49 reachable points, explicit provenance and asymmetric roads',()=>{
  assert.equal(data.points.length,49);assert.equal(engine.destinations.length,12);
  assert.match(data.raw_sha256,/^[a-f0-9]{64}$/);assert.ok(data.directed_edge_count>10000);
  assert.ok(data.node_via_restriction_count>0);
  let asymmetric=false;
  data.matrix.forEach((row,i)=>row.forEach((c,j)=>{assert.ok(Number.isFinite(c.base_minutes));assert.ok(c.distance_km>=0);if(Math.abs(c.distance_km-data.matrix[j][i].distance_km)>.05)asymmetric=true;}));
  assert.ok(asymmetric);
});
test('baseline is empty with three idle vehicles and zero operating cost',()=>{
  assert.deepEqual(baseline.orders,[]);assert.deepEqual(baseline.bookings,[]);assert.equal(baseline.routes.length,3);
  close(engine.metrics(baseline.routes,'normal').distanceKm,0);
  assert.equal(new Set(baseline.routes.flat().map(o=>o.id)).size,0);
  for(const route of baseline.routes){const r=engine.simulate(route);assert.ok(r.feasible);assert.ok(r.returnMinute<=engine.config.shiftEnd);assert.ok(route.reduce((s,o)=>s+o.weightKg,0)<=engine.config.capacityKg);
    if(route.length && r.returnMinute>engine.config.breakEnd)close(r.breakMinutes,30);
    for(const v of r.visits){const o=route.find(o=>o.id===v.id);assert.ok(v.serviceStart>=o.window[0]);assert.ok(v.departureMinute<=o.window[1]+1e-8);assert.ok(v.departureMinute<=750 || v.serviceStart>=780);}
    close(r.workMinutes,r.driveMinutes+r.serviceMinutes+r.waitMinutes);
  }
});
test('same state and inputs reproduce every result without mutation',()=>{
  const before=JSON.stringify(baseline),a=engine.evaluate(baseline,input,parcel),b=engine.evaluate(baseline,input,parcel);
  assert.deepEqual(a,b);assert.equal(JSON.stringify(baseline),before);
});
test('location changes routes and earliest vs green is computed, not a fixed slot',()=>{
  const a=engine.evaluate(baseline,input,parcel),b=engine.evaluate(baseline,{...input,destinationId:'ueno-02'},parcel);
  assert.notDeepEqual(a.options.map(o=>o.additionalDistanceKm),b.options.map(o=>o.additionalDistanceKm));
  assert.equal(a.options.find(o=>o.isEarliest).id,'earliest');
  assert.ok(!a.options.some(o=>o.isRecommended));
  close(a.options[0].additionalDistanceKm,a.options[1].additionalDistanceKm);
  assert.equal(a.options.find(o=>o.kind==='flexible').end,1320);
});
test('all destination recommendations reduce CO2 without worsening the three workload metrics',()=>{
  for(const p of engine.destinations){const result=engine.evaluate(baseline,{...input,destinationId:p.id},parcel),early=result.options.find(o=>o.isEarliest);
    for(const o of result.options.filter(o=>o.isRecommended)){
      assert.ok(o.additionalCO2Kg<early.additionalCO2Kg);assert.ok(o.additionalActiveMinutes<=early.additionalActiveMinutes+1e-8);
      assert.ok(o.additionalWorkMinutes<=early.additionalWorkMinutes+1e-8);assert.ok(o.maxDriverWorkMinutes<=early.maxDriverWorkMinutes+1e-8);
    }
  }
});
test('receiving availability removes slots, but unattended reception does not',()=>{
  const late={...input,availability:'late'};
  assert.deepEqual(engine.evaluate(baseline,late,parcel).options.filter(o=>o.feasible).map(o=>o.id),['earliest','flexible']);
  assert.equal(engine.evaluate(baseline,{...late,receptionMethod:'doorstep'},parcel).options.filter(o=>o.feasible).length,2);
});
test('infeasible weight or volume yields no options and no default recommendation',()=>{
  for(const p of [{weightKg:101,litres:12},{weightKg:2,litres:451}]){
    const r=engine.evaluate(baseline,input,p);assert.ok(r.options.every(o=>!o.feasible));assert.ok(!r.options.some(o=>o.isRecommended));
  }
});
test('larger parcels and stairs increase modeled service effort',()=>{
  const point=engine.points.find(p=>p.id===input.destinationId);
  const small=api.createEngine(data).serviceMinutes(input,parcel,point);
  assert.ok(engine.serviceMinutes(input,{weightKg:20,litres:50},point)>small);
  close(engine.serviceMinutes({...input,elevator:'no'},parcel,point)-small,2);
});
test('CO2 is the network delta, with exact unit conversion and no per-parcel average substitution',()=>{
  const r=engine.evaluate(baseline,input,parcel);
  for(const o of r.options.filter(o=>o.feasible)){
    close(o.additionalCO2Kg,o.additionalDistanceKm/10*2.32);
    close(o.additionalCO2Kg,o.totalCO2Kg-r.baseline.co2Kg);
    close(o.additionalWorkMinutes,o.totalWorkMinutes-r.baseline.workMinutes);
  }
});
test('time-dependent traversal remains FIFO at speed-period boundaries',()=>{
  for(const profile of Object.keys(api.traffic))for(const boundary of [540,660,960,1080])for(const base of [.1,5,40]){
    let previous=-Infinity;
    for(let t=boundary-10;t<=boundary+10;t+=.2){const arrival=t+api.travelMinutes(base,t,profile);assert.ok(arrival>=previous-1e-8);previous=arrival;}
  }
  assert.ok(api.travelMinutes(10,600,'congested')>api.travelMinutes(10,600,'normal'));
});
test('booking updates future state exactly once and preserves all previous commitments',()=>{
  const r=engine.evaluate(baseline,input,parcel),next=engine.commit(baseline,r,'flexible');
  assert.equal(next.revision,1);assert.equal(next.routes.flat().length,1);assert.equal(baseline.routes.flat().length,0);
  assert.throws(()=>engine.commit(next,r,'flexible'),/Stale/);
  for(const old of baseline.routes.flat())assert.deepEqual(next.routes.flat().find(o=>o.id===old.id).window,old.window);
  assert.deepEqual(next.routes.flat().find(o=>o.id==='booking-1').window,[600,1320]);
  assert.ok(engine.metrics(next.routes,next.profile).runs.every(r=>r.feasible));
  const later=engine.evaluate(next,input,parcel);assert.equal(later.revision,1);assert.notDeepEqual(later.baseline,r.baseline);
});
test('invalid locations, nonpositive loads and unavailable slots fail closed',()=>{
  assert.throws(()=>engine.evaluate(baseline,{...input,destinationId:'outside-tokyo'},parcel));
  assert.throws(()=>engine.evaluate(baseline,input,{weightKg:NaN,litres:2}));
  const r=engine.evaluate(baseline,{...input,availability:'late'},parcel);
  assert.throws(()=>engine.commit(baseline,r,'missing'),/unavailable/);
});
test('traffic scenarios and repeated bookings stay reproducible and feasible',()=>{
  let state=engine.baseline();
  assert.deepEqual(state,engine.baseline());
  for(let k=0;k<12;k++){
    const r=engine.evaluate(state,{...input,destinationId:engine.destinations[k].id},parcel),o=r.options.find(o=>o.isRecommended)||r.options.find(o=>o.feasible);
    assert.ok(o);state=engine.commit(state,r,o.id);
  }
  assert.equal(state.routes.flat().length,12);assert.ok(engine.metrics(state.routes,state.profile).runs.every(r=>r.feasible));
});

test('morning-only customer receives no duplicate broad window',()=>{
  const r=engine.evaluate(baseline,{...input,availability:'morning'},parcel);
  assert.equal(r.options.length,1);assert.equal(r.options[0].kind,'earliest');
});
test('flexible commitments can move while narrow promises survive and new options respond to load',()=>{
  let state=baseline, moved=false;
  for(let k=0;k<18;k++){
    const r=engine.evaluate(state,{...input,destinationId:engine.destinations[k%12].id},parcel);
    const option=r.options.find(o=>o.kind==='flexible')||r.options[0]; if(!option)break;
    const old=engine.metrics(state.routes,'normal').runs.flatMap(r=>r.visits);
    const next=engine.commit(state,r,option.id);
    const visits=engine.metrics(next.routes,'normal').runs.flatMap(r=>r.visits);
    if(old.some(v=>v.id.startsWith('booking')&&Math.abs(v.serviceStart-visits.find(w=>w.id===v.id).serviceStart)>.01))moved=true;
    for(const o of state.routes.flat())assert.deepEqual(next.routes.flat().find(n=>n.id===o.id).window,o.window);
    state=next;
  }
  assert.ok(moved,'at least one accepted flexible delivery must be rescheduled');
  assert.ok(state.revision>=12);
});
test('traffic is fixed to normal for scenario creation',()=>assert.throws(()=>engine.baseline('congested')));
test('a saturated early window moves the next earliest offer later',()=>{
  const e=api.createEngine(data,{vehicleCount:1,capacityKg:1000,capacityLitres:5000});
  let state={...baseline,routes:[[]],orders:[],bookings:[],revision:0};
  let shifted=false;
  for(let k=0;k<25;k++){
    const result=e.evaluate(state,input,parcel),early=result.options.find(o=>o.kind==='earliest');
    assert.ok(early);
    if(early.start>600){shifted=true;break;}
    state=e.commit(state,result,early.id);
  }
  assert.ok(shifted,'early slots cannot remain available after their time capacity fills');
});
