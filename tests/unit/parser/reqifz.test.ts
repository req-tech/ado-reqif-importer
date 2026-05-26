/**
 * T019 — .reqifz decompression tests (added to reqif-parser test suite)
 */

import { parseReqIfFile } from '../../../src/parser/reqif-parser';

// Base64-encoded .reqifz archive containing a minimal sample.reqif
// Generated via: node tests/setup/gen-fixture.js
const SAMPLE_REQIFZ_B64 =
  'UEsDBBQAAAAIADZ8ulw+8IxmGwEAAAICAAAMAAAAc2FtcGxlLnJlcWlmXZBRT8IwFIXf+RXN3rt2hBhDSglud6EGGZaribyyiktgHdsU4q+3bgwdSV/63XPuyT1iej7syZcpq8zmEy/wuUdMvrVplu8m3gvG9N6byoHQ8ExVTJw4rybeR10XY8ZOp5NvDzvfljtWFWbLtDmqmA15EPARD1hpjtm7f65STw4IETgHOodZBPr360C79MKIimCJKlagXUBa0m/Og8bYaEMNM1TJkqJ6AjnkwxHld5QHyPm4eRvB+prOeUnBJFlQFUk0VY3W7gW7GdzoX0Gv3S7pKrlKO9ZJUeEC5CYrCpOSyG4/DyavBWtxe2Nn/TvczXtFiDDRQMNkie7+fjM96PB6BSHFtxWsWZ8lD48QYkevof/8rp1eTKeRP1BLAQIUABQAAAAIADZ8ulw+8IxmGwEAAAICAAAMAAAAAAAAAAAAAAAAAAAAAABzYW1wbGUucmVxaWZQSwUGAAAAAAEAAQA6AAAARQEAAAAA';

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

describe('parseReqIfFile — .reqifz', () => {
  it('decompresses a .reqifz archive and parses the embedded .reqif', async () => {
    const buf = b64ToArrayBuffer(SAMPLE_REQIFZ_B64);
    const doc = await parseReqIfFile(buf, 'sample.reqifz');

    expect(doc.header.identifier).toBe('hdr-z001');
    expect(doc.header.title).toBe('Zipped Document');
    expect(doc.specObjectCount).toBe(0);
  });

  it('rejects with a clear error for a corrupt ZIP', async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x00, 0xff]).buffer; // PK header then garbage
    await expect(parseReqIfFile(corrupt, 'corrupt.reqifz')).rejects.toThrow(
      /decompress|corrupt|zip/i
    );
  });

  it('rejects when .reqifz contains no .reqif entry', async () => {
    // Create a valid ZIP with a .txt file (no .reqif)
    const { zipSync } = await import('fflate');
    const buf = zipSync({ 'readme.txt': new TextEncoder().encode('hello') }).buffer;
    await expect(parseReqIfFile(buf as ArrayBuffer, 'no-reqif.reqifz')).rejects.toThrow(
      /does not contain/i
    );
  });
});
