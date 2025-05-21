import CustomWaterMaterial from "./Material/CustomWaterMaterial";
import DynamicHeatMap from "./Simulation/DynamicHeatMap";
import LayersManage from "./Management/Layers";
import draw from "./draw/draw";
import WaterSimulate from "./Simulation/Water/WaterSimulate";

class CesiumExtClass {
  static CustomWaterMaterial = CustomWaterMaterial;
  static DynamicHeatMap = DynamicHeatMap;
  static LayersManage = LayersManage;
  static draw = draw;
  static WaterSimulate = WaterSimulate;
}

export { CesiumExtClass };
