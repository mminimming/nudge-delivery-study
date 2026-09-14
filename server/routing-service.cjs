'use strict';
const {randomUUID}=require('node:crypto');
class ApiError extends Error { constructor(status,message,details={}){super(message);this.status=status;this.details=details;} }
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
function createService(engine,store){
  async function state(id){
    const row=await store.getExperiment(id);
    if(!row||!row.active)throw new ApiError(404,'実験が見つからないか、受付が終了しています。');
    if(row.model_version!==require('../delivery-engine.js').VERSION)throw new ApiError(409,'実験の計算モデルが更新されました。研究者に連絡してください。');
    const scenario=row.scenario||{...engine.baseline(),id};
    return {scenario,deliveryDate:row.delivery_date,experimentId:id};
  }
  async function quote(body){
    if(!uuid(body.participantSession))throw new ApiError(400,'Invalid participant session');
    if(!['control','green_label','default_green_combined'].includes(body.condition))throw new ApiError(400,'Invalid condition');
    const current=await state(body.experimentId);
    let evaluation;
    try{evaluation=engine.evaluate(current.scenario,body.input,body.parcel)}catch{throw new ApiError(400,'配送条件を確認してください。')}
    const q={id:randomUUID(),experiment_id:body.experimentId,participant_session:body.participantSession,condition:body.condition,evaluation,expires_at:new Date(Date.now()+30*60*1000).toISOString()};
    await store.saveQuote(q);
    return {...current,evaluation:{...evaluation,quoteId:q.id,expiresAt:q.expires_at}};
  }
  return async function handle(body){
    if(!body||!uuid(body.experimentId))throw new ApiError(400,'実験リンク（experiment）を指定してください。');
    if(body.action==='state')return state(body.experimentId);
    if(body.action==='quote')return quote(body);
    if(body.action!=='commit'||!uuid(body.quoteId)||!uuid(body.requestId)||!uuid(body.participantSession))throw new ApiError(400,'Invalid booking request');
    // The server retrieves the displayed offer. Client-supplied routes/costs are never trusted.
    const q=await store.getQuote(body.quoteId);
    if(!q||q.experiment_id!==body.experimentId||q.participant_session!==body.participantSession)throw new ApiError(404,'配送候補が見つかりません。');
    const offered=q.evaluation.options.find(o=>o.id===body.slotId&&o.feasible);
    if(!offered)throw new ApiError(400,'提示されていない時間帯です。');
    const previous=await store.getReceipt(body.experimentId,body.participantSession);
    if(previous){if(previous.quoteId!==body.quoteId||previous.slotId!==body.slotId)throw new ApiError(409,'この注文は確定済みです。');return previous;}
    if(Date.parse(q.expires_at)<Date.now())throw new ApiError(409,'候補の有効期限が切れました。再計算してください。',{recalculate:true});
    for(let attempt=0;attempt<4;attempt++){
      const current=await state(body.experimentId),fresh=engine.evaluate(current.scenario,q.evaluation.input,q.evaluation.parcel);
      const option=fresh.options.find(o=>o.id===body.slotId&&o.feasible&&o.start===offered.start&&o.end===offered.end);
      if(!option)throw new ApiError(409,'予約状況が変わりました。新しい候補を選んでください。',{recalculate:true});
      const next=engine.commit(current.scenario,fresh,option.id);
      const receipt={experimentId:body.experimentId,participantSession:body.participantSession,requestId:body.requestId,quoteId:body.quoteId,slotId:body.slotId,window:[option.start,option.end],beforeRevision:current.scenario.revision,revision:next.revision,deliveryDate:current.deliveryDate,confirmedAt:new Date().toISOString(),scenario:next,acceptedOption:option,displayedRevision:q.evaluation.revision};
      const result=await store.commitCas({experimentId:body.experimentId,expectedRevision:current.scenario.revision,scenario:next,receipt});
      if(result.status==='committed'||result.status==='duplicate'){
        if(result.receipt.quoteId!==body.quoteId||result.receipt.slotId!==body.slotId)throw new ApiError(409,'この注文は確定済みです。');
        return result.receipt;
      }
    }
    throw new ApiError(409,'予約が集中しています。同じ注文でもう一度確定してください。');
  };
}
module.exports={createService,ApiError};
