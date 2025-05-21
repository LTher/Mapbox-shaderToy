/**
 * ShaderToy Fluid To Cesium.js 开源版
 * gitee:https://gitee.com/m3d
 * b站:https://www.bilibili.com/video/BV1yG4y1m7dF/
 * shadertiy：https://www.shadertoy.com/view/7tSSDD
 * 只作为技术实现学习，请勿下载后二次售卖
 * 该Demo为ShaderToy迁移版，不能直接应用，没有深入改造，提供学习使用，由于是免费的不提供技术支持！
 * 技术点：ShaderToy 多Buffer渲染的迁移和修改，Cesium.js体渲染流体计算结果。
 */
/**
 * 初始化viewer
 */

export const init = async (viewer) => {
  viewer.scene.msaaSamples = 4;
  viewer.scene.highDynamicRange = true;
  viewer.postProcessStages.fxaa.enabled = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.debugShowFramesPerSecond = true;

  // 初始化流体Demo
  const fluid = new FluidDemo(viewer, {});

  viewer.camera.setView({
    destination: {
      x: -2771064.6756677167,
      y: 4781829.550624459,
      z: 3179130.042667584,
    },
    orientation: {
      heading: Cesium.Math.toRadians(48.72529042457395),
      pitch: Cesium.Math.toRadians(-10.899276751527792),
      roll: Cesium.Math.toRadians(0.0014027234956804583),
    },
  });
};

