// src/models/mapping.ts
// Mapping configuration types — persisted in ADO Extension Data Service.

/** Top-level saved profile stored in ADO Extension Data Service */
export interface MappingProfile {
  /** Unique profile name — used as the document ID in ADO Data Service */
  id: string;
  displayName: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Name of the ADO custom field that stores the ReqIF identifier */
  reqIfIdentifierField: string; // e.g., "Custom.ReqIFIdentifier"
  /** One TypeMapping per ReqIF SpecType */
  typeMappings: TypeMapping[];
  /** Default field values for required ADO fields not covered by attribute mappings. key = field ref name */
  fieldDefaults?: Record<string, string>;
}

/** Maps one ReqIF SpecType to one ADO Work Item type */
export interface TypeMapping {
  /** SpecType.identifier from the ReqIF file */
  reqIfSpecTypeId: string;
  /** Human-readable name for display */
  reqIfSpecTypeName: string;
  /** ADO Work Item type name, e.g., "Requirement" or "User Story" */
  adoWorkItemType: string;
  /** One AttributeMapping per attribute in this SpecType */
  attributeMappings: AttributeMapping[];
}

/** Maps one ReqIF attribute to one ADO Work Item field */
export interface AttributeMapping {
  /** AttributeDefinition.identifier */
  reqIfAttributeId: string;
  /** AttributeDefinition.longName — for display */
  reqIfAttributeName: string;
  /** ADO field reference name, e.g., "System.Title" or "Custom.Priority" */
  adoFieldRefName: string;
  /** ADO field display name — for display */
  adoFieldName: string;
  /** Whether this mapping is enabled (user can toggle off individual attrs) */
  enabled: boolean;
  /** Value-level mappings for ENUMERATION attributes */
  enumValueMappings?: EnumValueMapping[];
}

/** Maps one ReqIF enum value name to the corresponding ADO field value */
export interface EnumValueMapping {
  /** Human-readable name from the ReqIF ENUM-VALUE LONG-NAME */
  reqIfEnumValueName: string;
  /** ADO field value to set (e.g. "2" for priority, "Active" for state) */
  adoValue: string;
}
