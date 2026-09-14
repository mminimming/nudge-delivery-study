const {createService,ApiError}=require('../../server/routing-service.cjs');
const {createStore}=require('../../server/supabase-store.cjs');
const {createEngine}=require('../../delivery-engine.js');
const data=require('../../data/taito-network.json');
let service;
exports.handler=async event=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 if(event.httpMethod!=='POST')return {statusCode:405,headers,body:JSON.stringify({error:'POST required'})};
 if((event.body||'').length>16000)return {statusCode:413,headers,body:JSON.stringify({error:'Request too large'})};
 try{
  if(!service)service=createService(createEngine(data),createStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY));
  let body;try{body=JSON.parse(event.body)}catch{throw new ApiError(400,'Invalid JSON')}
  return {statusCode:200,headers,body:JSON.stringify(await service(body))};
 }catch(e){return {statusCode:e.status||503,headers,body:JSON.stringify({error:e.status?e.message:'共有予約サーバーに接続できません。しばらくしてから再試行してください。',...e.details})};}
};
