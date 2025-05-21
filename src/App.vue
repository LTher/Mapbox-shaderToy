<template>
  <!-- <MapContainer></MapContainer> -->
  <RouterView />
</template>

<script setup>
// import MapContainer from "@/components/MapContainer/MapContainer.vue";

// Forbidden user scroll wheel zoom behavior
addEventListener(
  "wheel",
  (e) => {
    e.ctrlKey === true && e.preventDefault();
  },
  { passive: false }
);
</script>

<style lang="scss"></style>
