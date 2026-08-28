import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { strToU8, zipSync } from 'fflate';

export interface GeneratedFile {
  path: string;
  bytes: Uint8Array;
}

const encoder = new TextEncoder();

function text(value: string): Uint8Array {
  return encoder.encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  output.set(text(type), 4);
  output.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(output.subarray(4, 8 + data.byteLength)), false);
  return output;
}

function png(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 2, false);
  view.setUint32(4, 2, false);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const scanlines = new Uint8Array([
    0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', new Uint8Array()),
  );
}

function qoi(): Uint8Array {
  const header = new Uint8Array(14);
  header.set(text('qoif'));
  const view = new DataView(header.buffer);
  view.setUint32(4, 2, false);
  view.setUint32(8, 2, false);
  header.set([4, 0], 12);
  return concat(
    header,
    new Uint8Array([
      0xff, 255, 0, 0, 255, 0xff, 0, 255, 0, 128, 0xff, 0, 0, 255, 255, 0xff, 255, 255, 255, 255, 0,
      0, 0, 0, 0, 0, 0, 1,
    ]),
  );
}

function hdr(): Uint8Array {
  return concat(
    text('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nEXPOSURE=1.000000\n\n-Y 2 +X 2\n'),
    new Uint8Array([128, 0, 0, 129, 0, 128, 0, 129, 0, 0, 128, 129, 128, 128, 128, 129]),
  );
}

function tga(): Uint8Array {
  const output = new Uint8Array(18 + 12);
  const view = new DataView(output.buffer);
  output[2] = 2;
  view.setUint16(12, 2, true);
  view.setUint16(14, 2, true);
  output[16] = 24;
  output[17] = 0x20;
  output.set([0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255], 18);
  return output;
}

function ico(): Uint8Array {
  const output = new Uint8Array(6 + 16 + 40 + 4 + 4);
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  output[6] = 1;
  output[7] = 1;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, 48, true);
  view.setUint32(18, 22, true);
  view.setUint32(22, 40, true);
  view.setInt32(26, 1, true);
  view.setInt32(30, 2, true);
  view.setUint16(34, 1, true);
  view.setUint16(36, 32, true);
  view.setUint32(42, 4, true);
  output.set([0x20, 0x40, 0x80, 0xff], 62);
  return output;
}

function pfm(littleEndian: boolean): Uint8Array {
  const header = text(`PF\n2 2\n${littleEndian ? '-1.0' : '1.0'}\n`);
  const pixels = new Uint8Array(12 * 4);
  const view = new DataView(pixels.buffer);
  const values = [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, littleEndian);
  });
  return concat(header, pixels);
}

function envi(interleave: 'bil' | 'bip' | 'bsq', offset = 0): GeneratedFile[] {
  const header = text(
    `ENVI\ndescription = {deterministic values offset ${offset}}\nsamples = 3\nlines = 2\nbands = 2\nheader offset = 0\nfile type = ENVI Standard\ndata type = 2\ninterleave = ${interleave}\nbyte order = 0\nmap info = {Geographic Lat/Lon, 1, 1, -120, 45, 0.01, 0.01, WGS-84}\n`,
  );
  const values =
    interleave === 'bsq'
      ? [1, 2, 3, 4, 5, 6, 101, 102, 103, 104, 105, 106]
      : interleave === 'bil'
        ? [1, 2, 3, 101, 102, 103, 4, 5, 6, 104, 105, 106]
        : [1, 101, 2, 102, 3, 103, 4, 104, 5, 105, 6, 106];
  const payload = new Uint8Array(values.length * 2);
  const view = new DataView(payload.buffer);
  values.forEach((value, index) => {
    view.setInt16(index * 2, value + offset, true);
  });
  return [
    { path: `tiny-${interleave}.hdr`, bytes: header },
    { path: `tiny-${interleave}.bin`, bytes: payload },
  ];
}

function metaImage(): GeneratedFile[] {
  const raw = new Uint8Array(12);
  const view = new DataView(raw.buffer);
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });
  return [
    {
      path: 'tiny.mhd',
      bytes: text(
        'ObjectType = Image\nNDims = 2\nDimSize = 3 2\nElementType = MET_SHORT\nElementByteOrderMSB = False\nElementDataFile = tiny.raw\n',
      ),
    },
    { path: 'tiny.raw', bytes: raw },
  ];
}

