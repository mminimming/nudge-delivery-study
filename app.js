const STORAGE_KEY = "nudgeDeliveryStudyV1_1";
const SURVEY_VERSION = "1.1";

const params = new URLSearchParams(location.search);
const participantId = params.get("pid") || `P${Date.now().toString().slice(-8)}`;
const sessionId = crypto.randomUUID ? crypto.randomUUID() : `S${Date.now()}`;

const initialState = {
  participant_id: participantId,
  session_id: sessionId,
  assigned_condition: params.get("condition") || "dynamic_information",
  survey_version: SURVEY_VERSION,
  started_at: new Date().toISOString(),
  current_step: 1,
  cart: {},
  delivery: null,
  option_exposures: [],
  selected_option: null,
  final_choice_id: null,
  survey: null,
  submitted_at: null,
  events: [],
};

let state = loadState();
state.cart ||= {};
let selectedOptionId = state.selected_option?.id || null;

const deliveryOptionsBase = [
  { id: "slot_morning", time: "09:00–12:00", label: "오전 배송", fee: 3000, density: 0.52 },
  { id: "slot_afternoon", time: "13:00–16:00", label: "오후 배송", fee: 1000, density: 0.82 },
  { id: "slot_evening", time: "18:00–21:00", label: "저녁 배송", fee: 3000, density: 0.67 },
];
const products = [
  { id:"detergent", name:"생활 세탁세제", price:4900, unit:"1L", icon:"🧴", description:"일상 세탁용 액체세제" },
  { id:"toothbrush", name:"데일리 칫솔 4입", price:3500, unit:"4개입", icon:"🪥", description:"부드러운 미세모 칫솔" },
  { id:"cable", name:"USB-C 충전선", price:5900, unit:"1m", icon:"🔌", description:"휴대기기용 기본 충전 케이블" },
  { id:"tissue", name:"두루마리 휴지", price:6900, unit:"12롤", icon:"🧻", description:"무향 3겹 화장지" },
];

