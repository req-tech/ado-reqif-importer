const { zipSync } = require('fflate');

const reqifXml = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="hdr-z001">
      <CREATION-TIME>2024-06-01T00:00:00Z</CREATION-TIME>
      <REQ-IF-TOOL-ID>TestTool</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <TITLE>Zipped Document</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-TYPES/>
      <SPEC-OBJECTS/>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;

const bytes = new TextEncoder().encode(reqifXml);
const zipped = zipSync({ 'sample.reqif': bytes });
process.stdout.write(Buffer.from(zipped).toString('base64'));
