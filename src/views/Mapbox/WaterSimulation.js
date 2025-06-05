import CustomBoxLayer from "./customBoxLayer";
import ComputeLayer from "./computeLayer";
import * as turf from "@turf/turf";
import { getTerrainHeightGrid, calculateOffsetPoint } from "./utils";
import QZKCGeoJson from ".//LakeData/QZKC2024.json";
import JLCGeoJson from "./LakeData/JLC2024.json";

const GeoJsonCollection = {
  JLC: JLCGeoJson,
  QZKC: QZKCGeoJson,
};

const CenterCollection = {
  JLC: [85.84725319244541, 28.211073498412915, 0],
  QZKC: [87.770985940066, 27.926471549720233, 0],
  // YaAn: [102.957073, 29.990761]
  YaAn: [103.0966, 29.9559],
};

class WaterSimulate {
  constructor(options) {
    this.map = options.map;
    this.gl = options.gl;
    const ext = this.gl.getExtension("EXT_color_buffer_float");
    if (!ext) {
      console.warn("浮点颜色缓冲区扩展不可用");
    }

    this._width = options.width || 500;
    this._height = options.height || 500;
    this.cellSize = options.cellSize || 30;
  }

  async initBox(options) {
    // this.center = options.center;
    this.center = CenterCollection.QZKC;
    this.LakeGeoJson = GeoJsonCollection.QZKC;
    const terrainData = await getTerrainHeightGrid(
      this.map, // 你的 Mapbox GL 地图实例
      this.center,
      this.cellSize,
      this._width,
      this._height
    );
    await this.genDemTexture(terrainData);
    await this.initRender();
  }

  async genDemTexture(data) {
    this.terrainData = data;
    const map = this.map;
    const gl = this.gl;
    const width = this._width;
    const height = this._height;

    const texData = new Float32Array(width * height * 4);
    const texDataLake = new Float32Array(width * height * 4);

    let sourceIdx = 0;
    const sourceMax = 300;

    const demBuffer = new ArrayBuffer(width * height * 4); // 每个 int 占 4 字节
    const binghuBuffer = new ArrayBuffer(width * height * 4); // 每个 int 占 4 字节
    const sourceBuffer = new ArrayBuffer(width * height * 4); // 每个 int 占 4 字节
    const glacierBuffer = new ArrayBuffer(width * height * 4); // 每个 int 占 4 字节
    const demDataView = new DataView(demBuffer);
    const binghuDataView = new DataView(binghuBuffer);
    const sourceDataView = new DataView(sourceBuffer);
    const glacierDataView = new DataView(glacierBuffer);

    let max = 0,
      min = 999999;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let originalIndex = y * width + x;
        let flippedIndex = (height - 1 - y) * width + x;

        max = Math.max(data[originalIndex].height, max);
        min = Math.min(data[originalIndex].height, min);
      }
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    // 遍历原始图像数据，按照上下翻转的方式将像素值填充到新的 ImageData 对象中
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 计算原始图像数据和翻转后图像数据的索引
        let originalIndex = y * width + x;
        let flippedIndex = (height - 1 - y) * width + x;

        const h = clamp((data[originalIndex].height - min) / (max - min), 0, 1);
        texData[originalIndex * 4] =
          texData[originalIndex * 4 + 1] =
          texData[originalIndex * 4 + 2] =
          texData[originalIndex * 4 + 3] =
            h;

        demDataView.setInt32(
          flippedIndex * 4,
          data[originalIndex].height,
          !true
        ); // 小端序（true 表示小端序）
        glacierDataView.setInt32(flippedIndex * 4, 100, !true); // 小端序（true 表示小端序）

        const pt = turf.point([
          data[originalIndex].longitude,
          data[originalIndex].latitude,
        ]);

