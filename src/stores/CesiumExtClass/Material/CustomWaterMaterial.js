import WaterMaterial from "./CustomWaterShaderSource";
const CustomWaterMaterial = () => {
  return new Cesium.Material({
    fabric: {
      type: "CustomWater",
      uniforms: {
        baseWaterColor: new Cesium.Color(0.2, 0.3, 0.6, 1.0),
        blendColor: new Cesium.Color(0.0, 1.0, 0.699, 1.0),
        textureMap: "/images/texture/water.jpg",
        specularMap: "czm_defaultImage",
        normalMap: "/images/texture/waterNormals.jpg",
        frequency: 100.0,
        animationSpeed: 0.02,
        amplitude: 1.0,
        specularIntensity: 0.2,
        fadeFactor: 1.0,
      },
      source: WaterMaterial,
    },
    translucent: function (material) {
      const uniforms = material.uniforms;
      return (
        uniforms.baseWaterColor.alpha < 1.0 || uniforms.blendColor.alpha < 1.0
      );
    },
  });
};

export default CustomWaterMaterial;
