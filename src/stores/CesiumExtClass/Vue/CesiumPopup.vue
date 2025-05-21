<template>
  <div class="popup-wrapper " :style="{
    left: positionXy.xAxis + 'px',
    top: positionXy.yAxis + 'px',
  }">
    <component is=""></component>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useCounterStore } from "@/stores/counter";

const $store = useCounterStore();
const $props = defineProps({
  position: {
    type: Array,
    required: true,
  },
  component: {
    type: Object,
    required: !true
  }
});
const positionXy = ref({ xAxis: 0, yAxis: 0 });

const closeCallback = () => {
  $props.closeCallback();
};

const src = new URL("@/assets/images/markers/POI.png", import.meta.url).href

onMounted(() => {

  const position = new Cesium.Cartographic(Cesium.Math.toRadians($props.position[0]), Cesium.Math.toRadians($props.position[1]))
  const height = viewer.scene.sampleHeight(position);
  // pos_cartesian3.value = Cesium.Cartesian3.fromDegrees(
  //   $props.position[0],
  //   $props.position[1],
  //   height ?? 4000
  // );
  const pos_cartesian3 = Cesium.Cartesian3.fromDegrees(
    $props.position[0],
    $props.position[1],
    height ?? $props.position[2]
  );
  const viewer = $store.viewer();
  viewer.scene.postRender.addEventListener(() => {
    let windowPosition = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
      viewer.scene,
      pos_cartesian3
    );
    if (windowPosition) {
      positionXy.value.xAxis = windowPosition.x - 383;
      positionXy.value.yAxis = windowPosition.y - 300;
    }
  });
});
</script>

<style lang="scss" scoped>
.popup-wrapper {
  position: fixed;
  z-index: 10;

  width: vw(46.33px);
  height: vh(109.42px);

  background-image: url("@/assets/images/markers/POI.png");
  background-position: center center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
</style>
