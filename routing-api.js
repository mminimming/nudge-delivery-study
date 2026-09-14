(function(root){
 'use strict';
 const params=new URLSearchParams(location.search),experimentId=params.get('experiment');
 const shared=!!experimentId||!['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
 async function call(action,payload={}){
  if(!experimentId)throw Error('実験リンクに experiment がありません。研究者から配布されたリンクを使用してください。');
  let r;try{r=await fetch('/.netlify/functions/routing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,experimentId,...payload}),signal:AbortSignal.timeout(20000),cache:'no-store'})}catch{throw Error('共有予約サーバーに接続できません。接続を確認し、再試行してください。')}
  let data;try{data=await r.json()}catch{throw Error('共有予約APIが利用できません。サーバーの起動・公開設定を確認してください。')}
  if(!r.ok){const error=Error(data.error||'予約処理に失敗しました。');error.status=r.status;error.recalculate=data.recalculate;throw error}return data;
 }
 root.RoutingAPI={shared,experimentId,state:()=>call('state'),quote:(input,parcel,participantSession,condition)=>call('quote',{input,parcel,participantSession,condition}),commit:(quoteId,slotId,participantSession,requestId)=>call('commit',{quoteId,slotId,participantSession,requestId})};
})(window);
