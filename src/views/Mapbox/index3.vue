<template>
    <div ref="mapContainer" id="map-container"></div>
</template>

<script lang="js" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import stylejs from './streets-v12.json'
import CustomLayer from './customLayer';
import ComputeLayer from './computeLayer';
// import mapboxgl from "mapbox-gl";
// import "mapbox-gl/dist/mapbox-gl.css";
const mapboxgl = window.mapboxgl

const mapContainer = ref(null);
let map;

onMounted(async () => {
    // 设置 Mapbox Access Token 令牌
    mapboxgl.accessToken = import.meta.env.VITE_APP_MAP_TOKEN;
    console.log(mapboxgl.accessToken);

    // 创建 Map 实例
    console.log(mapContainer.value);

    if (mapboxgl.Map.prototype._setupPainter.toString().indexOf("webgl2") == -1) {
        var _setupPainter_old = mapboxgl.Map.prototype._setupPainter;
        mapboxgl.Map.prototype._setupPainter = function () {
            var getContext_old = this._canvas.getContext;
            this._canvas.getContext = function (name, attrib) {
                return getContext_old.apply(this, ["webgl2", attrib]) ||
                    getContext_old.apply(this, ['webgl', attrib]) ||
                    getContext_old.apply(this, ['experimental-webgl', attrib]);
            }
            _setupPainter_old.apply(this);
            this._canvas.getContext = getContext_old;
        };
    }

    map = new mapboxgl.Map({
        container: mapContainer.value, // 绑定的 DOM 容器
        style: stylejs, // 地图样式
        center: [94.9674, 29.6441], // 初始中心点经纬度（杭州）
        // center: [7.5, 58],
        zoom: 10, // 初始缩放级别
    });

    // 添加缩放和方向控制
    map.addControl(new mapboxgl.NavigationControl());

    const gl = map._canvas.getContext('webgl2')


    // 公共变量
    const Command = `#version 300 es
    precision highp float;
    precision highp int;
const int textureSize = 512;
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
const float initialWaterLevel = 0.05;

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
   float terrainElevation = mix(Terrain(uv * 4.0, floor(t), octaves), Terrain(uv * 4.0, floor(t) + 1.0, octaves), smoothstep(1.0 - transitionPercent, 1.0, fract(t))) * 0.5;
   // Water
   float waterDept = initialWaterLevel;
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

   out_FragColor = vec4(height.x, 0., 0., 1.);
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
             }`
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
const float boxHeight = 0.;

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
   return mix(c, c * t, 0.75);
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

vec3 Render(in vec3 ro, in vec3 rd) {
   vec3 n;
   vec3 rayDir = normalize(rd);
   vec2 ret = hitBox(ro, rayDir);
   if (ret.x > ret.y) discard;
   vec3 p = ro + ret.x * rayDir;
   
   if(ret.x > 0.0) {
       vec3 pi = ro + rd * ret.x;
       vec3 npi = normalizeP(pi);
       vec3 tc;
       vec3 tn;
       float tt = ret.x;
       vec2 h = getHeight(npi);
    //    return vec3(h.x);
       float spec;
       if(npi.z < h.x) {
           tn = n;
           tc = undergroundColor(h.x - npi.z);
       }
       else {
           for (int i = 0; i < 800; i++) {
               vec3 p = ro + rd * tt;
               vec3 np = normalizeP(p);
               float h = np.z - getHeight(np).x;
               if (h < 0.0002 || tt > ret.y)
               break;
               tt += p.z * 0.04;
           }
           tn = getNormal(normalizeP(ro + rd * tt), 0);
           tc = terrainColor(normalizeP(ro + rd * tt), tn, spec);
       }
       {   
           vec3 lightDir = normalize(light - normalizeP(ro + rd * tt));
           tc = tc * (max( 0.0, dot(lightDir, tn)) + 0.3);
           spec *= pow(max(0., dot(lightDir, reflect(rd, tn))), 10.0);
           tc += spec;
       }
       if(tt > ret.y) {
           tc = vec3(0, 0, 0.04);
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
               if (h < 0.0002 || wt > min(tt, ret.y))
               break;
               wt += p.z* 0.04;
           }
           waterNormal = getNormal(normalizeP(ro + rd * wt), 1);
       }
       if(wt < ret.y) {
           float dist = (min(tt, ret.y) - wt) / (ret.y-ret.x) ;
           vec3 p = waterNormal;
           vec3 lightDir = normalize(light - normalizeP(ro + rd * wt));
           tc = applyFog( tc, vec3(0, 0, 0.4), dist * 15.0);
           float spec = pow(max(0., dot(lightDir, reflect(rd, waterNormal))), 20.0);
           tc += 0.5 * spec * smoothstep(0.0, 0.1, dist);
       }else{
           discard;
       }
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
   vec3 col = Render(vo, rayDir);
   tot += col;
   out_FragColor = vec4( tot, 1.0 );
}
`;

    const camera = map.getFreeCameraOptions();
    const cameraPos = [camera._position.x, camera._position.y, camera._position.z]

    let time = 0, frame = 0, resolution = [512, 512]

    const textureA = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 0 });
    const textureB = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 0 });
    const textureC = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 0 });
    const textureD = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 0 });

    const terrainMap = await createTextureFromURL(gl, '/terrain.jpg')

    const textureImg = createTextureFromURL(gl, '/1.png')
    const blueTexture = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 1 });

    // 创建计算层
    const computeLayerA = new ComputeLayer({
        id: 'computeLayerA',
        texR: { width: 512, height: 512 },
        uniforms: {
            iTime: time,
            iFrame: frame,
            iChannel0: textureC,
            iChannel1: textureD,
        },
        outputTexture: textureA,
        fragmentShader: Command + BufferA
    });
    const computeLayerB = new ComputeLayer({
        id: 'computeLayerB',
        texR: { width: 512, height: 512 },
        uniforms: {
            iTime: time,
            iFrame: frame,
            iChannel0: textureA,
            iChannel1: textureD,
        },
        outputTexture: textureB,
        fragmentShader: Command + BufferB
    });
    const computeLayerC = new ComputeLayer({
        id: 'computeLayerC',
        texR: { width: 512, height: 512 },
        uniforms: {
            iTime: time,
            iFrame: frame,
            iChannel0: textureA,
            iChannel1: textureB,
        },
        outputTexture: textureC,
        fragmentShader: Command + BufferC
    });
    const computeLayerD = new ComputeLayer({
        id: 'computeLayerD',
        texR: { width: 512, height: 512 },
        uniforms: {
            iTime: time,
            iFrame: frame,
            iChannel0: textureC,
            iChannel1: textureB,
        },
        outputTexture: textureD,
        fragmentShader: Command + BufferD
    });

    // 创建渲染层

    const customLayer = new CustomLayer({
        texR: { width: 512, height: 512 },
        uniforms: {
            iTime: time,
            iFrame: frame,
            iResolution: resolution,
            cameraPos: cameraPos,
            iChannel0: textureC,
            iChannel1: terrainMap,
        },
        vertexShader: renderVertexShader,
        fragmentShader: Command + renderShaderSource
    });
    // const customLayer = new CustomLayer({
    //     uniforms: {
    //         u_texture: textureC,
    //         u_highlight: [1.0, 0.0, 0.0]
    //     },
    //     customShaderCode: {
    //         uniformDeclarations: `
    //   uniform sampler2D u_texture;
    //   uniform vec3 u_highlight;
    // `,
    //         uniformProcessing: `
    //   vec4 texColor = texture(u_texture, v_texCoord);
    //   outColor = vec4(texColor.rgb, 1.0);
    // //   outColor = vec4(u_highlight, 1.0);
    // `
    //     }
    // });

    map.on("load", function () {
        map.addSource("tileLayer", {
            type: "raster",
            tiles: [
                // "http://192.168.110.11/overviewMap3/{z}/{x}/{y}.png"
                "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            tileSize: 256
        });
        map.addLayer({
            id: "basemap",
            type: "raster",
            source: "tileLayer"
        });


        map.addLayer(computeLayerA);
        map.addLayer(computeLayerB);
        map.addLayer(computeLayerC);
        map.addLayer(computeLayerD);
        map.addLayer(customLayer);


    });
    map.on('render', () => {
        const newCamera = map.getFreeCameraOptions();
        const newCameraPos = [newCamera._position.x, newCamera._position.y, newCamera._position.z]
        // 在每一帧中执行的逻辑
        const now = performance.now();
        time = now / 1000.;
        frame += 0.02;
        computeLayerA.setUniform('iFrame', frame)
        computeLayerA.setUniform('iTime', time)
        computeLayerB.setUniform('iFrame', frame)
        computeLayerB.setUniform('iTime', time)
        computeLayerC.setUniform('iFrame', frame)
        computeLayerC.setUniform('iTime', time)
        computeLayerD.setUniform('iFrame', frame)
        computeLayerD.setUniform('iTime', time)
        customLayer.setUniform('iFrame', frame)
        customLayer.setUniform('iTime', time)
        customLayer.setUniform('cameraPos', newCameraPos)
    });

});

onBeforeUnmount(() => {
    // 销毁地图实例
    if (map) map.remove();
});


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
    const {
        flipY = true,
        textureUnit = 0
    } = options;

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
            1, 1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 255, 255])
        );

        // 4. 加载图片
        const image = new Image();
        image.crossOrigin = 'anonymous';
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

        image.onerror = (err) => reject(new Error('图片加载失败: ' + url));
        image.src = url;
    });
}