const reasonOptions = ["배송 시간의 편리성", "배송 가격", "CO₂ 정보", "배송자 부담 정보", "추천·Nudge 메시지", "기존 배송 습관", "기타"];
const influenceItems = [
  ["time_convenience_influence", "배송 시간의 편리성이 선택에 영향을 미쳤다."],
  ["price_influence", "배송 가격이 선택에 영향을 미쳤다."],
  ["co2_influence", "CO₂ 정보가 선택에 영향을 미쳤다."],
  ["courier_burden_influence", "배송자 부담 정보가 선택에 영향을 미쳤다."],
  ["nudge_influence", "추천 또는 Nudge 메시지가 선택에 영향을 미쳤다."],
];
const perceptionItems = [
  ["co2_awareness", "배송 옵션별 CO₂ 정보가 제시되었다는 것을 인식했다."],
  ["courier_burden_awareness", "배송자 부담 정보가 제시되었다는 것을 인식했다."],
  ["information_comprehension", "제시된 정보를 이해하기 쉬웠다."],
  ["information_trust", "제시된 정보가 신뢰할 만하다고 느꼈다."],
  ["information_choice_effect", "제시된 정보가 실제 선택에 영향을 미쳤다."],
];
const attitudeItems = [
  ["environmental_attitude", "나는 환경문제에 관심이 있다."],
  ["green_delivery_intention", "가능하다면 친환경 배송을 선택할 의향이 있다."],
  ["willingness_to_pay", "친환경 배송을 위해 추가 비용을 지불할 의향이 있다."],
  ["delivery_speed_preference", "나는 배송 속도를 중요하게 생각한다."],
  ["time_accuracy_preference", "나는 배송 시간대의 정확성을 중요하게 생각한다."],
  ["courier_welfare_attitude", "나는 배송자의 노동환경을 중요하게 생각한다."],
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.participant_id === participantId) return saved;
  } catch (_) {}
  return structuredClone(initialState);
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function logEvent(event_name, metadata = {}) {
  state.events.push({ event_id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, participant_id: state.participant_id, session_id: state.session_id, event_name, timestamp: new Date().toISOString(), page: state.current_step, assigned_condition: state.assigned_condition, ...metadata });
  saveState();
}
function formObject(form) {
  const data = new FormData(form); const object = {};
  for (const [key, value] of data.entries()) object[key] = object[key] ? [].concat(object[key], value) : value;
  return object;
}
function showStep(number, shouldLog = true) {
  state.current_step = number; saveState();
  document.querySelectorAll(".step").forEach((el) => el.classList.toggle("active", Number(el.dataset.step) === number));
  const visibleStep = Math.min(number, 5);
  const labels = ["상품선택", "배송정보", "배송선택", "주문확인", "앙케이트"];
  document.getElementById("progressLabel").textContent = number === 6 ? "완료" : labels[visibleStep - 1];
  document.getElementById("progressCount").textContent = number === 6 ? "완료" : `${visibleStep} / 5`;
  document.getElementById("progressBar").style.width = `${number === 6 ? 100 : visibleStep * 20}%`;
  document.querySelectorAll("[data-progress-step]").forEach((el) => el.classList.toggle("active", Number(el.dataset.progressStep) <= visibleStep));
  document.querySelector(".progress-panel").hidden = number === 6;
  if (shouldLog) logEvent("page_viewed", { step: number });
  scrollTo({ top: 0, behavior: "smooth" });
}
function hydrateDeliveryForm() {
  if (!state.delivery) return;
  const form = document.getElementById("deliveryForm");
  Object.entries(state.delivery).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];
    form.querySelectorAll(`[name="${key}"]`).forEach((input) => {
      if (["radio", "checkbox"].includes(input.type)) input.checked = values.includes(input.value); else input.value = value;
    });
  });
}
function cartEntries(){return products.filter(p=>(state.cart[p.id]||0)>0).map(p=>({...p,quantity:state.cart[p.id]}))}
function renderProducts(){
  document.getElementById("productGrid").innerHTML=products.map(p=>`<article class="product-card"><div class="product-image" role="img" aria-label="${p.name}">${p.icon}</div><h3>${p.name}</h3><div class="product-meta">${p.description} · ${p.unit}</div><div class="product-bottom"><span class="product-price">${p.price.toLocaleString()}원</span><button class="add-product" type="button" data-add-product="${p.id}">담기 +</button></div></article>`).join("");
  document.querySelectorAll("[data-add-product]").forEach(b=>b.addEventListener("click",()=>changeCart(b.dataset.addProduct,1)));
  renderCart();
}
function changeCart(id,delta){state.cart[id]=Math.max(0,(state.cart[id]||0)+delta);if(!state.cart[id])delete state.cart[id];saveState();renderCart();logEvent(delta>0?"add_to_cart":"remove_from_cart",{product_id:id,quantity:state.cart[id]||0})}
function renderCart(){
  const items=cartEntries(),count=items.reduce((s,i)=>s+i.quantity,0),total=items.reduce((s,i)=>s+i.price*i.quantity,0);
  document.getElementById("cartCount").textContent=count;document.getElementById("cartTotal").textContent=`${total.toLocaleString()}원`;
  document.getElementById("cartItems").innerHTML=items.length?items.map(i=>`<div class="cart-item"><strong>${i.name}</strong><span>${(i.price*i.quantity).toLocaleString()}원</span><div class="quantity-control"><button type="button" data-cart-minus="${i.id}">−</button><span>${i.quantity}</span><button type="button" data-cart-plus="${i.id}">+</button></div></div>`).join(""):`<p class="empty-cart">상품을 하나 이상 담아주세요.</p>`;
  document.querySelectorAll("[data-cart-minus]").forEach(b=>b.addEventListener("click",()=>changeCart(b.dataset.cartMinus,-1)));document.querySelectorAll("[data-cart-plus]").forEach(b=>b.addEventListener("click",()=>changeCart(b.dataset.cartPlus,1)));
}
function addressHashDistance(address){let h=0;for(const ch of address)h=(h*31+ch.charCodeAt(0))>>>0;return 3.5+(h%900)/100}
function calculateOptions() {
  const d = state.delivery;
  const areaDistance=Math.max(2,addressHashDistance(d.roadAddress)*1.25);
  const buildingLoad = { "단독주택": 0.4, "공동주택": 0.8, "오피스텔": 0.7, "기타": 0.6 }[d.buildingType] || .6;
  const elevatorPenalty = d.elevator === "없음" ? 1.3 : d.elevator === "있음" ? .15 : .35;
  return deliveryOptionsBase.map((o) => {
    const consolidation = o.density;
    const co2 = Math.max(.28, areaDistance * .11 * (1.22 - consolidation * .55));
    const baseline = areaDistance * .11;
    const reduction = Math.max(0, baseline - co2);
    const burden = Math.min(5, Math.max(1, 1.2 + buildingLoad + elevatorPenalty + (o.time.startsWith("18") ? .65 : .2) - consolidation * .45));
    return { ...o, route_distance_km:+areaDistance.toFixed(1),coordinate_based:false,co2_kg: +co2.toFixed(2), co2_reduction_kg: +reduction.toFixed(2), co2_reduction_percent: +((reduction / baseline) * 100).toFixed(1), courier_burden_score: +burden.toFixed(1), calculation_model_version: "prototype-address-v3", calculated_at: new Date().toISOString() };
  });
}
function nudgeText(option, best) {
  if (option.id === best.id) return `주변 주문과 함께 배송할 가능성이 높아 CO₂를 약 ${Math.round(option.co2_reduction_percent)}% 줄이고 배송 동선을 효율화할 수 있습니다.`;
  if (option.courier_burden_score >= 3.5) return "이 시간대는 배송자의 예상 업무부담이 비교적 높습니다.";
  return `예상 CO₂ 배출량은 ${option.co2_kg.toFixed(2)}kg입니다.`;
}
function renderOptions() {
  const options = calculateOptions();
  const best = [...options].sort((a,b) => (a.co2_kg + a.courier_burden_score/5) - (b.co2_kg + b.courier_burden_score/5))[0];
  state.option_exposures = options.map(o => ({ ...o, displayed_nudge: nudgeText(o,best) })); saveState();
  const depotName=window.NUDGE_STUDY_CONFIG?.depotName||"임시 물류 거점";
  document.getElementById("dynamicNotice").innerHTML = `<strong>${state.delivery.roadAddress}</strong>와 ${depotName}을 기준으로 시간대별 후보 슬롯 ${options.length}개를 만들었습니다. <small>현재 거리·CO₂·부담 값은 연구 구조 확인용 prototype-address-v3 모의값이며 실제 도로 경로 또는 배차 결과가 아닙니다.</small>`;
  document.getElementById("deliveryOptions").innerHTML = options.map((o) => `<label class="delivery-card ${selectedOptionId===o.id?'selected':''}"><input type="radio" name="deliveryOption" value="${o.id}" ${selectedOptionId===o.id?'checked':''}><span class="option-tag">${o.id===best.id?'통합배송 가능성 높음':'3시간 배송'}</span><h3>${o.time}</h3><div class="fee">배송비 ${o.fee.toLocaleString()}원</div><div class="metric-list"><div><span>예상 경로거리</span><b>${o.route_distance_km.toFixed(1)} km</b></div><div><span>예상 CO₂</span><b>${o.co2_kg.toFixed(2)} kg</b></div><div><span>CO₂ 절감률</span><b>${o.co2_reduction_percent.toFixed(1)}%</b></div><div><span>배송자 부담</span><b>${o.courier_burden_score.toFixed(1)} / 5</b></div></div><div class="nudge-message">${nudgeText(o,best)}</div></label>`).join("");
  document.querySelectorAll("[name=deliveryOption]").forEach(input => input.addEventListener("change", () => { selectedOptionId=input.value; document.querySelectorAll(".delivery-card").forEach(c=>c.classList.toggle("selected",c.contains(input))); logEvent("delivery_option_clicked",{delivery_option_id:input.value}); }));
  options.forEach((o,index)=>logEvent("nudge_exposed",{delivery_option_id:o.id,display_order:index+1,displayed_nudge:nudgeText(o,best),calculated_metrics:o}));
}
function renderReview() {
  const d=state.delivery; const fields=[["배송주소",d.roadAddress],["건물 유형",d.buildingType],["엘리베이터",d.elevator],["희망 배송일",d.deliveryDate],["수령 방식",d.receptionMethod],["특별조건",d.specialCondition||"없음"]];
  document.getElementById("deliverySummary").innerHTML=fields.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join("");
  const items=cartEntries();document.getElementById("cartSummary").innerHTML=`${items.map(i=>`<div>${i.name} × ${i.quantity} · ${(i.price*i.quantity).toLocaleString()}원</div>`).join("")}<strong>총 ${items.reduce((s,i)=>s+i.price*i.quantity,0).toLocaleString()}원</strong>`;
  const o=state.selected_option;
  document.getElementById("optionSummary").innerHTML=`<div class="summary-option"><span class="option-tag">선택 완료</span><h3>${o.time}</h3><p>배송비 ${o.fee.toLocaleString()}원 · 예상 CO₂ ${o.co2_kg.toFixed(2)}kg · 배송자 부담 ${o.courier_burden_score}/5</p><div class="nudge-message">${o.displayed_nudge}</div></div>`;
}
function likertMarkup(items) { return items.map(([name,text])=>`<fieldset class="likert-question"><p>${text} <em>*</em></p><div class="likert-scale">${[1,2,3,4,5].map(v=>`<label><input type="radio" name="${name}" value="${v}" required><span data-value="${v}">${v}</span></label>`).join("")}</div><div class="likert-labels"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div></fieldset>`).join(""); }
function selectField(name,label,options,required=true){return `<label class="field-group"><span>${label} ${required?'<em>*</em>':'<small>선택</small>'}</span><select name="${name}" ${required?'required':''}><option value="">선택해주세요</option>${options.map(o=>`<option>${o}</option>`).join('')}</select></label>`}
function renderSurvey() {
  document.getElementById("reasonChoices").innerHTML=reasonOptions.map(r=>`<label><input type="radio" name="choice_reason" value="${r}" required><span>${r}</span></label>`).join("");
  document.getElementById("influenceQuestions").innerHTML=likertMarkup(influenceItems);
  document.getElementById("perceptionQuestions").innerHTML=likertMarkup(perceptionItems);
  document.getElementById("attitudeQuestions").innerHTML=likertMarkup(attitudeItems);
  document.getElementById("demographicQuestions").innerHTML=[
    selectField("age_group","연령대",["19–29세","30–39세","40–49세","50–59세","60세 이상","응답하고 싶지 않음"]),
    selectField("gender","성별",["여성","남성","비이분법적·기타","응답하고 싶지 않음"],false),
    selectField("occupation_group","직업군",["학생","사무·관리직","전문직","서비스·판매직","생산·기술직","자영업","주부","무직·구직 중","은퇴","기타","응답하고 싶지 않음"]),
    selectField("employment_status","고용 형태",["정규직","비정규직·계약직","자영업·프리랜서","시간제","학생","현재 고용되지 않음","응답하고 싶지 않음"]),
    selectField("income_group","월평균 가구소득",["200만원 미만","200–399만원","400–599만원","600–799만원","800만원 이상","응답하고 싶지 않음"],false),
    selectField("education_level","최종 학력",["고등학교 졸업 이하","전문대학","대학교","대학원 이상","응답하고 싶지 않음"]),
    selectField("household_size","가구원 수",["1명","2명","3명","4명","5명 이상","응답하고 싶지 않음"]),
    selectField("household_composition","가구 구성",["1인 가구","부부","부부와 자녀","한부모와 자녀","성인 가족·친구와 동거","기타","응답하고 싶지 않음"],false),
    selectField("vehicle_ownership","차량 보유",["보유","미보유","응답하고 싶지 않음"],false),
    selectField("online_shopping_frequency","온라인 쇼핑 빈도",["거의 이용하지 않음","월 1–2회","주 1회","주 2–3회","주 4회 이상"]),
    selectField("online_grocery_experience","온라인 식료품 구매 경험",["없음","연 1–5회","월 1–3회","주 1회 이상"]),
    selectField("delivery_service_frequency","배송 서비스 이용 빈도",["월 1회 미만","월 1–3회","주 1–2회","주 3회 이상"]),
  ].join("");
}
function download(name,content,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}

