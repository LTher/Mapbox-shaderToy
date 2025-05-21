<template>
    <div ref="mapContainer" id="map-container"></div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import stylejs from './streets-v12.json'
import CustomLayer from './customLayer';
import * as BoxLayer from'./boxLayer';
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

    const layer = new CustomLayer();

    const box = new BoxLayer.default()

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


        map.addLayer(layer);
        map.addLayer(box);
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