function ripple(): GeneratedFile[] {
  const raw = new Uint8Array(12);
  const view = new DataView(raw.buffer);
  [1, 2, 3, 4, 5, 6].forEach((value, index) => {
    view.setUint16(index * 2, value, true);
  });
  return [
    {
      path: 'tiny.rpl',
      bytes: text(
        'key\tvalue\nwidth\t3\nheight\t2\ndepth\t1\noffset\t0\ndata-length\t2\ndata-type\tunsigned\nbyte-order\tlittle-endian\nrecord-by\tdont-care\n',
      ),
    },
    { path: 'tiny.raw', bytes: raw },
  ];
}

function fits(): Uint8Array {
  const cards = [
    'SIMPLE  =                    T',
    'BITPIX  =                   16',
    'NAXIS   =                    2',
    'NAXIS1  =                    3',
    'NAXIS2  =                    2',
    'EXTEND  =                    T',
    'END',
  ].map((card) => card.padEnd(80, ' '));
  const header = text(cards.join('').padEnd(2880, ' '));
  const data = new Uint8Array(2880);
  const view = new DataView(data.buffer);
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(index * 2, value, false);
  });
  return concat(header, data);
}

function npy(): Uint8Array {
  const dictionary = "{'descr': '<i2', 'fortran_order': False, 'shape': (2, 3), }";
  const prefixLength = 10;
  const headerLength = Math.ceil((prefixLength + dictionary.length + 1) / 64) * 64 - prefixLength;
  const header = text(`${dictionary.padEnd(headerLength - 1, ' ')}\n`);
  const prefix = new Uint8Array(prefixLength);
  prefix.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  new DataView(prefix.buffer).setUint16(8, headerLength, true);
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });
  return concat(prefix, header, data);
}

function nrrd(): Uint8Array {
  const header = text(
    'NRRD0005\ntype: short\ndimension: 2\nsizes: 3 2\nencoding: raw\nendian: little\nspace origin: (10,20)\nspace directions: (0.5,0) (0,-0.5)\n\n',
  );
  return concat(header, npy().subarray(npy().byteLength - 12));
}

function mrc(): Uint8Array {
  const output = new Uint8Array(1024 + 12);
  const view = new DataView(output.buffer);
  view.setInt32(0, 3, true);
  view.setInt32(4, 2, true);
  view.setInt32(8, 1, true);
  view.setInt32(12, 1, true);
  view.setInt32(28, 3, true);
  view.setInt32(32, 2, true);
  view.setInt32(36, 1, true);
  view.setFloat32(40, 3, true);
  view.setFloat32(44, 2, true);
  view.setFloat32(48, 1, true);
  view.setFloat32(52, 90, true);
  view.setFloat32(56, 90, true);
  view.setFloat32(60, 90, true);
  view.setInt32(64, 1, true);
  view.setInt32(68, 2, true);
  view.setInt32(72, 3, true);
  output.set(text('MAP '), 208);
  output.set([0x44, 0x41, 0, 0], 212);
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(1024 + index * 2, value, true);
  });
  return output;
}

function nifti(version: 1 | 2): Uint8Array {
  const headerSize = version === 1 ? 352 : 544;
  const output = new Uint8Array(headerSize + 12);
  const view = new DataView(output.buffer);
  view.setInt32(0, version === 1 ? 348 : 540, true);
  if (version === 1) {
    view.setInt16(40, 2, true);
    view.setInt16(42, 3, true);
    view.setInt16(44, 2, true);
    view.setInt16(70, 4, true);
    view.setInt16(72, 16, true);
    view.setFloat32(108, 352, true);
    output.set(text('n+1\0'), 344);
  } else {
    output.set(text('n+2\0\r\n\x1a\n'), 4);
    view.setInt16(12, 4, true);
    view.setInt16(14, 16, true);
    view.setBigInt64(16, 2n, true);
    view.setBigInt64(24, 3n, true);
    view.setBigInt64(32, 2n, true);
    view.setBigInt64(168, 544n, true);
  }
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(headerSize + index * 2, value, true);
  });
  return output;
}

