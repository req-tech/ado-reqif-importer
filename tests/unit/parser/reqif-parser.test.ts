/**
 * T015 — reqif-parser tests (must fail before T016 implementation)
 * Tests use browser-compatible DOMParser shim provided by dom-shim.ts
 */

import { parseReqIfFile } from '../../../src/parser/reqif-parser';

// ---------------------------------------------------------------------------
// Helper: build a minimal ReqIF XML string
// ---------------------------------------------------------------------------
function buildReqIfXml(opts: {
  specTypes?: string;
  specObjects?: string;
  headerTitle?: string;
}): string {
  const headerTitle = opts.headerTitle ?? 'Test Document';
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="hdr-001">
      <CREATION-TIME>2024-01-15T10:00:00Z</CREATION-TIME>
      <REQ-IF-TOOL-ID>TestTool</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>SomeExportTool</SOURCE-TOOL-ID>
      <TITLE>${headerTitle}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-TYPES>
        ${opts.specTypes ?? ''}
      </SPEC-TYPES>
      <SPEC-OBJECTS>
        ${opts.specObjects ?? ''}
      </SPEC-OBJECTS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;
}

const SAMPLE_SPEC_TYPE = `
<SPEC-OBJECT-TYPE IDENTIFIER="st-001" LONG-NAME="SoftwareRequirement" LAST-CHANGE="2024-01-01T00:00:00Z">
  <SPEC-ATTRIBUTES>
    <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-title" LONG-NAME="Title" LAST-CHANGE="2024-01-01T00:00:00Z">
      <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-string</DATATYPE-DEFINITION-STRING-REF></TYPE>
    </ATTRIBUTE-DEFINITION-STRING>
    <ATTRIBUTE-DEFINITION-INTEGER IDENTIFIER="ad-priority" LONG-NAME="Priority" LAST-CHANGE="2024-01-01T00:00:00Z">
      <TYPE><DATATYPE-DEFINITION-INTEGER-REF>dt-int</DATATYPE-DEFINITION-INTEGER-REF></TYPE>
    </ATTRIBUTE-DEFINITION-INTEGER>
    <ATTRIBUTE-DEFINITION-BOOLEAN IDENTIFIER="ad-active" LONG-NAME="Active" LAST-CHANGE="2024-01-01T00:00:00Z">
      <TYPE><DATATYPE-DEFINITION-BOOLEAN-REF>dt-bool</DATATYPE-DEFINITION-BOOLEAN-REF></TYPE>
    </ATTRIBUTE-DEFINITION-BOOLEAN>
  </SPEC-ATTRIBUTES>
</SPEC-OBJECT-TYPE>`;

