<template>
    <div ref="mapContainer" id="map-container"></div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import stylejs from './streets-v12.json'
import CustomLayer from './customLayer';
import ComputeLayer from './computeLayer';
// import mapboxgl from "mapbox-gl";
// import "mapbox-gl/dist/mapbox-gl.css";
const mapboxgl = window.mapboxgl

const mapContainer = ref(null);
let map;

onMounted(() => {
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

    function initTexture(gl, texture, width, height, options = {}) {
        // 默认参数配置（WebGL2 扩展特性）
        const {
            internalFormat = gl.RGBA8,   // 内部格式：支持 WebGL2 的 RGBA8/R32F 等
            format = gl.RGBA,           // 数据格式：通常与 internalFormat 对应
            type = gl.UNSIGNED_BYTE,    // 数据类型：UNSIGNED_BYTE/FLOAT 等
            wrapS = gl.CLAMP_TO_EDGE,   // S轴环绕方式
            wrapT = gl.CLAMP_TO_EDGE,   // T轴环绕方式
            minFilter = gl.LINEAR,      // 缩小过滤器
            magFilter = gl.LINEAR,      // 放大过滤器
            generateMipmaps = false,    // 是否生成 Mipmaps
            immutable = true,           // 是否使用不可变存储（texStorage2D）
        } = options;

        // 绑定纹理
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // 设置纹理参数
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

        // 分配纹理存储空间（WebGL2 核心改进）
        if (immutable) {
            // 使用不可变存储（高性能固定分配）
            const levels = generateMipmaps ? Math.log2(Math.max(width, height)) + 1 : 1;
            gl.texStorage2D(
                gl.TEXTURE_2D,
                levels,          // Mipmap 层级数量
                internalFormat,  // 内部格式（如 gl.RGBA8）
                width,
                height
            );
        } else {
            // 传统可变存储（兼容 WebGL1 风格）
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,                // Mipmap 级别
                internalFormat,   // 内部格式
                width,
                height,
                0,                // 边框
                format,           // 像素格式（如 gl.RGBA）
                type,             // 数据类型（如 gl.UNSIGNED_BYTE）
                null              // 像素数据（空分配）
            );
        }

        // 按需生成 Mipmaps
        if (generateMipmaps) {
            gl.generateMipmap(gl.TEXTURE_2D);
        }

        // 解绑纹理
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // debugger
    const gl = map._canvas.getContext('webgl2')
    // 创建两个纹理
    const textureA = gl.createTexture();
    const textureB = gl.createTexture();
    initTexture(gl, textureA, 512, 512);
    initTexture(gl, textureB, 512, 512);
    // 创建计算层
    const computeLayer = new ComputeLayer({
        texR: { width: 512, height: 512 },
        uniforms: {
            u_input1: textureA,
            u_input2: textureB,
            u_params: [0.5, 1.0]
        },
        outputTexture: textureA,
        customShaderCode: {
            uniformDeclarations: `
      uniform sampler2D u_input1;
      uniform sampler2D u_input2;
      uniform vec2 u_params;
    `,
            uniformProcessing: `
      vec4 color1 = texture(u_input1, v_texCoord);
      vec4 color2 = texture(u_input2, v_texCoord);
      outColor = mix(color1, color2, u_params.x);
      outColor = vec4(1.0,0.,0.,1.);
    `
        }
    });

    // 创建渲染层
    const customLayer = new CustomLayer({
        uniforms: {
            u_texture: textureA,
            u_highlight: [1.0, 0.0, 0.0]
        },
        customShaderCode: {
            uniformDeclarations: `
      uniform sampler2D u_texture;
      uniform vec3 u_highlight;
    `,
            uniformProcessing: `
      vec4 texColor = texture(u_texture, v_texCoord);
      outColor = vec4(texColor.rgb * u_highlight, 1.0);
    `
        }
    });

    map.on("load", function () {
        map.addSource("tileLayer", {
            type: "raster",
            tiles: [
                "http://192.168.110.11/overviewMap3/{z}/{x}/{y}.png"
                // "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            tileSize: 256
        });
        map.addLayer({
            id: "basemap",
            type: "raster",
            source: "tileLayer"
        });


        map.addLayer(computeLayer);
        map.addLayer(customLayer);
    });
});

onBeforeUnmount(() => {
    // 销毁地图实例
    if (map) map.remove();
});
</script>

<style>
#map-container {
    position: fixed;
    top: 0px;
    width: 100%;
    height: 100%;
}
</style>