function gsf(): Uint8Array {
  const rawHeader = text(
    'Gwyddion Simple Field 1.0\nXRes = 3\nYRes = 2\nXReal = 3\nYReal = 2\nXYUnits = m\nZUnits = m\n',
  );
  const padding = new Uint8Array(((4 - ((rawHeader.byteLength + 1) % 4)) % 4) + 1);
  const values = new Uint8Array(24);
  const view = new DataView(values.buffer);
  [0, 1, -1, 3.5, -2.25, 42].forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  return concat(rawHeader, padding, values);
}

function sxm(): Uint8Array {
  const header = text(
    ':NANONIS_VERSION:\n2\n:SCAN_PIXELS:\n3 2\n:SCAN_RANGE:\n3e-9 2e-9\n:SCAN_OFFSET:\n0 0\n:SCAN_ANGLE:\n0\n:SCAN_DIR:\ndown\n:DATA_INFO:\nIndex\tName\tUnit\tDirection\tCalibration\tOffset\n0\tHeight\tm\tforward\t1\t0\n:SCANIT_TYPE:\nFLOAT MSBFIRST\n:SCANIT_END:\n\x1a\x04',
  );
  const values = new Uint8Array(24);
  const view = new DataView(values.buffer);
  [0, 1, -1, 3.5, -2.25, 42].forEach((value, index) => {
    view.setFloat32(index * 4, value, false);
  });
  return concat(header, values);
}

function cbf(): Uint8Array {
  // x-CBF_BYTE_OFFSET stores signed deltas. These six bytes decode to 0, 1, 2, 3, 4, 5.
  const binary = new Uint8Array([0x0c, 0x1a, 0x04, 0xd5, 0, 1, 1, 1, 1, 1]);
  return concat(
    text(
      '###CBF: VERSION 1.0\ndata_image_1\n_array_data.header_convention "PILATUS_1.2"\n--CIF-BINARY-FORMAT-SECTION--\nContent-Type: application/octet-stream; conversions="x-CBF_BYTE_OFFSET"\nContent-Transfer-Encoding: BINARY\nX-Binary-Size: 6\nX-Binary-ID: 1\nX-Binary-Element-Type: "unsigned 8-bit integer"\nX-Binary-Element-Byte-Order: LITTLE_ENDIAN\nX-Binary-Number-of-Elements: 6\nX-Binary-Size-Fastest-Dimension: 3\nX-Binary-Size-Second-Dimension: 2\n\n',
    ),
    binary,
    text('\n--CIF-BINARY-FORMAT-SECTION----\n'),
  );
}

function x3p(): Uint8Array {
  const main = `<?xml version="1.0" encoding="UTF-8"?><ISO5436_2><Record1><Revision>ISO5436-2:2000</Revision><FeatureType>SUR</FeatureType><Axes><CX><AxisType>I</AxisType><DataType>F</DataType><Increment>1</Increment></CX><CY><AxisType>I</AxisType><DataType>F</DataType><Increment>1</Increment></CY><CZ><AxisType>A</AxisType><DataType>F</DataType></CZ></Axes></Record1><Record3><MatrixDimension><SizeX>3</SizeX><SizeY>2</SizeY><SizeZ>1</SizeZ></MatrixDimension><DataLink><PointDataLink>bindata/data.bin</PointDataLink></DataLink></Record3></ISO5436_2>`;
  const data = new Uint8Array(24);
  const view = new DataView(data.buffer);
  [0, 1, -1, 3.5, -2.25, 42].forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  return zipSync(
    { 'main.xml': strToU8(main), 'bindata/data.bin': data },
    // fflate writes the Date's local fields into the timezone-free DOS timestamp.
    { level: 0, mtime: new Date(1980, 0, 1, 19, 0, 0) },
  );
}

function srtm(): Uint8Array {
  const side = 1201;
  const output = new Uint8Array(side * side * 2);
  const view = new DataView(output.buffer);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) view.setInt16((y * side + x) * 2, (x + y) % 1000, false);
  }
  return output;
}

