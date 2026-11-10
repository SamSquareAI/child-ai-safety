import {validIdentifier,validResult} from './protocol.js';
import schema from './protocol.schema.json' with {type:'json'};
import type {Receipt,Result} from './gateway.js';

export type DeliveryView=Readonly<{kind:'approved'|'static';format:'plain-text';text:string}>;
export type DeliveryConfig=Readonly<{
  receipt: Receipt;
  /** Trusted reviewed application messages, keyed by responseId. */
  catalog: Readonly<Record<string,string>>;
  /** Trusted reviewed generic message when a catalog entry is absent/invalid. */
  fallbackText: string;
}>;
const text=(value:unknown):value is string=>typeof value==='string' && value.length<=16000 && value.trim().length>0 && [...value].length<=8000;
const responseKey=/^(en|fr|es)\.(refuse|support|unavailable)\.(none|privacy|harm|safeguarding|relational)$/;
const data=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
/** Project trusted gateway results to plain-text rendering/TTS data. Not an authenticator. */
export function createDeliveryProjection(config:DeliveryConfig){
  try {
    if(!data(config)||!data(config.receipt)||config.receipt.protocolVersion!=='1'||
       !(['policyVersion','detectorId','detectorRevision'] as const).every(k=>validIdentifier(config.receipt[k]))||
       Reflect.ownKeys(config.receipt).length!==4||!text(config.fallbackText)||!data(config.catalog))throw Error();
    const receipt=Object.freeze({...config.receipt});
    const fallback=Object.freeze({kind:'static',format:'plain-text',text:config.fallbackText}) as DeliveryView;
    const catalog=new Map<string,string>();
    if(Reflect.ownKeys(config.catalog).length>96)throw Error();
    for(const key of Reflect.ownKeys(config.catalog)){
      if(typeof key!=='string'||!responseKey.test(key))throw Error();
      const descriptor=Object.getOwnPropertyDescriptor(config.catalog,key);
      if(!descriptor||!Object.hasOwn(descriptor,'value')||!text(descriptor.value))throw Error();
      catalog.set(key,descriptor.value);
    }
    return (candidate:unknown):DeliveryView=>{
      try {
        if(!validResult(candidate))return fallback;
        const result=candidate as Result;
        if(result.protocolVersion!==receipt.protocolVersion||result.policyVersion!==receipt.policyVersion||
           result.detectorId!==receipt.detectorId||result.detectorRevision!==receipt.detectorRevision)return fallback;
        if(result.action==='allow')return Object.freeze({kind:'approved',format:'plain-text',text:result.text});
        return Object.freeze({kind:'static',format:'plain-text',text:catalog.get(result.responseId)??fallback.text});
      }catch{return fallback;}
    };
  }catch{throw new TypeError('Invalid trusted delivery configuration');}
}

/** Explicit name for the backwards-compatible, incomplete-catalog research helper. */
export const createResearchDeliveryProjection=createDeliveryProjection;

