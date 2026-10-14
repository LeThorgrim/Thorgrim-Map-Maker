import type { MapData } from './loadMap';

/** Camera: `x, y` = map point at the centre of the screen, `zoom` = CSS pixels per map pixel. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// The whole map is drawn by this shader: it reads the location id of the pixel, looks up the
// owning country, then its colour, and draws borders by comparing the neighbours one screen
// pixel away.
const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uIds;      // R16UI: location id per map pixel
uniform sampler2D uCoast;     // R8: distance to the coast (sea)
uniform usampler2D uOwner;    // R16UI, 256 wide: country of each location
uniform sampler2D uPalette;   // RGBA8, 256 wide: colour of each country
uniform usampler2D uFlags;    // R8UI, 256 wide: 1 = hovered
uniform vec2 uMapSize;
uniform vec2 uCenter;
uniform float uZoom;          // device pixels per map pixel
uniform vec2 uView;           // view size in device pixels
uniform float uZoneBorder;    // opacity of the borders between locations
uniform float uPx;            // line width, in device pixels
out vec4 outColor;

// Palette of an old campaign map: parchment land, sepia ink, slate-teal sea.
const vec3 BACKDROP  = vec3(0.090, 0.067, 0.047);
const vec3 UNCLAIMED = vec3(0.851, 0.788, 0.639);
const vec3 INK       = vec3(0.165, 0.114, 0.071);
const vec3 SHALLOW   = vec3(0.494, 0.612, 0.612);
const vec3 DEEP      = vec3(0.196, 0.310, 0.353);
const vec3 HOVER     = vec3(1.000, 0.925, 0.690);

uint idAt(vec2 m) {
  ivec2 p = ivec2(floor(m));
  if (p.x < 0 || p.y < 0 || p.x >= int(uMapSize.x) || p.y >= int(uMapSize.y)) return 0u;
  return texelFetch(uIds, p, 0).r;
}
ivec2 slot(uint i) { return ivec2(int(i % 256u), int(i / 256u)); }
uint ownerOf(uint id) { return id == 0u ? 65535u : texelFetch(uOwner, slot(id), 0).r; }
float hash(uint n) {
  n = (n << 13u) ^ n;
  n = n * (n * n * 15731u + 789221u) + 1376312589u;
  return float(n & 0x7fffffffu) / float(0x7fffffff);
}
float hash2(ivec2 p) { return hash(uint(p.x) * 73856093u ^ uint(p.y) * 19349663u); }
// Smooth value noise in map coordinates: stays put when panning and zooming.
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 p = ivec2(i);
  return mix(mix(hash2(p), hash2(p + ivec2(1, 0)), u.x), mix(hash2(p + ivec2(0, 1)), hash2(p + ivec2(1, 1)), u.x), u.y);
}
// Paper grain. Fine octaves only appear once zoomed in enough to see them: drawn smaller than a
// screen pixel they would turn into flickering speckle.
float paper(vec2 m) {
  float w1 = smoothstep(0.12, 0.45, uZoom), w2 = smoothstep(0.6, 1.6, uZoom);
  float n = 0.35 * vnoise(m / 120.0 + 3.0) + 0.3 * vnoise(m / 40.0 - 5.0) + w1 * 0.25 * vnoise(m / 9.0) + w2 * 0.15 * vnoise(m / 2.3 + 17.0);
  return 0.5 + (n - 0.5 * (0.65 + 0.25 * w1 + 0.15 * w2)) / (0.65 + 0.25 * w1 + 0.15 * w2);
}

/** True when a pixel at distance k lines from m, in any of the 4 directions, has another owner. */
bool otherOwner(vec2 m, float k, uint o) {
  return ownerOf(idAt(m + vec2(k, 0.0))) != o || ownerOf(idAt(m - vec2(k, 0.0))) != o ||
         ownerOf(idAt(m + vec2(0.0, k))) != o || ownerOf(idAt(m - vec2(0.0, k))) != o;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 m = uCenter + (frag - uView * 0.5) / uZoom;
  if (m.x < 0.0 || m.y < 0.0 || m.x >= uMapSize.x || m.y >= uMapSize.y) {
    outColor = vec4(BACKDROP, 1.0);
    return;
  }
  float e = uPx / uZoom; // one line, in map pixels
  float grain = paper(m);
  uint id = idAt(m);

  if (id == 0u) {
    // Sea: depth gradient, slow swell texture, and two engraved shore lines.
    float d = texture(uCoast, m / uMapSize).r * 127.5;
    vec3 c = mix(SHALLOW, DEEP, smoothstep(0.0, 80.0, d));
    c *= 0.95 + 0.07 * vnoise(m / 28.0 + vec2(0.0, m.x / 90.0)) + 0.03 * grain;
    float w = max(e, 0.6);
    c = mix(c, INK, 0.18 * (1.0 - smoothstep(w * 0.5, w, abs(d - 5.0))));
    c = mix(c, INK, 0.09 * (1.0 - smoothstep(w * 0.5, w, abs(d - 12.0))));
    outColor = vec4(c, 1.0);
    return;
  }

  uint o = ownerOf(id);
  vec3 c = o == 0u
    ? UNCLAIMED * (0.985 + (hash(id) - 0.5) * 0.04)
    : texelFetch(uPalette, slot(o), 0).rgb * (0.975 + hash(id) * 0.05);
  // painted-on-paper look: the grain shows through every colour
  c *= 0.9 + 0.16 * grain;

  uint r = idAt(m + vec2(e, 0.0)), l = idAt(m - vec2(e, 0.0));
  uint dn = idAt(m + vec2(0.0, e)), up = idAt(m - vec2(0.0, e));

  if (r == 0u || l == 0u || dn == 0u || up == 0u) {
    c = mix(c, INK, 0.85);                          // coast
  } else if (otherOwner(m, e, o)) {
    c = o == 0u ? mix(c, INK, 0.5) : mix(c * 0.35, INK, 0.35); // border between countries
  } else {
    if (o != 0u && (otherOwner(m, 2.5 * e, o) || otherOwner(m, 4.0 * e, o))) c *= 0.82; // inner shading of a border
    if (r != id || dn != id) c = mix(c, c * 0.7, uZoneBorder);                         // border between locations
  }

  if (texelFetch(uFlags, slot(id), 0).r == 1u) c = mix(c, HOVER, 0.35);
  outColor = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class MapRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tex: Record<'ids' | 'coast' | 'owner' | 'palette' | 'flags', WebGLTexture>;
  private rows: number;
  private flags: Uint8Array;
  private palette = new Uint8Array(256 * 256 * 4);
  private map: MapData;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, map: MapData) {
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    this.canvas = canvas;
    this.map = map;
    this.rows = Math.ceil(map.count / 256);
    this.flags = new Uint8Array(256 * this.rows);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    this.prog = prog;
    gl.useProgram(prog);
    for (const name of ['uIds', 'uCoast', 'uOwner', 'uPalette', 'uFlags', 'uMapSize', 'uCenter', 'uZoom', 'uView', 'uZoneBorder', 'uPx'])
      this.u[name] = gl.getUniformLocation(prog, name);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const make = (unit: number, linear: boolean) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      const f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tex = {
      ids: make(0, false),
      coast: make(1, true),
      owner: make(2, false),
      palette: make(3, false),
      flags: make(4, false),
    };
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.ids);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, map.width, map.height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, map.ids);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.coast);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, map.width, map.height, 0, gl.RED, gl.UNSIGNED_BYTE, map.coast);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.owner);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, 256, this.rows, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(256 * this.rows));
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.palette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.palette);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.flags);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 256, this.rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.flags);

    gl.uniform1i(this.u.uIds, 0);
    gl.uniform1i(this.u.uCoast, 1);
    gl.uniform1i(this.u.uOwner, 2);
    gl.uniform1i(this.u.uPalette, 3);
    gl.uniform1i(this.u.uFlags, 4);
    gl.uniform2f(this.u.uMapSize, map.width, map.height);
  }

  /** `owner` must hold 256 × rows values (see `paddedLength`). */
  setOwners(owner: Uint16Array) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.owner);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, this.rows, gl.RED_INTEGER, gl.UNSIGNED_SHORT, owner);
  }

  setPalette(countries: { id: number; color: string }[]) {
    this.palette.fill(0);
    for (const c of countries) this.palette.set([...hexToRgb(c.color), 255], c.id * 4);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.palette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, this.palette);
  }

  /** Highlights a set of locations (hover). */
  setHighlight(zones: number[]) {
    this.flags.fill(0);
    for (const z of zones) this.flags[z] = 1;
    this.uploadFlags();
  }

  private uploadFlags() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.flags);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, this.rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.flags);
  }

  private drawPass(cx: number, cy: number, zoom: number, w: number, h: number, px: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(this.u.uCenter, cx, cy);
    gl.uniform1f(this.u.uZoom, zoom);
    gl.uniform2f(this.u.uView, w, h);
    gl.uniform1f(this.u.uPx, px);
    // borders between locations fade in as you zoom in
    gl.uniform1f(this.u.uZoneBorder, Math.min(1, Math.max(0, (zoom / px - 0.22) / 0.5)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  draw(cam: Camera) {
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    this.drawPass(cam.x, cam.y, cam.zoom * dpr, this.canvas.width, this.canvas.height, Math.max(1, Math.round(dpr)));
  }

  /** Renders the whole map at its native resolution and returns it as a PNG. */
  async exportPng(): Promise<Blob> {
    const gl = this.gl;
    const { width: w, height: h } = this.map;
    const saved = this.flags.slice();
    this.flags.fill(0);
    this.uploadFlags();
    const target = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    this.drawPass(w / 2, h / 2, 1, w, h, 1);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(target);
    this.flags.set(saved);
    this.uploadFlags();

    // readPixels reads bottom-up: flip the image
    const img = new ImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.putImageData(img, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
  }

  dispose() {
    const gl = this.gl;
    for (const t of Object.values(this.tex)) gl.deleteTexture(t);
    gl.deleteProgram(this.prog);
  }
}

export const paddedLength = (count: number) => Math.ceil(count / 256) * 256;