function zarr(geo: boolean): GeneratedFile[] {
  const metadata = {
    zarr_format: 3,
    node_type: 'array',
    shape: [2, 3],
    data_type: 'int16',
    chunk_grid: { name: 'regular', configuration: { chunk_shape: [2, 3] } },
    chunk_key_encoding: { name: 'default', configuration: { separator: '/' } },
    fill_value: 0,
    codecs: [{ name: 'bytes', configuration: { endian: 'little' } }],
    attributes: geo
      ? { _ARRAY_DIMENSIONS: ['y', 'x'], crs: 'EPSG:4326', transform: [10, 0.5, 0, 20, 0, -0.5] }
      : { multiscales: [{ axes: ['y', 'x'], datasets: [{ path: '.' }] }] },
  };
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  [geo ? 7 : 8, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(index * 2, value, true);
  });
  return [
    { path: 'zarr.json', bytes: text(`${JSON.stringify(metadata, null, 2)}\n`) },
    { path: 'c/0/0', bytes: data },
  ];
}

function classicNetcdf(): Uint8Array {
  function u32(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    return bytes;
  }
  function ncString(value: string): Uint8Array {
    const bytes = text(value);
    return concat(u32(bytes.length), bytes, new Uint8Array((4 - (bytes.length % 4)) % 4));
  }
  const dimensions = concat(u32(10), u32(2), ncString('y'), u32(2), ncString('x'), u32(3));
  const absent = concat(u32(0), u32(0));
  const variablePrefix = concat(
    u32(11),
    u32(1),
    ncString('elevation'),
    u32(2),
    u32(0),
    u32(1),
    absent,
    u32(3),
    u32(12),
  );
  const headerWithoutOffset = concat(text('CDF\x01'), u32(0), dimensions, absent, variablePrefix);
  const begin = headerWithoutOffset.byteLength + 4;
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  [0, 1, -1, 32767, -32768, 42].forEach((value, index) => {
    view.setInt16(index * 2, value, false);
  });
  return concat(headerWithoutOffset, u32(begin), data);
}

function cfNetcdf(): Uint8Array {
  function u32(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    return bytes;
  }
  function ncString(value: string): Uint8Array {
    const bytes = text(value);
    return concat(u32(bytes.length), bytes, new Uint8Array((4 - (bytes.length % 4)) % 4));
  }
  function attributes(values: Array<[string, string]>): Uint8Array {
    if (values.length === 0) return concat(u32(0), u32(0));
    return concat(
      u32(12),
      u32(values.length),
      ...values.map(([name, value]) => {
        const bytes = text(value);
        return concat(
          ncString(name),
          u32(2),
          u32(bytes.length),
          bytes,
          new Uint8Array((4 - (bytes.length % 4)) % 4),
        );
      }),
    );
  }
  const dimensions = concat(u32(10), u32(2), ncString('lat'), u32(2), ncString('lon'), u32(3));
  const globals = attributes([
    ['Conventions', 'CF-1.8'],
    ['title', 'Deterministic CF latitude-longitude grid'],
  ]);
  const variableParts: Uint8Array[] = [];
  const beginOffsets: number[] = [];
  function variable(
    name: string,
    dimensionIds: number[],
    variableAttributes: Array<[string, string]>,
    type: number,
    size: number,
  ): void {
    const beforeBegin = concat(
      ncString(name),
      u32(dimensionIds.length),
      ...dimensionIds.map(u32),
      attributes(variableAttributes),
      u32(type),
      u32(size),
    );
    variableParts.push(beforeBegin);
    beginOffsets.push(variableParts.reduce((sum, part) => sum + part.byteLength, 0));
    variableParts.push(u32(0));
  }
  variable('lat', [0], [['units', 'degrees_north']], 6, 16);
  variable('lon', [1], [['units', 'degrees_east']], 6, 24);
  variable('elevation', [0, 1], [['units', 'm']], 3, 12);
  const prefix = concat(text('CDF\x01'), u32(0), dimensions, globals, u32(11), u32(3));
  const variables = concat(...variableParts);
  const header = concat(prefix, variables);
  const headerView = new DataView(header.buffer);
  let dataOffset = header.byteLength;
  const sizes = [16, 24, 12];
  beginOffsets.forEach((offset, index) => {
    headerView.setUint32(prefix.byteLength + offset, dataOffset, false);
    dataOffset += sizes[index] ?? 0;
  });
  const lat = new Uint8Array(16);
  const lon = new Uint8Array(24);
  const elevation = new Uint8Array(12);
  const latView = new DataView(lat.buffer);
  const lonView = new DataView(lon.buffer);
  const elevationView = new DataView(elevation.buffer);
  latView.setFloat64(0, 44.75, false);
  latView.setFloat64(8, 44.25, false);
  [-119.75, -119.25, -118.75].forEach((value, index) => {
    lonView.setFloat64(index * 8, value, false);
  });
  [1, 2, 3, 4, -9999, 6].forEach((value, index) => {
    elevationView.setInt16(index * 2, value, false);
  });
  return concat(header, lat, lon, elevation);
}

