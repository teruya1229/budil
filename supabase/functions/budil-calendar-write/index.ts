/**
 * Google Calendar write boundary: deployed in HARD OFF mode.
 * Adds a separately owner-gated, read-only credential diagnostic.
 * A production deployment, a durable backend, dedicated Google write scope,
 * owner consent and tenant binding require a separate explicit approval.
 * No Google credential or customer data is logged by this entrypoint.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {createSupabaseAuthorityPorts} from './authority.mjs';
import {createCalendarWriteHandler} from './handler.mjs';
import {createDiagnosticHttpHandler} from './diagnostic-route.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
if(!url||!anon||!service)throw Error('SERVER_CONFIGURATION_MISSING');
const authClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const adminClient=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const ports=createSupabaseAuthorityPorts({authClient,adminClient});
// The following hard OFF gate cannot be remotely overridden by an env var.
const handler=createCalendarWriteHandler({ports,writeEnabled:false,backend:null});
const diagnostic=createDiagnosticHttpHandler({
  ports,
  // Values stay inside Edge runtime. No logging, frontend output or persistence.
  readSecret:(key)=>Deno.env.get(key)||null
});
Deno.serve((req:Request)=>{
  const path=new URL(req.url).pathname;
  if(path.endsWith('/diagnostic'))return diagnostic(req);
  return handler(req);
});
