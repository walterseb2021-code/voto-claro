import { type NextRequest } from "next/server";
import {adminProjectJson,getAdminProjectSupabase,isAllowedAdminProjectMutationOrigin,isUuid,readAdminProjectJsonObject,requireAdminProject,withAdminAuthCookies} from "@/lib/adminProjectApi";
export const runtime="nodejs"; export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};
function leader(v:any){const r=Array.isArray(v)?v[0]:v;return r?{full_name:r.full_name??null,alias:r.alias??null,email:r.email??null}:null;}
export async function GET(req:NextRequest,ctx:Ctx){
  const gate=await requireAdminProject(req);
  if(!gate.ok)return withAdminAuthCookies(adminProjectJson(gate.status,{ok:false,error:gate.error}),gate);
  const {id}=await ctx.params;if(!isUuid(id))return withAdminAuthCookies(adminProjectJson(400,{ok:false,error:"project_id_invalid"}),gate);
  try{
    const db=getAdminProjectSupabase();
    const {data,error}=await db.from("projects").select(`
      id,name,category,objective,description,district,department,pdf_url,status,created_at,
      beneficiary_count,requested_budget,budget_category,minimum_supports_required,
      eligible_for_final_review,leader:project_participants!leader_id(full_name,alias,email)
    `).eq("id",id).limit(1).maybeSingle();
    if(error)return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"project_unavailable"}),gate);
    if(!data)return withAdminAuthCookies(adminProjectJson(404,{ok:false,error:"project_not_found"}),gate);
    return withAdminAuthCookies(adminProjectJson(200,{ok:true,project:{...data,leader:leader((data as any).leader)}}),gate);
  }catch{return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"project_unavailable"}),gate);}
}
export async function PATCH(req:NextRequest,ctx:Ctx){
  if(!isAllowedAdminProjectMutationOrigin(req))return adminProjectJson(403,{ok:false,error:"origin_invalid"});
  const gate=await requireAdminProject(req);
  if(!gate.ok)return withAdminAuthCookies(adminProjectJson(gate.status,{ok:false,error:gate.error}),gate);
  const {id}=await ctx.params;if(!isUuid(id))return withAdminAuthCookies(adminProjectJson(400,{ok:false,error:"project_id_invalid"}),gate);
  const body=await readAdminProjectJsonObject(req,1024);
  if(!body)return withAdminAuthCookies(adminProjectJson(400,{ok:false,error:"request_invalid"}),gate);
  const status=String(body.status??"").trim().toLowerCase();
  if(status!=="active"&&status!=="disqualified")return withAdminAuthCookies(adminProjectJson(400,{ok:false,error:"status_invalid"}),gate);
  try{
    const db=getAdminProjectSupabase();
    const {data,error}=await db.from("projects").update({status}).eq("id",id).select("id,status").limit(1).maybeSingle();
    if(error)return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"update_unavailable"}),gate);
    if(!data)return withAdminAuthCookies(adminProjectJson(404,{ok:false,error:"project_not_found"}),gate);
    return withAdminAuthCookies(adminProjectJson(200,{ok:true,project:data}),gate);
  }catch{return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"update_unavailable"}),gate);}
}
