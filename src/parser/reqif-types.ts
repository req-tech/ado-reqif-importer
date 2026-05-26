// src/parser/reqif-types.ts
// All ReqIF parsed-domain types — pure interfaces, no runtime behaviour.

/** Root document parsed from a .reqif / .reqifz file */
export interface ReqIfDocument {
  /** Parsed from REQ-IF/THE-HEADER */
  header: ReqIfHeader;
  /** All SpecType definitions keyed by their IDENTIFIER */
  specTypes: Map<string, SpecType>;
  /** All SpecObject instances keyed by their IDENTIFIER */
  specObjects: Map<string, SpecObject>;
  /** Total count of SpecObjects for display */
  specObjectCount: number;
  /** Ordered list of all SpecObject identifiers (preserves file order) */
  specObjectOrder: string[];
  /** Non-fatal warnings discovered during parsing */
  parseWarnings: ParseWarning[];
}

export interface ReqIfHeader {
  identifier: string;
  title: string;
  creationTime: string; // ISO 8601
  reqIfVersion: string; // "1.0" | "1.2"
  sourceToolId?: string;
  repositoryId?: string;
}

/** A SpecType defines a category of requirement (e.g., "SoftwareRequirement") */
export interface SpecType {
  identifier: string;
  longName: string;
  /** All attribute definitions for this type, keyed by IDENTIFIER */
  attributeDefinitions: Map<string, AttributeDefinition>;
}

/** Defines one attribute slot on a SpecType */
export interface AttributeDefinition {
  identifier: string;
  longName: string;
  type: ReqIfAttributeType;
  /** For ENUMERATION type: allowed values */
  enumValues?: EnumValue[];
  isMultiValued?: boolean; // ENUMERATION only
}

export type ReqIfAttributeType =
  | 'STRING'
  | 'XHTML'
  | 'INTEGER'
  | 'REAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'ENUMERATION'
  | 'UNKNOWN';

export interface EnumValue {
  identifier: string;
  longName: string;
  key: number;
}

/** A single parsed requirement */
export interface SpecObject {
  identifier: string; // ReqIF IDENTIFIER (unique in file)
  longName: string; // LONG-NAME (human readable)
  specTypeId: string; // references SpecType.identifier
  /** Attribute values keyed by AttributeDefinition.identifier */
  attributeValues: Map<string, AttributeValue>;
  lastChange: string; // ISO 8601
}

/** Typed value container — discriminated union */
export type AttributeValue =
  | { type: 'STRING'; value: string }
  | { type: 'XHTML'; value: string } // serialized safe HTML
  | { type: 'INTEGER'; value: number }
  | { type: 'REAL'; value: number }
  | { type: 'BOOLEAN'; value: boolean }
  | { type: 'DATE'; value: string } // ISO 8601
  | { type: 'ENUMERATION'; value: string[] } // longNames of selected values
  | { type: 'UNKNOWN'; value: string }; // raw XML text fallback

export interface ParseWarning {
  level: 'warning' | 'info';
  message: string;
  context?: string; // e.g., SpecObject identifier
}
