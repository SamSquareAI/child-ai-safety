import {createHash} from 'node:crypto';

/** Stable JSON binding: sorted object keys, preserved array order, data only. */
export function corpusDigest(value){
  const active=new Set();
  function canonical(item,depth=0){
    if(depth>64)throw new TypeError('Invalid JSON binding');
    if(item===null||typeof item==='string'||typeof item==='boolean')return item;
    if(typeof item==='number'&&Number.isFinite(item))return item;
    if(!item||typeof item!=='object'||active.has(item)||
      (!Array.isArray(item)&&![Object.prototype,null].includes(Object.getPrototypeOf(item))))throw new TypeError('Invalid JSON binding');
    active.add(item);
    try{
      const keys=Reflect.ownKeys(item);
      if(Array.isArray(item)){
        if(keys.length!==item.length+1)throw new TypeError('Invalid JSON binding');
        return Array.from({length:item.length},(_,index)=>{
          const d=Object.getOwnPropertyDescriptor(item,String(index));
          if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid JSON binding');
          return canonical(d.value,depth+1);
        });
      }
      if(keys.some(key=>typeof key!=='string'))throw new TypeError('Invalid JSON binding');
      return Object.fromEntries(keys.sort().map(key=>{
        const d=Object.getOwnPropertyDescriptor(item,key);
        if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw new TypeError('Invalid JSON binding');
        return [key,canonical(d.value,depth+1)];
      }));
    }finally{active.delete(item);}
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
