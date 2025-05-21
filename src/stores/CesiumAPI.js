import { CesiumExtClass } from "./CesiumExtClass/index";
import * as turf from "@turf/turf";
class CesiumAPI {
  /**
   * 创建一个新的 CesiumAPI 实例。
   * @param {string} elementId - 地图容器的元素 ID。
   */
  constructor(elementId) {
    Cesium.Ion.defaultAccessToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjZGMzNWExZi1kY2JhLTRkZDgtOTIyNy0xZGNiOTA5MDk3MDciLCJpZCI6ODAwMTMsImlhdCI6MTY1MDg3Nzg5NX0.0sovJpGjveKaD7loQu9Dr053pKU5hE0RJBymfr6UFwk";
    const _viewer = new Cesium.Viewer(elementId, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider({}), //移除自带地形
      geocoder: false, //隐藏查找控件
      homeButton: false, //隐藏视角返回初始位置按钮
      sceneModePicker: false, //隐藏视角模式3D 2D CV
      baseLayerPicker: false, //隐藏图层选择
      navigationHelpButton: false, //隐藏帮助
      animation: false, //隐藏动画控件
      timeline: false, //隐藏时间线控件
      fullscreenButton: false, //隐藏全屏
    });
    _viewer._cesiumWidget._creditContainer.style.display = "none";
    _viewer.scene.globe.depthTestAgainstTerrain = true;
    // _viewer.imageryLayers.removeAll();

    const _layers = new CesiumExtClass.LayersManage(_viewer);

    const _draw = new CesiumExtClass.draw({ viewer: _viewer });

