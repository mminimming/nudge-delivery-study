'use strict';
const $ = id => document.getElementById(id), n = TaitoUI.num, esc = TaitoUI.escape;
let engine, scenario, evaluation, history = [], busy=false, bookingSession=crypto.randomUUID(),requestId=crypto.randomUUID();
function input() {
  const values = Object.fromEntries(new FormData($('labForm')));
  return { delivery: { destinationId:values.destinationId, buildingType:values.buildingType, elevator:values.elevator, receptionMethod:values.receptionMethod, availability:values.availability },
    parcel: { weightKg:Number(values.weightKg), litres:Number(values.litres) } };
}
function drawMap(option) {
  TaitoUI.map($('labMap'), engine.data, { destinationId:$('destination').value, routePointSequence:option?.routePointSequence,
    onPick:id => { $('destination').value=id; invalidate(); } });
  $('mapHelp').textContent=option?`차량 ${option.vehicle+1}의 전체 예정 경로(거점 → 기존·추가 주문 → 거점). 한 주문의 직행 경로가 아닙니다. 기존 배송 약속·도로 방향·적재·근무 제약 아래 거리와 작업시간을 줄이는 탐색 결과이며 최단 경로 보장은 아닙니다. · 현재 계획상 작업 시작(확정 시각 아님) ${TaitoDelivery.timeLabel(option.arrivalMinute)} · 거점 복귀 ${TaitoDelivery.timeLabel(option.returnMinute)}`:'보라색 점을 누르면 배송 위치를 바꿀 수 있습니다.';
}
function invalidate() {
  evaluation=null; $('results').innerHTML='<p class="small">입력이 변경되었습니다. 시간대를 다시 계산해주세요.</p>';
  $('resultNote').textContent='';$('calculationTime').textContent='';drawMap();
}
function updateStats() {
  const m=engine.metrics(scenario.routes,scenario.profile);
  $('baselineStats').innerHTML=`<div><span>현재 주문 수</span><strong>${scenario.routes.flat().length}건</strong></div><div><span>전체 운행거리</span><strong>${n(m.distanceKm,1)} km</strong></div><div><span>운전·배달 작업</span><strong>${n(m.activeMinutes,0)}분</strong></div>`;
  $('revision').textContent=`예약 ${scenario.bookings.length}건 추가 · 상태 v${scenario.revision}`;
  $('networkStamp').textContent=`OSM ${engine.data.snapshot_utc.slice(0,10)}`;
  $('bookingHistory').innerHTML=scenario.bookings.length?scenario.bookings.map(b=>`<li><strong>상태 ${b.beforeRevision} → ${b.beforeRevision+1}</strong> · ${esc(engine.points.find(p=>p.id===b.input.destinationId).name)} · ${b.time}<br>${n(b.parcel.weightKg,1)} kg / ${n(b.parcel.litres,1)} L 예약</li>`).join(''):'<li>아직 추가 예약이 없습니다.</li>';
}
async function calculate() {
  if(!$('labForm').reportValidity())return;
  if(busy)return;busy=true;$('calculate').disabled=true;
  const start=performance.now(), values=input();
  try {
    if(RoutingAPI.shared){const response=await RoutingAPI.quote(values.delivery,values.parcel,bookingSession,'green_label');scenario=response.scenario;evaluation=response.evaluation;}else{scenario=TaitoUI.readScenario(engine);evaluation=engine.evaluate(scenario,values.delivery,values.parcel);}updateStats();
    history.push({type:'evaluated',timestamp:new Date().toISOString(),evaluation});
    $('error').textContent='';
    $('calculationTime').textContent=`상태 v${scenario.revision}에서 계산 · ${Math.round(performance.now()-start)} ms`;
    $('results').innerHTML=evaluation.options.map(o=> {
      if(!o.feasible)return `<article class="slot-result unavailable"><span class="badge">예약 불가</span><h3>${o.time}</h3><p class="reason">${o.reason==='receiving_window'?'직접 수령 가능한 시간 밖입니다.':'현재 용량·근무·기존 시간 약속을 만족하는 삽입 경로가 없습니다.'}</p></article>`;
      return `<article class="slot-result ${o.isRecommended?'recommended':''}"><span class="badge">${o.isRecommended?'환경·작업시간 추천':o.isEarliest?'가장 빠른 가능 시간대':'시간 맡기기'}</span><h3>${o.time}</h3><p>${o.kind==='flexible'?'이 범위 안에서 후속 주문에 맞춰 차량·배송 순서를 재조정합니다.':'현재 예약을 지킬 수 있는 가장 빠른 2시간 구간입니다.'}</p><dl><dt>추가 운행</dt><dd>${n(o.additionalDistanceKm,2)} km</dd><dt>추가 CO₂</dt><dd>${n(o.additionalCO2Kg,2)} kg</dd><dt>추가 작업</dt><dd>${n(o.additionalActiveMinutes,1)}분</dd><dt>대기 포함 증가</dt><dd>${n(o.additionalWorkMinutes,1)}분</dd><dt>최대 개인시간</dt><dd>${n(o.maxDriverWorkMinutes,0)}분</dd></dl>${o.isRecommended?`<p class="saving">가장 빠른 시간대보다 CO₂ ${n(o.savedCO2VsEarliest,2)} kg · 작업 ${n(o.savedActiveVsEarliest,1)}분 절감 예상</p>`:''}<div class="actions"><button type="button" data-route="${o.id}">경로 보기</button><button type="button" class="primary" data-book="${o.id}">이 시간대로 예약 추가</button></div></article>`;
    }).join('');
    if(!evaluation.options.length)$('results').innerHTML='<p>현재 주문과 수령·용량·근무 제약을 만족하는 배송 구간이 없습니다. 입력을 변경해주세요.</p>';
    $('resultNote').textContent=evaluation.options.some(o=>o.isRecommended)?'추천은 계산 결과로 정합니다. 대기 포함 시간·최대 개인시간도 늘어나지 않는지 확인합니다.':'넓은 구간은 후속 주문을 재배치할 여유를 제공합니다. 현재 주문만으로 확인되지 않은 절감량은 표시하지 않습니다.';
    document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>drawMap(evaluation.options.find(o=>o.id===b.dataset.route)));
    document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>book(b.dataset.book));
    drawMap(evaluation.options.find(o=>o.isRecommended)||evaluation.options.find(o=>o.feasible));
  } catch(error){$('error').textContent=error.message;evaluation=null;$('results').innerHTML='<p>계산할 수 없습니다. 입력을 확인해주세요.</p>';}finally{busy=false;$('calculate').disabled=false}
}
async function book(slotId) {
  if(!evaluation||busy)return;busy=true;document.querySelectorAll('[data-book]').forEach(b=>b.disabled=true);
  try {
    const before=scenario;
    if(RoutingAPI.shared){const receipt=await RoutingAPI.commit(evaluation.quoteId,slotId,bookingSession,requestId);scenario=receipt.scenario;}else{scenario=engine.commit(TaitoUI.readScenario(engine),evaluation,slotId);TaitoUI.writeScenario(scenario);}bookingSession=crypto.randomUUID();requestId=crypto.randomUUID();
    history.push({type:'committed',timestamp:new Date().toISOString(),slotId,beforeRevision:before.revision,afterRevision:scenario.revision});
    updateStats();invalidate();$('results').innerHTML='<p>예약을 추가했습니다. 다음 주문의 위치·화물을 입력하고 다시 계산하세요.</p>';
  } catch(error){$('error').textContent=error.message;}finally{busy=false;document.querySelectorAll('[data-book]').forEach(b=>b.disabled=false)}
}
$('labForm').onsubmit=e=>{e.preventDefault();calculate()};
$('labForm').oninput=()=>{if(engine)invalidate()};
$('labForm').onchange=()=>{if(engine)invalidate()};
$('reset').onclick=()=>{if(RoutingAPI.shared)return;try{scenario=engine.baseline();TaitoUI.writeScenario(scenario);history.push({type:'reset',timestamp:new Date().toISOString(),scenarioId:scenario.id});$('error').textContent='';updateStats();calculate()}catch(error){$('error').textContent=error.message}};
$('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({modelVersion:TaitoDelivery.VERSION,scenario,history,network:{version:engine.data.version,sha256:engine.data.raw_sha256,snapshot:engine.data.snapshot_utc},exported_at:new Date().toISOString()},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='taito-routing-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
TaitoUI.load().then(async e=>{engine=e;scenario=RoutingAPI.shared?(await RoutingAPI.state()).scenario:TaitoUI.readScenario(e);$('destination').innerHTML=e.destinations.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');$('destination').value='asakusa-02';['calculate','reset','export'].forEach(id=>$(id).disabled=false);if(RoutingAPI.shared){$('reset').hidden=true;document.querySelector('a[href^="index.html"]').href='index.html?research=1&experiment='+RoutingAPI.experimentId;}updateStats();await calculate()}).catch(error=>{$('error').textContent='도로 자료를 불러오지 못했습니다. 로컬 서버로 열어주세요. '+error.message;$('results').textContent='데이터 로딩 실패';});