// 公共变量
const Command = `
#define ch0 iChannel0
#define ch1 iChannel1
#define ch2 iChannel2
#define ch3 iChannel3

#define LOAD(ch, pos) texelFetch(ch, ivec2(pos), 0)
#define LOAD3D(ch, pos) texelFetch(ch, ivec2(dim2from3(pos)), 0)

#define PI 3.1415926535
#define TWO_PI 6.28318530718

#define light_dir normalize(vec3(0.820,1.000,0.702))

#define surface_tension 0.5
#define surface_tension_rad 2.0
#define initial_particle_density 2u
#define dt 0.7
#define rest_density 1.0
#define gravity 0.01
#define force_k 0.15
#define force_coef_a -4.0
#define force_coef_b 0.0
#define force_mouse 0.005
#define force_mouse_rad 40.0
#define force_boundary 5.0
#define boundary_h 5.0
#define max_velocity 2.0
#define cooling 0.0

#define R iResolution.xy

#define GD(x, R) exp(-dot(x/R,x/R))/(R*R)
#define GS(x) exp(-dot(x,x))

#define loop(i,x) for(int i = 0; i < x; i++)
#define range(i,a,b) for(int i = a; i <= b; i++)

//3d slice aspect ratio 
#define ar vec2(1.,1.)
vec2 SCALE;
vec3 size3d;

vec4 iMouse = vec4(0.);

vec2 dim2from3(vec3 p3d)
{
    p3d = clamp(p3d, vec3(0.0), size3d);
    float ny = floor(p3d.z/SCALE.x);
    float nx = floor(p3d.z) - ny*SCALE.x;
    return vec2(nx, ny)*vec2(size3d.xy) + p3d.xy;
}

vec3 dim3from2(vec2 p2d)
{
    return vec3(p2d - size3d.xy*floor(p2d/size3d.xy),(floor(p2d.x/size3d.x) + SCALE.x*floor(p2d.y/size3d.y)));
}


#define pixel(a, p, s) texture(a, p/vec2(s))
vec4 voxel(sampler2D ch, vec3 p3d)
{
    return pixel(ch, dim2from3(p3d), textureSize(ch, 0));
}

//trilinear interpolation = linear interp between layers
vec4 trilinear(sampler2D ch, vec3 p3d)
{
    return mix(voxel(ch, vec3(p3d.xy, floor(p3d.z))),voxel(ch, vec3(p3d.xy, ceil(p3d.z))), fract(p3d.z));
}


float sdBox( vec3 p, vec3 b )
{
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

vec2 hash21(float p)
{
	vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
	p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

vec2 hash23(vec3 p3)
{
	p3 = fract(p3 * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

vec3 udir(vec2 rng)
{
    float phi = 2.*PI*rng.x;
    float ctheta = 2.*rng.y-1.;
    float stheta = sqrt(1.0-ctheta*ctheta);
    return vec3(cos(phi)*stheta, sin(phi)*stheta, ctheta);
}

struct Particle 
{
    uint mass;
    bool sand;      // Uses 1 bit
    vec3 pos;
    vec3 vel;
    vec3 force;
    float density;
};

//5 bits for shared exponent, 9 bits for each component
uint packvec3(vec3 v)
{
    //get the exponent
    float maxv = max(abs(v.x), max(abs(v.y), abs(v.z)));
    int exp = clamp(int(ceil(log2(maxv))), -15, 15);
    float scale = exp2(-float(exp));
    uvec3 sv = uvec3(round(clamp(v*scale, -1.0, 1.0) * 255.0) + 255.0);
    uint packed = uint(exp + 15) | (sv.x << 5) | (sv.y << 14) | (sv.z << 23);
    return packed;
}

vec3 unpackvec3(uint packed)
{
    int exp = int(packed & 0x1Fu) - 15;
    vec3 sv = vec3((packed >> 5) & 0x1FFu, (packed >> 14) & 0x1FFu, (packed >> 23) & 0x1FFu);
    vec3 v = (sv - 255.0) / 255.0;
    v *= exp2(float(exp));
    return v;
}

vec4 packParticles(Particle p0, Particle p1, vec3 pos)
{
    p0.pos -= pos;
    p1.pos -= pos;

    uvec3 pos0 = uvec3(clamp(p0.pos, 0.0, 1.0) * 255.0);
    uvec3 pos1 = uvec3(clamp(p1.pos, 0.0, 1.0) * 255.0);

    // Pack mass (7 bits) and sand (1 bit) for both particles
    uint p0_mass_sand = p0.mass | (p0.sand ? 0x80u : 0x00u);  // sand in bit 7
    uint p1_mass_sand = p1.mass | (p1.sand ? 0x80u : 0x00u);
    
    uint data1 = p0_mass_sand | (p1_mass_sand << 8) | (pos0.x << 16) | (pos0.y << 24);
    float f1 = uintBitsToFloat(data1);
    uint data2 = pos0.z | (pos1.x << 8) | (pos1.y << 16) | (pos1.z << 24);
    float f2 = uintBitsToFloat(data2);
    uint data3 = packvec3(p0.vel);
    float f3 = uintBitsToFloat(data3);
    uint data4 = packvec3(p1.vel);
    float f4 = uintBitsToFloat(data4);
    return vec4(f1,f2,f3,f4);
}

void unpackParticles(vec4 packed, vec3 pos, out Particle p0, out Particle p1)
{
    uint data1 = floatBitsToUint(packed.x);
    uint data2 = floatBitsToUint(packed.y);
    uint data3 = floatBitsToUint(packed.z);
    uint data4 = floatBitsToUint(packed.w);

    // Unpack mass and sand for both particles
    p0.mass = data1 & 0x7Fu;         // Lower 7 bits for mass
    p0.sand = ((data1 & 0x80u) != uint(0)); // Bit 7 for sand
    
    p1.mass = (data1 >> 8) & 0x7Fu;
    p1.sand = ((data1 >> 8) & 0x80u) != uint(0);

    uvec3 pos0 = uvec3((data1 >> 16) & 0xFFu, (data1 >> 24) & 0xFFu, data2 & 0xFFu);
    uvec3 pos1 = uvec3((data2 >> 8) & 0xFFu, (data2 >> 16) & 0xFFu, (data2 >> 24) & 0xFFu);

    p0.pos = vec3(pos0) / 255.0 + pos;
    p1.pos = vec3(pos1) / 255.0 + pos;

    p0.vel = unpackvec3(data3);
    p1.vel = unpackvec3(data4);
}

float sdBox( in vec2 p, in vec2 b )
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

int ClosestCluster(Particle p0, Particle p1, Particle incoming)
{
    //first try to choose the particle with significantly smaller mass
    if(float(p0.mass) < 0.01*float(p1.mass) || float(p1.mass) < 0.01*float(p0.mass))
    {
        return p0.mass < p1.mass ? 0 : 1;
    }

    //otherwise choose the closest one
    float d0 = length(p0.pos - incoming.pos);
    float d1 = length(p1.pos - incoming.pos);
    return d0 < d1 ? 0 : 1;
}

void BlendParticle(inout Particle p, in Particle incoming)
{
    uint newMass = p.mass + incoming.mass;
    vec2 weight = vec2(p.mass, incoming.mass) / float(newMass);
    p.pos = p.pos*weight.x + incoming.pos*weight.y;
    p.vel = p.vel*weight.x + incoming.vel*weight.y;
    p.mass = newMass;
    p.sand = p.mass > incoming.mass ? p.sand : incoming.sand;
    // p.sand = p.sand || incoming.sand;
}

void Clusterize(inout Particle p0, inout Particle p1, in Particle incoming, vec3 pos)
{
    //check if the incoming particle is in the cell
    if(!all(equal(pos, floor(incoming.pos))))
    {
        return;
    }

    int closest = ClosestCluster(p0, p1, incoming);
    if(closest == 0)
    {
        BlendParticle(p0, incoming);
    }
    else
    {
        BlendParticle(p1, incoming);
    }
}

void SplitParticle(inout Particle p1, inout Particle p2)
{
    vec3 pos = p1.pos;
    uint newMass = p1.mass;
    p1.mass = newMass/2u;
    p2.mass = newMass - p1.mass;
    vec3 dir = udir(hash23(pos));
    p1.pos = pos - dir*5e-3;
    p2.pos = pos + dir*5e-3;
    p2.vel = p1.vel;
    p2.sand = p1.sand;
}


// 粒子作用力计算修改
void ApplyForce(inout Particle p, in Particle incoming)
{
    float d = distance(p.pos, incoming.pos);
    vec3 dir = (incoming.pos - p.pos)/max(d, 1e-5);
    vec3 dvel = incoming.vel - p.vel;
    float irho = float(incoming.mass);
    float rho = 0.5*(p.density + incoming.density);
    // 根据粒子类型调整参数
    float pressure = max(rho / rest_density - 1.0, -0.0);
    float f = force_coef_a * GD(d, 1.5);
    float SPH_F = f * pressure;
    // 表面张力仅作用于非沙粒
    float F = p.sand ? surface_tension * GD(d, surface_tension_rad)*.5 : surface_tension * GD(d, surface_tension_rad);
    // 摩擦系数根据沙粒调整
    float frictionCoeff = p.sand ? 0.9 : 0.45; // 沙粒摩擦更大
    float Friction = frictionCoeff * dot(dir, dvel) * GD(d, 1.5);
    // 沙粒禁用SPH压力项
    // if (p.sand) {
    //     SPH_F = 0.0;
    // }
    // 组合力并应用
    vec3 totalForce = force_k * dir * (F + SPH_F + Friction) * irho / rest_density;
    p.force += totalForce;
}

float minv(vec3 a)
{
    return min(min(a.x, a.y),a.z);
}

float maxv(vec3 a)
{
    return max(max(a.x, a.y),a.z);
}

float distance2border(vec3 p)
{
    vec3 a = vec3(size3d - 1.) - p;
    return min(minv(p),minv(a)) + 1.;
}

vec4 border_grad(vec3 p)
{
    const float dx = 0.001;
    const vec3 k = vec3(1,-1,0);
	return  (k.xyyx*distance2border(p + k.xyy*dx) +
			 k.yyxx*distance2border(p + k.yyx*dx) +
			 k.yxyx*distance2border(p + k.yxy*dx) +
			 k.xxxx*distance2border(p + k.xxx*dx))/vec4(4.*dx,4.*dx,4.*dx,4.);
}

float GetTerrainHeight(vec2 posXY) {
    return min(((size3d.x-posXY.x)+(size3d.y-posXY.y))*0.2,size3d.z);
    // return 0.5 * size3d.z;
}

vec3 terrainNormal(vec2 posXY) {

    float hL = GetTerrainHeight(posXY + vec2(-1,-0));
    float hR = GetTerrainHeight(posXY + vec2(1,-0));
    float hD = GetTerrainHeight(posXY + vec2(-0,-1));
    float hU = GetTerrainHeight(posXY + vec2(-0,1));

    vec3 dx = vec3(size3d.x, 0.0, hR - hL);
    vec3 dy = vec3(0.0, size3d.y, hU - hD);
    return normalize(cross(dx, dy));
}

vec3 terrainDownDir(vec2 posXY) {

    float hL = GetTerrainHeight(posXY + vec2(-1,-0));
    float hR = GetTerrainHeight(posXY + vec2(1,-0));
    float hD = GetTerrainHeight(posXY + vec2(-0,-1));
    float hU = GetTerrainHeight(posXY + vec2(-0,1));

    
    if(posXY.x-1.<0.)hL =size3d.z*2.;
    if(posXY.x+1.>size3d.x-1.)hR =size3d.z*2.;
    if(posXY.y-1.<0.)hD =size3d.z*2.;
    if(posXY.y-1.>size3d.x-1.)hU =size3d.z*2.;
    
    return normalize(vec3((hR - hL)/2., (hU - hD)/2.,-1. / size3d.z));
}

void IntegrateParticle(inout Particle p, vec3 pos, vec2 iR, vec4 iM, float time)
{
    p.force = p.force;/// max(0.0001, float(p.mass));
    // p.force += gravity*vec3(0.4*sin(0.7*time), 0.2*cos(0.5*time), -1.0); //gravity
    p.force += vec3(0.,0.,-0.096);
    

    vec4 border = border_grad(p.pos);
    vec3 bound =1.*normalize(border.xyz)*exp(-0.4*border.w*border.w);
    bound.z = max(0.0, bound.z);
    p.force += force_boundary*bound*dt;
    //p.force += vec2(0.0, 0.0)*GS(distance(p.pos, iR*vec2(0.2,0.5))/force_mouse_rad);
 
    //if(iM.z > 0.)
    //{
    //    vec3 dx = pos - vec3(iM.xy, 0.0);
    //    p.force -= force_mouse*dx*GS(dx/force_mouse_rad);
    //}

    // --- 新增：地形碰撞检测 ---
    vec3 newPos = p.pos + p.vel * dt;
    float terrainZ = GetTerrainHeight(newPos.xy);
    
    if (newPos.z < terrainZ) {
        // 碰撞响应：推回地形表面 + 速度修正
        // p.force.z += 1.0 * (terrainZ-newPos.z)* -p.force.z  ;  // 弹性反弹
        // p.force += terrainDownDir(newPos.xy)*.1;
        // p.vel.xy *= 0.8;  // 摩擦力
        // p.force += terrainNormal(newPos.xy)* (terrainZ-newPos.z);
        // vec3 n =terrainNormal(newPos.xy);
        // vec3 downSlopeDir = normalize(cross(cross(n, vec3(0, 0, 1)), n));
        // p.force += -downSlopeDir;
        // p.force*=0.;
    }
        
    p.vel += p.force * dt;

    //velocity limit
    float v = length(p.vel)/max_velocity;
    p.vel /= (v > 1.)?v:1.;

    if (newPos.z < terrainZ) {
        p.vel*=0.;
        p.vel+= -terrainDownDir(newPos.xy)*.4;
        // p.vel = -terrainDownDir(newPos.xy)*length(p.vel) *.8;
    }

    if(p.sand) p.vel*=0.92;
}

void InitGrid(vec2 iR)
{
    SCALE = floor(ar*pow(iR.x*iR.y,0.1666666));
    size3d = vec3(floor(iR.xy/SCALE), SCALE.x*SCALE.y);
}

vec3 hsv2rgb( in vec3 c )
{
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );

	rgb = rgb*rgb*(3.0-2.0*rgb); // cubic smoothing	

	return c.z * mix( vec3(1.0), rgb, c.y);
}

`;

