/**
 * Customer images live in private Supabase Storage. In the project document
 * they are written `storage:<bucket>/<path>`; pages swap them for short-lived
 * signed URLs before rendering. Bundled sample images (`/projects/...`) pass
 * through unchanged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/content/projects";

export const STORAGE_PREFIX = "storage:";
export const storageRef = (bucket: string, path: string) => `${STORAGE_PREFIX}${bucket}/${path}`;
export function parseStorageRef(src: string): { bucket: string; path: string } | null {
  if (!src.startsWith(STORAGE_PREFIX)) return null;
  const rest = src.slice(STORAGE_PREFIX.length), i = rest.indexOf("/");
  return i > 0 ? { bucket: rest.slice(0, i), path: rest.slice(i + 1) } : null;
}

/** Replace every storage reference with a signed URL valid for `seconds`. Unsignable images are dropped. */
export async function withSignedImages(client: SupabaseClient, project: Project, seconds = 3600): Promise<Project> {
  const heroImages = await Promise.all(project.heroImages.map(async (image) => {
    const ref = parseStorageRef(image.src);
    if (!ref) return image;
    const { data } = await client.storage.from(ref.bucket).createSignedUrl(ref.path, seconds);
    return data?.signedUrl ? { ...image, src: data.signedUrl } : null;
  }));
  return { ...project, heroImages: heroImages.filter((i): i is Project["heroImages"][number] => !!i) };
}
