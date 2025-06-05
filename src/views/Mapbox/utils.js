import * as turf from "@turf/turf";

/**
 * 获取地形高度的网格采样
 * @param {mapboxgl.Map} map - Mapbox GL 地图实例
 * @param {Object} center - 采样中心点 {lng: 经度, lat: 纬度}
 * @param {number} gridSize - 网格大小（单位：米）
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @returns {Promise<Array>} 返回包含经纬度和高程的对象数组
 */
export async function getTerrainHeightGrid(map, center, gridSize, rows, cols) {
  if (!map || !map.queryTerrainElevation) {
    throw new Error("Mapbox GL 地图实例无效或不支持地形查询");
  }

  // 确保地图已加载地形数据
  await new Promise((resolve) => {
    map.once("sourcedata", (e) => {
      if (e.sourceId === "mapbox-dem" && e.isSourceLoaded) {
        resolve();
      }
      if (map.getSource("mapbox-dem")) resolve();
    });
  });

  const result = [];
  const halfCols = Math.floor(cols / 2);
  const halfRows = Math.floor(rows / 2);

  // 计算网格点
  for (let row = -halfRows; row < halfRows; row++) {
    for (let col = -halfCols; col < halfCols; col++) {
      // 计算当前点的偏移量（米）
      const offsetX = col * gridSize;
      const offsetY = row * gridSize;

      // 将米转换为经纬度偏移
      const newPoint = calculateOffsetPoint(center, [offsetX, offsetY]);

      // 查询高程
      const elevation = map.queryTerrainElevation(newPoint);

      result.push({
        longitude: newPoint[0],
        latitude: newPoint[1],
        height: elevation !== undefined ? elevation : 0,
        row: row + halfRows,
        col: col + halfCols,
      });
    }
  }

  return result;
}

// /**
//  * 计算从起点偏移指定米数后的经纬度点
//  * @param {Object} origin - 起点 {lng: 经度, lat: 纬度}
//  * @param {number} offsetX - 东西方向偏移量（东为正，西为负，单位：米）
//  * @param {number} offsetY - 南北方向偏移量（北为正，南为负，单位：米）
//  * @returns {Object} 新的经纬度点 {lng: 经度, lat: 纬度}
//  */
// function calculateOffsetPoint(origin, offsetX, offsetY) {
//   // 地球半径（米）
//   const earthRadius = 6378137;

//   // 将东西方向偏移转换为经度变化
//   // 经度变化与纬度有关
//   const lngOffset =
//     ((offsetX / earthRadius) * (180 / Math.PI)) /
//     Math.cos((origin[1] * Math.PI) / 180);

//   // 将南北方向偏移转换为纬度变化
//   const latOffset = (offsetY / earthRadius) * (180 / Math.PI);

//   return [origin[0] + lngOffset, origin[1] + latOffset];
// }

/**
 * 根据经纬度点和正东正北方向的偏移量计算新坐标点
 * @param {Array} origin - 原点经纬度坐标 [经度, 纬度]
 * @param {Array} offset - 二维偏移量 [东向偏移(米), 北向偏移(米)]
 * @returns {Array} 新坐标点 [经度, 纬度]
 */
export function calculateOffsetPoint(origin, offset) {
  // 东向偏移（方位角90度）
  const eastPoint = turf.destination(
    turf.point(origin),
    offset[0] / 1000, // 转换为公里
    90, // 正东方向
    { units: "kilometers" }
  );

  // 从东向偏移点再向北偏移（方位角0度）
  const finalPoint = turf.destination(
    eastPoint,
    offset[1] / 1000, // 转换为公里
    0, // 正北方向
    { units: "kilometers" }
  );

  return finalPoint.geometry.coordinates;
}