// 计算地形和更新水位pass 1
const BufferA = `
uniform float     iTime;
uniform int     iFrame;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
void main()
{
    InitGrid(iResolution.xy);
    vec2 fragCoord = floor(gl_FragCoord.xy);
    vec3 pos = dim3from2(fragCoord);
    
    Particle p0, p1;
    p0.mass = 0u;
    p0.pos = vec3(0);
    p0.vel = vec3(0);

    p1.mass = 0u;
    p1.pos = vec3(0);
    p1.vel = vec3(0);

    //advect neighbors and accumulate + clusterize density if they fall into this cell
    range(i, -2, 2) range(j, -2, 2) range(k, -2, 2)
    {
        //load the particles 
        vec3 pos1 = pos + vec3(i, j, k);
        if(!all(lessThanEqual(pos1, size3d)) || !all(greaterThanEqual(pos1, vec3(0.0))))
        {
            continue;
        }
        Particle p0_, p1_;
        unpackParticles(LOAD3D(ch0, pos1), pos1, p0_, p1_);
        
        if(p0_.mass > 0u)
        {
            p0_.pos += p0_.vel*dt;
            Clusterize(p0, p1, p0_, pos);
        }
   
        if(p1_.mass > 0u)
        {
            p1_.pos += p1_.vel*dt;
            Clusterize(p0, p1, p1_, pos);
        }
    }
    
    if(p1.mass == 0u && p0.mass > 0u)
    {
        SplitParticle(p0, p1);
    }

    if(p0.mass == 0u && p1.mass > 0u)
    {
        SplitParticle(p1, p0);
    }
    
    vec4 packed = packParticles(p0, p1, pos);
    out_FragColor = packed;
}
`;

