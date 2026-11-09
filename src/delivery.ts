import {validIdentifier,validResult} from './protocol.js';
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
