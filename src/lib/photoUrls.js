import { base44 } from "@/api/base44Client";

/**
 * Maps stored photo values to displayable URLs.
 * - Private file URIs get a short-lived signed URL (fallback to the raw value on error).
 * - Legacy public URLs pass through unchanged.
 */
export async function getSignedPhotoUrls(values = []) {
  if (!Array.isArray(values) || !values.length) return [];
  const results = await Promise.allSettled(
    values.map((v) => base44.integrations.Core.CreateFileSignedUrl({ file_uri: v }))
  );
  return values.map((v, i) => {
    const r = results[i];
    return r.status === "fulfilled" && r.value?.signed_url ? r.value.signed_url : v;
  });
}