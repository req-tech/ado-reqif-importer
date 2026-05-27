import type { MappingProfile } from '../models/mapping';

/**
 * Trigger a browser download of the mapping profile as a JSON file.
 * @param fileName Optional filename override (without .json extension).
 */
export function exportProfile(profile: MappingProfile, fileName?: string): void {
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const baseName = fileName?.trim() || profile.displayName || 'mapping-config';
  const safeName = baseName.replace(/[^a-z0-9_-]/gi, '_');
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse a JSON file selected by the user as a MappingProfile.
 * Throws with a descriptive message if the file is invalid.
 */
export async function importProfileFromFile(file: File): Promise<MappingProfile> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).typeMappings)
  ) {
    throw new Error('Invalid mapping config: missing typeMappings array.');
  }
  return data as MappingProfile;
}