// 辅助函数：检测是否为2的幂
function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

/**
 * 创建WebGL纹理并初始化颜色
 * @param {WebGLRenderingContext} gl - WebGL上下文
 * @param {Array<number>} color - RGBA颜色数组，范围0-255
 * @param {object} [options] - 配置选项
 * @param {number} [options.width=1] - 纹理宽度（像素）
 * @param {number} [options.height=1] - 纹理高度（像素）
 * @param {number} [options.textureUnit=0] - 纹理单元编号
 * @returns {WebGLTexture} 创建的纹理对象
 */
function createColoredTexture(gl, color, options = {}) {
    const {
        width = 256,
        height = 256,
        textureUnit = 0
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

    // 4. 创建颜色数据数组
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = color[0];     // R
        pixels[i * 4 + 1] = color[1]; // G
        pixels[i * 4 + 2] = color[2]; // B
        pixels[i * 4 + 3] = color[3]; // A
    }

    // 5. 上传纹理数据
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,                // mipmap级别
        gl.RGBA,          // 内部格式
        width,
        height,
        0,                // 边框必须为0
        gl.RGBA,          // 像素数据格式
        gl.UNSIGNED_BYTE, // 像素数据类型
        pixels
    );

    return texture;
}
</script>

<style>
#map-container {
    position: fixed;
    top: 0px;
    width: 100%;
    height: 100%;
}
</style>
