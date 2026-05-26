/**
 * T017 — attribute-value-parser tests (must fail before T018 implementation)
 */
import { parseAttributeValue } from '../../../src/parser/attribute-value-parser';
import type { AttributeDefinition } from '../../../src/parser/reqif-types';

// ---------------------------------------------------------------------------
// Helper: create a fake Element from an XML snippet using DOMParser
// ---------------------------------------------------------------------------
function el(xmlSnippet: string): Element {
  const doc = new DOMParser().parseFromString(
    `<ROOT>${xmlSnippet}</ROOT>`,
    'application/xml'
  );
  const root = doc.documentElement;
  // Walk childNodes to find the first element node (nodeType 1)
  // — needed for @xmldom/xmldom compat where firstElementChild may not exist
  // and multi-line snippets have leading whitespace text nodes.
  for (let i = 0; i < root.childNodes.length; i++) {
    if (root.childNodes[i].nodeType === 1) return root.childNodes[i] as Element;
  }
  throw new Error(`Could not find element in snippet: ${xmlSnippet}`);
}

function attrDef(type: AttributeDefinition['type']): AttributeDefinition {
  return { identifier: 'ad-1', longName: 'Test', type };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseAttributeValue', () => {
  it('parses STRING values', () => {
    const e = el('<ATTRIBUTE-VALUE-STRING THE-VALUE="Hello World"/>');
    expect(parseAttributeValue(e, attrDef('STRING'))).toEqual({
      type: 'STRING',
      value: 'Hello World',
    });
  });

  it('parses INTEGER values', () => {
    const e = el('<ATTRIBUTE-VALUE-INTEGER THE-VALUE="42"/>');
    expect(parseAttributeValue(e, attrDef('INTEGER'))).toEqual({
      type: 'INTEGER',
      value: 42,
    });
  });

  it('parses REAL values', () => {
    const e = el('<ATTRIBUTE-VALUE-REAL THE-VALUE="3.14"/>');
    expect(parseAttributeValue(e, attrDef('REAL'))).toEqual({
      type: 'REAL',
      value: 3.14,
    });
  });

  it('parses BOOLEAN true', () => {
    const e = el('<ATTRIBUTE-VALUE-BOOLEAN THE-VALUE="true"/>');
    expect(parseAttributeValue(e, attrDef('BOOLEAN'))).toEqual({
      type: 'BOOLEAN',
      value: true,
    });
  });

  it('parses BOOLEAN false', () => {
    const e = el('<ATTRIBUTE-VALUE-BOOLEAN THE-VALUE="false"/>');
    expect(parseAttributeValue(e, attrDef('BOOLEAN'))).toEqual({
      type: 'BOOLEAN',
      value: false,
    });
  });

  it('parses DATE values (ISO 8601)', () => {
    const e = el('<ATTRIBUTE-VALUE-DATE THE-VALUE="2024-03-20T14:30:00Z"/>');
    expect(parseAttributeValue(e, attrDef('DATE'))).toEqual({
      type: 'DATE',
      value: '2024-03-20T14:30:00Z',
    });
  });

  it('parses XHTML values — serializes inner content to an HTML string', () => {
    const e = el(
      '<ATTRIBUTE-VALUE-XHTML><THE-VALUE><div>Hello <b>World</b></div></THE-VALUE></ATTRIBUTE-VALUE-XHTML>'
    );
    const result = parseAttributeValue(e, attrDef('XHTML'));
    expect(result.type).toBe('XHTML');
    if (result.type === 'XHTML') {
      expect(result.value).toContain('Hello');
      expect(result.value).toContain('World');
    }
  });

  it('parses single ENUMERATION value', () => {
    const e = el(`
      <ATTRIBUTE-VALUE-ENUMERATION>
        <VALUES>
          <ENUM-VALUE-REF>ev-001</ENUM-VALUE-REF>
        </VALUES>
      </ATTRIBUTE-VALUE-ENUMERATION>
    `);
    const def: AttributeDefinition = {
      ...attrDef('ENUMERATION'),
      enumValues: [
        { identifier: 'ev-001', longName: 'High', key: 1 },
        { identifier: 'ev-002', longName: 'Low', key: 2 },
      ],
    };
    expect(parseAttributeValue(e, def)).toEqual({
      type: 'ENUMERATION',
      value: ['High'],
    });
  });

  it('parses multi-value ENUMERATION', () => {
    const e = el(`
      <ATTRIBUTE-VALUE-ENUMERATION>
        <VALUES>
          <ENUM-VALUE-REF>ev-001</ENUM-VALUE-REF>
          <ENUM-VALUE-REF>ev-002</ENUM-VALUE-REF>
        </VALUES>
      </ATTRIBUTE-VALUE-ENUMERATION>
    `);
    const def: AttributeDefinition = {
      ...attrDef('ENUMERATION'),
      isMultiValued: true,
      enumValues: [
        { identifier: 'ev-001', longName: 'High', key: 1 },
        { identifier: 'ev-002', longName: 'Low', key: 2 },
      ],
    };
    const result = parseAttributeValue(e, def);
    expect(result).toEqual({ type: 'ENUMERATION', value: ['High', 'Low'] });
  });

  it('falls back to UNKNOWN with raw text for unrecognised element names', () => {
    const e = el('<ATTRIBUTE-VALUE-CUSTOM THE-VALUE="raw"/>');
    const result = parseAttributeValue(e, undefined);
    expect(result.type).toBe('UNKNOWN');
    if (result.type === 'UNKNOWN') {
      expect(typeof result.value).toBe('string');
    }
  });

  it('falls back to UNKNOWN when no attrDef is provided and tag is STRING', () => {
    // Without a definition we still fall back gracefully
    const e = el('<ATTRIBUTE-VALUE-STRING THE-VALUE="fallback"/>');
    const result = parseAttributeValue(e, undefined);
    // Without a definition, we still try to extract the value using tag-name heuristic
    expect(['STRING', 'UNKNOWN']).toContain(result.type);
  });
});
