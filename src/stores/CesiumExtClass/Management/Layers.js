class LayersManage {
  constructor(viewer) {
    this.viewer = viewer;
    this.idMap = new Map();
  }
  addXYZLayer(options) {
    const layer = this.viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: options.url, //服务地址
      }),
      options.index
    );
    const index = this.viewer.imageryLayers.indexOf(layer);
    this.idMap.set(options.id, { index: index, layer: layer });
    return layer;
  }
  //   contains(layer) {
  //     return this.viewer.imageryLayers.contains(layer);
  //   }
  getLayer(id) {
    const item = this.idMap.get(id);
    return item ? item.layer : item;
  }
  remove(id, isDestroy = false) {
    this.viewer.imageryLayers.remove(this.getLayer(id), isDestroy) &&
      this.idMap.delete(id);
  }
  removeAll(isDestroy) {
    this.viewer.imageryLayers.removeAll(isDestroy);
  }
}

export default LayersManage;
