import { type NextRequest } from "next/server";
import {adminProjectJson,getAdminProjectSupabase,isAllowedAdminProjectMutationOrigin,isUuid,readAdminProjectJsonObject,requireAdminProject,validCount,validMinimum,withAdminAuthCookies} from "@/lib/adminProjectApi";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const score=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=15?n:null;};
const round2=(n:number)=>Math.round(n*100)/100;
export async function POST(req:NextRequest){
  if(!isAllowedAdminProjectMutationOrigin(req))return adminProjectJson(403,{success:false,error:"origin_invalid"});
  const gate=await requireAdminProject(req);
  if(!gate.ok)return withAdminAuthCookies(adminProjectJson(gate.status,{success:false,error:gate.error}),gate);
  const b=await readAdminProjectJsonObject(req,4096);
  if(!b)return withAdminAuthCookies(adminProjectJson(400,{success:false,error:"Solicitud inválida."}),gate);
  const projectId=String(b.projectId??"").trim();
  if(!isUuid(projectId))return withAdminAuthCookies(adminProjectJson(400,{success:false,error:"projectId inválido."}),gate);
  if(String(b.confirm??"")!=="yes")return withAdminAuthCookies(adminProjectJson(400,{success:false,error:"La evaluación no fue confirmada."}),gate);
  const impact=score(b.impact),clarity=score(b.clarity),viability=score(b.viability),sustainability=score(b.sustainability);
  if([impact,clarity,viability,sustainability].some(v=>v==null))return withAdminAuthCookies(adminProjectJson(400,{success:false,error:"Todos los puntajes deben ser números válidos entre 0 y 15."}),gate);
  try{
    const db=getAdminProjectSupabase();
    const {data:existing,error:e1}=await db.from("project_evaluations").select("id").eq("project_id",projectId).limit(1).maybeSingle();
    if(e1)return withAdminAuthCookies(adminProjectJson(503,{success:false,error:"No se pudo verificar la evaluación."}),gate);
    if(existing)return withAdminAuthCookies(adminProjectJson(409,{success:false,error:"Ya existe una evaluación para este proyecto."}),gate);
    const {data:p,error:e2}=await db.from("projects").select("id,status,beneficiary_count,minimum_supports_required").eq("id",projectId).limit(1).maybeSingle();
    if(e2)return withAdminAuthCookies(adminProjectJson(503,{success:false,error:"No se pudo verificar el proyecto."}),gate);
    if(!p)return withAdminAuthCookies(adminProjectJson(404,{success:false,error:"Proyecto no encontrado."}),gate);
    if(p.status!=="active")return withAdminAuthCookies(adminProjectJson(409,{success:false,error:"Solo se pueden evaluar proyectos activos."}),gate);
    const count=validCount(p.beneficiary_count),minimum=validMinimum(p.minimum_supports_required);
    if(count==null||minimum==null)return withAdminAuthCookies(adminProjectJson(409,{success:false,error:"El proyecto no tiene un umbral de apoyos válido configurado."}),gate);
    if(count<minimum)return withAdminAuthCookies(adminProjectJson(409,{success:false,error:`Este proyecto todavía no puede evaluarse. Le faltan ${minimum-count} apoyos.`}),gate);
    const quality=round2((impact as number)+(clarity as number)+(viability as number)+(sustainability as number));
    const citizen=40,finalScore=round2(citizen+quality);
    const {error:e3}=await db.from("project_evaluations").insert({
      project_id:projectId,judge_name:"Admin",impact_score:impact,originality_score:clarity,
      viability_score:viability,participation_score:sustainability,citizen_support_score:citizen,
      quality_score:quality,final_score:finalScore,
      comments:`Evaluación 40/60 aplicada. Respaldo ciudadano: ${citizen}/40. Calidad del proyecto: ${quality}/60. Impacto: ${impact}/15. Claridad: ${clarity}/15. Viabilidad: ${viability}/15. Sostenibilidad: ${sustainability}/15.`
    });
    if(e3)return withAdminAuthCookies(adminProjectJson(503,{success:false,error:"No se pudo guardar la evaluación."}),gate);
    const {error:e4}=await db.from("projects").update({eligible_for_final_review:true,final_score:finalScore,score_updated_at:new Date().toISOString()}).eq("id",projectId);
    if(e4)return withAdminAuthCookies(adminProjectJson(503,{success:false,error:"La evaluación se guardó, pero no se pudo actualizar el puntaje del proyecto."}),gate);
    return withAdminAuthCookies(adminProjectJson(200,{success:true,citizen_support_score:citizen,quality_score:quality,final_score:finalScore}),gate);
  }catch{return withAdminAuthCookies(adminProjectJson(503,{success:false,error:"Error al guardar evaluación."}),gate);}
}
