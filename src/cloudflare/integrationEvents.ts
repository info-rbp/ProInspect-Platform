import { randomUUID } from 'node:crypto';
import { context, type Bindings } from './context.ts';
import { seal, unseal } from './crypto.ts';
import type { IntegrationEventInput } from '../server/integrationEvents.ts';

type StoredEvent = {
  eventId: string;
  eventType: string;
  entityId: string;
  propertyId?: string;
  clientId?: string;
  tenancyId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

function endpoint(env: Bindings): URL | null {
  const raw=String(env.APPS_SCRIPT_WEBHOOK_URL||'').trim();
  if(!raw)return null;
  const url=new URL(raw);
  if(url.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(url.hostname))throw new Error('APPS_SCRIPT_WEBHOOK_URL_INVALID');
  return url;
}
function configured(env: Bindings){
  return Boolean(endpoint(env)&&String(env.APPS_SCRIPT_WEBHOOK_TOKEN||'').trim());
}
export async function emitIntegrationEvent(input: IntegrationEventInput): Promise<string | undefined> {
  const {env,waitUntil}=context();
  const eventId='evt_'+randomUUID().replace(/-/g,'');
  const occurredAt=new Date().toISOString();
  const event:StoredEvent={eventId,eventType:input.eventType,entityId:input.entityId,occurredAt,payload:input.payload};
  if(input.propertyId)event.propertyId=input.propertyId;
  if(input.clientId)event.clientId=input.clientId;
  if(input.tenancyId)event.tenancyId=input.tenancyId;
  const bytes=Buffer.from(JSON.stringify(event));
  if(bytes.length>64*1024)throw new Error('INTEGRATION_EVENT_TOO_LARGE');

  const persist=(async()=>{
    try{
      const encrypted=seal(env,bytes,'integration:'+eventId).toString('base64');
      const now=Date.now();
      await env.DB.prepare('INSERT INTO integration_outbox(event_id,event_type,entity_id,encrypted_payload,state,attempts,created_at,updated_at) VALUES(?,?,?,?,\'pending\',0,?,?)')
        .bind(eventId,input.eventType,input.entityId,encrypted,now,now).run();
      if(configured(env))await env.JOBS.send({kind:'integration',id:eventId});
    }catch(error){
      console.error('INTEGRATION_OUTBOX_PERSIST_FAILED',{eventType:input.eventType,entityId:input.entityId,error:error instanceof Error?error.message:'unknown'});
    }
  })();
  waitUntil(persist);
  return eventId;
}
export async function deliverIntegrationEvent(env:Bindings,eventId:string):Promise<void>{
  const url=endpoint(env);const token=String(env.APPS_SCRIPT_WEBHOOK_TOKEN||'').trim();
  if(!url||!token)throw new Error('APPS_SCRIPT_NOT_CONFIGURED');
  const now=Date.now();
  const row=await env.DB.prepare("UPDATE integration_outbox SET state='sending',attempts=attempts+1,lease_until=?,updated_at=? WHERE event_id=? AND attempts<8 AND (state='pending' OR (state='sending' AND lease_until<?)) RETURNING encrypted_payload,attempts")
    .bind(now+180000,now,eventId,now).first<any>();
  if(!row)return;
  try{
    const event=JSON.parse(unseal(env,Buffer.from(String(row.encrypted_payload),'base64'),'integration:'+eventId).toString()) as StoredEvent;
    const response=await fetch(url.toString(),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,event}),
      redirect:'error',
      signal:AbortSignal.timeout(30000)
    });
    const result=await response.json().catch(()=>({})) as any;
    if(!response.ok||result?.ok!==true||result?.eventId!==eventId)throw new Error('APPS_SCRIPT_REJECTED_'+response.status);
    await env.DB.prepare("UPDATE integration_outbox SET state='sent',lease_until=NULL,provider_id=?,error_code=NULL,updated_at=? WHERE event_id=?")
      .bind(String(result.row||result.eventId).slice(0,200),Date.now(),eventId).run();
  }catch(error){
    const attempts=Number(row.attempts||1);
    const state=attempts>=8?'failed':'pending';
    const code=String(error instanceof Error?error.message:'INTEGRATION_DELIVERY_FAILED').replace(/[^A-Z0-9_]/gi,'_').toUpperCase().slice(0,64);
    await env.DB.prepare('UPDATE integration_outbox SET state=?,lease_until=NULL,error_code=?,updated_at=? WHERE event_id=?')
      .bind(state,code,Date.now(),eventId).run();
    throw error;
  }
}
export async function retryIntegrationEvents(env:Bindings):Promise<void>{
  if(!configured(env))return;
  const rows=await env.DB.prepare("SELECT event_id FROM integration_outbox WHERE attempts<8 AND (state='pending' OR (state='sending' AND lease_until<?)) ORDER BY created_at LIMIT 50")
    .bind(Date.now()).all<any>();
  for(const row of rows.results||[])await env.JOBS.send({kind:'integration',id:String(row.event_id)});
}