function getRemoteConfig(){const c=window.NUDGE_STUDY_CONFIG||{};return{url:String(c.supabaseUrl||"").replace(/\/$/,""),key:String(c.supabasePublishableKey||"")}}
function submissionRow(){return{participant_id:state.participant_id,session_id:state.session_id,assigned_condition:state.assigned_condition,final_choice_id:state.final_choice_id,selected_option_id:state.selected_option?.id||null,survey_version:state.survey_version,cart_items:cartEntries(),delivery_information:state.delivery||{},option_exposures:state.option_exposures||[],selected_option:state.selected_option||{},survey_responses:state.survey||{},event_log:state.events||[],client_started_at:state.started_at,client_submitted_at:state.submitted_at}}
function setSubmissionStatus(kind,message){const el=document.getElementById("submissionStatus");el.className=`submission-status ${kind}`;el.textContent=message}
async function submitToSupabase(){
  const{url,key}=getRemoteConfig();
  if(!url||!key){setSubmissionStatus("error","온라인 데이터베이스가 아직 연결되지 않아 이 브라우저에만 저장되었습니다. JSON 또는 CSV 파일을 연구자에게 전달해주세요.");return false}
  setSubmissionStatus("sending","응답을 연구 데이터베이스로 전송하고 있습니다…");
  try{
    const response=await fetch(`${url}/rest/v1/study_submissions`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(submissionRow())});
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
    state.remote_submission={status:"success",sent_at:new Date().toISOString()};saveState();
    setSubmissionStatus("success","응답이 연구 데이터베이스에 정상적으로 전달되었습니다. 이제 창을 닫아도 됩니다.");
    document.getElementById("submissionMessage").textContent="모의 주문과 앙케이트 응답이 연구자에게 전달되었습니다.";return true;
  }catch(error){state.remote_submission={status:"failed",failed_at:new Date().toISOString(),error:String(error)};saveState();setSubmissionStatus("error","온라인 전송에 실패했습니다. 아래 JSON 또는 CSV 저장 버튼으로 응답을 보관해주세요.");console.error("Supabase submission failed",error);return false}
}

