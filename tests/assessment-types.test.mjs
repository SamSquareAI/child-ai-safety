import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import path from 'node:path';

test('TypeScript permits context-free input calls but requires context on output',()=>{
  const filename=path.resolve('src/__synthetic_assessment_typecheck.ts');
  const source=`
    import type {Assess,Profile,Stage} from '../dist/index.js';
    declare const assess:Assess;
    declare const profile:Profile;
    declare const signal:AbortSignal;
    declare const stage:Stage;
    assess('question','input',profile,signal);
    assess('answer','output',profile,signal,{version:'1',requestInput:'question'});
    assess('text',stage,profile,signal,{version:'1',requestInput:'question'});
    // @ts-expect-error output needs original question context
    assess('answer','output',profile,signal);
    // @ts-expect-error unknown stage cannot omit context
    assess('text',stage,profile,signal);
    // @ts-expect-error caller history is not supported
    assess('answer','output',profile,signal,{version:'1',requestInput:'question',history:[]});
  `;
  const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,
    strict:true,noEmit:true,skipLibCheck:true,types:[]};
  const host=ts.createCompilerHost(options);
  const get=host.getSourceFile.bind(host);
  host.getSourceFile=(name,languageVersion,...args)=>path.resolve(name)===filename
    ?ts.createSourceFile(filename,source,languageVersion,true):get(name,languageVersion,...args);
  const program=ts.createProgram([filename],options,host);
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[]);
});