function tiff(kind: 'plain' | 'geo' | 'ome'): Uint8Array {
  const description =
    kind === 'ome'
      ? text(
          '<?xml version="1.0"?><OME><Image ID="Image:0"><Pixels DimensionOrder="XYCZT" Type="uint8" SizeX="2" SizeY="2" SizeC="1" SizeZ="1" SizeT="1"/></Image></OME>\0',
        )
      : undefined;
  const baseEntries = 10 + (kind === 'geo' ? 3 : 0) + (description ? 1 : 0);
  const ifdOffset = 8;
  const ifdBytes = 2 + baseEntries * 12 + 4;
  const extrasOffset = ifdOffset + ifdBytes;
  const scale = kind === 'geo' ? 24 : 0;
  const tie = kind === 'geo' ? 48 : 0;
  const key = kind === 'geo' ? 16 : 0;
  const descriptionBytes = description?.byteLength ?? 0;
  const pixelOffset = extrasOffset + scale + tie + key + descriptionBytes;
  const output = new Uint8Array(pixelOffset + 4);
  const view = new DataView(output.buffer);
  output.set(text('II'));
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, baseEntries, true);
  let cursor = ifdOffset + 2;
  function entry(tag: number, type: number, count: number, value: number): void {
    view.setUint16(cursor, tag, true);
    view.setUint16(cursor + 2, type, true);
    view.setUint32(cursor + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(cursor + 8, value, true);
    else view.setUint32(cursor + 8, value, true);
    cursor += 12;
  }
  entry(256, 3, 1, 2);
  entry(257, 3, 1, 2);
  entry(258, 3, 1, 8);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 1);
  entry(273, 4, 1, pixelOffset);
  entry(277, 3, 1, 1);
  entry(278, 4, 1, 2);
  entry(279, 4, 1, 4);
  entry(284, 3, 1, 1);
  let extraCursor = extrasOffset;
  if (kind === 'geo') {
    entry(33550, 12, 3, extraCursor);
    [0.5, 0.5, 0].forEach((value, index) => {
      view.setFloat64(extraCursor + index * 8, value, true);
    });
    extraCursor += scale;
    entry(33922, 12, 6, extraCursor);
    [0, 0, 0, -120, 45, 0].forEach((value, index) => {
      view.setFloat64(extraCursor + index * 8, value, true);
    });
    extraCursor += tie;
    entry(34735, 3, 8, extraCursor);
    [1, 1, 0, 1, 2048, 0, 1, 4326].forEach((value, index) => {
      view.setUint16(extraCursor + index * 2, value, true);
    });
    extraCursor += key;
  }
  if (description) {
    entry(270, 2, description.byteLength, extraCursor);
    output.set(description, extraCursor);
  }
  output.set([0, 64, 128, 255], pixelOffset);
  return output;
}

