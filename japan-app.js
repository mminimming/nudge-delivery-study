const SURVEY_VERSION = "3.1-JP-Taito-Flex";
const params = new URLSearchParams(location.search);
const participantId = params.get("pid") || sessionStorage.getItem("taitoParticipant") || `JP${Date.now().toString().slice(-8)}`;
sessionStorage.setItem("taitoParticipant", participantId);
const STORAGE_KEY = `nudgeTaitoSharedV1:${RoutingAPI.experimentId||"local"}:${participantId}`;
const requestedCondition = params.get("condition") || "default_green_combined";
const NUDGE_MODE = ["control","green_label","default_green_combined"].includes(requestedCondition) ? requestedCondition : "default_green_combined";
const initialState = { participant_id:participantId, session_id:crypto.randomUUID?.()||`S${Date.now()}`, assigned_condition:NUDGE_MODE, requested_condition:requestedCondition, survey_version:SURVEY_VERSION, started_at:new Date().toISOString(), current_step:1, cart:{}, delivery:null, option_exposures:[], exposure_history:[], selected_option:null, survey:null, events:[], routing_state:null, routing_evaluation:null, booking_after:null };
let state; try { state=JSON.parse(localStorage.getItem(STORAGE_KEY))||structuredClone(initialState) } catch { state=structuredClone(initialState) }
if(state.participant_id!==participantId || state.survey_version!==SURVEY_VERSION || state.assigned_condition!==NUDGE_MODE) state=structuredClone(initialState);
let routingEngine, ready;
const safe = TaitoUI.escape;
const number = TaitoUI.num;
const products=[
  {id:"detergent",name:"ナチュラル洗濯洗剤",price:680,unit:"1L",image:"assets/laundry-detergent.png",desc:"無香料・液体タイプ"},
  {id:"toothbrush",name:"デイリー歯ブラシ",price:498,unit:"4本入り",image:"assets/toothbrush-4pack.png",desc:"やわらか極細毛"},
  {id:"cable",name:"USB-C 充電ケーブル",price:899,unit:"1m",image:"assets/usb-c-cable.png",desc:"急速充電対応"},
  {id:"tissue",name:"トイレットペーパー",price:798,unit:"12ロール",image:"assets/toilet-paper-12roll.png",desc:"無香料・3枚重ね"}
];
const parcelAttributes = {detergent:{kg:1.1,litres:2},toothbrush:{kg:.15,litres:.5},cable:{kg:.1,litres:.4},tissue:{kg:1.4,litres:24}};
const parcel = () => entries().reduce((a,p)=>({weightKg:a.weightKg+parcelAttributes[p.id].kg*p.quantity,litres:a.litres+parcelAttributes[p.id].litres*p.quantity}),{weightKg:0,litres:0});
const yen=n=>`¥${n.toLocaleString("ja-JP")}`;
const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
const log=(name,data={})=>{state.events.push({event_name:name,timestamp:new Date().toISOString(),step:state.current_step,...data});save()};
const entries=()=>products.filter(p=>state.cart[p.id]).map(p=>({...p,quantity:state.cart[p.id]}));
const total=()=>entries().reduce((s,p)=>s+p.price*p.quantity,0);
const field=(name,label,options,required=true)=>`<label class="field-group"><span>${label} ${required?'<em>*</em>':'<small>任意</small>'}</span><select name="${name}" ${required?'required':''}><option value="">選択してください</option>${options.map(x=>`<option>${x}</option>`).join("")}</select></label>`;
const likert=(items)=>items.map(([name,text])=>`<fieldset class="likert-question"><p>${text} <em>*</em></p><div class="likert-scale">${[1,2,3,4,5].map(v=>`<label><input type="radio" name="${name}" value="${v}" required><span data-value="${v}">${v}</span></label>`).join("")}</div><div class="likert-labels"><span>まったくそう思わない</span><span>非常にそう思う</span></div></fieldset>`).join("");

