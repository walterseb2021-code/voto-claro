import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, type AdminAuthResult } from "@/lib/adminAuth";

const noStore={ "Cache-Control":"no-store, max-age=0, private", Pragma:"no-cache", Vary:"Cookie, Origin" };

export function adminProjectJson(status:number,body:Record<string,unknown>){
  return NextResponse.json(body,{status,headers:noStore});
}
export function withAdminAuthCookies(response:NextResponse,gate:AdminAuthResult){
  for(const c of gate.cookiesToSet) response.cookies.set(c.name,c.value,c.options);
  return response;
}
export function requireAdminProject(req:NextRequest){ return requireAdmin(req); }
export function getAdminProjectSupabase(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
  if(!url||!key) throw new Error("Admin project dependency unavailable.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function isAllowedAdminProjectMutationOrigin(req:NextRequest){
  const raw=req.headers.get("origin"); if(!raw) return false;
  let origin:URL; try{origin=new URL(raw);}catch{return false;}
  if(origin.protocol!=="https:"&&origin.protocol!=="http:") return false;
  const host=req.headers.get("x-forwarded-host")||req.headers.get("host");
  const proto=req.headers.get("x-forwarded-proto")||req.nextUrl.protocol.replace(":","");
  if(host&&origin.origin===`${proto}://${host}`) return true;
  return origin.origin===req.nextUrl.origin;
}
export async function readAdminProjectJsonObject(req:NextRequest,maxBytes:number){
  if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json")) return null;
  const len=req.headers.get("content-length");
  if(len){const n=Number(len);if(!Number.isFinite(n)||n<0||n>maxBytes)return null;}
  const raw=await req.text(); if(Buffer.byteLength(raw,"utf8")>maxBytes) return null;
  try{const v=JSON.parse(raw);return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}catch{return null;}
}
export function isUuid(v:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v??"").trim());}
export function validMinimum(v:unknown){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=100000?n:null;}
export function validCount(v:unknown){const n=Number(v);return Number.isInteger(n)&&n>=0&&n<=100000000?n:null;}
