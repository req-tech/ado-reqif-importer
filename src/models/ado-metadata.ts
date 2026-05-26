// src/models/ado-metadata.ts
// ADO metadata types fetched at runtime from the current project.

/** Represents one Work Item type available in the current ADO project */
export interface AdoWorkItemType {
  name: string; // e.g., "Requirement"
  referenceName: string; // e.g., "Microsoft.VSTS.WorkItemTypes.Requirement"
  fields: AdoFieldDefinition[];
}

/** Represents one field available on an ADO Work Item type */
export interface AdoFieldDefinition {
  name: string; // e.g., "Title"
  referenceName: string; // e.g., "System.Title"
  type: AdoFieldType;
  isRequired: boolean;
}

export type AdoFieldType =
  | 'string'
  | 'integer'
  | 'double'
  | 'dateTime'
  | 'boolean'
  | 'html'
  | 'plainText'
  | 'picklistString'
  | 'picklistInteger'
  | 'picklistDouble'
  | 'other';