document.body.innerHTML=`
<header class="site-header"><a class="brand" href="#"><span class="brand-mark">研</span><span>配送選択研究</span></a><div class="header-cart">カート <b id="headerCartCount">0</b></div><div class="secure-label">研究用の模擬注文 · 実際の決済はありません</div></header>
<main class="page-shell"><section class="progress-panel"><div class="progress-meta"><span id="progressLabel"></span><span id="progressCount"></span></div><div class="progress-track"><div id="progressBar" class="progress-bar"></div></div><ol class="progress-steps">${["商品選択","お届け先","配送日","注文確認","アンケート"].map((x,i)=>`<li data-progress-step="${i+1}">${x}</li>`).join("")}</ol></section>
<section id="step1" class="step"><div class="section-heading"><p class="eyebrow">ONLINE STORE</p><h1>商品を選んでください</h1><p>必要な商品をカートに入れ、レジに進んでください。</p></div><div class="shop-layout"><div id="productGrid" class="product-grid"></div><aside class="cart-panel"><h2>ショッピングカート <span id="cartCount">0</span></h2><div id="cartItems" class="cart-items"></div><div class="cart-total"><span>小計（税込）</span><strong id="cartTotal"></strong></div><p id="cartError" class="form-error"></p><button id="cartContinue" class="button checkout full-button">レジに進む</button></aside></div></section>
<section id="step2" class="step"><div class="section-heading"><p class="eyebrow">DELIVERY DETAILS</p><h1>お届け先と受取方法</h1><p>日本国内の配送先と、置き配などの受取方法を設定します。</p></div><form id="deliveryForm" class="form-card" novalidate><div class="privacy-note"><span>🔒</span><div><strong>個人情報について</strong><br>実在の氏名、部屋番号、オートロック番号は入力しないでください。</div></div><div class="form-grid"><label class="field-group"><span>郵便番号 <em>*</em></span><input name="postalCode" inputmode="numeric" pattern="[0-9]{3}-?[0-9]{4}" placeholder="123-4567" required></label>${field("prefecture","都道府県",["東京都","神奈川県","埼玉県","千葉県","大阪府","京都府","愛知県","福岡県","北海道","その他"])}<label class="field-group full-width"><span>市区町村・番地 <em>*</em></span><input name="addressLine" placeholder="例：文京区千駄木3-39-1" required></label><label class="field-group full-width"><span>建物名 <small>任意</small></span><input name="buildingName" placeholder="例：サンプルレジデンス"></label>${field("buildingType","住居タイプ",["戸建て","マンション・アパート","オフィス","その他"])}<fieldset class="field-group"><legend>エレベーター <span class="required">*</span></legend><div class="segmented">${["あり","なし","該当なし"].map(x=>`<label><input type="radio" name="elevator" value="${x}" required><span>${x}</span></label>`).join("")}</div></fieldset><fieldset class="field-group full-width"><legend>受取方法 <span class="required">*</span></legend><div class="reception-grid">${[["🚪","置き配（玄関）","玄関前にお届け"],["📦","宅配ボックス","非対面で受取"],["🤝","対面受取","手渡しで受取"],["🏪","コンビニ受取","指定店舗で受取"]].map(([i,n,d])=>`<label><input type="radio" name="receptionMethod" value="${n}" required><span>${i} <b>${n}</b><small>${d}</small></span></label>`).join("")}</div></fieldset><label class="field-group full-width"><span>配送指示 <small>任意</small></span><textarea name="specialCondition" rows="2" placeholder="暗証番号は入力しないでください"></textarea></label></div><p id="deliveryError" class="form-error"></p><div class="action-row"><button class="button secondary" type="button" data-back="1">カートに戻る</button><button class="button primary" type="submit">配送日を選ぶ →</button></div></form></section>
<section id="step3" class="step"><div class="section-heading"><p class="eyebrow">DELIVERY OPTIONS</p><h1>お届け日時を選んでください</h1><p>配送のまとめやすさ、環境負荷、配送員の作業負担を比較できます。</p></div><div id="dynamicNotice" class="dynamic-notice"></div><div id="deliveryOptions" class="delivery-options"></div><p id="optionError" class="form-error"></p><div class="action-row"><button class="button secondary" data-back="2">お届け先を変更</button><button id="optionContinue" class="button primary">この配送日時にする →</button></div></section>
<section id="step4" class="step"><div class="section-heading"><p class="eyebrow">ORDER REVIEW</p><h1>注文内容を確認</h1><p>この操作で実際の注文や決済は発生しません。</p></div><div class="checkout-layout"><div><div class="review-card"><h2>お届け先・商品</h2><div id="cartSummary" class="mini-cart"></div><dl id="deliverySummary"></dl></div><div class="review-card"><h2>お届け予定</h2><div id="optionSummary"></div></div></div><aside class="order-total"><button id="confirmOrder" class="button checkout full-button">模擬注文を確定する</button><p>実際の請求は行われません。</p><div id="reviewTotal"></div></aside></div><div class="action-row"><button class="button secondary" data-back="3">配送日時を変更</button></div></section>
<section id="step5" class="step"><div class="section-heading"><p class="eyebrow">POST-SURVEY</p><h1>配送選択についてお聞かせください</h1></div><form id="surveyForm" novalidate><article class="survey-section"><span class="section-number">01</span><h2>選択理由</h2><fieldset class="question"><legend>最も重視した理由 <em>*</em></legend><div class="radio-list" id="reasonChoices"></div></fieldset><div id="influenceQuestions"></div></article><article class="survey-section"><span class="section-number">02</span><h2>情報の認識</h2><div id="perceptionQuestions"></div></article><article class="survey-section"><span class="section-number">03</span><h2>態度・意識</h2><div id="attitudeQuestions"></div></article><article class="survey-section"><span class="section-number">04</span><h2>回答者属性</h2><div id="demographicQuestions" class="form-grid"></div></article><article class="survey-section"><span class="section-number">05</span><h2>自由回答</h2><textarea name="openFeedback" rows="4" placeholder="ご意見があればお聞かせください"></textarea></article><p id="surveyError" class="form-error"></p><div class="action-row"><button class="button secondary" id="surveyBack" type="button">注文内容に戻る</button><button class="button primary" type="submit">アンケートを送信 →</button></div></form></section>
<section id="step6" class="step complete-panel"><div class="complete-icon">✓</div><p class="eyebrow">COMPLETE</p><h1>ご参加ありがとうございました</h1><p id="submissionMessage">模擬注文と回答を保存しました。</p><div id="submissionStatus" class="submission-status"></div><div class="participant-ticket"><span>参加者ID</span><strong id="completeParticipantId"></strong></div><div class="complete-actions"><button id="nextOrder" class="button primary">次の模擬注文へ（予約を引き継ぐ）</button><button id="downloadJson" class="button secondary">JSON</button><button id="downloadCsv" class="button secondary">CSV</button></div><button id="restartStudy" class="text-button danger">テストデータを削除して最初から</button></section></main><footer><span>日本の配送選択行動研究プロトタイプ</span><span>Survey version ${SURVEY_VERSION}</span></footer>`;
document.querySelector('#step2 .section-heading h1').textContent='台東区のお届け先と受取方法';
document.querySelector('#step2 .section-heading p:not(.eyebrow)').textContent='地図上の配送地点を選ぶと、その場所と荷物に合う翌日の配送枠を計算します。';
deliveryForm.innerHTML=`<div class="model-note"><strong>実際の街を使った配送シミュレーション</strong><br>台東区の道路と建物位置を使用します。注文・車両・交通条件は研究用の想定です。実際のお届け先や個人情報の入力は不要です。</div>
<div class="location-layout"><div class="location-fields"><label class="field-group"><span>配送地点 <em>*</em></span><select name="destinationId" id="destinationSelect" required><option value="">道路データを読み込み中…</option></select></label><p class="availability-hint">地図の紫色の点からも選択できます。各地点は実際の建物位置を使った仮想の注文先です。</p><div class="parcel-readout" id="parcelReadout"></div><div class="parcel-readout"><strong>出発拠点：元浅草営業所</strong><br>台東区元浅草4丁目7-9<br>翌日配送・初期注文0件・確定した予約のみ反映・車両3台</div>
</div><div id="destinationMap" aria-live="polite"></div></div><div class="form-grid">
<label class="field-group"><span>住居タイプ <em>*</em></span><select name="buildingType" required><option value="">選択してください</option><option value="house">戸建て</option><option value="apartment">マンション・アパート</option><option value="office">オフィス</option></select></label>
<label class="field-group"><span>エレベーター <em>*</em></span><select name="elevator" required><option value="">選択してください</option><option value="yes">あり</option><option value="no">なし</option><option value="na">該当なし</option></select></label>
<label class="field-group"><span>受取方法 <em>*</em></span><select name="receptionMethod" required><option value="">選択してください</option><option value="doorstep">置き配（玄関）</option><option value="locker">宅配ボックス</option><option value="handover">対面受取</option></select></label>
<label class="field-group"><span>対面で受け取れる時間 <em>*</em></span><select name="availability" required><option value="all">10:00–22:00</option><option value="morning">10:00–12:00のみ</option><option value="afternoon">12:00–22:00</option><option value="late">16:00–22:00</option></select><small class="availability-hint">置き配・宅配ボックスでは在宅時間による制限はありません。</small></label></div>
<p id="deliveryError" class="form-error" role="alert"></p><div class="action-row"><button class="button secondary" type="button" data-back="1">カートに戻る</button><button id="calculateDelivery" class="button primary" type="submit" disabled>配送枠を計算する →</button></div>`;
deliveryOptions.classList.add('taito-cards');
document.querySelector('#step3 .section-heading p:not(.eyebrow)').textContent='この注文を追加したときに増える走行CO₂と作業時間を比較できます。';
deliveryOptions.insertAdjacentHTML('afterend','<details class="calculation-details"><summary>計算について</summary><p>表示値は実際の道路経路に研究用の注文・車両・交通条件を組み合わせた推定です。作業時間は運転と配達の合計です。待機を含む拘束時間も計算し、既存の時間指定・車両容量・休憩を守れる枠だけを選択できます。走行CO₂はガソリン消費に由来するCO₂で、電力・倉庫・再配達などは含みません。</p></details><div id="selectedRouteMap" class="route-preview"></div>');
if(params.has('research')) document.querySelector('footer').insertAdjacentHTML('beforeend','<a class="research-link" href="routing-lab.html">연구자 계산실</a>');
function invalidateCalculation(){state.selected_option=null;state.routing_evaluation=null;state.option_exposures=[];state.booking_after=null;delete state.order_confirmed_at;save()}
function refreshDestinationMap(){if(routingEngine)TaitoUI.map(destinationMap,routingEngine.data,{destinationId:destinationSelect.value,onPick:id=>{destinationSelect.value=id;destinationSelect.dispatchEvent(new Event('change',{bubbles:true}))}})}
function updateParcel(){const p=parcel();parcelReadout.textContent=`荷物の想定：${number(p.weightKg,2)} kg · ${number(p.litres,1)} L（商品数量から計算）`}
deliveryForm.addEventListener('change',e=>{invalidateCalculation();if(e.target.name==='destinationId')refreshDestinationMap();log('delivery_input_changed',{field:e.target.name,value:e.target.value})});