export function generateFixture(
  generator: string,
  parameters: Record<string, unknown>,
): GeneratedFile[] {
  switch (generator) {
    case 'qoi-rgba':
      return [{ path: 'rgba-2x2.qoi', bytes: qoi() }];
    case 'radiance-rgbe':
      return [{ path: 'rgbe-2x2.hdr', bytes: hdr() }];
    case 'ico-dib':
      return [{ path: 'rgba-1x1.ico', bytes: ico() }];
    case 'tga-rgb':
      return [{ path: 'rgb-2x2.tga', bytes: tga() }];
    case 'pbm-ascii':
      return [
        {
          path: 'checker-3x2.pbm',
          bytes: text('P1\n# deterministic checker\n3 2\n0 1 0\n1 0 1\n'),
        },
      ];
    case 'pgm-binary':
      return [
        {
          path: 'gray-3x2.pgm',
          bytes: concat(text('P5\n3 2\n255\n'), new Uint8Array([0, 1, 127, 128, 254, 255])),
        },
      ];
    case 'ppm-binary':
      return [
        {
          path: 'rgb-2x2.ppm',
          bytes: concat(
            text('P6\n2 2\n255\n'),
            new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]),
          ),
        },
      ];
    case 'pam-rgba':
      return [
        {
          path: 'rgba-2x1.pam',
          bytes: concat(
            text('P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n'),
            new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]),
          ),
        },
      ];
    case 'pfm':
      return [
        {
          path: `rgb-${parameters.endian === 'big' ? 'be' : 'le'}.pfm`,
          bytes: pfm(parameters.endian !== 'big'),
        },
      ];
    case 'meta-image':
      return metaImage();
    case 'ripple':
      return ripple();
    case 'png-world':
      return [
        { path: 'map.png', bytes: png() },
        { path: 'map.pgw', bytes: text('0.5\n0\n0\n-0.5\n-119.75\n44.75\n') },
      ];
    case 'esri-ascii-grid':
      return [
        {
          path: 'tiny.asc',
          bytes: text(
            'ncols 3\nnrows 2\nxllcorner -120\nyllcorner 44\ncellsize 0.5\nNODATA_value -9999\n1 2 3\n4 -9999 6\n',
          ),
        },
      ];
    case 'srtm-hgt':
      return [{ path: 'N00E000.hgt', bytes: srtm() }];
    case 'geozarr':
      return zarr(true);
    case 'ome-zarr':
      return zarr(false);
    case 'envi': {
      const interleave = parameters.interleave;
      if (interleave !== 'bil' && interleave !== 'bip' && interleave !== 'bsq')
        throw new Error(`Invalid ENVI interleave: ${String(interleave)}`);
      const offset = typeof parameters.offset === 'number' ? parameters.offset : 0;
      return envi(interleave, offset);
    }
    case 'fits':
      return [{ path: 'int16-3x2.fits', bytes: fits() }];
    case 'npy':
      return [{ path: 'int16-2x3.npy', bytes: npy() }];
    case 'nrrd':
      return [{ path: 'int16-3x2.nrrd', bytes: nrrd() }];
    case 'mrc':
      return [{ path: 'int16-3x2.mrc', bytes: mrc() }];
    case 'nifti': {
      const version = parameters.version === 2 ? 2 : 1;
      return [{ path: `nifti-${version}.nii`, bytes: nifti(version) }];
    }
    case 'gsf':
      return [{ path: 'float32-3x2.gsf', bytes: gsf() }];
    case 'nanonis-sxm':
      return [{ path: 'float32-3x2.sxm', bytes: sxm() }];
    case 'cbf':
      return [{ path: 'uint8-3x2.cbf', bytes: cbf() }];
    case 'x3p':
      return [{ path: 'float32-3x2.x3p', bytes: x3p() }];
    case 'classic-netcdf':
      return [{ path: 'int16-3x2.nc', bytes: classicNetcdf() }];
    case 'cf-netcdf':
      return [{ path: 'cf-latlon-3x2.nc', bytes: cfNetcdf() }];
    case 'tiff':
      return [{ path: 'gray-2x2.tiff', bytes: tiff('plain') }];
    case 'geotiff':
      return [{ path: 'wgs84-2x2.tiff', bytes: tiff('geo') }];
    case 'ome-tiff':
      return [{ path: 'ome-2x2.ome.tiff', bytes: tiff('ome') }];
    default:
      throw new Error(`Unknown fixture generator: ${generator}`);
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
