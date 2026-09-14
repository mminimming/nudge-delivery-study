'use strict';
function createStore(url,key){
 if(!url||!key)throw Error('Server database configuration missing');
 async function request(path,options={}){
  const r=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error(`Database request failed (${r.status})`);
  const t=await r.text();return t?JSON.parse(t):null;
 }
 return {
  getExperiment:async id=>(await request(`routing_experiments?id=eq.${id}&select=*`))[0],
  saveQuote:q=>request('routing_quotes',{method:'POST',body:JSON.stringify(q)}),
  getQuote:async id=>(await request(`routing_quotes?id=eq.${id}&select=*`))[0],
  getReceipt:async(id,p)=>(await request(`routing_bookings?experiment_id=eq.${id}&participant_session=eq.${p}&select=receipt`))[0]?.receipt,
  commitCas:arg=>request('rpc/routing_commit',{method:'POST',body:JSON.stringify({p_experiment:arg.experimentId,p_expected:arg.expectedRevision,p_scenario:arg.scenario,p_receipt:arg.receipt})})
 };
}
module.exports={createStore};
