"use server";
/**
 * Account actions. Each runs as the signed-in member, so row-level security
 * decides what they may touch; nothing here trusts an organization id sent by
 * the browser.
 */
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentMember } from "@/lib/supabase/server";
import { slugify } from "@/lib/data/projects";
import { newProjectDocument } from "@/lib/data/newProject";
import { CITY_PRESETS, type CityId } from "@/lib/cityPresets";

export interface ActionState {
  error?: string;
}

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

export async function createOrganization(_: ActionState, form: FormData): Promise<ActionState> {
  const member = await currentMember();
  if (!member) redirect("/sign-in?next=/app");
  const name = text(form, "name", 120);
  if (name.length < 2) return { error: "Enter your company name (at least two characters)." };
  const slug = slugify(text(form, "slug", 48) || name, 48);
  const { error } = await member.supabase.rpc("create_organization", { org_name: name, org_slug: slug });
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { error: `The address “${slug}” is taken. Choose another short name.` };
    if (/already a member/i.test(error.message)) redirect("/app");
    return { error: "Your organization could not be created. Try again." };
  }
  revalidatePath("/app");
  redirect("/app");
}

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  const member = await currentMember();
  if (!member) redirect("/sign-in?next=/app");
  if (!member.org) return { error: "Set up your organization first." };
  const name = text(form, "name", 160);
  if (!name) return { error: "Give the project a name." };
  const city = text(form, "city", 120);
  const backdropInput = text(form, "backdrop", 40);
  const backdrop = (CITY_PRESETS.some((c) => c.id === backdropInput) ? backdropInput : "generic") as CityId;
  const slug = `${slugify(name, 60)}-${randomBytes(2).toString("hex")}`;
  const { data, error } = await member.supabase.from("projects").insert({
    org_id: member.org.id, slug, name, city, status: "Concept", created_by: member.user.id,
    data: newProjectDocument({ name, slug, city, backdrop, location: null }),
  }).select("id").single();
  if (error || !data) return { error: "The project could not be created. Try again." };
  redirect(`/app/projects/${data.id}`);
}
