import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {readHoldoutFiles} from '../evaluation/holdout.mjs';
import {checkThresholds} from '../evaluation/thresholds.mjs';

function readPolicy(filename){
  const fd=openSync(filename,constants.O_RDONLY|constants.O_NONBLOCK);
  try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size>65536)throw Error();
    const bytes=Buffer.alloc(stat.size+1);let used=0;
    while(used<bytes.length){const n=readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
    if(used!==stat.size)throw Error();
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));
  }finally{closeSync(fd);}
}

try{
  const args=process.argv.slice(2);
  if(args.length!==4||args.some(x=>x.startsWith('--')))throw Error();
  const errors=[];
  const [inputs,reviews,observations]=readHoldoutFiles(args.slice(0,3),['inputs','review','observations'],errors);
  if(errors.length)throw Error();
  const result=checkThresholds(inputs,reviews,observations,readPolicy(args[3]));
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==='thresholds-met'?0:1;
}catch{
  console.log(JSON.stringify({status:'invalid',releaseAuthorized:false,independentQualification:false,
    blockers:['Usage: node scripts/check-thresholds.mjs INPUTS REVIEW_KEY OBSERVATIONS FROZEN_THRESHOLDS; files must be bounded valid JSON.']}));
  process.exitCode=1;
}
