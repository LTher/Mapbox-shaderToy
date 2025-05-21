import { h, render } from "vue";

/**
 * 自定义地图标记的类。
 * @author LXQ
 */
export class CustomMarker {
  /**
   * 创建一个自定义地图标记。
   * @constructor
   * @param {object} params - 标记参数对象。
   * @property {string} params.tag - 标记的标签。
   * @property {string} params.info - 标记的信息。
   * @property {string} params.src - 标记的图像源。
   * @property {string} params.anchor - 标记的锚点。
   * @property {Array<number>} params.coordinates - 标记的经纬度坐标。
   * @property {mapmostMap} params.mapAPI - 要添加标记的地图对象。
   */
  constructor(params) {
    this.#params = params;

    const pos_cartesian3 = Cesium.Cartesian3.fromDegrees(
      params.position[0],
      params.position[1],
      params.position[2]
    );

    const src = new URL("/images/mainPage/markers/POI.png", import.meta.url)
      .href;

    this.marker = params.mapAPI.billboards.add({
      position: pos_cartesian3,
      // image: "/images/mainPage/markers/POI.png",
      image: params.src ?? src,
      id: params.name,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: params.pixelOffset,
      disableDepthTestDistance: 0,
      scale: 0.5,
    });
    // this.#vmInstance = h(params.popupComponent, params.popupParams);

    // render(this.#vmInstance, document.createElement("div"));

    this.label = params.mapAPI.labels.add({
      position: pos_cartesian3,
      id: params.name,
      text: params.label,
      fillColor: Cesium.Color.WHITE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: params.labelOffser,
      disableDepthTestDistance: 0,
      scale: 0.5,
    });

    const _this = this;
    const handler = new Cesium.ScreenSpaceEventHandler(
      params.viewer.scene.canvas
    );
    // handler.setInputAction(function (movement) {
    //   let pickedLabel = params.viewer.scene.pick(movement.position);
    //   if (Cesium.defined(pickedLabel)) {
    //     if (pickedLabel.id === _this.#params.name) {
    //       if (!_this.#vmInstance) {
    //         _this.#vmInstance = h(params.popupComponent, params.popupParams);
    //         render(
    //           _this.#vmInstance,
    //           document.querySelector(".marker-collection")
    //         );
    //       } else {
    //         _this.#vmInstance.el.style.display = "block";
    //       }
    //     } else {
    //       if (_this.#vmInstance) {
    //         _this.#vmInstance.el.style.display = "none";
    //       }
    //     }
    //   } else {
    //     if (_this.#vmInstance) {
    //       _this.#vmInstance.el.style.display = "none";
    //     }
    //   }
    // }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  #params;
  #vmInstance;
  #marker;
  #isHighlight;

  /**
   * 从地图上移除标记。
   */
  removeMarker() {
    this.#vmInstance.el.remove();
    this.#vmInstance = null;
  }
}
