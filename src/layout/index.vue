<template>
  <div style="background-color: pink;width: 500px;height: 500px;"></div>
  <MapContainer :isMainMap="true"></MapContainer>
</template>

<script setup>
import MapContainer from "@/components/MapContainer/MapContainer.vue";

// Forbidden user scroll wheel zoom behavior
addEventListener(
  "wheel",
  (e) => {
    e.ctrlKey === true && e.preventDefault();
  },
  { passive: false }
);
</script>

<style lang="scss">
:root {
  --el-color-primary: rgba(255, 141, 26, 1);
  --el-color-primary-light-9: #fdf6ec;
  --el-color-primary-light-5: #f3d19e;
  --el-color-primary-light-7: #f3d19e;
  --el-color-primary-light-3: #f3d19e;
  --el-color-primary-dark-2: rgba(255, 141, 26, 1);
  --el-color-primary-light-8: #f3d19e;


  --el-color-warning: rgba(255, 141, 26, 1);
  --el-color-warning-light-9: #fdf6ec;
  --el-color-warning-light-5: #f3d19e;
  --el-color-warning-light-7: #f3d19e;
  --el-color-warning-light-3: #f3d19e;
  --el-color-warning-dark-2: rgba(255, 141, 26, 1);
  --el-color-warning-light-8: #f3d19e;
}
</style>
