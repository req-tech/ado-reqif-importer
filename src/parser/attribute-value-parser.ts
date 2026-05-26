import type { AttributeDefinition, AttributeValue } from './reqif-types';

// ---------------------------------------------------------------------------
// Tag-name → type heuristic (used when no AttributeDefinition is available)
// ---------------------------------------------------------------------------
const TAG_VALUE_TYPE: Record<string, AttributeValue['type']> = {
  'ATTRIBUTE-VALUE-STRING': 'STRING',
  'ATTRIBUTE-VALUE-XHTML': 'XHTML',
  'ATTRIBUTE-VALUE-INTEGER': 'INTEGER',
  'ATTRIBUTE-VALUE-REAL': 'REAL',
  'ATTRIBUTE-VALUE-BOOLEAN': 'BOOLEAN',
  'ATTRIBUTE-VALUE-DATE': 'DATE',
  'ATTRIBUTE-VALUE-ENUMERATION': 'ENUMERATION',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a typed AttributeValue from an ATTRIBUTE-VALUE-* XML element.
 * When `attrDef` is undefined the function uses the element tag name as a
 * heuristic; for unknown tags it returns `{ type: 'UNKNOWN', value: rawText }`.
 */
export function parseAttributeValue(
  el: Element,
  attrDef: AttributeDefinition | undefined
): AttributeValue {
  const tagName = el.tagName.toUpperCase();
  const type: AttributeValue['type'] =
    attrDef?.type ?? TAG_VALUE_TYPE[tagName] ?? 'UNKNOWN';

  switch (type) {
    case 'STRING':
      return { type: 'STRING', value: el.getAttribute('THE-VALUE') ?? '' };

    case 'INTEGER': {
      const raw = el.getAttribute('THE-VALUE') ?? '0';
      return { type: 'INTEGER', value: parseInt(raw, 10) };
    }

    case 'REAL': {
      const raw = el.getAttribute('THE-VALUE') ?? '0';
      return { type: 'REAL', value: parseFloat(raw) };
    }

    case 'BOOLEAN':
      return { type: 'BOOLEAN', value: el.getAttribute('THE-VALUE') === 'true' };

    case 'DATE':
      return { type: 'DATE', value: el.getAttribute('THE-VALUE') ?? '' };

    case 'XHTML': {
      const theValueEls = el.getElementsByTagName('THE-VALUE');
      const theValue = theValueEls.length > 0 ? theValueEls[0] : null;
      const html = theValue ? serializeInnerXml(theValue) : '';
      return { type: 'XHTML', value: html };
    }

    case 'ENUMERATION': {
      const refs = Array.from(el.getElementsByTagName('ENUM-VALUE-REF')).map(
        (r) => r.textContent?.trim() ?? ''
      );
      const enumValues = attrDef?.enumValues ?? [];
      const longNames = refs.map((refId) => {
        const ev = enumValues.find((e) => e.identifier === refId);
        return ev?.longName ?? refId;
      });
      return { type: 'ENUMERATION', value: longNames };
    }

    default:
      return { type: 'UNKNOWN', value: el.textContent?.trim() ?? '' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialise the child nodes of an element to a string (inner XML). */
function serializeInnerXml(el: Element): string {
  return new XMLSerializer().serializeToString(el).replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
}