        this.LakeGeoJson.features.forEach((feature) => {
          if (turf.booleanPointInPolygon(pt, feature)) {
            texDataLake[originalIndex * 4] =
              texDataLake[originalIndex * 4 + 1] =
              texDataLake[originalIndex * 4 + 2] =
              texDataLake[originalIndex * 4 + 3] =
                1;

            binghuDataView.setInt32(flippedIndex * 4, 80, false); // 小端序（true 表示小端序）
            if (sourceIdx < sourceMax) {
              sourceDataView.setInt32(flippedIndex * 4, 10, false); // 小端序（true 表示小端序）
              sourceIdx++;
            }
          }
        });
      }
    }
    this.demMap = createTextureWithFloatArray(gl, texData, {
      width: this._width,
      height: this._height,
      textureUnit: 5,
    });
    // const base64 = await textureToBase64(
    //   gl,
    //   this.demMap,
    //   this._width,
    //   this._height
    // );
    this.lakeMap = createTexture(gl, texDataLake, {
      width: this._width,
      height: this._height,
      textureUnit: 6,
    });
    this.waterHeightMap = createTexture(gl, texDataLake, {
      width: this._width,
      height: this._height,
      textureUnit: 7,
    });

    this.demMap = await createTextureFromURL(gl, "/dem.png");
    this.lakeMap = await createTextureFromURL(gl, "/lake.png");

    this.max = max;
    this.min = min;

    const maxp = calculateOffsetPoint(this.center, [
      (this._width / 2) * this.cellSize,
      (this._height / 2) * this.cellSize,
    ]);
    const minp = calculateOffsetPoint(this.center, [
      (-this._width / 2) * this.cellSize,
      (-this._height / 2) * this.cellSize,
    ]);
    this.box = {
      minLng: minp[0],
      minLat: minp[1],
      minHeight: this.min,
      maxLng: maxp[0],
      maxLat: maxp[1],
      maxHeight: this.max,
    };
    debugger;

    this.texData = texData;

    this.demBlob = new Blob([demBuffer], {
      type: "application/octet-stream",
    });
    this.binghuBlob = new Blob([binghuBuffer], {
      type: "application/octet-stream",
    });
    this.sourceBlob = new Blob([sourceBuffer], {
      type: "application/octet-stream",
    });
    this.glacierBlob = new Blob([glacierBuffer], {
      type: "application/octet-stream",
    });

    this.demBuffer = demBuffer;
    this.binghuBuffer = binghuBuffer;
    this.sourceBuffer = sourceBuffer;
    this.glacierBuffer = glacierBuffer;

    // saveTxt(demBuffer, "dem.txt", this._width);
    // saveTxt(binghuBuffer, "binghu.txt", this._width);
    // saveTxt(sourceBuffer, "source.txt", this._width);
    // saveTxt(glacierBuffer, "glacier.txt", this._width);
  }

  async initRender() {
    const map = this.map;
    const gl = this.gl;

    // 公共变量
    const Command = `#version 300 es
    precision highp float;
    precision highp int;
    precision highp sampler2D;   // 采样器也需要高精度
const int textureSize = 500;
// Render
const vec3 backgroundColor = vec3(0.2);
// Terrain
const float transitionTime = 5.0;
const float transitionPercent = 0.3;
const int octaves = 7;
// Water simulation
const float attenuation = 0.995;
const float strenght = 0.25;
const float minTotalFlow = 0.0001;
const float initialWaterLevel = 0.0;

mat2 rot(in float ang) 
{
  return mat2(
           cos(ang), -sin(ang),
           sin(ang),  cos(ang));
}

// hash from Dave_Hoskins https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p)
{
   vec3 p3  = fract(vec3(p.xyx) * .1031);
   p3 += dot(p3, p3.yzx + 33.33);
   return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3)
{
   p3  = fract(p3 * .1031);
   p3 += dot(p3, p3.zyx + 31.32);
   return fract((p3.x + p3.y) * p3.z);
}

// Box intersection by IQ https://iquilezles.org/articles/boxfunctions

vec2 boxIntersection( in vec3 ro, in vec3 rd, in vec3 rad, out vec3 oN ) 
{
   vec3 m = 1.0 / rd;
   vec3 n = m * ro;
   vec3 k = abs(m) * rad;
   vec3 t1 = -n - k;
   vec3 t2 = -n + k;

   float tN = max( max( t1.x, t1.y ), t1.z );
   float tF = min( min( t2.x, t2.y ), t2.z );
   
   if( tN > tF || tF < 0.0) return vec2(-1.0); // no intersection
   
   oN = -sign(rd)*step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);

   return vec2( tN, tF );
}

// vec2 hitBox(vec3 orig, vec3 dir) {
//    const vec3 box_min = vec3(-0.5);
//    const vec3 box_max = vec3(0.5);
//    vec3 inv_dir = 1.0 / dir;
//    vec3 tmin_tmp = (box_min - orig) * inv_dir;
//    vec3 tmax_tmp = (box_max - orig) * inv_dir;
//    vec3 tmin = min(tmin_tmp, tmax_tmp);
//    vec3 tmax = max(tmin_tmp, tmax_tmp);
//    float t0 = max(tmin.x, max(tmin.y, tmin.z));
//    float t1 = min(tmax.x, min(tmax.y, tmax.z));
//    return vec2(t0, t1);
// }

uniform vec3 u_boxMin;
uniform vec3 u_boxMax;
vec2 hitBox(vec3 orig, vec3 dir) {
   vec3 inv_dir = 1.0 / dir;
   vec3 tmin_tmp = (u_boxMin - orig) * inv_dir;
   vec3 tmax_tmp = (u_boxMax - orig) * inv_dir;
   vec3 tmin = min(tmin_tmp, tmax_tmp);
   vec3 tmax = max(tmin_tmp, tmax_tmp);
   float t0 = max(tmin.x, max(tmin.y, tmin.z));
   float t1 = min(tmax.x, min(tmax.y, tmax.z));
   return vec2(t0, t1);
}

vec2 iBox( in vec3 ro, in vec3 rd, in vec3 boxSize ) 
{
    vec3 m = sign(rd)/max(abs(rd), 1e-8);
    vec3 n = m*ro;
    vec3 k = abs(m)*boxSize;
	
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;

	float tN = max( max( t1.x, t1.y ), t1.z );
	float tF = min( min( t2.x, t2.y ), t2.z );
	
    if (tN > tF || tF <= 0.) {
        return vec2(10.);
    } else {
        return vec2(tN, tF);
    }
}

// Fog by IQ https://iquilezles.org/articles/fog

vec3 applyFog( in vec3  rgb, vec3 fogColor, in float distance)
{
   float fogAmount = exp( -distance );
   return mix( fogColor, rgb, fogAmount );
}
out vec4 out_FragColor;
`;

    // 计算地形和更新水位pass 1
    const BufferA = `
// compute Terrain and update water level 1st pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D heightMap;
uniform sampler2D lakeMap;
uniform float     iTime;
uniform int     iFrame;
float boxNoise( in vec2 p, in float z )
{
   vec2 fl = floor(p);
   vec2 fr = fract(p);
   fr = smoothstep(0.0, 1.0, fr);    
   float res = mix(mix( hash13(vec3(fl, z)),             hash13(vec3(fl + vec2(1,0), z)),fr.x),
                   mix( hash13(vec3(fl + vec2(0,1), z)), hash13(vec3(fl + vec2(1,1), z)),fr.x),fr.y);
   return res;
}

float Terrain( in vec2 p, in float z, in int octaveNum)
{
   float a = 1.0;
   float f = .0;
   for (int i = 0; i < octaveNum; i++)
   {
       f += a * boxNoise(p, z);
       a *= 0.45;
       p = 2.0 * rot(radians(41.0)) * p;
   }
   return f;
}

float readTerrain(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(textureSize - 1));
   return texelFetch(heightMap, p, 0).r;
} 
float readinitWater(ivec2 p){
  int lakeRadius = 1;
  for(int i = -lakeRadius; i <= lakeRadius; i++)
     for(int j = -lakeRadius; j <= lakeRadius; j++)
     {
        if(texelFetch(lakeMap, p + ivec2(i, j), 0).r!=0.) return 1.;
     }
  return 0.;
}

vec2 readHeight(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(textureSize - 1));
   return texelFetch(iChannel0, p, 0).xy;
} 

vec4 readOutFlow(ivec2 p)
{
   if(p.x < 0 || p.y < 0 || p.x >= textureSize || p.y >= textureSize)
       return vec4(0);
   return texelFetch(iChannel1, p, 0);
} 

void main( )
{
   // Outside ?
   if( max(gl_FragCoord.x, gl_FragCoord.y) > float(textureSize) )
       discard;
          
   // Terrain
   vec2 uv = gl_FragCoord.xy / float(textureSize);
   float t = iTime / transitionTime;
//    float terrainElevation = mix(Terrain(uv * 4.0, floor(t), octaves), Terrain(uv * 4.0, floor(t) + 1.0, octaves), smoothstep(1.0 - transitionPercent, 1.0, fract(t))) * 0.5;
   float terrainElevation = readTerrain(ivec2(gl_FragCoord.xy));
   // Water
   float waterDept = initialWaterLevel;
   if(readinitWater(ivec2(gl_FragCoord.xy))!=0.) waterDept= 0.05;
   if(iFrame != 0)
   {
       ivec2 p = ivec2(gl_FragCoord.xy);
       vec2 height = readHeight(p);
       vec4 OutFlow = texelFetch(iChannel1, p, 0);
       float totalOutFlow = OutFlow.x + OutFlow.y + OutFlow.z + OutFlow.w;
       float totalInFlow = 0.0;
       totalInFlow += readOutFlow(p  + ivec2( 1,  0)).z;
       totalInFlow += readOutFlow(p  + ivec2( 0,  1)).w;
       totalInFlow += readOutFlow(p  + ivec2(-1,  0)).x;
       totalInFlow += readOutFlow(p  + ivec2( 0, -1)).y;
       waterDept = height.y - totalOutFlow + totalInFlow;
       
       if(readinitWater(p)!=0.&& iFrame>5 && iFrame<50) waterDept+= 0.001;

    //    if(uv.x<0.05&&uv.y>.95&&iFrame<50) waterDept = .3;
   }
   out_FragColor = vec4(terrainElevation, waterDept, 0, 1);
}
`;

    // 更新水流量pass
    const BufferB = `
// Update Outflow 1st pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(textureSize - 1));
   return texelFetch(iChannel0, p, 0).xy;
} 

float computeOutFlowDir(vec2 centerHeight, ivec2 pos)
{
   vec2 dirHeight = readHeight(pos);
   return max(0.0f, (centerHeight.x + centerHeight.y) - (dirHeight.x + dirHeight.y));
}

void main()
{
   ivec2 p = ivec2(gl_FragCoord.xy);
   // Init to zero at frame 0
   if(iFrame == 0)
   {
       out_FragColor = vec4(0);
       return;
   }    
   
   // Outside ?
   if( max(p.x, p.y) > textureSize )
       discard;
       
   
      vec4 oOutFlow = texelFetch(iChannel1, p, 0);
   vec2 height = readHeight(p);
   vec4 nOutFlow;        
   nOutFlow.x = computeOutFlowDir(height, p + ivec2( 1,  0));
   nOutFlow.y = computeOutFlowDir(height, p + ivec2( 0,  1));
   nOutFlow.z = computeOutFlowDir(height, p + ivec2(-1,  0));
   nOutFlow.w = computeOutFlowDir(height, p + ivec2( 0, -1));
   nOutFlow = attenuation * oOutFlow + strenght * nOutFlow;
   float totalFlow = nOutFlow.x + nOutFlow.y + nOutFlow.z + nOutFlow.w;
   if(totalFlow > minTotalFlow)
   {
       if(height.y < totalFlow)
       {
           nOutFlow = nOutFlow * (height.y / totalFlow);
       }
   }
   else
   {
       nOutFlow = vec4(0);
   }


   out_FragColor = nOutFlow;
}
`;

    // 水位计算pass2
    const BufferC = `
// water level 2nd pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(textureSize - 1));
   return texelFetch(iChannel0, p, 0).xy;
} 

vec4 readOutFlow(ivec2 p)
{
   if(p.x < 0 || p.y < 0 || p.x >= textureSize || p.y >= textureSize)
       return vec4(0);
   return texelFetch(iChannel1, p, 0);
} 

void main( )
{
   // Outside ?
   if( max(gl_FragCoord.x, gl_FragCoord.y) > float(textureSize) )
       discard;
          
   // Water
   ivec2 p = ivec2(gl_FragCoord.xy);
   vec2 height = readHeight(p);
   vec4 OutFlow = texelFetch(iChannel1, p, 0);
   float totalOutFlow = OutFlow.x + OutFlow.y + OutFlow.z + OutFlow.w;
   float totalInFlow = 0.0;
   totalInFlow += readOutFlow(p  + ivec2( 1,  0)).z;
   totalInFlow += readOutFlow(p  + ivec2( 0,  1)).w;
   totalInFlow += readOutFlow(p  + ivec2(-1,  0)).x;
   totalInFlow += readOutFlow(p  + ivec2( 0, -1)).y;
   float waterDept = height.y - totalOutFlow + totalInFlow;

   out_FragColor = vec4(height.x, waterDept, 0, 1);
}
`;

    // 水流量计算pass2
    const BufferD = `
// Update Outflow 2nd pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(textureSize - 1));
   return texelFetch(iChannel0, p, 0).xy;
} 

float computeOutFlowDir(vec2 centerHeight, ivec2 pos)
{
   vec2 dirHeight = readHeight(pos);
   return max(0.0f, (centerHeight.x + centerHeight.y) - (dirHeight.x + dirHeight.y));
}

void main( )
{
   ivec2 p = ivec2(gl_FragCoord.xy);
   
   // Outside ?
   if( max(p.x, p.y) > textureSize )
       discard;
       
   
      vec4 oOutFlow = texelFetch(iChannel1, p, 0);
   vec2 height = readHeight(p);
   vec4 nOutFlow;        
   nOutFlow.x = computeOutFlowDir(height, p + ivec2( 1,  0));
   nOutFlow.y = computeOutFlowDir(height, p + ivec2( 0,  1));
   nOutFlow.z = computeOutFlowDir(height, p + ivec2(-1,  0));
   nOutFlow.w = computeOutFlowDir(height, p + ivec2( 0, -1));
   nOutFlow = attenuation * oOutFlow + strenght * nOutFlow;
   float totalFlow = nOutFlow.x + nOutFlow.y + nOutFlow.z + nOutFlow.w;
   if(totalFlow > minTotalFlow)
   {
       if(height.y < totalFlow)
       {
           nOutFlow = nOutFlow * (height.y / totalFlow);
       }
   }
   else
   {
       nOutFlow = vec4(0);
   }


   out_FragColor = nOutFlow;
}
`;
    const renderVertexShader = `#version 300 es
             uniform mat4 u_matrix;
             uniform vec3 cameraPos;
             layout(location=0) in vec3 a_pos;
             layout(location=1) in vec2 a_texCoord;
             out vec3 v_pos;
             out vec3 vo;
             out vec3 vd;
             out vec2 v_st;
             void main() {
               v_pos = a_pos;
               v_st = a_texCoord;
               gl_Position = u_matrix * vec4(a_pos, 1.0);
            //    gl_Position = a_pos;

               vo = cameraPos;
               vd = v_pos - vo;
            //    vec4 vo_m = u_matrix * vec4(cameraPos, 1.0);
            //    vo = vo_m.xyz / vo_m.w;
            //    vd = gl_Position.xyz / gl_Position.w - vo;
             }`;
    const renderShaderSource = `
// Created by David Gallardo - xjorma/2021
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0
#define AA
#define GAMMA 1
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform vec2     iResolution;
uniform float     iTime;
uniform int     iFrame;
in vec3 vo;
in vec3 vd;
in vec2 v_st;
const vec3 light = vec3(0.,4.,2.);
const float boxHeight = 0.0;

vec3 normalizeP(vec3 p)
{
   return (p - u_boxMin) / (u_boxMax - u_boxMin);
}

vec2 getHeight(in vec3 p)
{
   vec2 p2 = p.xy * vec2(float(textureSize)) / iResolution.xy;
   p2 = min(p2, vec2(float(textureSize) - 0.5) / iResolution.xy);
   vec2 h = texture(iChannel0, p2).xy;
   h.y += h.x;
   return h - boxHeight;
} 

vec3 getNormal(in vec3 p, int comp)
{
   float d = 2.0 / float(textureSize);
   float hMid = getHeight(p)[comp];
   float hRight = getHeight(p + vec3(d, 0, 0))[comp];
   float hTop = getHeight(p + vec3(0, d, 0))[comp];
   return normalize(cross(vec3(hTop - hMid, d, 0), vec3(d, hRight - hMid, 0)));
}

vec3 terrainColor(in vec3 p, in vec3 n, out float spec)
{
   spec = 0.1;
   vec3 c = vec3(0.21, 0.50, 0.07);
   float cliff = smoothstep(0.8, 0.3, n.y);
   c = mix(c, vec3(0.25), cliff);
   spec = mix(spec, 0.3, cliff);
   float snow = smoothstep(0.05, 0.25, p.z) * smoothstep(0.5, 0.7, n.y);
   c = mix(c, vec3(0.95, 0.95, 0.85), snow);
   spec = mix(spec, 0.4, snow);
   vec3 t = texture(iChannel1, p.xy * 5.0).xyz;
   return mix(c, c * t, 0.75)* (vec3(214.,160.,29.) / 255.) *4.;
}

vec3 undergroundColor(float d)
{
   vec3 color[4] = vec3[](vec3(0.5, 0.45, 0.5), vec3(0.40, 0.35, 0.25), vec3(0.55, 0.50, 0.4), vec3(0.45, 0.30, 0.20));
   d *= 6.0;
   d = min(d, 3.0 - 0.001);
   float fr = fract(d);
   float fl = floor(d);
   return mix(color[int(fl)], color[int(fl) + 1], fr);
}

vec4 Render(in vec3 ro, in vec3 rd) {
   vec3 n;
   vec3 rayDir = normalize(rd);
   vec2 ret = hitBox(ro, rayDir);
   if (ret.x > ret.y) discard;
   vec3 p = ro + ret.x * rayDir;
   
   if(ret.x > 0.0) {
       vec3 pi = ro + rd * ret.x;
       vec3 npi = normalizeP(pi);
       vec4 tc;
       vec3 tn;
       float tt = ret.x;
       vec2 h = getHeight(npi);
    //    return vec3(h.xy,0.);
    //    return vec3(h.y);
       float spec;
       if(npi.z < h.x) {
           tn = n;
           tc.xyz = undergroundColor(h.x - npi.z);
       }
       else {
           for (int i = 0; i < 800; i++) {
               vec3 p = ro + rd * tt;
               vec3 np = normalizeP(p);
               float h = np.z - getHeight(np).x;
               if (h < 0.002 || tt > ret.y)
               break;
               tt += (ret.y-ret.x) * 0.002;
           }
           tn = getNormal(normalizeP(ro + rd * tt), 0);
           tc.xyz = terrainColor(normalizeP(ro + rd * tt), tn, spec);
       }
       {   
           vec3 lightDir = normalize(light - normalizeP(ro + rd * tt));
           tc.xyz = tc.xyz * (max( 0.0, dot(lightDir, tn)) + 0.3);
           spec *= pow(max(0., dot(lightDir, reflect(rd, tn))), 10.0);
        //    tc.xyz += spec;
       }
       if(tt > ret.y) {
           tc.xyz = vec3(0, 0, 0.04);
       }
       float wt = ret.x;
       h = getHeight(npi);
       vec3 waterNormal;
       if(npi.z < h.y) {
           waterNormal = n;
       }
       else {
           for (int i = 0; i < 800; i++) {
               vec3 p = ro + rd * wt;
               vec3 np = normalizeP(p);
               float h = np.z  - getHeight(np).y;
               if (h < 0.002 || wt > min(tt, ret.y))
               break;
               wt += (ret.y-ret.x)* 0.002;
           }
           waterNormal = getNormal(normalizeP(ro + rd * wt), 1);
       }
       if(wt < ret.y) {
           float dist = (min(tt, ret.y) - wt) / (ret.y-ret.x) ;
           vec3 p = waterNormal;
           vec3 lightDir = normalize(light - normalizeP(ro + rd * wt));
           tc.xyz = applyFog( tc.xyz, vec3(0.359375, 0.2578125, 0.14453125), dist * 15.0*20.);
           float spec = pow(max(0., dot(lightDir, reflect(rd, waterNormal))), 20.0);
           tc.xyz += 0.5 * spec * smoothstep(0.0, 0.1, dist);
       }else{
           discard;
       }
       tc.a=1.;
       if(tt -wt < 0.000000001 ) discard;
       return tc;
   }
  discard;
}

vec3 vignette(vec3 color, vec2 q, float v)
{
   color *= 0.3 + 0.8 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), v);
   return color;
}


void main()
{
   vec3 tot = vec3(0.0);
   vec3 rayDir = normalize(vd);
   vec4 col = Render(vo, rayDir);
   tot += col.xyz;
   out_FragColor = vec4( tot, col.a );
}
`;

    const camera = map.getFreeCameraOptions();
    const cameraPos = [
      camera._position.x,
      camera._position.y,
      camera._position.z,
    ];

    let time = 0,
      frame = 0,
      resolution = [500, 500];

    const textureA = createTexture(gl, null, { textureUnit: 0 });
    const textureB = createTexture(gl, null, { textureUnit: 1 });
    const textureC = createTexture(gl, null, { textureUnit: 2 });
    const textureD = createTexture(gl, null, { textureUnit: 3 });

    const terrainMap = await createTextureFromURL(gl, "/terrain.jpg");

    // const heightMap = await createTextureFromURL(gl, '/tif1.png')
    const heightMap = genDem(gl);

    const textureImg = createTextureFromURL(gl, "/1.png");
    const blueTexture = createTexture(gl, [0, 0, 255, 128], {
      textureUnit: 1,
    });

    // 创建计算层
    const computeLayerA = new ComputeLayer({
      id: "computeLayerA",
      texR: { width: 500, height: 500 },
      uniforms: {
        iTime: time,
        iFrame: frame,
        iChannel0: textureC,
        iChannel1: textureD,
        heightMap: this.demMap,
        lakeMap: this.lakeMap,
      },
      // textureUnit: 0,
      outputTexture: textureA,
      fragmentShader: Command + BufferA,
    });
    const computeLayerB = new ComputeLayer({
      id: "computeLayerB",
      texR: { width: 500, height: 500 },
      uniforms: {
        iTime: time,
        iFrame: frame,
        iChannel0: textureA,
        iChannel1: textureD,
      },
      // textureUnit: 2,
      outputTexture: textureB,
      fragmentShader: Command + BufferB,
    });
    const computeLayerC = new ComputeLayer({
      id: "computeLayerC",
      texR: { width: 500, height: 500 },
      uniforms: {
        iTime: time,
        iFrame: frame,
        iChannel0: textureA,
        iChannel1: textureB,
      },
      // textureUnit: 4,
      outputTexture: textureC,
      fragmentShader: Command + BufferC,
    });
    const computeLayerD = new ComputeLayer({
      id: "computeLayerD",
      texR: { width: 500, height: 500 },
      uniforms: {
        iTime: time,
        iFrame: frame,
        iChannel0: textureC,
        iChannel1: textureB,
      },
      // textureUnit: 6,
      outputTexture: textureD,
      fragmentShader: Command + BufferD,
    });

    // 创建渲染层

    const myCustomBoxLayer = new CustomBoxLayer({
      box: this.box,
      texR: { width: 500, height: 500 },
      uniforms: {
        iTime: time,
        iFrame: frame,
        iResolution: resolution,
        cameraPos: cameraPos,
        iChannel0: textureC,
        iChannel1: terrainMap,
      },
      // textureUnit: 0,
      vertexShader: renderVertexShader,
      fragmentShader: Command + renderShaderSource,
    });

    map.addLayer(computeLayerA);
    map.addLayer(computeLayerB);
    map.addLayer(computeLayerC);
    map.addLayer(computeLayerD);
    map.addLayer(myCustomBoxLayer);

    map.on("render", () => {
      const newCamera = map.getFreeCameraOptions();
      const newCameraPos = [
        newCamera._position.x,
        newCamera._position.y,
        newCamera._position.z,
      ];
      // 在每一帧中执行的逻辑
      const now = performance.now();
      time = now / 1000;
      frame += 0.02;
      computeLayerA.setUniform("iFrame", frame);
      // computeLayerA.setUniform('iTime', time)

      computeLayerB.setUniform("iFrame", frame);
      computeLayerB.setUniform("iTime", time);

      computeLayerC.setUniform("iFrame", frame);
      computeLayerC.setUniform("iTime", time);

      computeLayerD.setUniform("iFrame", frame);
      computeLayerD.setUniform("iTime", time);

      myCustomBoxLayer.setUniform("iFrame", frame);
      myCustomBoxLayer.setUniform("iTime", time);
      myCustomBoxLayer.setUniform("cameraPos", newCameraPos);
      // myCustomBoxLayer.setUniform('iChannel0', textureC)
      // myCustomBoxLayer.setUniform('iChannel1', terrainMap)
    });

    // const viewCamera = JSON.parse(
    //   '{"position":{"x":0.7639722167626107,"y":0.41299299824297137,"z":0.0023821707297549876},"orientation":[-0.02182992592397022,0.19660918000605684,-0.9742519384761601,0.10817321778954461],"_renderWorldCopies":true}'
    // );
    const viewCamera = JSON.parse(
        '{"position":{"x":0.7436788867347409,"y":0.4188306458438292,"z":0.0003806961584104004},"orientation":[-0.006169343503937063,0.4249180184114985,-0.9051154199939287,0.013141283011550695],"_renderWorldCopies":true}'
      );
      map.setFreeCameraOptions(viewCamera);
  }

  addWater(position, strenght) {
    const { theta, distance } = angle(this.center, position);
    const dis_north = distance * Math.cos(Cesium.Math.toRadians(theta));
    const dis_east = distance * Math.sin(Cesium.Math.toRadians(theta));
    if (
      Math.abs(dis_north) > this._height * this.cellSize ||
      Math.abs(dis_east) > this._width * this.cellSize
    ) {
      this._waterAdd.w = 0;
      return;
    }
    const x = parseInt(dis_east / this.cellSize) + this._width / 2;
    const y = parseInt(dis_north / this.cellSize) + this._height / 2;

    this._waterAdd.x = x;
    this._waterAdd.y = this._height - 1 - y;
    this._waterAdd.z = strenght;
    this._waterAdd.w = 1;
  }
  StopAddWater() {
    this._waterAdd.w = 0;
  }
  async pushFortronData(base64) {
    this.fortranDataSet.push("data:image/png;base64," + base64);
  }

  async setRange(base64) {
    const img = await base64ToImg(base64);

    const newTex = new Cesium.Texture({
      context: this._viewer.scene.frameState.context,
      source: img,
      sampler: new Cesium.Sampler({
        wrapS: Cesium.TextureWrap.REPEAT,
        wrapT: Cesium.TextureWrap.REPEAT,
        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
        minificationFilter:
          Cesium.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
      }),
    });
    newTex.generateMipmap();
    this.rangeMap = newTex;
  }

  async setWaterHeight(base64) {
    const img = await base64ToImg(base64);

    const newTex = new Cesium.Texture({
      context: this._viewer.scene.frameState.context,
      source: img,
      flipY: false,
      sampler: new Cesium.Sampler({
        wrapS: Cesium.TextureWrap.REPEAT,
        wrapT: Cesium.TextureWrap.REPEAT,
        magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
        minificationFilter:
          Cesium.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
      }),
    });
    newTex.generateMipmap();
    const oldTex = this.waterHeightMap;
    this.waterHeightMap = newTex;
    oldTex.destroy();
  }

  setRenderOpts(opt) {
    if (opt.deepWaterColor)
      this._deepWaterColor = Cesium.Color.fromCssColorString(
        opt.deepWaterColor
      );
    if (opt.lightWaterColor)
      this._lightWaterColor = Cesium.Color.fromCssColorString(
        opt.lightWaterColor
      );
    this.renderHeatMap = opt.renderHeatMap;
  }

  async getInundation(index) {
    const _this = this;
    const promise = new Promise((resolve, reject) => {
      base64ToUint8Array(
        _this.fortranDataSet[Math.floor(_this.dataSetIdx / 15)]
      ).then((dataArray) => {
        const points = [];
        for (let y = 0; y < _this._height; y++) {
          for (let x = 0; x < _this._width; x++) {
            // 计算原始图像数据和翻转后图像数据的索引
            let originalIndex = y * _this._width + x;
            let flippedIndex = (_this._height - 1 - y) * _this._width + x;

            if (
              dataArray[flippedIndex * 4] != 0 &&
              dataArray[flippedIndex * 4 + 1] != 0 &&
              dataArray[flippedIndex * 4 + 2] != 0
            ) {
              const offset = [
                (x - _this._width / 2 + 0.5) * _this.cellSize,
                (y - _this._height / 2 + 0.5) * _this.cellSize,
              ];
              const cellCenter = getNorthPointByDistance(_this.center, offset);
              const cart = Cartographic.fromCartesian(cellCenter);
              points.push(
                turf.point([
                  Cesium.Math.toDegrees(cart.longitude),
                  Cesium.Math.toDegrees(cart.latitude),
                ])
              );
            }
          }
        }
        const options = { units: "miles", maxEdge: 10 };

        const hull = turf.convex(turf.featureCollection(points), options);
        // const dataSource = await Cesium.GeoJsonDataSource.load(hull)
        // this._viewer.dataSources.add(dataSource)
        resolve(hull);
      });
    });
    return promise;
  }

  remove() {}
}
/**
 * 创建WebGL纹理并初始化颜色
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {Array<number>} array - 数据数组
 * @param {object} [options] - 配置选项
 * @param {number} [options.width=1] - 纹理宽度（像素）
 * @param {number} [options.height=1] - 纹理高度（像素）
 * @param {number} [options.textureUnit=0] - 纹理单元编号
 * @returns {WebGLTexture} 创建的纹理对象
 */
