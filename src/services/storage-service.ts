import * as SDK from 'azure-devops-extension-sdk';
import type { MappingProfile } from '../models/mapping';

const COLLECTION = 'reqif-mapping-profiles';

// ---------------------------------------------------------------------------
// Internal: get the ADO Extension Data Service
// ---------------------------------------------------------------------------

interface ExtensionDataService {
  getDocuments(collection: string): Promise<unknown[]>;
  getDocument(collection: string, id: string): Promise<unknown>;
  setDocument(collection: string, doc: object): Promise<unknown>;
  deleteDocument(collection: string, id: string): Promise<void>;
}

async function getDataService(): Promise<ExtensionDataService> {
  // SDK.CommonServiceIds.ExtensionDataService is 'ms.vss-features.extension-data-service'
  const svc = await SDK.getService<ExtensionDataService>(
    'ms.vss-features.extension-data-service'
  );
  return svc;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Retrieve all saved mapping profiles. */
export async function listProfiles(): Promise<MappingProfile[]> {
  const svc = await getDataService();
  const docs = await svc.getDocuments(COLLECTION);
  return docs as MappingProfile[];
}

/** Retrieve a single profile by id, or null if not found. */
export async function loadProfile(id: string): Promise<MappingProfile | null> {
  const svc = await getDataService();
  try {
    const doc = await svc.getDocument(COLLECTION, id);
    return doc as MappingProfile;
  } catch {
    return null;
  }
}

/** Create or update a mapping profile. */
export async function saveProfile(profile: MappingProfile): Promise<void> {
  const svc = await getDataService();
  await svc.setDocument(COLLECTION, profile);
}

/** Delete a mapping profile by id. */
export async function deleteProfile(id: string): Promise<void> {
  const svc = await getDataService();
  await svc.deleteDocument(COLLECTION, id);
}
