import "server-only";
import { config } from "../config";
import { localRepo } from "./local";
import type { Repo } from "./repo";
import { supabaseRepo } from "./supabase";

export function repo(): Repo {
  if (config.supabaseUrl && config.supabaseServiceKey) return supabaseRepo;
  if (process.env.VERCEL) {
    throw new Error("Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY – na Vercelu je databáze povinná.");
  }
  return localRepo;
}

export type { Repo, LeadPatch } from "./repo";