// 更新水流量pass
const BufferB = `
uniform float     iTime;
uniform int     iFrame;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
void AddDensity(inout Particle p, in Particle incoming, float rad)
{
    if(incoming.mass == 0u) return;
    float d = distance(p.pos, incoming.pos);
    float irho = float(incoming.mass);
    float rho = 0.25*irho*GD(d,rad);
    p.density += rho;
}

//compute particle SPH densities
void main()
{
    InitGrid(iResolution.xy);
    vec2 fragCoord = floor(gl_FragCoord.xy);
    vec3 pos = dim3from2(fragCoord);
    
    Particle p0, p1, pV;
    pV.pos = pos + 0.5;
    
    //load the particles
    vec4 packed = LOAD3D(ch0, pos);
    unpackParticles(packed, pos, p0, p1);
    
    range(i, -2, 2) range(j, -2, 2) range(k, -2, 2)
    {
        if(i == 0 && j == 0 && k == 0) continue;
        vec3 pos1 = pos + vec3(i, j, k);
        Particle p0_, p1_;
        unpackParticles(LOAD3D(ch0, pos1), pos1, p0_, p1_);

        if(p0.mass > 0u)
        {
            AddDensity(p0, p0_, 1.5);
            AddDensity(p0, p1_, 1.5);
        }
        if(p1.mass > 0u)
        {
            AddDensity(p1, p0_, 1.5);
            AddDensity(p1, p1_, 1.5);
        }
        
        AddDensity(pV, p0_, 1.6);
        AddDensity(pV, p1_, 1.6);
    }

    if(p0.mass > 0u)
    {
        AddDensity(p0, p0, 1.5);
        AddDensity(p0, p1, 1.5);
    }
    if(p1.mass > 0u)
    {
        AddDensity(p1, p0, 1.5);
        AddDensity(p1, p1, 1.5);
    }
    AddDensity(pV, p0, 1.6);
    AddDensity(pV, p1, 1.6);

    out_FragColor = vec4(p0.density, p1.density, pV.density, 0.0);
}

`;