function showStep(n){state.current_step=n;save();document.querySelectorAll(".step").forEach((x,i)=>x.classList.toggle("active",i===n-1));const labels=["商品選択","お届け先","配送日","注文確認","アンケート"];
 const v=Math.min(n,5);document.getElementById("progressLabel").textContent=n===6?"完了":labels[v-1];document.getElementById("progressCount").textContent=n===6?"完了":`${v} / 5`;document.getElementById("progressBar").style.width=`${n===6?100:v*20}%`;document.querySelectorAll("[data-progress-step]").forEach(x=>x.classList.toggle("active",+x.dataset.progressStep<=v));document.querySelector(".progress-panel").hidden=n===6;log("page_viewed",{page:n});scrollTo({top:0,behavior:"smooth"})}
function renderProducts(){productGrid.innerHTML=products.map(p=>`<article class="product-card"><div class="product-image">${p.image?`<img src="${p.image}" alt="${p.name}">`:p.icon}</div><p class="stock">在庫あり</p><h3>${p.name}</h3><div class="product-meta">${p.desc} · ${p.unit}</div><div class="product-bottom"><span class="product-price">${yen(p.price)}</span><button class="add-product" data-add="${p.id}">カートに入れる</button></div></article>`).join("");document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>changeCart(b.dataset.add,1));renderCart()}
function changeCart(id,d){invalidateCalculation();state.cart[id]=Math.max(0,(state.cart[id]||0)+d);if(!state.cart[id])delete state.cart[id];save();renderCart();updateParcel();log(d>0?"add_to_cart":"remove_from_cart",{product_id:id})}
function renderCart(){const items=entries(),count=items.reduce((s,x)=>s+x.quantity,0);cartCount.textContent=count;headerCartCount.textContent=count;cartTotal.textContent=yen(total());cartItems.innerHTML=items.length?items.map(x=>`<div class="cart-item"><strong>${x.name}</strong><span>${yen(x.price*x.quantity)}</span><div class="quantity-control"><button data-minus="${x.id}">−</button><span>${x.quantity}</span><button data-plus="${x.id}">+</button></div></div>`).join(""):`<p class="empty-cart">カートは空です。</p>`;document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeCart(b.dataset.minus,-1));document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeCart(b.dataset.plus,1))}
function formData(form){return Object.fromEntries(new FormData(form))}
async function calculateOptions(){
  const d=state.delivery;
  if(!routingEngine)throw Error('道路データを読み込めませんでした。');
  let result,deliveryDate;
  if(RoutingAPI.shared){
    const response=await RoutingAPI.quote(d,parcel(),state.session_id,NUDGE_MODE);
    state.routing_state=response.scenario;result=response.evaluation;deliveryDate=response.deliveryDate;
  }else{state.routing_state=TaitoUI.readScenario(routingEngine);result=routingEngine.evaluate(state.routing_state,d,parcel());}

  state.routing_evaluation=result;
  const localDate=new Date(state.started_at).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
  const date=new Date(`${deliveryDate||localDate}T12:00:00+09:00`);if(!deliveryDate)date.setUTCDate(date.getUTCDate()+1);
  const dateLabel=new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(date);
  state.option_exposures=result.options.map(o=>({...o,date:dateLabel,nudge_mode:NUDGE_MODE,is_recommended:o.isRecommended,is_earliest:o.isEarliest,
    displayed_nudge:NUDGE_MODE!=='control'&&o.kind==='flexible'?'まとめて配送に協力':null,nudge_presentation:'label-v1',co2_kg:o.additionalCO2Kg??null,route_distance_km:o.additionalDistanceKm??null,
    courier_additional_active_minutes:o.additionalActiveMinutes??null,routing_method:result.method,calculation_model_version:result.modelVersion}));
  state.delivery={...d,destination:routingEngine.points.find(p=>p.id===d.destinationId),parcel:parcel(),routing_metadata:{model:result.modelVersion,network:result.networkVersion,network_sha256:result.networkSha256,scenario:result.scenarioId,revision:result.revision,assumptions:result.assumptions},baseline_routing_state:state.routing_state};
  state.exposure_history.push({exposed_at:new Date().toISOString(),input:structuredClone(state.delivery),options:structuredClone(state.option_exposures),baseline:result.baseline});
  log('delivery_options_calculated',{model_version:result.modelVersion,scenario_id:result.scenarioId,revision:result.revision,input:result.input,parcel:result.parcel,options:state.option_exposures,baseline:result.baseline});
  return state.option_exposures;
}
async function renderOptions(recalculate=false){
  const opts=recalculate||!state.routing_evaluation?await calculateOptions():state.option_exposures;
  opts.forEach(o=>{o.displayed_nudge=NUDGE_MODE!=='control'&&o.kind==='flexible'?'まとめて配送に協力':null;o.nudge_presentation='label-v1'});
  if(state.selected_option)state.selected_option=opts.find(o=>o.id===state.selected_option.id)||null;
  if(!state.selected_option&&NUDGE_MODE==='default_green_combined'){
    const best=opts.find(o=>o.feasible&&o.isRecommended);
    if(best){state.selected_option=best;log('delivery_option_defaulted',{delivery_option_id:best.id,nudge_mode:NUDGE_MODE})}
  }
  save();
  const place=routingEngine.points.find(p=>p.id===state.delivery.destinationId);
  dynamicNotice.innerHTML=`<strong>${safe(place.name)}</strong> への翌日の配送候補です。<small>追加走行距離・走行CO₂・運転と配達の追加時間を、既存の配送計画と比較しています。</small>`;
  deliveryOptions.innerHTML=opts.map(o=>{
    if(!o.feasible)return `<article class="delivery-card unavailable-slot"><span class="option-tag">選択できません</span><h3>翌日 ${safe(o.date)}</h3><h4>${o.time}</h4><p class="unavailable-reason">${o.reason==='receiving_window'?'指定した対面受取時間の範囲外です。':'既存の予約・荷物容量・勤務時間を守れる経路が見つかりません。'}</p></article>`;
    const recommended=o.kind==='flexible'&&NUDGE_MODE!=='control',selected=state.selected_option?.id===o.id;
    return `<label class="delivery-card ${selected?'selected':''} ${recommended?'recommended-slot':''}"><input type="radio" name="deliveryOption" value="${o.id}" ${selected?'checked':''}>
      <span class="option-tag ${recommended?'green-label':''}">${recommended?'まとめて配送に協力':o.isEarliest?'最も早い配送枠':'時間おまかせ配送'}</span>
      <h3>翌日 ${safe(o.date)}</h3><h4>${o.time}</h4><p>${o.kind==='flexible'?'この時間内でお届けします。':'現在の予約状況で最も早くお届けできる2時間枠です。'}</p><div class="fee">配送料 無料</div>
      <div class="metric-list"><div><span>追加の走行距離</span><b>${number(o.additionalDistanceKm,2)} km</b></div><div><span>追加の走行CO₂</span><b>${number(o.additionalCO2Kg,2)} kg</b></div><div><span>運転・配達の追加時間</span><b>${number(o.additionalActiveMinutes,1)} 分</b></div></div>
      </label>`;
  }).join('');
  optionError.textContent=opts.some(o=>o.feasible)?'':'選択できる配送枠がありません。荷物数量または受取条件を変更してください。';
  optionContinue.disabled=!opts.some(o=>o.feasible);
  document.querySelectorAll('[name=deliveryOption]').forEach(x=>x.onchange=()=>{
    state.selected_option=state.option_exposures.find(o=>o.id===x.value);state.booking_after=null;delete state.order_confirmed_at;save();
    document.querySelectorAll('.delivery-card').forEach(c=>c.classList.toggle('selected',c.contains(x)));
    optionError.textContent='';drawSelectedRoute();log('delivery_option_clicked',{delivery_option_id:x.value,nudge_mode:NUDGE_MODE});
  });
  drawSelectedRoute();
}
function drawSelectedRoute(){
  selectedRouteMap.innerHTML='';

}
function renderReview(){
  cartSummary.innerHTML=entries().map(x=>`<div>${safe(x.name)} × ${x.quantity} · ${yen(x.price*x.quantity)}</div>`).join('')+`<strong>商品小計 ${yen(total())}</strong>`;
  const d=state.delivery,labels={house:'戸建て',apartment:'マンション・アパート',office:'オフィス',doorstep:'置き配（玄関）',locker:'宅配ボックス',handover:'対面受取'};
  deliverySummary.innerHTML=[['配送地点',d.destination.name],['住居',labels[d.buildingType]],['受取方法',labels[d.receptionMethod]],['荷物',`${number(d.parcel.weightKg,2)} kg · ${number(d.parcel.litres,1)} L`]].map(([a,b])=>`<dt>${a}</dt><dd>${safe(b)}</dd>`).join('');
  const o=state.selected_option;
  optionSummary.innerHTML=`<div class="summary-option"><span class="option-tag">選択済み</span><h3>翌日 ${safe(o.date)} ${o.time}</h3><p>配送料 ${yen(o.fee)} · 追加走行CO₂ ${number(o.additionalCO2Kg,2)} kg</p><p>運転・配達の追加時間 ${number(o.additionalActiveMinutes,1)} 分</p>${o.displayed_nudge?`<span class="option-tag green-label">${safe(o.displayed_nudge)}</span>`:''}</div>`;
  reviewTotal.innerHTML=`<span>商品の小計</span><b>${yen(total())}</b><span>配送料</span><b>${yen(o.fee)}</b><strong>ご請求額</strong><strong>${yen(total()+o.fee)}</strong>`;
}
function renderSurvey(){reasonChoices.innerHTML=["配送日時の便利さ","配送料","環境情報","配送員の負担","おすすめ表示","普段の習慣","その他"].map(x=>`<label><input type="radio" name="choice_reason" value="${x}" required><span>${x}</span></label>`).join("");influenceQuestions.innerHTML=likert([["time_influence","配送日時の便利さが選択に影響した"],["co2_influence","CO₂情報が選択に影響した"],["nudge_influence","おすすめ表示が選択に影響した"]]);perceptionQuestions.innerHTML=likert([["information_comprehension","提示情報は理解しやすかった"],["information_trust","提示情報は信頼できると感じた"]]);attitudeQuestions.innerHTML=likert([["environmental_attitude","環境問題に関心がある"],["green_delivery_intention","可能であれば環境負荷の少ない配送を選びたい"],["courier_welfare_attitude","配送員の労働環境を重視する"]]);demographicQuestions.innerHTML=field("age_group","年齢層",["18–29歳", "30–39歳","40–49歳","50–59歳","60歳以上","回答しない"])+field("gender","性別",["女性","男性","ノンバイナリー・その他","回答しない"],false)+field("online_shopping_frequency","オンライン購買頻度",["ほとんど利用しない","月1–2回","週1回","週2–3回","週4回以上"])}
async function submitRemote(){if(['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname)){submissionStatus.textContent='ローカル確認用として保存しました。外部データベースには送信していません。';return}const c=window.NUDGE_STUDY_CONFIG||{};if(!c.supabaseUrl||!c.supabasePublishableKey){submissionStatus.textContent="オンライン送信先が未設定のため、このブラウザに保存しました。";return}try{const res=await fetch(`${c.supabaseUrl.replace(/\/$/,"")}/rest/v1/study_submissions`,{method:"POST",headers:{apikey:c.supabasePublishableKey,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({participant_id:state.participant_id,session_id:state.session_id,assigned_condition:state.assigned_condition,selected_option_id:state.selected_option?.id,survey_version:SURVEY_VERSION,cart_items:entries(),delivery_information:state.delivery,option_exposures:state.option_exposures,selected_option:state.selected_option,survey_responses:state.survey,event_log:state.events,client_started_at:state.started_at,client_submitted_at:state.submitted_at})});if(!res.ok)throw Error(res.status);submissionStatus.textContent="回答を研究データベースに送信しました。"}catch{submissionStatus.textContent="オンライン送信に失敗しました。JSONまたはCSVを保存してください。"}}
cartContinue.onclick=()=>{if(!entries().length){cartError.textContent='商品を1点以上選んでください。';return}updateParcel();showStep(2)};
deliveryForm.onsubmit=async e=>{
  e.preventDefault();if(!e.currentTarget.checkValidity()){e.currentTarget.reportValidity();deliveryError.textContent='必須項目を入力してください。';return}
  calculateDelivery.disabled=true;calculateDelivery.textContent='配送枠を計算中…';deliveryError.textContent='';
  try{await ready;state.delivery=formData(deliveryForm);invalidateCalculation();await renderOptions(true);showStep(3)}
  catch(error){deliveryError.textContent=`計算できませんでした。${error.message} ページを再読み込みしてください。`;log('calculation_failed',{message:error.message})}
  finally{calculateDelivery.disabled=false;calculateDelivery.textContent='配送枠を計算する →'}
};
optionContinue.onclick=()=>{if(!state.selected_option?.feasible){optionError.textContent='配送日時を選んでください。';return}renderReview();showStep(4)};
confirmOrder.onclick=async()=>{
  if(confirmOrder.disabled)return;
  confirmOrder.disabled=true;
  try{
    if(!state.booking_after){
      if(RoutingAPI.shared){
        state.booking_request_id ||= crypto.randomUUID();save();
        const receipt=await RoutingAPI.commit(state.routing_evaluation.quoteId,state.selected_option.id,state.session_id,state.booking_request_id);
        state.booking_receipt=receipt;state.booking_after=receipt.scenario;
      }else{state.booking_after=routingEngine.commit(TaitoUI.readScenario(routingEngine),state.routing_evaluation,state.selected_option.id);TaitoUI.writeScenario(state.booking_after);}
    }
    state.order_confirmed_at=new Date().toISOString();state.delivery.confirmed_routing_state=state.booking_after;
    state.delivery.booking_receipt=state.booking_receipt||null;
    log('booking_committed',{slot_id:state.selected_option.id,before_revision:state.routing_state.revision,after_revision:state.booking_after.revision});save();renderSurvey();showStep(5);
  }catch(error){
    if(error.recalculate){state.selected_option=null;state.routing_evaluation=null;try{await renderOptions(true)}catch(e){error=e}}
    showStep(3);optionError.textContent=error.message;
  }finally{confirmOrder.disabled=false}
};
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>{if(state.booking_after){alert('確定済みの予約は変更できません。次の模擬注文として進めてください。');return}showStep(+b.dataset.back)});surveyBack.onclick=()=>showStep(4);
surveyForm.onsubmit=async e=>{e.preventDefault();if(!e.currentTarget.checkValidity()){e.currentTarget.reportValidity();surveyError.textContent="必須項目に回答してください。";return}state.survey=formData(e.currentTarget);state.submitted_at=new Date().toISOString();save();completeParticipantId.textContent=participantId;showStep(6);await submitRemote()};
function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
nextOrder.onclick=()=>{const q=new URLSearchParams(location.search);q.set('pid',`JP${Date.now()}`);location.href=location.pathname+'?'+q};
downloadJson.onclick=()=>download(`${participantId}_jp-study.json`,JSON.stringify(state,null,2),"application/json");downloadCsv.onclick=()=>{const o=state.survey||{},k=Object.keys(o),esc=x=>`"${String(x??"").replaceAll('"','""')}"`;download(`${participantId}_jp-survey.csv`,`${k.map(esc)}\n${k.map(x=>esc(o[x]))}\n`,"text/csv;charset=utf-8")};restartStudy.onclick=()=>{if(confirm("テストデータを削除しますか？")){localStorage.removeItem(STORAGE_KEY);location.href=location.pathname}};
const resumeStep=state.current_step;
renderProducts();updateParcel();showStep(Math.min(resumeStep,2));
ready=TaitoUI.load().then(async engine=>{
  routingEngine=engine;
  destinationSelect.innerHTML='<option value="">配送地点を選択してください</option>'+engine.destinations.map(p=>`<option value="${p.id}">${safe(p.name)}</option>`).join('');
  if(state.delivery){['destinationId','buildingType','elevator','receptionMethod','availability'].forEach(k=>{const el=deliveryForm.elements.namedItem(k);if(el&&state.delivery[k])el.value=state.delivery[k]})}
  refreshDestinationMap();calculateDelivery.disabled=false;
  if(resumeStep>=3&&state.delivery)await renderOptions();if(resumeStep>=4&&state.selected_option)renderReview();if(resumeStep>=5)renderSurvey();
  if(state.survey)Object.entries(state.survey).forEach(([k,v])=>surveyForm.querySelectorAll(`[name="${k}"]`).forEach(el=>{if(el.type==='radio')el.checked=el.value===v;else el.value=v}));
  if(state.submitted_at){completeParticipantId.textContent=participantId;submissionStatus.textContent='保存済みの回答です。JSON・CSVをダウンロードできます。'}
  showStep(state.submitted_at?6:Math.min(resumeStep||1,5));return engine;
}).catch(error=>{deliveryError.textContent=error.message;calculateDelivery.disabled=true;showStep(2);throw error});
ready.catch(()=>{});
document.addEventListener('visibilitychange',()=>log(document.hidden?'tab_hidden':'tab_visible'));

if(RoutingAPI.shared){
 const status=document.createElement('p');status.className='availability-hint';status.textContent='共有実験の予約状況から計算します。';document.querySelector('.progress-panel').append(status);
 document.querySelectorAll('a[href*="routing-lab.html"]').forEach(a=>a.href='routing-lab.html?experiment='+encodeURIComponent(RoutingAPI.experimentId||''));
}
