const { defaultValue, Cartographic, sampleTerrain } = Cesium;

class WaterSimulate {
  constructor(options) {
    this._viewer = options.viewer;
    this._width = defaultValue(options.width, 1024);
    this._height = defaultValue(options.height, 1024);
    this.cellSize = defaultValue(options.cellSize, 30);

    this._resolution = new Cesium.Cartesian2(this._width, this._height);

    this._waterAdd = new Cesium.Cartesian4(0, 0, 0, 0);
  }

  async initBox(options) {
    const terrainData = await this.initTerrain(options.center, options.level);
    this.genDemTexture(terrainData);
    this.initShader();
    await this.initTexture();
    this.initFrameBuffer();
    this.initRender();
  }

  initTerrain(center, level) {
    this.center = center;
    const positions = [];
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const offset = [
          (x - this._width / 2 + 0.5) * this.cellSize,
          (y - this._height / 2 + 0.5) * this.cellSize,
        ];
        const cellCenter = getNorthPointByDistance(center, offset);
        positions.push(Cartographic.fromCartesian(cellCenter));
      }
    }
    return sampleTerrain(viewer.terrainProvider, level, positions);
  }

  genDemTexture(data) {
    this.terrainData = data;
    const width = this._width;
    const height = this._height;

    const texData = new Float32Array(width * height * 4);

    let max = 0,
      min = 999999;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let originalIndex = y * width + x;
        max = Math.max(data[originalIndex].height, max);
        min = Math.min(data[originalIndex].height, min);
      }
    }

    // 遍历原始图像数据，按照上下翻转的方式将像素值填充到新的 ImageData 对象中
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 计算原始图像数据和翻转后图像数据的索引
        let originalIndex = y * width + x;
        let flippedIndex = ((height - 1 - y) * width + x) * 4;

        // 将原始图像数据的像素值填充到翻转后图像数据中
        texData[originalIndex * 4] =
          (data[originalIndex].height - min) / (max - min);
        texData[originalIndex * 4 + 1] =
          (data[originalIndex].height - min) / (max - min);
        texData[originalIndex * 4 + 2] =
          (data[originalIndex].height - min) / (max - min);
        texData[originalIndex * 4 + 3] =
          (data[originalIndex].height - min) / (max - min);
      }
    }
    this.demMap = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: texData,
    });

    this.max = max;
    this.min = min;
  }

  initShader() {
    // 公共变量
    this.Command = `
const int textureSize = `+ this._width +`;
// Render
const vec3 backgroundColor = vec3(0.2);
// Terrain
const float transitionTime = 5.0;
const float transitionPercent = 0.3;
const int octaves = 7;
// Water simulation
const float attenuation = 0.995;
const float strenght = 0.00525;
const float minTotalFlow = 0.0001;
const float initialWaterLevel = 0.002;

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

vec2 hitBox(vec3 orig, vec3 dir) {
   const vec3 box_min = vec3(-0.5);
   const vec3 box_max = vec3(0.5);
   vec3 inv_dir = 1.0 / dir;
   vec3 tmin_tmp = (box_min - orig) * inv_dir;
   vec3 tmax_tmp = (box_max - orig) * inv_dir;
   vec3 tmin = min(tmin_tmp, tmax_tmp);
   vec3 tmax = max(tmin_tmp, tmax_tmp);
   float t0 = max(tmin.x, max(tmin.y, tmin.z));
   float t1 = min(tmax.x, min(tmax.y, tmax.z));
   return vec2(t0, t1);
}

// Fog by IQ https://iquilezles.org/articles/fog

vec3 applyFog( in vec3  rgb, vec3 fogColor, in float distance)
{
   float fogAmount = exp( -distance );
   return mix( fogColor, rgb, fogAmount );
}
`;

    // 计算地形和更新水位pass 1
    this.BufferA = `
// compute Terrain and update water level 1st pass
uniform sampler2D TerrainWaterMap;
uniform sampler2D OutFlow;
uniform sampler2D heightMap;
uniform float     iTime;
uniform int     iFrame;
uniform vec4 waterAdd;
uniform vec2 resolution;

vec2 readHeight(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(ivec2(resolution) - 1));
   return texelFetch(TerrainWaterMap, p, 0).xy;
}

float readTerrain(ivec2 p)
{
   p = clamp(p, ivec2(0), ivec2(ivec2(resolution) - 1));
   return texelFetch(heightMap, p, 0).r;
} 


vec4 readOutFlow(ivec2 p)
{
   if(p.x < 0 || p.y < 0 || p.x >= ivec2(resolution).x || p.y >= ivec2(resolution).y)
       return vec4(0);
   return texelFetch(OutFlow, p, 0);
} 

void main( )
{
   // Outside ?
   if( max(gl_FragCoord.x, gl_FragCoord.y) > float(textureSize) )
       discard;
          
   // Terrain
   vec2 uv = gl_FragCoord.xy / float(textureSize);
   float t = iTime / transitionTime;
   float terrainElevation = readTerrain(ivec2(gl_FragCoord.xy));
   // Water
   float waterDept = initialWaterLevel;
   if(iFrame != 0)
   {
       ivec2 p = ivec2(gl_FragCoord.xy);
       vec2 height = readHeight(p);
       vec4 OutFlow = texelFetch(OutFlow, p, 0);
       float totalOutFlow = OutFlow.x + OutFlow.y + OutFlow.z + OutFlow.w;
       float totalInFlow = 0.0;
       totalInFlow += readOutFlow(p  + ivec2( 1,  0)).z;
       totalInFlow += readOutFlow(p  + ivec2( 0,  1)).w;
       totalInFlow += readOutFlow(p  + ivec2(-1,  0)).x;
       totalInFlow += readOutFlow(p  + ivec2( 0, -1)).y;
       waterDept = height.y - totalOutFlow + totalInFlow;

       if(waterAdd.w==1. && int(waterAdd.x) == p.x && int(waterAdd.y) == p.y)
           waterDept += waterAdd.z;
   }
   out_FragColor = vec4(terrainElevation, waterDept, 0, 1);
}
`;

    // 更新水流量pass
    this.BufferB = `
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
    this.BufferC = `
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
    this.BufferD = `
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

    this.renderShaderSource = `
// Created by David Gallardo - xjorma/2021
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0
#define AA
#define GAMMA 1
uniform sampler2D iChannel0;
// uniform sampler2D iChannel1;
uniform sampler2D heightMap;
uniform vec2     iResolution;
uniform float     iTime;
uniform int     iFrame;
in vec3 vo;
in vec3 vd;
in vec2 v_st;
const vec3 light = vec3(0.,4.,2.);
const float boxHeight = 0.45;
vec2 getHeight(in vec3 p)
{
   p = (p + 1.0) * 0.5;
   vec2 p2 = p.xz * vec2(float(textureSize)) / iResolution.xy;
   p2 = min(p2, vec2(float(textureSize) - 0.5) / iResolution.xy);
  //  vec2 p2 = p.xz * vec2(float(iResolution.xy)) / iResolution.xy;
  //  p2 = min(p2, vec2(float(iResolution.xy) - 0.5) / iResolution.xy);
   
   vec2 h = texture(iChannel0, p2).xy;
   h.y += h.x;
   return h - boxHeight;
} 

vec3 getNormal(in vec3 p, int comp)
{
   float d = 2.0 / float(textureSize);
  //  float d = 2.0 / float(iResolution.xy);
   float hMid = getHeight(p)[comp];
   float hRight = getHeight(p + vec3(d, 0, 0))[comp];
   float hTop = getHeight(p + vec3(0, 0, d))[comp];
   return normalize(cross(vec3(0, hTop - hMid, d), vec3(d, hRight - hMid, 0)));
}

vec4 terrainColor(in vec3 p, in vec3 n, out float spec)
{
  //  spec = 0.1;
  //  vec3 c = vec3(0.21, 0.50, 0.07);
  //  float cliff = smoothstep(0.8, 0.3, n.y);
  //  c = mix(c, vec3(0.25), cliff);
  //  spec = mix(spec, 0.3, cliff);
  //  float snow = smoothstep(0.05, 0.25, p.y) * smoothstep(0.5, 0.7, n.y);
  //  c = mix(c, vec3(0.95, 0.95, 0.85), snow);
  //  spec = mix(spec, 0.4, snow);
  //  vec3 t = texture(iChannel1, p.xz * 5.0).xyz;
  //  return mix(c, c * t, 0.75);
  return vec4(.62,.79,.91,1.);
  // return vec3(p.y + .5);
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
   ret.x = max(ret.x, 0.0);
   vec3 p = ro + ret.x * rayDir;
   
   if(ret.x > 0.0) {
       vec3 pi = ro + rd * ret.x;
       vec4 tc;
       vec3 tn;
       float tt = ret.x;
       vec2 h = getHeight(pi);
       float spec;
       if(pi.y < h.x) {
           tn = n;
           tc.xyz = undergroundColor(h.x - pi.y);
           discard;
       }
       else {
           for (int i = 0; i < 80; i++) {
               vec3 p = ro + rd * tt;
               float h = p.y - getHeight(p).x;
               if (h < 0.0002 || tt > ret.y)
               break;
               tt += h * 0.4;
           }
           tn = getNormal(ro + rd * tt, 0);
           tc = terrainColor(ro + rd * tt, tn, spec);
       }
       {   
           vec3 lightDir = normalize(light - (ro + rd * tt));
           tc.xyz = tc.xyz * (max( 0.0, dot(lightDir, tn)) + 0.3);
           spec *= pow(max(0., dot(lightDir, reflect(rd, tn))), 10.0);
           tc.xyz += spec;
       }
       if(tt > ret.y) {
           tc.xyz = vec3(0, 0, 0.4);
       }
       float wt = ret.x;
       h = getHeight(pi);
       vec3 waterNormal;
       if(pi.y < h.y) {
           waterNormal = n;
       }
       else {
           for (int i = 0; i < 80; i++) {
               vec3 p = ro + rd * wt;
               float h = p.y - getHeight(p).y;
               if (h < 0.0002 || wt > min(tt, ret.y))
               break;
               wt += h * 0.4;
           }
           waterNormal = getNormal(ro + rd * wt, 1);
       }
       if(wt < ret.y) {
           float dist = (min(tt, ret.y) - wt);
           vec3 p = waterNormal;
           vec3 lightDir = normalize(light - (ro + rd * wt));
           tc.xyz = applyFog( tc.xyz, vec3(0, 0, 0.4), dist * 15.0);
           float spec = pow(max(0., dot(lightDir, reflect(rd, waterNormal))), 20.0);
           tc.xyz += 0.5 * spec * smoothstep(0.0, 0.1, dist);
       }else{
           discard;
       }
       float alpha = 1.;
      //  if( h.y > 0.) alpha = 1.;
      //  else alpha = 0.;
      //  return vec4(tc,alpha);
      if(tt -wt < 0.01) discard;
      else tc.a = .7;
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
   tot += col.rgb;
   out_FragColor = vec4( tot, col.a );
}
`;
  }

async initTexture() {
    this.texA = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    this.texB = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    this.texC = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    this.texD = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });

    // Render Box
    // this.terrainMap = this._viewer.scene.frameState.context.defaultTexture;
    // const image = await Cesium.Resource.fetchImage({
    //   url: "/SimulateData/terrainColorMap.jpg",
    // });
    // this.terrainMap = new Cesium.Texture({
    //   context: this._viewer.scene.frameState.context,
    //   source: image,
    //   sampler: new Cesium.Sampler({
    //     wrapS: Cesium.TextureWrap.REPEAT,
    //     wrapT: Cesium.TextureWrap.REPEAT,
    //     magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
    //     minificationFilter:
    //       Cesium.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    //   }),
    // });
    // this.terrainMap.generateMipmap();
  }

  initFrameBuffer() {
    const _this = this;
    // Render Buffers
    this.quadGeometry = RenderUtil.getFullscreenQuad();
    // BufferA
    this.Buffer_A = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return this.time;
        },
        iFrame: () => {
          return this.frame;
        },
        waterAdd: () => {
          return this._waterAdd;
        },
        resolution: () => {
          return this._resolution;
        },
        TerrainWaterMap: () => {
          return this.texC;
        },
        OutFlow: () => {
          return this.texD;
        },
        heightMap: () => {
          return this.demMap;
        },
        lakeMap: () => {
          return this._LakeArea;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [this.Command, this.BufferA],
      }),
      geometry: this.quadGeometry,
      outputTexture: this.texA,
      preExecute: function () {
        _this.Buffer_A.commandToExecute.outputTexture = _this.texA;
      },
    });

    // BufferB
    this.Buffer_B = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return this.time;
        },
        iFrame: () => {
          return this.frame;
        },
        resolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return this.texA;
        },
        iChannel1: () => {
          return this.texD;
        },
        lakeMap: () => {
          return this._LakeArea;
        },
        waterMap: () => {
          return this._WaterMap;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [this.Command, this.BufferB],
      }),
      geometry: this.quadGeometry,
      outputTexture: this.texB,
      preExecute: function () {
        _this.Buffer_B.commandToExecute.outputTexture = _this.texB;
      },
    });

    // BufferC
    this.Buffer_C = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return this.time;
        },
        iFrame: () => {
          return this.frame;
        },
        resolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return this.texA;
        },
        iChannel1: () => {
          return this.texB;
        },
        waterMap: () => {
          return this._WaterMap;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [this.Command, this.BufferC],
      }),
      geometry: this.quadGeometry,
      outputTexture: this.texC,
      preExecute: function () {
        _this.Buffer_C.commandToExecute.outputTexture = _this.texC;
      },
    });

    // BufferD
    this.Buffer_D = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return this.time;
        },
        iFrame: () => {
          return this.frame;
        },
        resolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return this.texC;
        },
        iChannel1: () => {
          return this.texB;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [this.Command, this.BufferD],
      }),
      geometry: this.quadGeometry,
      outputTexture: this.texD,
      preExecute: function () {
        _this.Buffer_D.commandToExecute.outputTexture = _this.texD;
      },
    });
  }

  initRender() {
    const cartographicCenter = Cartographic.fromCartesian(this.center);
    const degreeCenter = [
      Cesium.Math.toDegrees(cartographicCenter.longitude),
      Cesium.Math.toDegrees(cartographicCenter.latitude),
      // cartographicCenter.height,
      (this.max + this.min) / 2 - 100,
      // this.max,
    ];

    // Render Command
    const modelMatrix = generateModelMatrix(
      // [120.20998865783179, 30.13650797533829, 300],
      degreeCenter,
      [90, 0, 0],
      [
        (this._width * this.cellSize) / 2,
        this.max - this.min,
        // 1600,
        (this._height * this.cellSize) / 2,
      ]
    );
    const boxGeometry = Cesium.BoxGeometry.fromDimensions({
      vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
      dimensions: new Cesium.Cartesian3(1, 1, 1),
    });
    const geometry = Cesium.BoxGeometry.createGeometry(boxGeometry);
    const attributelocations =
      Cesium.GeometryPipeline.createAttributeLocations(geometry);
    this.fluidCommand = new CustomPrimitive({
      commandType: "Draw",
      uniformMap: {
        iTime: () => {
          return this.time;
        },
        iFrame: () => {
          return this.frame;
        },
        iResolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return this.texC;
        },
        // iChannel1: () => {
        //   return this.terrainMap;
        // },
        heightMap: () => {
          return this.demMap;
        },
      },
      geometry: geometry,
      modelMatrix: modelMatrix,
      attributeLocations: attributelocations,
      vertexShaderSource: new Cesium.ShaderSource({
        sources: [
          `
                   in vec3 position;
                   in vec2 st;
                 
                   out vec3 vo;
                   out vec3 vd;
                   out vec2 v_st;
                   void main()
                   {    
                       vo = czm_encodedCameraPositionMCHigh + czm_encodedCameraPositionMCLow;
                       vd = position - vo;
                       v_st = st;
                       gl_Position = czm_modelViewProjection * vec4(position,1.0);
                   }
                   `,
        ],
      }),
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [this.Command + this.renderShaderSource],
      }),
      rawRenderState: {
        depthTest: {
          enabled: true,
          // func: DepthFunction.LESS,
        },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    });

    this._viewer.scene.primitives.add(this.Buffer_A);
    this._viewer.scene.primitives.add(this.Buffer_B);
    this._viewer.scene.primitives.add(this.Buffer_C);
    this._viewer.scene.primitives.add(this.Buffer_D);
    this._viewer.scene.primitives.add(this.fluidCommand);

    // Render Event
    const _this = this;
    this.time = 1.0;
    this.frame = 0;
    this._viewer.scene.postRender.addEventListener(() => {
      const now = performance.now();
      _this.time = now / 1000;
      _this.frame += 0.01;

      // if (frame % 1 < 0.01)
      //   this.updateTex(this.dataSet[parseInt((frame * 10) % 10000)]);
    });
  }

  addWater(position, strenght) {
    const { theta, distance } = angle(this.center, position);
    const dis_north = distance * Math.cos(Cesium.Math.toRadians(theta));
    const dis_east = distance * Math.sin(Cesium.Math.toRadians(theta));
    if (
      Math.abs(dis_north) > (this._height * this.cellSize) / 2 ||
      Math.abs(dis_east) > (this._width * this.cellSize) / 2
    )
      return;
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
}

/**
 * @description 自定义DC
 */
class CustomPrimitive {
  constructor(options) {
    this.commandType = options.commandType;

    this.geometry = options.geometry;
    this.attributeLocations = options.attributeLocations;
    this.primitiveType = options.primitiveType;

    this.uniformMap = options.uniformMap;

    this.vertexShaderSource = options.vertexShaderSource;
    this.fragmentShaderSource = options.fragmentShaderSource;

    this.rawRenderState = options.rawRenderState;
    this.framebuffer = options.framebuffer;

    this.outputTexture = options.outputTexture;

    this.autoClear = Cesium.defaultValue(options.autoClear, false);
    this.preExecute = options.preExecute;

    this.modelMatrix = Cesium.defaultValue(
      options.modelMatrix,
      Cesium.Matrix4.IDENTITY
    );
    this.show = true;
    this.commandToExecute = undefined;
    this.clearCommand = undefined;
    if (this.autoClear) {
      this.clearCommand = new Cesium.ClearCommand({
        color: new Cesium.Color(0.0, 0.0, 0.0, 0.0),
        depth: 1.0,
        framebuffer: this.framebuffer,
        pass: Cesium.Pass.OPAQUE,
      });
    }
  }

  createCommand(context) {
    switch (this.commandType) {
      case "Draw": {
        let vertexArray = Cesium.VertexArray.fromGeometry({
          context: context,
          geometry: this.geometry,
          attributeLocations: this.attributeLocations,
          bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
        });

        let shaderProgram = Cesium.ShaderProgram.fromCache({
          context: context,
          attributeLocations: this.attributeLocations,
          vertexShaderSource: this.vertexShaderSource,
          fragmentShaderSource: this.fragmentShaderSource,
        });

        let renderState = Cesium.RenderState.fromCache(this.rawRenderState);
        return new Cesium.DrawCommand({
          owner: this,
          vertexArray: vertexArray,
          primitiveType: this.primitiveType,
          uniformMap: this.uniformMap,
          modelMatrix: this.modelMatrix,
          shaderProgram: shaderProgram,
          framebuffer: this.framebuffer,
          renderState: renderState,
          pass: Cesium.Pass.OPAQUE,
        });
      }
      case "Compute": {
        return new Cesium.ComputeCommand({
          owner: this,
          fragmentShaderSource: this.fragmentShaderSource,
          uniformMap: this.uniformMap,
          outputTexture: this.outputTexture,
          persists: true,
        });
      }
    }
  }

  setGeometry(context, geometry) {
    this.geometry = geometry;
    let vertexArray = Cesium.VertexArray.fromGeometry({
      context: context,
      geometry: this.geometry,
      attributeLocations: this.attributeLocations,
      bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
    });
    this.commandToExecute.vertexArray = vertexArray;
  }

  update(frameState) {
    if (!this.show) {
      return;
    }

    if (!Cesium.defined(this.commandToExecute)) {
      this.commandToExecute = this.createCommand(frameState.context);
    }

    if (Cesium.defined(this.preExecute)) {
      this.preExecute();
    }

    if (Cesium.defined(this.clearCommand)) {
      frameState.commandList.push(this.clearCommand);
    }
    frameState.commandList.push(this.commandToExecute);
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    if (Cesium.defined(this.commandToExecute)) {
      this.commandToExecute.shaderProgram =
        this.commandToExecute.shaderProgram &&
        this.commandToExecute.shaderProgram.destroy();
    }
    return Cesium.destroyObject(this);
  }
}

/**
 * @description 渲染工具类
 */
class RenderUtil {
  constructor() {}

  static loadText(filePath) {
    let request = new XMLHttpRequest();
    request.open("GET", filePath, false);
    request.send();
    return request.responseText;
  }

  static getFullscreenQuad() {
    let fullscreenQuad = new Cesium.Geometry({
      attributes: new Cesium.GeometryAttributes({
        position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          //  v3----v2
          //  |     |
          //  |     |
          //  v0----v1
          values: new Float32Array([
            -1,
            -1,
            0, // v0
            1,
            -1,
            0, // v1
            1,
            1,
            0, // v2
            -1,
            1,
            0, // v3
          ]),
        }),
        st: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        }),
      }),
      indices: new Uint32Array([3, 2, 0, 0, 2, 1]),
    });
    return fullscreenQuad;
  }

  static createTexture(options) {
    if (Cesium.defined(options.arrayBufferView)) {
      // typed array needs to be passed as source option, this is required by Cesium.Texture
      let source = {};
      source.arrayBufferView = options.arrayBufferView;
      options.source = source;
    }

    let texture = new Cesium.Texture(options);
    return texture;
  }

  static createFramebuffer(context, colorTexture, depthTexture) {
    let framebuffer = new Cesium.Framebuffer({
      context: context,
      colorTextures: [colorTexture],
      depthTexture: depthTexture,
    });
    return framebuffer;
  }

  static createRawRenderState(options) {
    let translucent = true;
    let closed = false;
    let existing = {
      viewport: options.viewport,
      depthTest: options.depthTest,
      depthMask: options.depthMask,
      blending: options.blending,
    };

    let rawRenderState = Cesium.Appearance.getDefaultRenderState(
      translucent,
      closed,
      existing
    );
    return rawRenderState;
  }
}

const getNorthPointByDistance = (position, offset) => {
  //以点为原点建立局部坐标系（东方向为x轴,北方向为y轴,垂直于地面为z轴），得到一个局部坐标到世界坐标转换的变换矩阵
  var localToWorld_Matrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  return Cesium.Matrix4.multiplyByPoint(
    localToWorld_Matrix,
    Cesium.Cartesian3.fromElements(offset[0], offset[1], 0),
    new Cesium.Cartesian3()
  );
};

/**
 * 计算两个点坐标之间的直线与正北方向之间的夹角
 * @param {Array} [p] -两个坐标经纬度高程坐标数组
 * @return {Object} -返回两个数组元素，1.两个点坐标之间的直线与正北方向之间的夹角；2.两个坐标之间的直线距离
 */
const angle = (A, B) => {
  // let A = Cesium.Cartesian3.fromDegrees(p[0], p[1]);
  // let B = Cesium.Cartesian3.fromDegrees(p[3], p[4]);
  let ab = Cesium.Cartesian3.distance(A, B);

  //以a点为原点建立局部坐标系（东方向为x轴,北方向为y轴,垂直于地面为z轴），得到一个局部坐标到世界坐标转换的变换矩阵
  const localToWorld = Cesium.Transforms.eastNorthUpToFixedFrame(
    // new Cesium.Cartesian3.fromDegrees(p[0], p[1])
    A
  );
  //求世界坐标到局部坐标的变换矩阵
  const worldToLocal = Cesium.Matrix4.inverse(
    localToWorld,
    new Cesium.Matrix4()
  );
  //A点在局部坐标的位置，其实就是局部坐标原点
  const localPosition_A = Cesium.Matrix4.multiplyByPoint(
    worldToLocal,
    // new Cesium.Cartesian3.fromDegrees(p[0], p[1])
    A,
    new Cesium.Cartesian3()
  );
  //B点在以A点为原点的局部的坐标位置
  const localPosition_B = Cesium.Matrix4.multiplyByPoint(
    worldToLocal,
    // new Cesium.Cartesian3.fromDegrees(p[3], p[4]),
    B,
    new Cesium.Cartesian3()
  );
  //弧度
  const angle = Math.atan2(
    localPosition_B.x - localPosition_A.x,
    localPosition_B.y - localPosition_A.y
  );
  //角度
  let theta = angle * (180 / Math.PI);
  if (theta < 0) {
    theta = theta + 360;
  }

  var geodesic = new Cesium.EllipsoidGeodesic();
  geodesic.setEndPoints(
    Cartographic.fromCartesian(A),
    Cartographic.fromCartesian(B)
  );
  var distance = geodesic.surfaceDistance;
  return { theta, distance };
};

/**
 * 生成矩阵
 * @param {*} position
 * @param {*} rotation
 * @param {*} scale
 * @returns
 */
const generateModelMatrix = (
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1]
) => {
  const rotationX = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(rotation[0]))
  );

  const rotationY = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(rotation[1]))
  );

  const rotationZ = Cesium.Matrix4.fromRotationTranslation(
    Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotation[2]))
  );
  if (!(position instanceof Cesium.Cartesian3)) {
    position = Cesium.Cartesian3.fromDegrees(...position);
  }
  const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  Cesium.Matrix4.multiply(enuMatrix, rotationX, enuMatrix);
  Cesium.Matrix4.multiply(enuMatrix, rotationY, enuMatrix);
  Cesium.Matrix4.multiply(enuMatrix, rotationZ, enuMatrix);
  const scaleMatrix = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(...scale));
  const modelMatrix = Cesium.Matrix4.multiply(
    enuMatrix,
    scaleMatrix,
    new Cesium.Matrix4()
  );

  return modelMatrix;
};

export default WaterSimulate;