// 水位计算pass2
const BufferC = `
uniform float     iTime;
uniform int     iFrame;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
void main()
{
    InitGrid(iResolution.xy);
    vec2 fragCoord = floor(gl_FragCoord.xy);
    vec3 pos = dim3from2(fragCoord);

    Particle p0, p1;
    
    //load the particles
    vec4 packed = LOAD3D(ch0, pos);
    unpackParticles(packed, pos, p0, p1);
    
    //load density
    vec2 densities = LOAD3D(ch1, pos).xy;
    p0.density = densities.x;
    p1.density = densities.y;
    
    if(p0.mass + p1.mass > 0u) 
    {
        range(i, -2, 2) range(j, -2, 2) range(k, -2, 2)
        {
            if(i == 0 && j == 0 && k == 0) continue;
            vec3 pos1 = pos + vec3(i, j, k);
            Particle p0_, p1_;
            unpackParticles(LOAD3D(ch0, pos1), pos1, p0_, p1_);
            
            vec2 densities_ = LOAD3D(ch1, pos1).xy;
            p0_.density = densities_.x;
            p1_.density = densities_.y;

            //apply the force
            ApplyForce(p0, p0_);
            ApplyForce(p0, p1_);
            ApplyForce(p1, p0_);
            ApplyForce(p1, p1_);
        }

        ApplyForce(p0, p1);
        ApplyForce(p1, p0);

        IntegrateParticle(p0, pos, iResolution.xy, iMouse, iTime);
        IntegrateParticle(p1, pos, iResolution.xy, iMouse, iTime);
    }
    
        
    if(iFrame < 10)
    {
        if(pos.x < 0.4*size3d.x && pos.x > 0.0*size3d.x && 
           pos.y < 0.45*size3d.y && pos.y > 0.15*size3d.y &&
           pos.z < 0.99*size3d.z && pos.z > 0.75*size3d.z)
        {
            p0.mass = initial_particle_density;
            p1.mass = 0u;
            if( pos.z < 0.90*size3d.z && pos.z > 0.80*size3d.z) p0.sand = bool(1);
        }

        p0.pos = pos;
        p0.vel = vec3(0.0);
        p1.pos = pos;
        p1.vel = vec3(0.0);
    }

    packed = packParticles(p0, p1, pos);
    out_FragColor = packed;
}

`;

