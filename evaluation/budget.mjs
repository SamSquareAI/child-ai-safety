import {createHash} from 'node:crypto';
export const AUTHORIZED_MICRO_USD=10_000_000;
export const SMOKE_RESERVE_MICRO_USD=387_840;
export const SMOKE_REPORT_SHA256='9284b4cdbaa08c54fa3481fae1617fd1c1b654034f32b0eac63451ab9dd67b49';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const timestamp=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const exact=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));

/** Maintainer authorized deferred billing reconciliation; no claim of actual charges. */
export function deferredBatchBudget(smokeBytes){
 if(sha256(smokeBytes)!==SMOKE_REPORT_SHA256)throw new TypeError('Original smoke report required');
 const batchReserveMicroUsd=48*((8192+4096)*10+128*50);
 const totalReservedMicroUsd=SMOKE_RESERVE_MICRO_USD+batchReserveMicroUsd;
 if(totalReservedMicroUsd>AUTHORIZED_MICRO_USD)throw new TypeError('Budget exceeded');
 return Object.freeze({authorizedMicroUsd:AUTHORIZED_MICRO_USD,previousReserveMicroUsd:SMOKE_RESERVE_MICRO_USD,
  batchReserveMicroUsd,totalReservedMicroUsd,billingDataAsOf:null,billingReconciled:false,
  reconciliationDeferredByMaintainer:true,providerEnforced:false});
}

/** Structural check of operator-observed billing metadata, not a provider API or attestation verifier. */
export function checkBatchBudget(smokeBytes,billing,{calls=48,now=new Date()}={}){
 const fail=()=>{throw new TypeError('Billing reconciliation or evaluation budget is not valid');};
 if(sha256(smokeBytes)!==SMOKE_REPORT_SHA256 || !Number.isInteger(calls) || calls<1 || calls>48 || !(now instanceof Date) || !Number.isFinite(now.getTime()))fail();
 let smoke;try{smoke=JSON.parse(smokeBytes);}catch{fail();}
 if(!timestamp(smoke.completedAt) || smoke.executed!==true || smoke.calls!==3 || smoke.billingReconciled!==false)fail();
 if(!exact(billing,['schemaVersion','source','smokeReportSha256','dataAsOf','observedAt','totalCostUpperBoundMicroUsd']) ||
  billing.schemaVersion!==1 || billing.source!=='claude-console-key-cost' || billing.smokeReportSha256!==SMOKE_REPORT_SHA256 ||
  !timestamp(billing.dataAsOf) || !timestamp(billing.observedAt) ||
  !Number.isSafeInteger(billing.totalCostUpperBoundMicroUsd) || billing.totalCostUpperBoundMicroUsd<0)fail();
 const observed=Date.parse(billing.observedAt),asOf=Date.parse(billing.dataAsOf),time=now.getTime();
 // A stale dashboard showing $0 before the calls is not reconciliation.
 if(asOf<Date.parse(smoke.completedAt) || asOf>observed || observed>time || time-observed>86400000)fail();
 const previousReserveMicroUsd=Math.max(SMOKE_RESERVE_MICRO_USD,billing.totalCostUpperBoundMicroUsd);
 // Planning allowance only: 8 KiB bytes + 4096 overhead tokens at $10/M input,
 // and 128 output tokens at $50/M. Pricing assumptions still need review.
 const batchReserveMicroUsd=calls*((8192+4096)*10+128*50);
 const totalReservedMicroUsd=previousReserveMicroUsd+batchReserveMicroUsd;
 if(!Number.isSafeInteger(totalReservedMicroUsd) || totalReservedMicroUsd>AUTHORIZED_MICRO_USD)fail();
 return Object.freeze({authorizedMicroUsd:AUTHORIZED_MICRO_USD,previousReserveMicroUsd,batchReserveMicroUsd,totalReservedMicroUsd,
  billingDataAsOf:billing.dataAsOf,providerEnforced:false});
}