    // 修改交互
    _viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
    ];

    _viewer.scene.screenSpaceCameraController.tiltEventTypes = [
      Cesium.CameraEventType.PINCH,
      Cesium.CameraEventType.RIGHT_DRAG,
    ];

    Object.defineProperty(this, "viewer", {
      get: () => _viewer,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "scene", {
      get: () => _viewer.scene,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "layers", {
      get: () => _layers,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "draw", {
      get: () => _draw,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "billboards", {
      get: () => this.#billboards,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "labels", {
      get: () => this.#labels,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    Object.defineProperty(this, "ExtClass", {
      get: () => CesiumExtClass,
      set: () => {
        throw new Error("MapInstance modification is not allowed");
      },
    });
    window.viewer = _viewer;

    // _viewer.scene.globe.baseColor = Cesium.Color.LIGHTGRAY;

    this.initView();

    // this.testFunHeat(true);

    // const tdtLayer = new Cesium.UrlTemplateImageryProvider({
    //   url: "http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    //   minimumLevel: 3,
    //   maximumLevel: 18,
    // });
    // _viewer.imageryLayers.addImageryProvider(tdtLayer);

    this.setTerrain(import.meta.env.VITE_CESIUM_DEM);

    this.#primitiveMap = new Map();
    this.#billboards = this.scene.primitives.add(
      new Cesium.BillboardCollection({
        scene: _viewer.scene,
      })
    );
    this.#labels = this.scene.primitives.add(
      new Cesium.LabelCollection({
        scene: _viewer.scene,
      })
    );
    this.#geoJsonMap = new Map();
  }

  // 林芝
  // initView() {
  //   this.viewer.camera.setView({
  //     destination: {
  //       x: -505172.24692565424,
  //       y: 5541503.589401738,
  //       z: 3147091.2957640355,
  //     },
  //     orientation: {
  //       heading: 4.735201080861955,
  //       pitch: -0.7649677908225119,
  //       roll: 0.00017909847857655592,
  //     },
  //   });
  // }

  initView() {
    this.viewer.camera.setView({
      destination: {
        x: 218159.1407474338,
        y: 5643850.738024476,
        z: 2970073.2739274595,
      },
      orientation: {
        heading: 5.900965762325427,
        pitch: -0.7136907953941716,
        roll: 6.283109404877598,
      },
    });
  }

  #primitiveMap;
  #geoJsonMap;
  #billboards;
  #labels;
  #lastIceLakeIdx;

  flyTo(option) {
    const destination = Cesium.Cartesian3.fromDegrees(
      option.coor[0],
      option.coor[1],
      option.coor[2]
    );
    this.viewer.camera.flyTo({
      duration: option.duration,
      destination,
      orientation: {
        heading: Cesium.Math.toRadians(option.heading),
        pitch: Cesium.Math.toRadians(option.pitch),
        roll: option.roll,
      },
    });
  }

  testFunHeat(isActived, heatKey, opt) {
    //   const heatCount = 1000;
    //   // 获取bbox矩形区域内的count个随机点
    //   function getRandomPoints() {
    //     const arr = [];
    //     const arrPoint = turf.randomPoint(heatCount, {
    //       bbox: [rectangle.xmin, rectangle.ymin, rectangle.xmax, rectangle.ymax],
    //     }).features; // 随机点
    //     for (let i = 0; i < arrPoint.length; i++) {
    //       const item = arrPoint[i].geometry.coordinates;
    //       const val = Math.floor(Math.random() * 100); // 热力值
    //       arr.push({ lng: item[0], lat: item[1], value: val });
    //     }
    //     return arr;
    //   }

    //   function lerpHeatMapData(startArr, endArr, ratio, result) {
    //     for (let i = 0; i < heatCount; i++) {
    //       const start = startArr[i];
    //       const end = endArr[i];
    //       result[i] = {
    //         lng: start.lng * (1 - ratio) + end.lng * ratio,
    //         lat: start.lat * (1 - ratio) + end.lat * ratio,
    //         value: start.value * (1 - ratio) + end.value * ratio,
    //       };
    //     }
    //   }

    const top = 28.2465948971,
      left = 85.7905053899,
      right = 86.0194742976,
      bottom = 28.1222310742;
    if (isActived) {
      this.viewer.camera.setView({
        destination: {
          x: 406796.8840863207,
          y: 5618146.165667902,
          z: 3001570.8221610724,
        },
        orientation: {
          heading: 0.09989810827285872,
          pitch: -1.5706914465694095,
          roll: 0,
        },
      });

      this.dynamicHeatmap = new CesiumExtClass.DynamicHeatMap(
        this.viewer,
        heatKey,
        opt
      );
      return this.dynamicHeatmap;
    } else {
      if (this.dynamicHeatmap) {
        this.dynamicHeatmap.isDynamic = false;
        this.viewer.scene.primitives.remove(
          this.dynamicHeatmap.dynamicHeatMapPrimitive
        );
      }
    }

    // Cesium.Resource.fetchText({ url: "/Arcgis data/sur0832.txt" }).then(
    //   (data) => {
    //     const canvas = 2000;

    //     const final_data = data
    //       .split(" ")
    //       .filter((str) => str !== "" && str !== "\r\n");
    //     const header = final_data.splice(0, 12);
    //     const ncols = Number(header[1]);
    //     const nrows = Number(header[3]);
    //     let arr = [];
    //     let n = 0;
    //     for (let i = 0; i < nrows; i++) {
    //       for (let j = 0; j < ncols; j++) {
    //         const v = Number(final_data[n]);
    //         if (v !== 0) {
    //           arr.push({
    //             y: ((i / nrows) * canvas).toFixed(0), // x coordinate of the datapoint, a number
    //             x: ((j / ncols) * canvas).toFixed(0), // y coordinate of the datapoint, a number
    //             value: v, // the value at datapoint(x, y)
    //           });
    //         }

    //         n++;
    //       }
    //     }

    //     const dom = window.document.createElement("div");
    //     dom.id = `easy3d-heatmap-test`;
    //     dom.className = `easy3d-heatmap`;
    //     dom.style.width = canvas + "px";
    //     dom.style.height = canvas + "px";
    //     dom.style.position = "absolute";
    //     dom.style.display = "none";
    //     let mapDom = window.document.getElementById(this.viewer.container.id);

    //     mapDom.appendChild(dom);

    //     let config = {
    //       container: document.getElementById(`easy3d-heatmap-test`),
    //       radius: 60,
    //       maxOpacity: 0.7,
    //       minOpacity: 0,
    //       blur: 0.75,
    //       // gradient: {
    //       //   ".1": "blue",
    //       //   ".5": "yellow",
    //       //   ".7": "red",
    //       //   ".99": "white",
    //       // },
    //     };
    //     const heatmapInstance = h337.create(config);
    //     heatmapInstance.addData(arr);
    //     console.log(heatmapInstance.getDataURL());

    //   }
    // );
  }

  testFuncRock() {
    const data = [
      [87.75909894667836, 27.9323061652444],
      [87.76093361245694, 27.932114810752353],
      [87.76350337414289, 27.931528430523215],
      [87.76448956146396, 27.931520824613784],
      [87.7658950559806, 27.936047469660352],
      [87.76122597088806, 27.936333490467945],
      [87.75817335568149, 27.934153041842137],
      [87.7577204736624, 27.932788530135056],
      [87.75909894667836, 27.9323061652444],
    ];
    const pointsArray = [];

    data.forEach((coor) => {
      pointsArray.push(coor[0]);
      pointsArray.push(coor[1]);
    });

    const fabric = {
      type: "OurMappedPlastic",
      materials: {
        diffuseMaterial: {
          type: "DiffuseMap",
        },
        normalMaterial: {
          type: "NormalMap",
        },
      },
      components: {
        diffuse: "diffuseMaterial.diffuse",
        normal: "normalMaterial.normal",
      },
    };

    var m = new Cesium.Material({
      fabric: fabric,
    });

    m.materials.diffuseMaterial.uniforms.image =
      "/images/texture/T_Rocky_Ground_wgupdij_2K_D.jpg";
    m.materials.normalMaterial.uniforms.image =
      "/images/texture/T_Rocky_Ground_wgupdij_2K_N.jpg";

    //绘制面
    var addPolygonGroundPrimitive = new Cesium.GroundPrimitive({
      //贴地面
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(pointsArray)
          ),
          //extrudedHeight:1000000
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: m,
        faceForward: true,
      }),
    });
    this.scene.primitives.add(addPolygonGroundPrimitive);
  }

  flyTo(option) {
    const destination = Cesium.Cartesian3.fromDegrees(
      option.coor[0],
      option.coor[1],
      option.coor[2]
    );
    this.viewer.camera.flyTo({
      destination: destination,
      orientation: {
        heading: Cesium.Math.toRadians(option.heading ?? 0),
        pitch: Cesium.Math.toRadians(option.pitch ?? -90),
        roll: Cesium.Math.toRadians(option.roll ?? 0),
      },
      duration: option.duration ?? 2,
    });
  }

  zoomIn() {
    // 镜头拉进
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.add(
        this.viewer.camera.position,
        Cesium.Cartesian3.multiplyByScalar(
          this.viewer.camera.direction,
          this.viewer.camera.positionCartographic.height * 0.7,
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      ),
      orientation: {
        heading: this.viewer.camera.heading,
        pitch: this.viewer.camera.pitch,
        roll: this.viewer.camera.roll,
      },
      duration: 1.0,
    });
  }

  zoomOut() {
    // 镜头远离
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.add(
        this.viewer.camera.position,
        Cesium.Cartesian3.multiplyByScalar(
          this.viewer.camera.direction,
          this.viewer.camera.positionCartographic.height * -0.7,
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      ),
      orientation: {
        heading: this.viewer.camera.heading,
        pitch: this.viewer.camera.pitch,
        roll: this.viewer.camera.roll,
      },
      duration: 1.0,
    });
  }

  toNorth() {
    const viewCenter = this.viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(
        this.viewer.canvas.clientWidth / 2,
        this.viewer.canvas.clientHeight / 2
      )
    );
    let destination = this.viewer.camera.position;
    if (viewCenter) {
      const cartographic = Cesium.Cartographic.fromCartesian(viewCenter);
      destination = Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        this.viewer.camera.positionCartographic.height
      );
    }

    this.viewer.camera.flyTo({
      destination: destination,
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.0,
    });
  }

  async setTerrain(url) {
    // 自定义地形服务
    this.viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl(
      url
    );
  }

  removeTerrain() {
    this.viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider({});
  }

  async addGeoJson(url, id, style) {
    const geoJsonDS = await Cesium.GeoJsonDataSource.load(url, {
      clampToGround: true,
      stroke: style.lineColor
        ? Cesium.Color.fromCssColorString(style.lineColor)
        : Cesium.Color.HOTPINK,
      fill: style.fillColor
        ? Cesium.Color.fromCssColorString(style.fillColor)
        : Cesium.Color.PINK,
      strokeWidth: style.lineWidth ?? 1,
      markerSymbol: "?",
    });
    this.viewer.dataSources.add(geoJsonDS);
    this.#geoJsonMap.set(id, geoJsonDS);
  }

  removeGeoJson(id, destroy = true) {
    const geoJsonDS = this.#geoJsonMap.get(id);
    this.viewer.dataSources.remove(geoJsonDS, destroy);
  }

  addTexturePolygon(options) {
    const m = Cesium.Material.fromType("Image");
    m.uniforms.image;
    //绘制面
    const primitive = new Cesium.GroundPrimitive({
      //贴地面
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(options.pointsArray)
          ),
          //extrudedHeight:1000000
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: m,
        faceForward: true,
      }),
    });
    primitive.appearance.material.uniforms.image = options.image;
    this.scene.primitives.add(primitive);
    this.#primitiveMap.set(options.id, primitive);
  }

  removeTexturePolygon(id) {
    const primitive = this.#primitiveMap.get(id);
    this.scene.primitives.remove(primitive);
    this.#primitiveMap.delete(id);
  }

  addXYZLayer(options) {
    this.viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: options.url, //服务地址
      })
    );
  }

  addLakeSurface(layerId, geoJSON, isRemovelast) {
    this.removeLakeSurface(this.#lastIceLakeIdx);
    const pointsArray = [];
    geoJSON.features[0].geometry.coordinates[0][0].forEach((coor) => {
      pointsArray.push(coor[0]);
      pointsArray.push(coor[1]);
    });

    //绘制面
    //定义几何形状
    var polygon = new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(
          Cesium.Cartesian3.fromDegreesArray(pointsArray)
        ),
        //extrudedHeight:1000000
      }),
    });

    const waterMaterial = CesiumExtClass.CustomWaterMaterial();
    //定义外观
    var polygonAppearance = new Cesium.MaterialAppearance({
      material: waterMaterial,
      faceForward: true,
    });
    //创建GroundPrimitive
    var addPolygonGroundPrimitive = new Cesium.GroundPrimitive({
      //贴地面
      geometryInstances: polygon,
      appearance: polygonAppearance,
    });

    // viewer.scene.primitives.add(addPolygonGroundPrimitive);

    this.scene.primitives.add(addPolygonGroundPrimitive, layerId);

    this.#primitiveMap.set(layerId, addPolygonGroundPrimitive);
    this.#lastIceLakeIdx = layerId;
  }
  removeLakeSurface(curIdx) {
    this.scene.primitives.remove(this.#primitiveMap.get(curIdx));
    this.#primitiveMap.delete(curIdx);
  }
}

export { CesiumAPI };