export type DeliveryLocale='en'|'fr'|'es';
export type DeliveryEvidence=Readonly<{id:string;ref:string;sha256:string;content:string}>;
export type DeliveryReview=Readonly<{
  reviewerRef:string;independent:true;decision:'approved';role:'safeguarding'|'native-language';
  evidenceId:string;evidenceSha256:string;catalogVersion:string;catalogSha256:string;
  locales:readonly DeliveryLocale[];
}>;
export type DeploymentDeliveryConfig=Readonly<{
  receipt:Receipt;catalog:Readonly<Record<string,string>>;enabledLocales:readonly DeliveryLocale[];
  catalogVersion:string;catalogSha256:string;authorRef:string;
  evidence:readonly DeliveryEvidence[];reviews:readonly DeliveryReview[];
}>;
const locales:readonly DeliveryLocale[]=['en','fr','es'];
const shaPattern=/^[a-f0-9]{64}$/;
const reference=(value:unknown):value is string=>{
  if(typeof value!=='string'||value.length>2048||/\s/.test(value))return false;
  if(/^urn:[a-z0-9][a-z0-9-]{0,31}:[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value))return true;
  try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
};
// Deployment configuration is JSON data. Reject accessors before copying or hashing.
function snapshot(value:unknown):unknown{
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;
  if(!Array.isArray(value)&&!data(value))throw Error();
  const result:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
  for(const key of Reflect.ownKeys(value)){
    if(Array.isArray(value)&&key==='length')continue;
    if(typeof key!=='string'||key==='__proto__')throw Error();
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value'))throw Error();
    Object.defineProperty(result,key,{value:snapshot(d.value),enumerable:true});
  }
  return result;
}
const shape=(value:unknown,keys:readonly string[]):boolean=>
  data(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
function scope(value:unknown):value is DeliveryLocale[]{
  return Array.isArray(value)&&value.length>0&&value.length<=locales.length&&
    new Set(value).size===value.length&&Reflect.ownKeys(value).length===value.length+1&&
    Array.from(value).every(l=>locales.includes(l));
}
/** Every static key accepted by the runtime result validator, including all support categories. */
export function requiredDeliveryResponseKeys(locale:DeliveryLocale):readonly string[]{
  if(!locales.includes(locale))throw new TypeError('Unsupported delivery locale');
  const receipt={protocolVersion:'1',policyVersion:'scope',detectorId:'scope',detectorRevision:'scope'};
  return Object.freeze(schema.$defs.result.properties.action.enum.filter(action=>action!=='allow').flatMap(action=>
    schema.$defs.assessment.properties.category.enum.map(category=>`${locale}.${action}.${category}`)
      .filter(responseId=>validResult({...receipt,action,responseId}))));
}
async function sha256(value:string):Promise<string>{
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Canonical binding: version, receipt, sorted locale scope, sorted [key,text] pairs. */
export async function deliveryCatalogSha256(config:Pick<DeploymentDeliveryConfig,'catalogVersion'|'receipt'|'enabledLocales'|'catalog'>):Promise<string>{
  const c=snapshot(config) as typeof config;
  return sha256(JSON.stringify([c.catalogVersion,
    [c.receipt.protocolVersion,c.receipt.policyVersion,c.receipt.detectorId,c.receipt.detectorRevision],
    [...c.enabledLocales].sort(),Object.keys(c.catalog).sort().map(key=>[key,c.catalog[key]])]));
}
/** Consistency gate only; never verifies the truth or qualifications of a reviewer. */
export async function createDeploymentDeliveryProjection(input:DeploymentDeliveryConfig){
  try{
    const c=snapshot(input) as DeploymentDeliveryConfig;
    if(!shape(c,['receipt','catalog','enabledLocales','catalogVersion','catalogSha256','authorRef','evidence','reviews'])||
      !scope(c.enabledLocales)||!validIdentifier(c.catalogVersion)||!reference(c.authorRef)||
      typeof c.catalogSha256!=='string'||!shaPattern.test(c.catalogSha256)||!data(c.catalog))throw Error();
    const keys=c.enabledLocales.flatMap(requiredDeliveryResponseKeys);
    if(Object.keys(c.catalog).length!==keys.length||!keys.every(k=>Object.hasOwn(c.catalog,k)&&text(c.catalog[k])))throw Error();
    if(await deliveryCatalogSha256({catalogVersion:c.catalogVersion,receipt:c.receipt,enabledLocales:c.enabledLocales,catalog:c.catalog})!==c.catalogSha256)throw Error();
    if(!Array.isArray(c.evidence)||!c.evidence.length||c.evidence.length>96||
      !Array.isArray(c.reviews)||!c.reviews.length||c.reviews.length>96)throw Error();
    const evidence=new Map<string,DeliveryEvidence>();
    for(const e of c.evidence){
      if(!shape(e,['id','ref','sha256','content'])||!validIdentifier(e.id)||!reference(e.ref)||
        typeof e.sha256!=='string'||!shaPattern.test(e.sha256)||typeof e.content!=='string'||
        !e.content.trim()||e.content.length>1_000_000||evidence.has(e.id)||
        await sha256(e.content)!==e.sha256)throw Error();
      evidence.set(e.id,e);
    }
    const covered=new Set<string>();
    for(const r of c.reviews){
      if(!shape(r,['reviewerRef','independent','decision','role','evidenceId','evidenceSha256','catalogVersion','catalogSha256','locales'])||
        !reference(r.reviewerRef)||r.reviewerRef===c.authorRef||r.independent!==true||r.decision!=='approved'||
        !['safeguarding','native-language'].includes(r.role)||!scope(r.locales)||
        !r.locales.every((l:DeliveryLocale)=>c.enabledLocales.includes(l))||r.catalogVersion!==c.catalogVersion||
        r.catalogSha256!==c.catalogSha256||!evidence.has(r.evidenceId)||
        r.evidenceSha256!==evidence.get(r.evidenceId)?.sha256)throw Error();
      for(const l of r.locales)covered.add(`${l}.${r.role}`);
    }
    if(!c.enabledLocales.every(l=>['safeguarding','native-language'].every(role=>covered.has(`${l}.${role}`))))throw Error();
    const projections=new Map(c.enabledLocales.map(locale=>[locale,createResearchDeliveryProjection({
      receipt:c.receipt,catalog:c.catalog,fallbackText:c.catalog[`${locale}.unavailable.none`]!
    })]));
    return (candidate:unknown,locale:DeliveryLocale):DeliveryView=>{
      const project=projections.get(locale);
      if(!project)throw new TypeError('Unsupported delivery locale');
      try{
        if(validResult(candidate)&&(candidate as Result).action!=='allow'&&
          !(candidate as {responseId:string}).responseId.startsWith(`${locale}.`))return project(null);
        return project(candidate);
      }catch{return project(null);}
    };
  }catch{throw new TypeError('Invalid deployment delivery configuration');}
}
