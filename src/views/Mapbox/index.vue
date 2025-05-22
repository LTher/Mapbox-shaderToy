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

    const gl = map._canvas.getContext('webgl2')

    const textureA = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 1 });
    const textureB = createColoredTexture(gl, [0, 255, 0, 128], { textureUnit: 1 });
    const textureC = createColoredTexture(gl, [255, 0, 0, 128], { textureUnit: 1 });

    const textureImg = createTextureFromURL(gl, '/1.png')
    const blueTexture = createColoredTexture(gl, [0, 0, 255, 128], { textureUnit: 1 });

    // 创建计算层
    const computeLayer = new ComputeLayer({
        texR: { width: 512, height: 512 },
        uniforms: {
            u_input1: textureC,
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
    //   outColor = color2;
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
      outColor = vec4(texColor.rgb, 1.0);
    //   outColor = vec4(u_highlight, 1.0);
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
        width = 512,
        height = 512,
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

// function initTexture(gl, texture, width, height, options = {}) {
//     // 默认参数配置（WebGL2 扩展特性）
//     const {
//         internalFormat = gl.RGBA,   // 内部格式：支持 WebGL2 的 RGBA8/R32F 等
//         format = gl.RGBA,           // 数据格式：通常与 internalFormat 对应
//         type = gl.UNSIGNED_BYTE,    // 数据类型：UNSIGNED_BYTE/FLOAT 等
//         wrapS = gl.CLAMP_TO_EDGE,   // S轴环绕方式
//         wrapT = gl.CLAMP_TO_EDGE,   // T轴环绕方式
//         minFilter = gl.LINEAR,      // 缩小过滤器
//         magFilter = gl.LINEAR,      // 放大过滤器
//         generateMipmaps = false,    // 是否生成 Mipmaps
//         immutable = !true,           // 是否使用不可变存储（texStorage2D）
//     } = options;

//     // 绑定纹理
//     gl.bindTexture(gl.TEXTURE_2D, texture);

//     // 设置纹理参数
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

//     // 分配纹理存储空间（WebGL2 核心改进）
//     if (immutable) {
//         // 使用不可变存储（高性能固定分配）
//         const levels = generateMipmaps ? Math.log2(Math.max(width, height)) + 1 : 1;
//         gl.texStorage2D(
//             gl.TEXTURE_2D,
//             levels,          // Mipmap 层级数量
//             internalFormat,  // 内部格式（如 gl.RGBA8）
//             width,
//             height
//         );
//     } else {
//         // 传统可变存储（兼容 WebGL1 风格）
//         const color = new Uint8Array([255, 0, 0, 255]); // 红色，不透明
//         gl.texImage2D(
//             gl.TEXTURE_2D,
//             0,                // Mipmap 级别
//             internalFormat,   // 内部格式
//             width,
//             height,
//             0,                // 边框
//             format,           // 像素格式（如 gl.RGBA）
//             type,             // 数据类型（如 gl.UNSIGNED_BYTE）
//             color              // 像素数据（空分配）
//         );
//     }

//     // 按需生成 Mipmaps
//     if (generateMipmaps) {
//         gl.generateMipmap(gl.TEXTURE_2D);
//     }

//     // 解绑纹理
//     gl.bindTexture(gl.TEXTURE_2D, null);
// }

// // debugger
// const gl = map._canvas.getContext('webgl2')
// // 创建两个纹理
// const textureA = gl.createTexture();
// const textureB = gl.createTexture();
// initTexture(gl, textureA, 512, 512);
// initTexture(gl, textureB, 512, 512);
</script>

<style>
#map-container {
    position: fixed;
    top: 0px;
    width: 100%;
    height: 100%;
}
</style>
