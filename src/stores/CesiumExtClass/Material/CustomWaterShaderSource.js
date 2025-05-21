//This file is automatically rebuilt by the Cesium build process.
export default `
uniform sampler2D textureMap;
uniform sampler2D normalMap;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);

    float durationTime = 2.0;
    // 获取当前帧数,fract(x) 返回x的小数部分
    float time = czm_frameNumber / (60.0 * durationTime);


    vec2 s = time * 0.13 * vec2(0, 0.3);
    vec2 offset = texture(normalMap,fract(materialInput.st + s)).xy * 0.015;
    vec4 textureMapValue = texture(textureMap, fract(materialInput.st + offset));

    material.diffuse = textureMapValue.rgb;

    return material;
}
`;