function createTexture(gl, array, options = {}) {
  const {
    width = 500,
    height = 500,
    textureUnit = 0,
    internalFormat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
  } = options;

  // 1. 创建纹理对象
  const texture = gl.createTexture();

  // 2. 激活指定纹理单元并绑定纹理
  gl.activeTexture(gl[`TEXTURE${textureUnit}`]);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // 3. 设置纹理参数（兼容非2的幂纹理）
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // 5. 上传纹理数据
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // mipmap级别
    internalFormat, // 内部格式
    width,
    height,
    0, // 边框必须为0
    format, // 像素数据格式
    type, // 像素数据类型
    array || new Uint8Array(width * height * 4)
  );

  return texture;
}

/**
 * 创建WebGL纹理并初始化颜色（支持0~1浮点数自动映射到UNSIGNED_BYTE）
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {Array<number>} array - 数据数组（0~1区间的浮点数）
 * @param {object} [options] - 配置选项
 * @param {number} [options.width=1] - 纹理宽度（像素）
 * @param {number} [options.height=1] - 纹理高度（像素）
 * @param {number} [options.textureUnit=0] - 纹理单元编号
 * @returns {WebGLTexture} 创建的纹理对象
 */
function createTextureWithFloatArray(gl, array, options = {}) {
  const {
    width = 500,
    height = 500,
    textureUnit = 0,
    internalFormat = gl.RGBA,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
  } = options;

  // 1. 创建纹理对象
  const texture = gl.createTexture();

  // 2. 激活指定纹理单元并绑定纹理
  gl.activeTexture(gl[`TEXTURE${textureUnit}`]);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // 3. 设置纹理参数（兼容非2的幂纹理）
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // 4. 如果传入的是浮点数组且类型为UNSIGNED_BYTE，则进行数值映射
  let data = array;
  if (array && type === gl.UNSIGNED_BYTE && array.some((v) => v > 1 || v < 0)) {
    console.warn(
      "Array contains values outside 0~1 range, clamping will occur"
    );
  }

  if (array && type === gl.UNSIGNED_BYTE) {
    // 创建Uint8Array并映射0~1 → 0~255
    const length = width * height * (format === gl.RGBA ? 4 : 3);
    data = new Uint8Array(length);
    for (let i = 0; i < array.length; i++) {
      data[i] = Math.round(Math.min(1, Math.max(0, array[i])) * 255);
    }
  } else if (!array) {
    // 默认初始化白色纹理
    data = new Uint8Array(width * height * 4).fill(255);
  }

  // 5. 上传纹理数据
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // mipmap级别
    internalFormat,
    width,
    height,
    0, // 边框必须为0
    format,
    type,
    data
  );

  return texture;
}