function buildSpecObject(id: string, specTypeId = 'st-001', longName = `Req ${id}`): string {
  return `
<SPEC-OBJECT IDENTIFIER="${id}" LONG-NAME="${longName}" LAST-CHANGE="2024-02-01T00:00:00Z">
  <TYPE><SPEC-OBJECT-TYPE-REF>${specTypeId}</SPEC-OBJECT-TYPE-REF></TYPE>
  <VALUES>
    <ATTRIBUTE-VALUE-STRING THE-VALUE="The title for ${id}">
      <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-title</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
    </ATTRIBUTE-VALUE-STRING>
    <ATTRIBUTE-VALUE-INTEGER THE-VALUE="3">
      <DEFINITION><ATTRIBUTE-DEFINITION-INTEGER-REF>ad-priority</ATTRIBUTE-DEFINITION-INTEGER-REF></DEFINITION>
    </ATTRIBUTE-VALUE-INTEGER>
    <ATTRIBUTE-VALUE-BOOLEAN THE-VALUE="true">
      <DEFINITION><ATTRIBUTE-DEFINITION-BOOLEAN-REF>ad-active</ATTRIBUTE-DEFINITION-BOOLEAN-REF></DEFINITION>
    </ATTRIBUTE-VALUE-BOOLEAN>
  </VALUES>
</SPEC-OBJECT>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseReqIfFile', () => {
  describe('Header extraction', () => {
    it('extracts header fields from a valid .reqif file', async () => {
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE, headerTitle: 'My Requirements' });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.header.identifier).toBe('hdr-001');
      expect(doc.header.title).toBe('My Requirements');
      expect(doc.header.reqIfVersion).toBe('1.0');
      expect(doc.header.creationTime).toBe('2024-01-15T10:00:00Z');
      expect(doc.header.sourceToolId).toBe('SomeExportTool');
    });
  });

  describe('SpecType parsing', () => {
    it('parses a SpecType with STRING, INTEGER and BOOLEAN attribute definitions', async () => {
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.specTypes.size).toBe(1);
      const st = doc.specTypes.get('st-001')!;
      expect(st.longName).toBe('SoftwareRequirement');
      expect(st.attributeDefinitions.size).toBe(3);

      const titleDef = st.attributeDefinitions.get('ad-title')!;
      expect(titleDef.type).toBe('STRING');
      expect(titleDef.longName).toBe('Title');

      const priosDef = st.attributeDefinitions.get('ad-priority')!;
      expect(priosDef.type).toBe('INTEGER');

      const activeDef = st.attributeDefinitions.get('ad-active')!;
      expect(activeDef.type).toBe('BOOLEAN');
    });

    it('parses multiple SpecTypes', async () => {
      const secondType = SAMPLE_SPEC_TYPE.replace('st-001', 'st-002').replace(
        'SoftwareRequirement',
        'HardwareRequirement'
      );
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE + secondType });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.specTypes.size).toBe(2);
      expect(doc.specTypes.has('st-001')).toBe(true);
      expect(doc.specTypes.has('st-002')).toBe(true);
    });
  });

  describe('SpecObject parsing', () => {
    it('parses 10 SpecObjects with STRING/INTEGER/BOOLEAN attributes', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `obj-${String(i + 1).padStart(3, '0')}`);
      const specObjects = ids.map((id) => buildSpecObject(id)).join('\n');
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE, specObjects });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.specObjectCount).toBe(10);
      expect(doc.specObjectOrder).toHaveLength(10);
      expect(doc.specObjectOrder[0]).toBe('obj-001');
      expect(doc.specObjectOrder[9]).toBe('obj-010');

      const first = doc.specObjects.get('obj-001')!;
      expect(first.specTypeId).toBe('st-001');

      const titleVal = first.attributeValues.get('ad-title');
      expect(titleVal).toEqual({ type: 'STRING', value: 'The title for obj-001' });

      const prioVal = first.attributeValues.get('ad-priority');
      expect(prioVal).toEqual({ type: 'INTEGER', value: 3 });

      const activeVal = first.attributeValues.get('ad-active');
      expect(activeVal).toEqual({ type: 'BOOLEAN', value: true });
    });

    it('preserves file order in specObjectOrder', async () => {
      const specObjects =
        buildSpecObject('obj-c') + buildSpecObject('obj-a') + buildSpecObject('obj-b');
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE, specObjects });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.specObjectOrder).toEqual(['obj-c', 'obj-a', 'obj-b']);
    });

    it('returns zero items and no crash for empty SPEC-OBJECTS', async () => {
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE, specObjects: '' });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.specObjectCount).toBe(0);
      expect(doc.specObjectOrder).toHaveLength(0);
      expect(doc.parseWarnings).toHaveLength(0);
    });

    it('adds a warning for SpecObject referencing unknown SpecType', async () => {
      const objWithBadType = buildSpecObject('obj-bad', 'st-unknown');
      const xml = buildReqIfXml({ specTypes: SAMPLE_SPEC_TYPE, specObjects: objWithBadType });
      const buf = new TextEncoder().encode(xml).buffer;

      const doc = await parseReqIfFile(buf, 'test.reqif');

      expect(doc.parseWarnings.length).toBeGreaterThanOrEqual(1);
      const warn = doc.parseWarnings.find((w: { context?: string }) => w.context === 'obj-bad');
      expect(warn).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('rejects with a clear error message for malformed XML', async () => {
      // @xmldom/xmldom is lenient with unclosed tags — test with truly corrupt bytes
      // that cannot produce any valid XML document element.
      const badBytes = new Uint8Array([0xff, 0xfe, 0x00]); // invalid UTF-8 / not XML
      const buf = badBytes.buffer;

      // In both environments, parsing must reject — exact message varies by environment
      await expect(parseReqIfFile(buf, 'broken.reqif')).rejects.toThrow();
    });

    it('rejects with a clear error message when THE-HEADER is missing', async () => {
      const noHeader = `<?xml version="1.0"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <CORE-CONTENT><REQ-IF-CONTENT><SPEC-TYPES/><SPEC-OBJECTS/></REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
      const buf = new TextEncoder().encode(noHeader).buffer;

      await expect(parseReqIfFile(buf, 'noheader.reqif')).rejects.toThrow(/header/i);
    });
  });
});