document.getElementById("cartContinue").addEventListener("click",()=>{if(!cartEntries().length){document.getElementById("cartError").textContent="상품을 하나 이상 선택해주세요.";return}document.getElementById("cartError").textContent="";logEvent("cart_confirmed",{cart_items:cartEntries()});showStep(2)});
document.getElementById("addressSearch").addEventListener("click",()=>{if(!window.daum?.Postcode){document.getElementById("deliveryError").textContent="주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.";return}const panel=document.getElementById("addressSearchPanel"),container=document.getElementById("postcodeEmbed");panel.hidden=false;container.innerHTML="";new daum.Postcode({oncomplete:(data)=>{const address=data.roadAddress||data.jibunAddress;document.getElementById("roadAddress").value=address;document.getElementById("postcode").value=data.zonecode||"";panel.hidden=true;document.getElementById("deliveryError").textContent="";logEvent("address_selected",{postcode:data.zonecode,address});document.querySelector('[name="addressDetail"]').focus()}}).embed(container,{autoClose:false});panel.scrollIntoView({behavior:"smooth",block:"center"})});
document.getElementById("addressSearchClose").addEventListener("click",()=>{document.getElementById("addressSearchPanel").hidden=true});
document.getElementById("deliveryForm").addEventListener("submit",(e)=>{e.preventDefault();const form=e.currentTarget;if(!form.checkValidity()){form.reportValidity();document.getElementById("deliveryError").textContent="필수 정보를 모두 입력해주세요.";return}state.delivery=formObject(form);document.getElementById("deliveryError").textContent="";logEvent("delivery_information_saved",{delivery:state.delivery});renderOptions();showStep(3)});
document.getElementById("optionContinue").addEventListener("click",()=>{if(!selectedOptionId){document.getElementById("optionError").textContent="배송 옵션을 선택해주세요.";return}const option=state.option_exposures.find(o=>o.id===selectedOptionId);state.selected_option=option;saveState();logEvent("delivery_option_selected",{delivery_option_id:option.id,calculated_metrics:option});renderReview();showStep(4)});
document.getElementById("confirmOrder").addEventListener("click",()=>{state.final_choice_id=crypto.randomUUID?.()||`F${Date.now()}`;state.order_confirmed_at=new Date().toISOString();saveState();logEvent("order_confirmed",{final_choice_id:state.final_choice_id,delivery_option_id:state.selected_option.id});renderSurvey();showStep(5)});
document.querySelectorAll("[data-back]").forEach(btn=>btn.addEventListener("click",()=>showStep(Number(btn.dataset.back))));
document.getElementById("surveyBack").addEventListener("click",()=>showStep(4));
document.getElementById("surveyForm").addEventListener("submit",async(e)=>{e.preventDefault();if(state.submitted_at){document.getElementById("surveyError").textContent="이미 제출된 응답입니다.";return}if(!e.currentTarget.checkValidity()){e.currentTarget.reportValidity();document.getElementById("surveyError").textContent="필수 문항에 모두 응답해주세요.";return}state.survey=formObject(e.currentTarget);state.submitted_at=new Date().toISOString();state.survey.participant_id=state.participant_id;state.survey.session_id=state.session_id;state.survey.final_choice_id=state.final_choice_id;state.survey.assigned_condition=state.assigned_condition;state.survey.submitted_at=state.submitted_at;state.survey.survey_version=SURVEY_VERSION;logEvent("post_survey_submitted");saveState();document.getElementById("completeParticipantId").textContent=state.participant_id;showStep(6);await submitToSupabase()});
document.getElementById("downloadJson").addEventListener("click",()=>download(`${state.participant_id}_study-data.json`,JSON.stringify(state,null,2),"application/json"));
document.getElementById("downloadCsv").addEventListener("click",()=>{const row=state.survey||{};const keys=Object.keys(row);const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;download(`${state.participant_id}_post-survey.csv`,`${keys.map(esc).join(',')}\n${keys.map(k=>esc(row[k])).join(',')}\n`,"text/csv;charset=utf-8")});
document.getElementById("restartStudy").addEventListener("click",()=>{if(confirm("현재 테스트 데이터를 모두 지우고 다시 시작할까요?")){localStorage.removeItem(STORAGE_KEY);location.href=location.pathname}});

renderProducts();hydrateDeliveryForm();
if(state.current_step===3&&state.delivery) renderOptions();
if(state.current_step===4&&state.selected_option) renderReview();
if(state.current_step>=5) renderSurvey();
if(state.submitted_at) document.getElementById("completeParticipantId").textContent=state.participant_id;
showStep(state.submitted_at?6:Math.min(state.current_step||1,5),false);
if(state.submitted_at){if(state.remote_submission?.status==="success"){document.getElementById("submissionMessage").textContent="모의 주문과 앙케이트 응답이 연구자에게 전달되었습니다.";setSubmissionStatus("success","응답이 연구 데이터베이스에 정상적으로 전달되었습니다.")}else{submitToSupabase()}}
if(!state.events.length) logEvent("study_started");
