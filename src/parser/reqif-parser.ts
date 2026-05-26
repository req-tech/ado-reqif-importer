import type {
  ReqIfDocument,
  ReqIfHeader,
  SpecType,
  AttributeDefinition,
  ReqIfAttributeType,
  SpecObject,
  AttributeValue,
  ParseWarning,
} from './reqif-types';
import { parseAttributeValue } from './attribute-value-parser';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .reqif or .reqifz ArrayBuffer and return a structured ReqIfDocument.
 * Throws (rejects) on fatal errors; accumulates non-fatal issues in parseWarnings.
 */
export async function parseReqIfFile(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ReqIfDocument> {
  let xmlSource: ArrayBuffer;

  if (fileName.toLowerCase().endsWith('.reqifz')) {
    xmlSource = await decompressReqIfz(buffer);
  } else {
    xmlSource = buffer;
  }

  const xmlText = new TextDecoder('utf-8').decode(xmlSource);
  return parseReqIfXml(xmlText);
}

// ---------------------------------------------------------------------------
// XML parsing  (uses getElementsByTagName — works in both browser and @xmldom/xmldom)
// ---------------------------------------------------------------------------

function parseReqIfXml(xmlText: string): ReqIfDocument {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Detect parse error — browser returns a <parsererror> child; xmldom throws on
  // truly invalid XML and leaves documentElement null or as parsererror.
  const root = xmlDoc.documentElement;
  if (
    !root ||
    root.tagName === 'parsererror' ||
    root.getElementsByTagName('parsererror').length > 0
  ) {
    const msg =
      (root?.textContent ?? '').trim().slice(0, 200) || 'invalid XML structure';
    throw new Error(`ReqIF XML parse error: ${msg}`);
  }

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------
  const headerEls = root.getElementsByTagName('REQ-IF-HEADER');
  if (!headerEls || headerEls.length === 0) {
    throw new Error(
      'ReqIF file is missing the required THE-HEADER / REQ-IF-HEADER element'
    );
  }
  const header = extractHeader(headerEls[0]);

  // ------------------------------------------------------------------
  // SpecTypes
  // ------------------------------------------------------------------
  const specTypes = new Map<string, SpecType>();
  const specTypeEls = root.getElementsByTagName('SPEC-OBJECT-TYPE');
  for (let i = 0; i < specTypeEls.length; i++) {
    const st = extractSpecType(specTypeEls[i]);
    specTypes.set(st.identifier, st);
  }

  // ------------------------------------------------------------------
  // SpecObjects
  // ------------------------------------------------------------------
  const warnings: ParseWarning[] = [];
  const specObjects = new Map<string, SpecObject>();
  const specObjectOrder: string[] = [];

  const specObjectEls = root.getElementsByTagName('SPEC-OBJECT');
  for (let i = 0; i < specObjectEls.length; i++) {
    const result = extractSpecObject(specObjectEls[i], specTypes, warnings);
    specObjects.set(result.identifier, result);
    specObjectOrder.push(result.identifier);
  }

  return {
    header,
    specTypes,
    specObjects,
    specObjectCount: specObjects.size,
    specObjectOrder,
    parseWarnings: warnings,
  };
}

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

function extractHeader(el: Element): ReqIfHeader {
  return {
    identifier: el.getAttribute('IDENTIFIER') ?? '',
    title: firstChildText(el, 'TITLE'),
    creationTime: firstChildText(el, 'CREATION-TIME'),
    reqIfVersion: firstChildText(el, 'REQ-IF-VERSION'),
    sourceToolId: firstChildText(el, 'SOURCE-TOOL-ID') || undefined,
    repositoryId: firstChildText(el, 'REPOSITORY-ID') || undefined,
  };
}

// ---------------------------------------------------------------------------
// SpecType extraction
// ---------------------------------------------------------------------------

function extractSpecType(el: Element): SpecType {
  const identifier = el.getAttribute('IDENTIFIER') ?? '';
  const longName = el.getAttribute('LONG-NAME') ?? '';
  const attributeDefinitions = new Map<string, AttributeDefinition>();

  const specAttrs = el.getElementsByTagName('SPEC-ATTRIBUTES');
  if (specAttrs.length > 0) {
    const children = specAttrs[0].childNodes;
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType !== 1) continue; // element nodes only
      const ad = extractAttributeDefinition(node as Element);
      if (ad) {
        attributeDefinitions.set(ad.identifier, ad);
      }
    }
  }

  return { identifier, longName, attributeDefinitions };
}