// 辅助函数：检测是否为2的幂
function isPowerOf2(value) {
  return (value & (value - 1)) === 0;
}

/**
 * 根据图片URL创建WebGL纹理对象
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {string} url - 图片URL
 * @param {object} [options] - 配置选项
 * @param {boolean} [options.flipY=true] - 是否垂直翻转纹理（默认true）
 * @param {number} [options.textureUnit=0] - 纹理单元编号（默认0）
 * @returns {Promise<WebGLTexture>} 返回包含纹理对象的Promise
 */
function createTextureFromURL(gl, url, options = {}) {
  const { flipY = true, textureUnit = 0 } = options;

  return new Promise((resolve, reject) => {
    // 1. 创建并绑定纹理对象
    const texture = gl.createTexture();
    gl.activeTexture(gl[`TEXTURE${textureUnit}`]);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 2. 设置默认纹理参数（非2的幂纹理兼容）
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 3. 设置临时单像素纹理（蓝色占位）
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 255, 255])
    );

    // 4. 加载图片
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      // 5. 配置像素存储（Y轴翻转）
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);

      // 6. 上传真实纹理数据
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );

      // 7. 如果是2的幂纹理则生成mipmap
      if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      resolve(texture);
    };

    image.onerror = (err) => reject(new Error("图片加载失败: " + url));
    image.src = url;
  });
}

