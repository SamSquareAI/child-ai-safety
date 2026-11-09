import {sha256,SMOKE_REPORT_SHA256,AUTHORIZED_MICRO_USD} from './budget.mjs';
export const BATCH_SHA256='27d6a4f59e3dac6e25851e2b90d8c9f0af828dc91d25247fadf59a28269ce37c';
export const PIPELINE_MAX_CALLS=18;
export function pipelineBudget(smokeBytes,batchBytes){
 if(sha256(smokeBytes)!==SMOKE_REPORT_SHA256||sha256(batchBytes)!==BATCH_SHA256)throw new TypeError('Verified prior reports required');
 const previousReserveMicroUsd=6_593_280;
 // All calls reserved at generation's larger 256 output token limit.
 const pipelineReserveMicroUsd=PIPELINE_MAX_CALLS*((8192+4096)*10+256*50);
 const totalReservedMicroUsd=previousReserveMicroUsd+pipelineReserveMicroUsd;
 if(totalReservedMicroUsd>AUTHORIZED_MICRO_USD)throw new TypeError('Budget exceeded');
 return Object.freeze({authorizedMicroUsd:AUTHORIZED_MICRO_USD,previousReserveMicroUsd,pipelineReserveMicroUsd,totalReservedMicroUsd,
  billingReconciled:false,reconciliationDeferredByMaintainer:true,providerEnforced:false});
}