const TAG_TO_TYPE: Record<string, ReqIfAttributeType> = {
  'ATTRIBUTE-DEFINITION-STRING': 'STRING',
  'ATTRIBUTE-DEFINITION-XHTML': 'XHTML',
  'ATTRIBUTE-DEFINITION-INTEGER': 'INTEGER',
  'ATTRIBUTE-DEFINITION-REAL': 'REAL',
  'ATTRIBUTE-DEFINITION-BOOLEAN': 'BOOLEAN',
  'ATTRIBUTE-DEFINITION-DATE': 'DATE',
  'ATTRIBUTE-DEFINITION-ENUMERATION': 'ENUMERATION',
};

function extractAttributeDefinition(el: Element): AttributeDefinition | null {
  const tagName = el.tagName.toUpperCase();
  const type: ReqIfAttributeType = TAG_TO_TYPE[tagName] ?? 'UNKNOWN';
  const identifier = el.getAttribute('IDENTIFIER');
  if (!identifier) return null;

  return {
    identifier,
    longName: el.getAttribute('LONG-NAME') ?? '',
    type,
    isMultiValued: el.getAttribute('MULTI-VALUED') === 'true' || undefined,
  };
}

// ---------------------------------------------------------------------------
// SpecObject extraction
// ---------------------------------------------------------------------------

function extractSpecObject(
  el: Element,
  specTypes: Map<string, SpecType>,
  warnings: ParseWarning[]
): SpecObject {
  const identifier = el.getAttribute('IDENTIFIER') ?? '';
  const longName = el.getAttribute('LONG-NAME') ?? '';
  const lastChange = el.getAttribute('LAST-CHANGE') ?? '';

  // TYPE > SPEC-OBJECT-TYPE-REF
  const typeEls = el.getElementsByTagName('SPEC-OBJECT-TYPE-REF');
  const specTypeId = typeEls.length > 0 ? (typeEls[0].textContent?.trim() ?? '') : '';

  const specType = specTypes.get(specTypeId);
  if (!specType) {
    warnings.push({
      level: 'warning',
      message: `SpecObject "${identifier}" references unknown SpecType "${specTypeId}" — attribute values will not be typed`,
      context: identifier,
    });
  }

  const attributeValues = new Map<string, AttributeValue>();

  // VALUES > ATTRIBUTE-VALUE-*
  const valuesEls = el.getElementsByTagName('VALUES');
  if (valuesEls.length > 0) {
    const valueNodes = valuesEls[0].childNodes;
    for (let i = 0; i < valueNodes.length; i++) {
      const node = valueNodes[i];
      if (node.nodeType !== 1) continue;
      const valueEl = node as Element;

      const defRef = getAttrDefinitionRef(valueEl);
      if (!defRef) continue;

      const attrDef = specType?.attributeDefinitions.get(defRef);
      const parsed = parseAttributeValue(valueEl, attrDef);
      attributeValues.set(defRef, parsed);
    }
  }

  return { identifier, longName, specTypeId, attributeValues, lastChange };
}

/**
 * Extract the attribute definition reference ID from a ATTRIBUTE-VALUE-* element.
 * The ref lives inside <DEFINITION><ATTRIBUTE-DEFINITION-*-REF>id</...></DEFINITION>
 */
function getAttrDefinitionRef(valueEl: Element): string | null {
  const defEls = valueEl.getElementsByTagName('DEFINITION');
  if (defEls.length === 0) return null;
  for (let i = 0; i < defEls[0].childNodes.length; i++) {
    const node = defEls[0].childNodes[i];
    if (node.nodeType === 1) {
      return node.textContent?.trim() ?? null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// .reqifz decompression
// ---------------------------------------------------------------------------

async function decompressReqIfz(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const { unzipSync } = await import('fflate');

  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error(
      'Failed to decompress .reqifz archive — the file may be corrupt or not a valid ZIP'
    );
  }

  const reqifEntry = Object.entries(entries).find(([name]) =>
    name.toLowerCase().endsWith('.reqif')
  );

  if (!reqifEntry) {
    throw new Error(
      'The .reqifz archive does not contain a .reqif file — invalid archive structure'
    );
  }

  return reqifEntry[1].buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function firstChildText(parent: Element, tagName: string): string {
  const els = parent.getElementsByTagName(tagName);
  return els.length > 0 ? (els[0].textContent?.trim() ?? '') : '';
}