const genDem = (gl) => {
  // 1. 创建WebGL2上下文
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 500;
  if (!gl) throw new Error("WebGL2 not supported");

  // 2. 创建纹理
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // 3. 创建FBO
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  // 4. 着色器程序
  const vertShader = `#version 300 es
in vec2 position;
void main() {
    gl_Position = vec4(position, 0, 1);
}`;

  const fragShader = `#version 300 es
precision highp float;
out vec4 fragColor;

// 噪声函数 (简化版)
float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// 河道生成函数
float river(vec2 uv) {
    // 主河道蜿蜒路径 (使用正弦波模拟)
    float riverPath = sin(uv.x * 10.0) * 0.1 + sin(uv.x * 30.0) * 0.03;
    
    // 河道宽度 (渐变)
    float riverWidth = 0.03 + smoothstep(0.0, 1.0, uv.x) * 0.02;
    
    // 计算到河道的距离
    float dist = abs(uv.y - 0.5 - riverPath);
    
    // 平滑的河道边缘
    return smoothstep(riverWidth, riverWidth - 0.01, dist);
}

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(500.0);
    
    // 生成河道 (值为1表示河道，0表示陆地)
    float riverValue = river(uv);
    
    // 噪声模拟地面高程
    float elevation = noise(uv * 10.0) * 0.3 + 0.7;
    
    // 混合河道和地面
    float finalValue = mix(elevation, 1.0, riverValue);
    
    // RGBA分量相等 (灰度图)
    fragColor = vec4(vec3(finalValue), 1.0);
}`;

  // 编译着色器
  function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compileShader(gl, vertShader, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragShader, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  // 5. 渲染全屏四边形
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // 6. 执行渲染
  gl.viewport(0, 0, 500, 500);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // 7. 解绑FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // 8. 获取纹理数据 (可选)
  const pixels = new Uint8Array(500 * 500 * 4);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // 现在texture就是包含河道和高程的纹理
  console.log("纹理创建完成");
  return texture;
};

/**
 * 将 WebGL2 纹理转换为 Base64 图像
 * @param {WebGL2RenderingContext} gl - WebGL2 上下文
 * @param {WebGLTexture} texture - 要转换的纹理
 * @param {number} width - 纹理宽度
 * @param {number} height - 纹理高度
 * @param {string} [format='image/png'] - 输出图像格式 (image/png 或 image/jpeg)
 * @param {number} [quality=0.92] - 如果格式为 JPEG，则指定质量 (0-1)
 * @returns {Promise<string>} 返回一个解析为 Base64 字符串的 Promise
 */
function textureToBase64(
  gl,
  texture,
  width,
  height,
  format = "image/png",
  quality = 0.92
) {
  return new Promise((resolve, reject) => {
    try {
      // 创建帧缓冲区并绑定纹理
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );

      // 检查帧缓冲区状态
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      ) {
        throw new Error("Framebuffer is not complete");
      }

      // 读取像素数据
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // 清理
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);

      // 创建临时 canvas 来处理数据
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not get 2D context");
      }

      // 创建 ImageData 并放入 canvas
      const imageData = ctx.createImageData(width, height);

      // WebGL 的像素数据是底部向上的，需要翻转
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIndex = (y * width + x) * 4;
          const dstIndex = ((height - y - 1) * width + x) * 4;

          imageData.data[dstIndex] = pixels[srcIndex]; // R
          imageData.data[dstIndex + 1] = pixels[srcIndex + 1]; // G
          imageData.data[dstIndex + 2] = pixels[srcIndex + 2]; // B
          imageData.data[dstIndex + 3] = pixels[srcIndex + 3]; // A
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // 转换为 Base64
      const base64 = canvas.toDataURL(format, quality);
      resolve(base64);
    } catch (error) {
      reject(error);
    }
  });
}
export default WaterSimulate;
