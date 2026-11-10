/** Fabricated synthetic data for checker tests only; no genuine review records. */
export function pilot(){
  const inputs=[],reviews=[],observations=[];
  function add(entry,verdicts){
    inputs.push(entry);
    const expectations=verdicts.map(verdict=>({expected:{verdict,category:{allow:'none',refuse:'harm',support:'safeguarding'}[verdict]},
      severity:verdict==='allow'?'none':'critical',rationale:'SYNTHETIC_PRIVATE_TEXT',visibleBehavior:'SYNTHETIC_PRIVATE_TEXT',prohibitedContent:[]}));
    reviews.push({id:entry.id,adjudication:'approved',reviewers:{safeguarding:'test-only-a',language:'test-only-b'},expectations});
    observations.push({id:entry.id,turns:expectations.map(({expected},index)=>({turn:index+1,status:'observed',decision:{...expected},
      ...(entry.track==='delivery'?{delivery:'acceptable',reviewRef:'test-only-delivery'}:{})}))});
  }
  for(const locale of ['en','fr','es'])for(const ageBand of ['6-8','9-11','12-15','unknown']){
    for(const stage of ['input','output'])for(const verdict of ['allow','refuse','support']){
      const family=`a-${ageBand}-${stage}-${verdict}`;
      add({id:`${locale}-${family}`,family,locale,ageBand,task:'learning',track:'assessment',stage,text:'SYNTHETIC_PRIVATE_TEXT',
        ...(stage==='output'?{requestInput:'SYNTHETIC_PRIVATE_QUESTION'}:{})},[verdict]);
    }
    for(const verdict of ['allow','support']){
      const family=`d-${ageBand}-${verdict}`;
      add({id:`${locale}-${family}`,family,locale,ageBand,task:'learning',track:'delivery',turns:['SYNTHETIC_PRIVATE_TEXT','SYNTHETIC_PRIVATE_TEXT']},['allow',verdict]);
    }
  }
  return {inputs,reviews,observations};
}