// 水流量计算pass2
const BufferD = `
uniform float     iTime;
uniform int     iFrame;
uniform vec2 iResolution;
uniform sampler2D iChannel1;
float Density(vec3 p)
{
    return trilinear(ch1, p).z;
}

vec4 calcNormal(vec3 p, float dx) {
	const vec3 k = vec3(1,-1,0);
	return   (k.xyyx*Density(p + k.xyy*dx) +
			 k.yyxx*Density(p + k.yyx*dx) +
			 k.yxyx*Density(p + k.yxy*dx) +
			 k.xxxx*Density(p + k.xxx*dx))/vec4(4.*dx,4.*dx,4.*dx,4.);
}

//compute shadows
void main()
{
    InitGrid(iResolution.xy);
    vec2 fragCoord = floor(gl_FragCoord.xy);
    vec3 pos = dim3from2(fragCoord);
    
    //ray march in the -light_dir direction
    const float step_size = 1.0;
    const int step_count = 100;
    float td = 0.0;
    vec3 rd = light_dir;
    float optical_density = 0.0;
    vec3 normal = normalize(calcNormal(pos, 0.5).xyz);
    pos += -normal*0.5;
    for(int i = 0; i < step_count; i++)
    {
        vec3 p = pos + rd * td;
        if(!all(lessThanEqual(p, size3d)) || !all(greaterThanEqual(p, vec3(0.0))))
        {
            break;
        }
        float d = Density(p);
        optical_density += d * step_size;
        td += step_size;
    }

    out_FragColor = vec4(0.2*optical_density);
}
`;
const renderShaderSource = `
// Fork of "PCGSPH 3D" by michael0884. https://shadertoy.com/view/mstfzS
// 2023-10-16 03:59:48

//Particle cluster grid smoothed particle hydrodynamics. Now in 3D.
//Compared to 2D this is muuuch trickier, the effective resolution tolerances are much higher.
//So before noone really made a liquid in 3d that looked even remotely "liquid"
//I think this is probably the highest (visual) resolution fluid sim on shadertoy so far.
//Right now I'm just tracing the particles, but I think maybe its possible to do an isosurface render somehow?

#define FOV 2.5

in vec3 vo;
in vec3 vd;
in vec2 v_st;

uniform float     iTime;
uniform int     iFrame;
uniform vec2 iResolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform samplerCube iChannel3;

mat3 getCamera(vec2 angles)
{
   mat3 theta_rot = mat3(1,   0,              0,
                          0,  cos(angles.y),  -sin(angles.y),
                          0,  sin(angles.y),  cos(angles.y)); 
        
   mat3 phi_rot = mat3(cos(angles.x),   sin(angles.x), 0.,
        		       -sin(angles.x),   cos(angles.x), 0.,
        		        0.,              0.,            1.); 
        
   return theta_rot*phi_rot;
}

vec3 getRay(vec2 angles, vec2 pos)
{
    mat3 camera = getCamera(angles);
    return normalize(transpose(camera)*vec3(FOV*pos.x, 1., FOV*pos.y));
}


#define MAX_DIST 1e5

struct Ray 
{
    vec3 ro;
    vec3 rd;
    float td;
    vec3 normal;
    vec3 color;
    bool sand;
};

void iSphere(inout Ray ray, vec4 sphere, vec3 color)
{
    vec3 ro = ray.ro - sphere.xyz;
    float b = dot(ro, ray.rd);
    float c = dot(ro, ro) - sphere.w*sphere.w;
    float h = b*b - c;
    if (h > 0.) 
    {
	    h = sqrt(h);
        float d1 = -b-h;
        float d2 = -b+h;
        if (d1 >= 0.0 && d1 <= ray.td) {
            ray.normal = normalize(ro + ray.rd*d1);
            ray.color = color;
            ray.td = d1;
        } else if (d2 >= 0.0 && d2 <= ray.td) { 
            ray.normal = normalize(ro + ray.rd*d2); 
            ray.color = color;
            ray.td = d2;
        }
    }
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
        return vec2(MAX_DIST);
    } else {
        return vec2(tN, tF);
    }
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

#define radius 0.75
#define zoom 0.25

void TraceCell(inout Ray ray, vec3 p)
{
    //load the particles 
    vec4 packed = LOAD3D(ch0, p);
    Particle p0, p1;
    unpackParticles(packed, p, p0, p1);

    vec3 water_color = vec3(0.420,0.302,0.996);
    vec3 sand_color = vec3(0.359375, 0.2578125, 0.14453125);

    if(p0.mass > 0u) iSphere(ray, vec4(p0.pos, 1.0), (p0.sand ? sand_color:water_color) * length(p0.vel));
    if(p1.mass > 0u) iSphere(ray, vec4(p1.pos, 1.0), (p1.sand ? sand_color:water_color) * length(p1.vel));

    // if(p0.sand || p1.sand) ray.color = vec3(0.359375, 0.2578125, 0.14453125);
    // if(p0.sand || p1.sand) ray.sand = bool(1);
}

void TraceCells(inout Ray ray, vec3 p)
{
    vec3 p0 = floor(p);
    vec4 rho = LOAD3D(ch1, p);
    if(rho.z < 1e-5) return;
    range(i, -1, 1) range(j, -1, 1) range(k, -1, 1)
    {
        //load the particles 
        vec3 p1 = p0 + vec3(i, j, k);
        TraceCell(ray, p1);
    }
}


float Density(vec3 p)
{
    return trilinear(ch1, p).z;
}

float Shadow(vec3 p)
{
    float optical_density = trilinear(ch2, p).x;
    return exp(-optical_density)+0.05;
}

vec4 calcNormal(vec3 p, float dx) {
	const vec3 k = vec3(1,-1,0);
	return   (k.xyyx*Density(p + k.xyy*dx) +
			 k.yyxx*Density(p + k.yyx*dx) +
			 k.yxyx*Density(p + k.yxy*dx) +
			 k.xxxx*Density(p + k.xxx*dx))/vec4(4.*dx,4.*dx,4.*dx,4.);
}

float TraceDensity(vec3 ro, vec3 rd)
{
    const float step_size = 1.0;
    const int step_count = 100;
    float dens = 0.0;
    float td = 0.0;
    for(int i = 0; i < step_count; i++)
    {
        vec3 p = ro + rd * td;
        if(!all(lessThanEqual(p, size3d)) || !all(greaterThanEqual(p, vec3(0.0))))
        {
            break;
        }
        float d = Density(p);
        dens += d * step_size;
        td += step_size;
    }
    return dens;
}

vec3 rotateZ(vec3 point, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        point.x * c - point.y * s,
        point.x * s + point.y * c,
        point.z
    );
}

vec3 rotateY(vec3 point, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        point.x * c + point.z * s,
        point.y,
        -point.x * s + point.z * c
    );
}

vec3 rotateX(vec3 point, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        point.x,
        point.y * c - point.z * s,
        point.y * s + point.z * c
    );
}

void main()
{    
    InitGrid(iResolution.xy);

    vec3 ro = (vo *2. +1.) * vec3(size3d)*vec3(0.5,0.5,0.5);
    vec3 rd = normalize(vd);

    vec2 tdBox = iBox(ro - vec3(size3d)*0.5, rd, 0.5*vec3(size3d));
    out_FragColor = texture(iChannel3,  rd.yzx);
    out_FragColor = vec4(size3d/256.,1.);
    if(tdBox.x < MAX_DIST)
    {
        float td = max(tdBox.x, 0.0);
        float step_size = 2.5;
        const int step_count = 100;
        Ray ray;
        ray.ro = ro;
        ray.rd = rd;
        ray.td = tdBox.y;

        for(int i = 0; i < step_count; i++)
        {
            vec3 p = ro + rd*td;
            float height = GetTerrainHeight(p.xy);
            if(height>p.z){
                out_FragColor.xyz = vec3(0.,0.5,0.);
                return;
            } 
            TraceCells(ray, p);

            td += step_size;
            if(td > tdBox.y || ray.td < tdBox.y)
            {
                break;
            }
        }
        
        if(ray.td < tdBox.y)
        {
            vec3 p0 = ray.ro + ray.rd*ray.td;
            vec3 normal = normalize(calcNormal(p0, 0.5).xyz);
            normal = -normalize(mix(normal, ray.normal, 0.0));
            vec3 albedo = vec3(0.220,0.349,1.000);
            float LdotN = dot(normal, light_dir);
            float shadow = Shadow(p0);
            vec3 refl_d = reflect(ray.rd, normal);
            vec3 refr_d = refract(ray.rd, normal, 1.0/1.33);
            float liquid_density = TraceDensity(p0, refr_d);
            vec3 liquid_color = exp(-0.1*liquid_density*vec3(0.953,0.353,0.247));
            vec3 refr_color = texture(iChannel3,  refr_d.yzx).xyz * liquid_color;
            vec3 refl = texture(iChannel3,  refl_d.yzx).xyz;
            float K = 1. - pow(max(dot(normal,refl_d),0.), 2.);
            K = mix(0.0, K, 0.5);
            out_FragColor.xyz = (0.25*shadow + 1.5)*refr_color*(1.0 - K) + 0.*ray.color + 0.75*shadow*refl*K;
            // out_FragColor.w = min( td/length(size3d), 1.);
            out_FragColor.xyz = ray.color;
            // out_FragColor.xyz = (0.25*shadow + 1.5)*refr_color*(1.0 - K) + 0.2*ray.color + 0.75*shadow*refl*K;
            // out_FragColor.xyz = 2.5*shadow*albedo*LdotN*(1.0 - K) + 0.5*ray.color + shadow*refl*K;
        }
        // else discard;
    }
    // else discard;
}
`;

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

