import { type NextRequest } from "next/server";
import {adminProjectJson,getAdminProjectSupabase,requireAdminProject,withAdminAuthCookies} from "@/lib/adminProjectApi";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const allowed=new Set(["pending","active","disqualified"]);
function leader(v:any){const r=Array.isArray(v)?v[0]:v;return r?{full_name:r.full_name??null,alias:r.alias??null}:null;}
export async function GET(req:NextRequest){
  const gate=await requireAdminProject(req);
  if(!gate.ok)return withAdminAuthCookies(adminProjectJson(gate.status,{ok:false,error:gate.error}),gate);
  const status=String(req.nextUrl.searchParams.get("status")||"pending").trim().toLowerCase();
  if(!allowed.has(status))return withAdminAuthCookies(adminProjectJson(400,{ok:false,error:"status_invalid"}),gate);
  try{
    const db=getAdminProjectSupabase();
    const {data,error}=await db.from("projects").select(`
      id,name,category,objective,district,department,pdf_url,status,created_at,
      beneficiary_count,requested_budget,budget_category,minimum_supports_required,
      eligible_for_final_review,
      leader:project_participants!leader_id(full_name,alias),
      evaluation:project_evaluations(id)
    `).eq("status",status).order("created_at",{ascending:false}).limit(500);
    if(error){console.error("[admin-projects] list failed");return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"projects_unavailable"}),gate);}
    const projects=(data||[]).map((x:any)=>({...x,leader:leader(x.leader),evaluation_exists:Array.isArray(x.evaluation)?x.evaluation.length>0:Boolean(x.evaluation),evaluation:undefined}));
    return withAdminAuthCookies(adminProjectJson(200,{ok:true,projects}),gate);
  }catch{console.error("[admin-projects] unexpected");return withAdminAuthCookies(adminProjectJson(503,{ok:false,error:"projects_unavailable"}),gate);}
}
