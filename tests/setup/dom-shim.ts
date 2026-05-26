// DOMParser shim for Jest/Node environment
// Uses @xmldom/xmldom as a drop-in replacement for the browser DOMParser.
// This file is a devDependency — never imported in production code.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { TextEncoder, TextDecoder } from 'node:util';

// Assign to globalThis so that src/parser/reqif-parser.ts can use `new DOMParser()`
// identically in both browser and test environments.
const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = DOMParser;
g.XMLSerializer = XMLSerializer;
// Jest/jsdom may not have TextEncoder/TextDecoder in all Node versions
if (!g.TextEncoder) g.TextEncoder = TextEncoder;
if (!g.TextDecoder) g.TextDecoder = TextDecoder;
