import { Deep } from "@/utils/deep";
class DynamicHeatMap {
  constructor(viewer, dataName, opt) {
    this.viewer = viewer;
    this.dataName = dataName;
    this.opt = opt;
    this.updataCallback = opt.updataCallback;
    this.startCallback = opt.startCallback;
    this.scene = viewer.scene;
    this.isDynamic = true;
    this.isLoop = false;

    this.dataSet = [];
    this.dataSetLength = 0;
    this.resultHeatMapData = [];

    this.ratio = 0;

    const top = 28.2465948971,
      left = 85.7905053899,
      right = 86.0194742976,
      bottom = 28.1222310742;

    this.pointsArray = [
      85.7905053899, 28.246594897186, 86.0194742976, 28.2465948971,
      86.0194742976, 28.1222310742, 85.7905053899, 28.1222310742,
    ];

    this.initHeatMap();
    this.initDataSet(true);
  }

  initHeatMap() {
    const canvas = 2000;
    const dom = window.document.createElement("div");
    dom.id = `easy3d-heatmap-test`;
    dom.className = `easy3d-heatmap`;
    dom.style.width = canvas + "px";
    dom.style.height = canvas + "px";
    dom.style.position = "absolute";
    dom.style.display = "none";
    let mapDom = window.document.getElementById(this.viewer.container.id);

    mapDom.appendChild(dom);

    let config = {
      container: document.getElementById(`easy3d-heatmap-test`),
      radius: 10,
      maxOpacity: 1,
      minOpacity: 0.1,
      blur: 0.75,
      opacity: 1,
      gradient: {
        // ".0": "rgba(0,0,0,0)",
        // ".1": "rgba(24, 230, 245,0.4)",
        // ".3": "rgb(57, 127, 247)",
        //20, 0, 245
        ".1": "rgba(55, 149, 196,1)",
        ".2": "rgba(161, 194, 153,1)",
        ".3": "rgba(250, 250, 102,1)",
        ".5": "rgba(250, 146, 55,1)",
        ".99": "rgba(232, 24, 21,1)",
      },
    };
    this.heatmapInstance = h337.create(config);

    // yellow_red={ ".1": "rgba(245, 241, 0,1)",
    // ".3": "rgba(245, 175, 0,1)",
    // ".5": "rgba(245, 122, 0,1)",
    // ".7": "rgba(245, 69, 0,1)",
    // ".99": "rgba(245, 4, 0,1)",}

    // floodColor={ ".1": "rgba(0, 67, 151,1)",
    // ".3": "rgba(0, 170, 228,1)",
    // ".5": "rgba(255, 255, 191,1)",
    // ".7": "rgba(247, 167, 116,1)",
    // ".99": "rgba(219, 60, 46,1)",}
  }

  initDataSet(useFinalResult) {
    if (useFinalResult) {
      // const url = new URL(
      //   "./heatData/final/" + this.dataName + "_final.json",
      //   import.meta.url
      // );
      // fetch(url);
      Cesium.Resource.fetchJson({
        url: "./heatData/final/" + this.dataName + "_final.json",
      }).then((dataSet) => {
        this.dataSet = dataSet;
        this.dataSetLength = dataSet.length;

        this.initPolygon();
      });
    } else {
      const promiseArr = [];
      promiseArr.push(
        Cesium.Resource.fetchJson({
          url: "/heatData/tempData/" + this.dataName + "/attr.json",
        })
      );
      for (let index = 0; index < 61; index++) {
        promiseArr.push(
          Cesium.Resource.fetchJson({
            url:
              "/heatData/tempData/" +
              this.dataName +
              "/heat_" +
              index +
              ".json",
          })
        );
      }
      Promise.all(promiseArr).then((values) => {
        const attr = values.shift();
        //   this.dataSet = values;
        this.dataSetLength = values.length;
        this.resultHeatMapData = Deep.copy(values[0]);

        values.forEach((data) => {
          // 初始化数据
          this.heatmapInstance.setData({
            max: attr.max,
            min: attr.min,
            data: data,
          });
          this.dataSet.push(this.heatmapInstance.getDataURL());
        });

        this.initPolygon();

        downJson(this.dataName + "_final.json", this.dataSet);
      });
    }
  }

  initPolygon() {
    const m = Cesium.Material.fromType("Image");
    m.uniforms.image;

    //绘制面
    this.dynamicHeatMapPrimitive = new Cesium.GroundPrimitive({
      //贴地面
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(this.pointsArray)
          ),
          //extrudedHeight:1000000
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: m,
        faceForward: true,
      }),
    });
    this.dynamicHeatMapPrimitive.appearance.material.uniforms.image =
      this.dataSet[0];
    this.scene.primitives.add(this.dynamicHeatMapPrimitive);

    this.startCallback && this.startCallback(this);
    this.startPlay();
  }

  startPlay() {
    setInterval(() => {
      if (!this.isDynamic) {
        return;
      }

      this.ratio += 1;
      if (this.ratio > this.dataSetLength) {
        if (this.isLoop) this.ratio = 0.0;
        else {
          this.isDynamic = false;
          return;
        }
      }

      //   lerpHeatMapData(
      //     this.dataSet[Math.floor(ratio)],
      //     this.dataSet[Math.ceil(ratio)],
      //     ratio % 1,
      //     this.resultHeatMapData
      //   );

      // 更新数据
      //   this.heatmapInstance.setData({
      //     max: 183.37,
      //     min: 0,
      //     // data: this.resultHeatMapData,
      //     data: this.dataSet[ratio],
      //   });
      this.dynamicHeatMapPrimitive.appearance.material.uniforms.image =
        this.dataSet[this.ratio];
      // this.heatmapInstance.getDataURL();

      this.updataCallback && this.updataCallback(this);
    }, 500);
  }

  stopPlay() {
    this.isDynamic = false;
  }

  setDataIndex(index) {
    // this.heatmapInstance.setData({
    //   max: 183.37,
    //   min: 0,
    //   data: this.dataSet[index],
    // });
    this.dynamicHeatMapPrimitive.appearance.material.uniforms.image =
      this.dataSet[index];
    //   this.heatmapInstance.getDataURL();
  }

  destroy() {
    this.scene.primitives.remove(this.dynamicHeatMapPrimitive);
    this.isDynamic = false;
    this.updataCallback = null;
  }
}

function getRandomPoints() {
  const arr = [];
  const arrPoint = turf.randomPoint(heatCount, {
    bbox: [rectangle.xmin, rectangle.ymin, rectangle.xmax, rectangle.ymax],
  }).features; // 随机点
  for (let i = 0; i < arrPoint.length; i++) {
    const item = arrPoint[i].geometry.coordinates;
    const val = Math.floor(Math.random() * 100); // 热力值
    arr.push({ lng: item[0], lat: item[1], value: val });
  }
  return arr;
}

function lerpHeatMapData(startArr, endArr, ratio, result) {
  for (let i = 0; i < result.length; i++) {
    const start = startArr[i];
    const end = endArr[i];
    result[i] = {
      x: start.x * (1 - ratio) + end.x * ratio,
      y: start.y * (1 - ratio) + end.y * ratio,
      value: start.value * (1 - ratio) + end.value * ratio,
    };
  }
}

const downJson = (fileName, fileMsg) => {
  const elementA = document.createElement("a");
  elementA.download = fileName;
  elementA.style.display = "none";

  const blob = new Blob([JSON.stringify(fileMsg)]);

  elementA.href = URL.createObjectURL(blob);
  document.body.appendChild(elementA);
  elementA.click();
  document.body.removeChild(elementA);
};

export default DynamicHeatMap;
