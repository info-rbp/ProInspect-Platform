const API='https://api.cloudflare.com/client/v4';
const token=(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const account=(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const mode=(process.argv[2]||'plan').trim();

if(!token)throw new Error('CLOUDFLARE_API_TOKEN is required.');
if(!/^[a-f0-9]{32}$/i.test(account))throw new Error('CLOUDFLARE_ACCOUNT_ID is required.');
if(!['plan','apply'].includes(mode))throw new Error('Mode must be plan or apply.');

const managed=[
  {name:'ProInspect Public Signing SPA',domain:'proinspect.systems/sign/*'},
  {name:'ProInspect Public Signing API',domain:'proinspect.systems/api/public/signing/*'},
  {name:'ProInspect Public Signing Health',domain:'proinspect.systems/api/public/workflow-health'},
];
const policyName='ProInspect Public Signing Bypass';

async function cf(path,{method='GET',body}={}){
  const response=await fetch(API+path,{
    method,
    headers:{
      Authorization:'Bearer '+token,
      'Content-Type':'application/json',
    },
    body:body===undefined?undefined:JSON.stringify(body),
    redirect:'manual',
  });
  let payload={};
  try{payload=await response.json();}catch{}
  const errors=(payload.errors||[]).map(x=>String(x?.message||x?.code||'unknown'));
  if(!response.ok||payload.success===false){
    const detail=errors.join(' | ')||('HTTP '+response.status);
    const error=new Error(method+' '+path+' failed: '+detail);
    error.status=response.status;
    throw error;
  }
  return payload.result;
}

function domainOf(app){
  if(typeof app?.domain==='string'&&app.domain)return app.domain.toLowerCase();
  const destinations=Array.isArray(app?.destinations)?app.destinations:[];
  const publicDestination=destinations.find(x=>x?.type==='public'&&typeof x?.uri==='string');
  return String(publicDestination?.uri||'').toLowerCase();
}
function isEveryone(rule){
  return !!rule&&typeof rule==='object'&&rule.everyone&&typeof rule.everyone==='object';
}
function policyIsExpected(policy){
  return policy?.name===policyName &&
    policy?.decision==='bypass' &&
    Array.isArray(policy?.include) &&
    policy.include.length===1 &&
    isEveryone(policy.include[0]) &&
    (!Array.isArray(policy.exclude)||policy.exclude.length===0) &&
    (!Array.isArray(policy.require)||policy.require.length===0);
}

async function listApps(){
  const result=await cf('/accounts/'+account+'/access/apps?per_page=1000');
  return Array.isArray(result)?result:[];
}
async function listPolicies(appId){
  const result=await cf('/accounts/'+account+'/access/apps/'+encodeURIComponent(appId)+'/policies?per_page=100');
  return Array.isArray(result)?result:[];
}
async function createApp(spec){
  return cf('/accounts/'+account+'/access/apps',{
    method:'POST',
    body:{
      name:spec.name,
      type:'self_hosted',
      domain:spec.domain,
      session_duration:'24h',
      app_launcher_visible:false,
      auto_redirect_to_identity:false,
    },
  });
}
async function createBypass(appId){
  return cf('/accounts/'+account+'/access/apps/'+encodeURIComponent(appId)+'/policies',{
    method:'POST',
    body:{
      name:policyName,
      decision:'bypass',
      include:[{everyone:{}}],
      exclude:[],
      require:[],
      precedence:1,
    },
  });
}

async function inspect(apps,spec){
  const sameName=apps.filter(app=>app?.name===spec.name);
  const sameDomain=apps.filter(app=>domainOf(app)===spec.domain.toLowerCase());
  if(sameName.length>1)throw new Error('Multiple managed Access applications have name '+spec.name+'.');
  if(sameDomain.length>1)throw new Error('Multiple Access applications already target '+spec.domain+'.');
  if(sameDomain.length===1&&sameDomain[0]?.name!==spec.name){
    throw new Error('Refusing to modify unknown Access application '+String(sameDomain[0]?.name||sameDomain[0]?.id)+' already targeting '+spec.domain+'.');
  }
  if(sameName.length===1&&domainOf(sameName[0])!==spec.domain.toLowerCase()){
    throw new Error('Managed Access application '+spec.name+' targets unexpected domain '+domainOf(sameName[0])+'.');
  }
  const app=sameDomain[0]||sameName[0]||null;
  if(!app)return {state:'missing',app:null,policies:[]};
  if(app.type!=='self_hosted')throw new Error(spec.name+' must be a self_hosted Access application.');
  const policies=await listPolicies(app.id);
  const expected=policies.filter(policyIsExpected);
  const unexpected=policies.filter(p=>!policyIsExpected(p));
  if(expected.length>1)throw new Error(spec.name+' has duplicate managed bypass policies.');
  if(unexpected.length)throw new Error('Refusing to alter '+spec.name+' because it contains unexpected policies: '+unexpected.map(x=>x.name||x.id).join(', '));
  return {state:expected.length===1?'ready':'needs-policy',app,policies};
}

async function verifyPublicBoundary(){
  const requests=[
    {name:'health',url:'https://proinspect.systems/api/public/workflow-health',expect:200,body:'"status":"ok"'},
    {name:'signing-spa',url:'https://proinspect.systems/sign/access-check',expect:200},
  ];
  for(const check of requests){
    const response=await fetch(check.url,{redirect:'manual',headers:{'User-Agent':'ProInspect-ZeroTrust-Verification/1.0'}});
    const body=await response.text();
    if(response.status!==check.expect)throw new Error(check.name+' expected HTTP '+check.expect+' but received '+response.status+'. Body: '+body.slice(0,500));
    if(check.body&&!body.includes(check.body))throw new Error(check.name+' response body did not contain expected marker.');
  }

  const tokenProbe=await fetch('https://proinspect.systems/api/public/signing/not-a-real-token',{redirect:'manual',headers:{'User-Agent':'ProInspect-ZeroTrust-Verification/1.0'}});
  if([301,302,303,307,308,401,403].includes(tokenProbe.status)){
    throw new Error('Token-scoped public signing API is still intercepted by Access (HTTP '+tokenProbe.status+').');
  }

  const staff=await fetch('https://report.creation.proinspect.systems/api/public/workflow-health',{redirect:'manual',headers:{'User-Agent':'ProInspect-ZeroTrust-Verification/1.0'}});
  if(![301,302,303,307,308,401,403].includes(staff.status)){
    throw new Error('Staff/editor hostname is no longer protected by Cloudflare Access (HTTP '+staff.status+').');
  }

  const unrelated=await fetch('https://proinspect.systems/api/me',{redirect:'manual',headers:{'User-Agent':'ProInspect-ZeroTrust-Verification/1.0'}});
  if(unrelated.status===200)throw new Error('Unexpected public /api/me response on marketing apex; signing route scope may be too broad.');

  console.log(JSON.stringify({
    publicHealth:200,
    publicSigningSpa:200,
    publicSigningApi:tokenProbe.status,
    staffEditorProtected:staff.status,
    unrelatedMarketingApi:unrelated.status,
  },null,2));
}

const apps=await listApps();
const protectedSummaries=apps
  .filter(app=>{
    const d=domainOf(app);
    return d.includes('report.creation.proinspect.systems')||d.includes('sign.proinspect.systems')||app?.type==='warp';
  })
  .map(app=>({name:app.name||'',type:app.type||'',domain:domainOf(app),id:app.id||''}));
console.log('Existing relevant protected Access applications (read-only):');
console.log(JSON.stringify(protectedSummaries,null,2));

const states=[];
for(const spec of managed){
  const current=await inspect(apps,spec);
  states.push({spec,current});
}
console.log('Managed public-path plan:');
console.log(JSON.stringify(states.map(({spec,current})=>({name:spec.name,domain:spec.domain,state:current.state})),null,2));

if(mode==='plan'){
  console.log('PLAN_OK: Access applications are readable; no changes made.');
  process.exit(0);
}

for(const entry of states){
  let {app,state}=entry.current;
  if(state==='missing'){
    console.log('Creating exact-path Access application: '+entry.spec.domain);
    app=await createApp(entry.spec);
    state='needs-policy';
  }
  if(state==='needs-policy'){
    const afterCreatePolicies=await listPolicies(app.id);
    if(afterCreatePolicies.length)throw new Error('New managed application unexpectedly contains policies; refusing mutation.');
    console.log('Creating Bypass + Everyone policy for '+entry.spec.domain);
    await createBypass(app.id);
  }
}

const finalApps=await listApps();
for(const spec of managed){
  const final=await inspect(finalApps,spec);
  if(final.state!=='ready')throw new Error('Managed Access application did not reconcile: '+spec.domain);
}

await verifyPublicBoundary();
console.log('APPLY_OK: exact public signing paths bypass Access; staff/editor protection remains intact.');
