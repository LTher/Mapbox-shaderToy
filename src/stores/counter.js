import { reactive, ref } from "vue";
import { defineStore } from "pinia";
import { CesiumAPI } from "./CesiumAPI";

export const useCounterStore = defineStore("counter", () => {
  const commonRefs = reactive({
    isReady: false,
  });
  const commonFunc = reactive({})
  const assignment = (key, value) => (commonRefs[key] = value);

  let _cesiumIns;

  const initMap = (elementId) => {
    return new CesiumAPI(elementId);
  };

  const setMainMap = (mapIns) => {
    _cesiumIns = mapIns;
  };

  const mapAPI = () => _cesiumIns;
  const viewer = () => _cesiumIns.viewer;

  return {
    commonRefs,
    assignment,
    initMap,
    setMainMap,
    mapAPI,
    viewer,
  };
});
