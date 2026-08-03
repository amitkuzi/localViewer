import { describe, it, expect } from 'vitest';
import { parse3MFParts } from '../src/threemf.js';

const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
           'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';

// A unit tetrahedron-ish mesh: 3 vertices, 1 triangle.
const tri = (x = 0) => `
  <mesh>
    <vertices>
      <vertex x="${x}" y="0" z="0"/>
      <vertex x="${x + 1}" y="0" z="0"/>
      <vertex x="${x}" y="1" z="0"/>
    </vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh>`;

const model = (body, build = '<build/>') =>
  `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" ${NS}>
     <resources>${body}</resources>${build}</model>`;

describe('parse3MFParts', () => {
  it('follows p:path into another model part', () => {
    // Exactly the shape Bambu Studio / OrcaSlicer write: the root holds only
    // components, the geometry lives in a satellite part whose ids restart at 1.
    const parts = {
      '3D/3dmodel.model': model(
        `<object id="5" type="model"><components>
           <component p:path="/3D/Objects/object_1.model" objectid="1"/>
         </components></object>`,
        `<build><item objectid="5" transform="1 0 0 0 1 0 0 0 1 10 20 30"/></build>`
      ),
      '3D/Objects/object_1.model': model(`<object id="1" type="model">${tri()}</object>`)
    };

    const pos = parse3MFParts(parts);
    expect(pos.length).toBe(9); // 1 triangle
    expect(Array.from(pos.slice(0, 3))).toEqual([10, 20, 30]); // build item translation applied
  });

  it('keeps object ids scoped per part instead of colliding', () => {
    // Two satellite parts both defining id 1 — the flat-id bug rendered one of
    // them twice; both distinct meshes must survive.
    const parts = {
      '3D/3dmodel.model': model(
        `<object id="2" type="model"><components>
           <component p:path="/3D/Objects/object_1.model" objectid="1"/>
           <component p:path="/3D/Objects/object_2.model" objectid="1"/>
         </components></object>`,
        `<build><item objectid="2"/></build>`
      ),
      '3D/Objects/object_1.model': model(`<object id="1" type="model">${tri(0)}</object>`),
      '3D/Objects/object_2.model': model(`<object id="1" type="model">${tri(100)}</object>`)
    };

    const pos = parse3MFParts(parts);
    expect(pos.length).toBe(18); // 2 triangles
    const xs = Array.from(pos).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(101);
  });

  it('instances one mesh per build item with each item transform', () => {
    const parts = {
      '3D/3dmodel.model': model(
        `<object id="1" type="model">${tri()}</object>`,
        `<build>
           <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
           <item objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0"/>
         </build>`
      )
    };

    const pos = parse3MFParts(parts);
    expect(pos.length).toBe(18);
    expect(pos[0]).toBe(0);
    expect(pos[9]).toBe(50);
  });

  it('skips dangling references instead of failing the whole file', () => {
    const parts = {
      '3D/3dmodel.model': model(
        `<object id="1" type="model">${tri()}</object>`,
        `<build><item objectid="1"/><item objectid="99"/></build>`
      )
    };
    expect(parse3MFParts(parts).length).toBe(9);
  });

  it('falls back to every mesh when the file has no build items', () => {
    const parts = { '3D/3dmodel.model': model(`<object id="1" type="model">${tri()}</object>`) };
    expect(parse3MFParts(parts).length).toBe(9);
  });
});
