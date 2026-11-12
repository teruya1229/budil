/**
 * Google Calendar write prototype: deliberately NON-DEPLOYED and ALWAYS OFF.
 * A production deployment, a durable backend, dedicated Google write scope,
 * owner consent and tenant binding require a separate explicit approval.
 * No Google credential or customer data is logged by this entrypoint.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {createSupabaseAuthorityPorts} from './authority.mjs';
import {createCalendarWriteHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
if(!url||!anon||!service)throw Error('SERVER_CONFIGURATION_MISSING');
const authClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const adminClient=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const ports=createSupabaseAuthorityPorts({authClient,adminClient});
// The following hard OFF gate cannot be remotely overridden by an env var.
const handler=createCalendarWriteHandler({ports,writeEnabled:false,backend:null});
Deno.serve(handler);
