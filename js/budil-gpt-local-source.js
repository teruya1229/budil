/**
 * Adapter between Budil's existing Storage and the read-only GPT business
 * tools. This does NOT import Storage or touch localStorage itself.
 * Caller must explicitly provide Storage from an already-opened Budil app.
 * No automatic reads, no login bypass, no network, no write methods.
 *
 * Do not expose source/gateway dependencies to the model. Model receives
 * only result.modelReceipt; result.view remains browser-local.
 */
const BudilGptLocalSource = (() => {
  'use strict';
  const allowed=Object.freeze([
    'customer.search','document.search','work.search','receivables.summary'
  ]);
  const getters=Object.freeze({
    'customer.search':['getLeads'],
    'document.search':['getDocuments'],
    'work.search':['getWorkOrders'],
    'receivables.summary':['getRevenueRecords','getDocuments']
  });
  const fail=code=>({
    ok:false,code,localOnly:true,persisted:false,networkUsed:false
  });
  function make({storage,readonly,customerResolver,paymentBrain}={}) {
    // Construction performs NO READ and DOES NOT retain any customer snapshot.
    if(!storage||typeof storage!=='object'||!readonly||
       typeof readonly.perform!=='function') return Object.freeze({
      query:()=>fail('DEPENDENCY_MISSING')
    });
    const query=(request,consent)=>{
      if(consent!==true)return fail('LOCAL_CONSENT_REQUIRED');
      if(!request||typeof request!=='object'||Array.isArray(request)||
         !allowed.includes(request.action))return fail('ACTION_NOT_ALLOWED');
      const required=getters[request.action];
      if(!required.every(k=>typeof storage[k]==='function'))
        return fail('DATA_SOURCE_UNAVAILABLE');
      const deps={
        customerResolver,paymentBrain
      };
      // Construct *only* the getters necessary for the one requested action;
      // no eager reads, migration, saves, client storage or remote queries.
      for(const key of required){
        deps[key]=()=>storage[key]();
      }
      try {
        const result=readonly.perform(request,deps,true);
        if(!result||typeof result!=='object')return fail('READ_UNAVAILABLE');
        return result;
      } catch(_){return fail('READ_UNAVAILABLE');}
    };
    return Object.freeze({query,actions:allowed});
  }
  return Object.freeze({make});
})();
if(typeof module!=='undefined'&&module.exports)module.exports={BudilGptLocalSource};
