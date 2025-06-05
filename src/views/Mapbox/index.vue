<template>
    <div ref="mapContainer" id="map-container"></div>
</template>

<script lang="js" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import stylejs from './streets-v12.json'
import WaterSimulate from './waterSimulation';
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
        // center: [94.9674, 29.6441], // 初始中心点经纬度（杭州）
        // zoom: 5, // 初始缩放级别
        center: [87.770985940066, 27.926471549720233],
        zoom: 10, // 初始缩放级别
        // center: [7.5, 58],
    });

    map.on("load", async function () {
        map.addSource("tileLayer", {
            type: "raster",
            tiles: [
                // "http://192.168.110.11/overviewMap3/{z}/{x}/{y}.png"
                "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
        });
        map.addLayer({
            id: "basemap",
            type: "raster",
            source: "tileLayer",
        });
        map.addSource("mapbox-dem", {
            type: "raster-dem",
            tiles: [
                "http://192.168.110.11/Tibet-dem/{z}/{x}/{y}.png"
            ],
            tileSize: 256,
        });
        map.setTerrain({
            source: "mapbox-dem",
            exaggeration: 1,
        });


        // 添加缩放和方向控制
        map.addControl(new mapboxgl.NavigationControl());

        // const viewCamera = JSON.parse('{"position":{"x":0.7647795347630167,"y":0.41202136634716663,"z":0.020631742121587733},"orientation":[-0.09205062231110657,0.3758240254648531,-0.8956342725796784,0.219367806654034],"_renderWorldCopies":true}')
        // map.setFreeCameraOptions(viewCamera);

        await sleep(2000)

        const coord = new mapboxgl.MercatorCoordinate(0.7647795347630167, 0.41202136634716663, 0);
        const lngLat = coord.toLngLat(); // LngLat(0, 0)

        const gl = map._canvas.getContext('webgl2')
        const waterS = new WaterSimulate({
            map: map,
            gl: gl
        })

        waterS.initBox()
    });
});

onBeforeUnmount(() => {
    // 销毁地图实例
    if (map) map.remove();
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