class FluidDemo {
  constructor(viewer) {
    this._viewer = viewer;

    // 分辨率
    this._width = 1024;
    this._height = 1024;

    this._resolution = new Cesium.Cartesian2(this._width, this._height);

    this.initShaderToy();
  }

  initShaderToy() {
    const texA = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    const texB = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    const texC = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });
    const texD = RenderUtil.createTexture({
      context: this._viewer.scene.context,
      width: this._width,
      height: this._height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      arrayBufferView: new Float32Array(this._width * this._height * 4),
    });

    // Render Buffers
    const quadGeometry = RenderUtil.getFullscreenQuad();
    // BufferA
    const Buffer_A = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return time;
        },
        iFrame: () => {
          return frame;
        },
        iResolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return texC;
        },
        // iChannel1: () => {
        //   return texD;
        // },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [Command, BufferA],
      }),
      geometry: quadGeometry,
      outputTexture: texA,
      preExecute: function () {
        Buffer_A.commandToExecute.outputTexture = texA;
      },
    });

    // BufferB
    const Buffer_B = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return time;
        },
        iFrame: () => {
          return frame;
        },
        iResolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return texA;
        },
        // iChannel1: () => {
        //   return texD;
        // },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [Command, BufferB],
      }),
      geometry: quadGeometry,
      outputTexture: texB,
      preExecute: function () {
        Buffer_B.commandToExecute.outputTexture = texB;
      },
    });

    // BufferC
    const Buffer_C = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return time;
        },
        iFrame: () => {
          return frame;
        },
        iResolution: () => {
          return this._resolution;
        },
        iChannel0: () => {
          return texA;
        },
        iChannel1: () => {
          return texB;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [Command, BufferC],
      }),
      geometry: quadGeometry,
      outputTexture: texC,
      preExecute: function () {
        Buffer_C.commandToExecute.outputTexture = texC;
      },
    });

    // BufferD
    const Buffer_D = new CustomPrimitive({
      commandType: "Compute",
      uniformMap: {
        iTime: () => {
          return time;
        },
        iFrame: () => {
          return frame;
        },
        iResolution: () => {
          return this._resolution;
        },
        // iChannel0: () => {
        //   return texC;
        // },
        iChannel1: () => {
          return texB;
        },
      },
      fragmentShaderSource: new Cesium.ShaderSource({
        sources: [Command, BufferD],
      }),
      geometry: quadGeometry,
      outputTexture: texD,
      preExecute: function () {
        Buffer_D.commandToExecute.outputTexture = texD;
      },
    });

    // // Render Box
    // let terrainMap = this._viewer.scene.frameState.context.defaultTexture;
    // Cesium.Resource.fetchImage({
    //   url: "./image/8979352a182bde7c3c651ba2b2f4e0615de819585cc37b7175bcefbca15a6683.jpg",
    // }).then((image) => {
    //   terrainMap = new Cesium.Texture({
    //     context: this._viewer.scene.frameState.context,
    //     source: image,
    //     sampler: new Cesium.Sampler({
    //       wrapS: Cesium.TextureWrap.REPEAT,
    //       wrapT: Cesium.TextureWrap.REPEAT,
    //       magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
    //       minificationFilter:
    //         Cesium.TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    //     }),
    //   });
    //   terrainMap.generateMipmap();
    // });
    const promiseArr = [];
    for (let index = 0; index < 6; index++) {
      promiseArr.push(
        Cesium.Resource.fetchImage({
          url:
            "SimulateData/image/488bd40303a2e2b9a71987e48c66ef41f5e937174bf316d3ed0e86410784b919" +
            (index == 0 ? "" : "_" + index) +
            ".jpg",
        })
      );
    }
    const _this = this;
    Promise.all(promiseArr).then((imgs) => {
      debugger;
      _this.cubeMap = new Cesium.CubeMap({
        context: _this._viewer.scene.context,
        source: {
          positiveX: imgs[0],
          negativeX: imgs[1],
          positiveY: imgs[2],
          negativeY: imgs[3],
          positiveZ: imgs[4],
          negativeZ: imgs[5],
        },
      });
    });
    this.cubeMap = this._viewer.scene.context._defaultCubeMap;

    // Render Command
    const modelMatrix = generateModelMatrix(
      [120.20998865783179, 30.13650797533829, 1000],
      [0, 0, 0],
      [2000, 2000, 2000]
    );
    const boxGeometry = Cesium.BoxGeometry.fromDimensions({
      vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
      dimensions: new Cesium.Cartesian3(1, 1, 1),
    });
    const geometry = Cesium.BoxGeometry.createGeometry(boxGeometry);
    const attributelocations =
      Cesium.GeometryPipeline.createAttributeLocations(geometry);
    const fluidCommand = new CustomPrimitive({
      commandType: "Draw",
      uniformMap: {
        iTime: () => {
          return time;
        },
        iFrame: () => {
          return frame;
        },
        iResolution: () => {
          return this._resolution;
        },

        iChannel0: () => {
          return texA;
        },
        iChannel1: () => {
          return texB;
        },
        iChannel2: () => {
          return texD;
        },
        iChannel3: () => {
          return this.cubeMap ?? this._viewer.scene.context._defaultCubeMap;
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
        sources: [Command + renderShaderSource],
      }),
      rawRenderState: {
        depthTest: {
          enabled: true,
          // func: DepthFunction.LESS,
        },
        blending: Cesium.BlendingState.ALPHA_BLEND,
      },
    });

    // Render Event
    let time = 1.0;
    let frame = 0;
    this._viewer.scene.postRender.addEventListener(() => {
      const now = performance.now();
      time = now / 1000;
      frame += 0.02;
    });

    this._viewer.scene.primitives.add(Buffer_A);
    this._viewer.scene.primitives.add(Buffer_B);
    this._viewer.scene.primitives.add(Buffer_C);
    this._viewer.scene.primitives.add(Buffer_D);
    this._viewer.scene.primitives.add(fluidCommand);
  }
}
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

const main = async () => {
  await initViewer();
};

window.onload = main;
