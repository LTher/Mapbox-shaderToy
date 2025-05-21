import * as turf from "@turf/turf";

const pointType = ["point", "multi_point"];
const polylineType = "polyline";
const polygonType = "polygon";
const wallType = "wall";
const verticalLabel = "verticalLabel";
const labelType = ["label", verticalLabel];
const CircleType = "circle";
const rectangleType = "rectangle";//矩形
const ellipseType = "ellipse";//椭圆
const cylindricalType = "cylindrical";//圆柱
const cylinderType = "cylinder";//圆锥
const extrudedRectangleType = "extrudedRectangle";//矩形立体
const modelType = 'model';//

const allGraphicType = [...pointType, polylineType, polygonType, wallType, ...labelType, CircleType, rectangleType, ellipseType,
    cylindricalType, cylinderType, extrudedRectangleType,modelType];//所有支持的几何类型

/**
 * 绘图工具
 * @classdesc Draw
 */
class Draw {
    /**
    * 创建绘图工具
    * @param {viewer} viewer 地图对象
    * @memberof Draw
    */
    constructor({viewer} = {}) {
        this.viewer = viewer || window.viewer;
        this.tempPositions = [];
        this.positions = [];
        this.allEntity = [];
        this.drawEntity = null;
        this.startPositionHeight = null;
    }

    //绘制的所有几何
    allEntity;
    //绘制时，左键点击的点坐标
    positions;
    tempPositions;

    /**
     * 开始绘制
     * @param type {String} 绘制的类型，可会知的几何类型参考：drawType
     * @param option {Object} Object，可选参数，具有以下属性的对象：
     * @param option.callBack {Function} 回调函数，返回值包括两个分别是：鼠标左键点击的坐标点，绘制的几何
     * @param option.color {String} 颜色，默认：#0f16ff
     * @param option.opacity {Number} 透明度，默认：1
     * @param option.pixelSize {Number} 画点的大小，默认：20
     * @param option.width {Number} 线宽，默认：1
     * @param option.height {Number} 墙高度、立体文字的高度、几何相对地面的高度，默认：0
     * @param option.extrudedHeight {Number} 几何拉伸的高度,clampToGround为false生效，默认：0
     * @param option.material {Cesium.Property} 材质（不包括点），传了这个值，上面的属性将会失效
     * @param option.clampToGround {Boolean} 是否贴地，默认：true贴地
     */
    activate(type, {
        callBack, color = "#0f16ff", opacity = 1, pixelSize = 20, width = 1, height = 0, extrudedHeight = 0, material,
        text = "", font = '20px "微软雅黑"', repeat = [1, 1], clampToGround = true,url='', minimumPixelSize= 38
    } = {}) {
        if (!allGraphicType.includes(type)) {
            throw("不能进行type为: " + type + "的绘制，无该类型！");
        }
        this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        this.tempPositions = [];
        this.positions = [];
        // this.allEntity = [];
        this.drawEntity = null;
        this.dragStartPostion = null;//点击坐标
        //
        //
        //左键点击
        this.handler.setInputAction(movement => {
            let position = this.viewer.scene.pickPosition(movement.position);
            if (!position) {
                position = this.viewer.scene.camera.pickEllipsoid(movement.position, this.viewer.scene.globe.ellipsoid);
            }
            //
            if((this.startPositionHeight === null)){
                const pt = this.cartesian3ToDegrees(position);
                console.log(pt);
                this.startPositionHeight = pt[0][0];
            }
            //
            this.dragStartPostion = movement.position;
            // let position = this.viewer.scene.camera.pickEllipsoid(movement.position, this.viewer.scene.globe.ellipsoid);
            this.positions.push(position);
            if (pointType.includes(type)) {//点，多点
                this.drawPoint(position, type, color, opacity, pixelSize);
                //绘制单个点的时候，左键点击完立即返回，不需要点击右键
                type === pointType[0] && callBack && (typeof callBack === "function") && callBack(this.positions, this.allEntity);
            } else if (type === modelType) {//模型
                this.drawmodel(position, url, pixelSize,minimumPixelSize);
                //绘制模型的时候，左键点击完立即返回，不需要点击右键
                callBack && (typeof callBack === "function") && callBack(this.positions, this.allEntity);
            } else if (type === polylineType) {//线
                this.drawPolyline({color, opacity, width, material, clampToGround});
            } else if (type === polygonType) {//面
                this.drawPolygon({color, opacity, height, material, clampToGround});
            } else if (type === wallType) {//墙
                this.drawWall({color, opacity, height, material});
            } else if ([CircleType, ellipseType].includes(type)) {//圆，椭圆
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawCircle({color, opacity, height, extrudedHeight, material, clampToGround, type});
            } else if (type === rectangleType) {//矩形
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawRectangle({color, opacity, height, material, clampToGround});
            } else if (labelType.includes(type)) {//标注
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawLabel({text, type, color, font, height, repeat, clampToGround});
            } else if (type === cylindricalType) {//圆柱
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawCylindrical({color, opacity, material, height});
            } else if (cylinderType === type) {//圆锥
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawCylinder({color,opacity,material});
            } else if (type === extrudedRectangleType) {//矩形立体
                tempClick(this);
                if (this.positions.length > 1) {
                    return null;
                }
                this.drawExtrudedRectangle({color,opacity,material});
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        //鼠标移动
        this.handler.setInputAction(movement => {
            if (!this.drawEntity || pointType.includes(type)) {
                return null;
            }
            let position = this.viewer.scene.pickPosition(movement.endPosition);
            if (!position) {
                position = this.viewer.scene.camera.pickEllipsoid(movement.endPosition, this.viewer.scene.globe.ellipsoid);
            }
            if (!position) {
                return null;
            }
            // let position =  this.viewer.scene.camera.pickEllipsoid(movement.endPosition, this.viewer.scene.globe.ellipsoid);
            // console.log(position)

            if ([cylindricalType,cylinderType,extrudedRectangleType].includes(type)) {//计算高度
                let ray = this.viewer.camera.getPickRay(movement.endPosition);
                let cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
                let ray2 = this.viewer.camera.getPickRay(this.dragStartPostion);
                let cartesian2 = this.viewer.scene.globe.pick(ray2, this.viewer.scene);
                if (cartesian2 && cartesian) {
                    let cz = cartesian2.z - cartesian.z;
                    this.extrudedHeightChengeValue = cz;
                }
            }
            this.tempPositions = this.positions.concat(position);
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        //右键点击
        this.handler.setInputAction(movement => {
            if (!this.drawEntity || (type === pointType[0])) {
                return null;
            }
            if (![CircleType, ellipseType, cylindricalType,cylinderType,extrudedRectangleType].includes(type)) {//结束绘制时需要保留第二点
                this.tempPositions = this.positions;
            }
            switch (type) {
                case polylineType:
                case polygonType:
                    this.allEntity.push(this.drawEntity);
                    break;
            }
            this.deactivate();
            callBack && (typeof callBack === "function") && callBack(this.positions, this.allEntity);
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

        //
        function tempClick(target) {
            if (target.positions.length > 1) {
                target.deactivate();
                callBack && (typeof callBack === "function") && callBack(target.positions, target.allEntity);
                return null;
            }
        }
    }

    //画点
    drawPoint(position, type, color, opacity, pixelSize) {
        this.drawEntity = this.viewer.entities.add({
            position,
            point: {
                pixelSize: pixelSize,
                color: Cesium.Color.fromCssColorString(color).withAlpha(opacity),
            }
        });
        this.allEntity.push(this.drawEntity);
        if (type === "point") {
            this.deactivate();
        }
    }

    //画模型
    drawmodel(position, uri, pixelSize,minimumPixelSize){
        this.drawEntity = this.viewer.entities.add({
            position,
            model: {
                minimumPixelSize: minimumPixelSize,
                uri: uri,
            }
        });
        this.allEntity.push(this.drawEntity);
            this.deactivate();
    }

    //画线
    drawPolyline({color, opacity, width, material, clampToGround}) {
        const tempMaterial = material ?? new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.fromCssColorString(color).withAlpha(opacity)
        });
        this.drawEntity = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(e => {
                    return this.tempPositions;
                }, false),
                width: width,
                material: tempMaterial,
                clampToGround: clampToGround
            }
        });
    }

    //画面
    drawPolygon({color, opacity, height, material, clampToGround}) {
        const tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            polygon: {
                hierarchy: new Cesium.CallbackProperty(e => {
                    return new Cesium.PolygonHierarchy(this.tempPositions);
                }, false),
                material: tempMaterial,
            },
        };
        !clampToGround && height && (option.polygon.height = height);
        this.drawEntity = this.viewer.entities.add(option);
    }

    //画墙
    drawWall({color, opacity, height = 100, material}) {
        const tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        this.drawEntity = this.viewer.entities.add({
            wall: {
                positions: new Cesium.CallbackProperty(e => {
                    let temp = [];
                    const pts = this.cartesian3ToDegrees(this.tempPositions);
                    pts.map(pt => {
                        temp.push(pt[0], pt[1], height);
                    });
                    return temp.length ? Cesium.Cartesian3.fromDegreesArrayHeights(temp) : temp;
                }, false),
                material: tempMaterial
            }
        });
        this.allEntity.push(this.drawEntity);
    }

    //画圆，椭圆
    drawCircle({color, opacity, height, extrudedHeight, material, clampToGround, type}) {
        let tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            type: "EditableCircle",
            position: this.positions[0],
            ellipse: {
                fill: true,
                semiMinorAxis: new Cesium.CallbackProperty(() => {
                    if (this.tempPositions.length < 1) {
                        return null;
                    }
                    //半径 两点间距离
                    const tempR = calPointsLength2d(this.tempPositions);
                    const r = type === CircleType ? tempR : tempR * 2;
                    return r ? r : r + 1;
                }, false),
                semiMajorAxis: new Cesium.CallbackProperty(() => {
                    if (this.tempPositions.length < 1) {
                        return null;
                    }
                    //半径 两点间距离
                    const tempR = calPointsLength2d(this.tempPositions);
                    const r = tempR;
                    return r ? r : r + 1;
                }, false),
                material: tempMaterial
            },
        };
        //
        if (!clampToGround) {
            height && (option.ellipse.height = height);
            extrudedHeight && (option.ellipse.extrudedHeight = extrudedHeight);
        }
        //
        //
        this.drawEntity = this.viewer.entities.add(option);
        this.allEntity.push(this.drawEntity);
    }

    //画矩形
    drawRectangle({color, opacity, height, material, clampToGround}) {
        const tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            rectangle: {
                coordinates: new Cesium.CallbackProperty(() => {
                    if (!this.tempPositions.length) {
                        return null;
                    }
                    let temp = [];
                    const pts = this.cartesian3ToDegrees(this.tempPositions);
                    pts.map(pt => {
                        temp.push(pt[0], pt[1], pt[2]);
                    });
                    let features = turf.featureCollection([
                        turf.point([temp[0], temp[1], temp[2]], {"name": "Location A"}),
                        turf.point([temp[3], temp[4], temp[5]], {"name": "Location B"}),
                    ]);
                    let enveloped = turf.envelope(features);
                    let obj = Cesium.Rectangle.fromDegrees(enveloped.bbox[0], enveloped.bbox[1], enveloped.bbox[2], enveloped.bbox[3]);
                    return obj;
                }, false),
                material: tempMaterial
            }
        };
        !clampToGround && height && (option.rectangle.height = height);
        this.drawEntity = this.viewer.entities.add(option);
        this.allEntity.push(this.drawEntity);
    }

    //画标注
    drawLabel({text, type, color, font, height = 100, clampToGround}) {
        if (!text) {
            return null;
        }
        const canvas = getImage({text, font, color});
        if (type === verticalLabel) {//立体标注
            this.drawWall({
                color,
                material: new Cesium.ImageMaterialProperty({
                    image: canvas,
                    transparent: true,
                    repeat: new Cesium.Cartesian2(1, 1),
                }),
                height
            });
        } else {//平面标注
            this.drawRectangle({
                color,
                material: canvas.toDataURL(),
                height, clampToGround
            });
        }
    }

    //圆柱
    drawCylindrical({color, opacity, material, height}) {
        let regionExtrudedHeight = 0;
        let tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            type: "EditableCircle",
            position: this.positions[0],
            ellipse: {
                fill: true,
                semiMinorAxis: new Cesium.CallbackProperty(() => {
                    if (this.tempPositions.length < 1) {
                        return null;
                    }
                    //半径 两点间距离
                    const r = calPointsLength2d(this.tempPositions);
                    return r ? r : r + 1;
                }, false),
                semiMajorAxis: new Cesium.CallbackProperty(() => {
                    if (this.tempPositions.length < 1) {
                        return null;
                    }
                    //半径 两点间距离
                    const r = calPointsLength2d(this.tempPositions);
                    return r ? r : r + 1;
                }, false),
                material: tempMaterial,
                height,
                extrudedHeight: new Cesium.CallbackProperty(() => {//高度
                    let temp = regionExtrudedHeight - this.extrudedHeightChengeValue;
                    return (temp >= 0) ? temp : 0;
                }, false)
            },
        };
        //
        this.drawEntity = this.viewer.entities.add(option);
        this.allEntity.push(this.drawEntity);
    }

    //画圆锥
    drawCylinder({color,opacity,material}) {
        let regionExtrudedHeight = 0;
        let tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            position: this.positions[0],
            cylinder: {
                length: new Cesium.CallbackProperty(() => {//高度
                    let temp = regionExtrudedHeight - this.extrudedHeightChengeValue;
                    return (temp >= 0) ? temp : 0;
                }, false),//高度
                topRadius: 0,//顶部的半径
                bottomRadius: new Cesium.CallbackProperty(() => {//底部的半径
                    if (this.tempPositions.length < 1) {
                        return null;
                    }
                    //半径 两点间距离
                    const r = calPointsLength2d(this.tempPositions);
                    return r ? r : r + 1;
                }, false),
                material: tempMaterial,
            },
        };
        //
        this.drawEntity = this.viewer.entities.add(option);
        this.allEntity.push(this.drawEntity);
    }
    //矩形立体
    drawExtrudedRectangle({color,opacity,material}){
        let regionExtrudedHeight = 0;
        const tempMaterial = material ?? Cesium.Color.fromCssColorString(color).withAlpha(opacity);
        const option = {
            rectangle: {
                coordinates: new Cesium.CallbackProperty(() => {
                    if (!this.tempPositions.length) {
                        return null;
                    }
                    let temp = [];
                    const pts = this.cartesian3ToDegrees(this.tempPositions);
                    pts.map(pt => {
                        temp.push(pt[0], pt[1], pt[2]);
                    });
                    let features = turf.featureCollection([
                        turf.point([temp[0], temp[1], temp[2]], {"name": "Location A"}),
                        turf.point([temp[3], temp[4], temp[5]], {"name": "Location B"}),
                    ]);
                    let enveloped = turf.envelope(features);
                    let obj = Cesium.Rectangle.fromDegrees(enveloped.bbox[0], enveloped.bbox[1], enveloped.bbox[2], enveloped.bbox[3]);
                    return obj;
                }, false),
                extrudedHeight:new Cesium.CallbackProperty(() => {//高度
                    let temp = regionExtrudedHeight - this.extrudedHeightChengeValue;
                    return (temp >= 0) ? temp : 0;
                }, false),//高度
                height: this.startPositionHeight,
                material: tempMaterial
            }
        };
        this.drawEntity = this.viewer.entities.add(option);
        this.allEntity.push(this.drawEntity);
    }


    /**
     * 停止绘制
     */
    deactivate() {
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        this.handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
        this.drawEntity = null;
    }

    /**
     * 获取绘制的所有几何
     * @returns {*}
     */
    getDrawEntity() {
        return this.allEntity;
    }


    /**
     * 删除绘制的所有几何
     */
    removeDrawEntity() {
        this.viewer.entities.remove(this.allEntity);
        this.allEntity = [];
        this.tempPositions = [];
    }

  /**
   * cartesian3转经纬度
   * @param cartesian3Arr {Cesium.Cartesian3 | Array<Cesium.Cartesian3>} 3D笛卡尔坐标数组
   * @return  {Array} 返回经纬度 [[经度，纬度, 高度]......]
   */
  cartesian3ToDegrees(cartesian3Arr){
    if(!Array.isArray(cartesian3Arr)){
      cartesian3Arr = [cartesian3Arr];
    }
    let xyArr = [];
    cartesian3Arr.map(cartesian3 =>{
      let ellipsoid = this.viewer.scene.globe.ellipsoid;
      let cartographic=ellipsoid.cartesianToCartographic(cartesian3);
      let y=Cesium.Math.toDegrees(cartographic.latitude);
      let x=Cesium.Math.toDegrees(cartographic.longitude);
      xyArr.push([x,y,cartographic.height]);
    });

    return xyArr;
  }

}

function calPointsLength2d(points) {
    let len = 0;
    let locals = calLocals(points[0], points);
    for (var i = 0; i < locals.length - 1; i++) {
        len += calDistance2d(locals[i], locals[i + 1]);
    }
    return len;
}

function calLocals(positionFrom, positions) {
    var localpts = [];
    var mpcarto = toCartographic(positionFrom);
    var l0 = mpcarto.longitude;
    var b0 = mpcarto.latitude;

    for (var i = 0; i < positions.length; i++) {
        var dmp = new Cesium.Cartesian3(
            positions[i].x - positionFrom.x,
            positions[i].y - positionFrom.y,
            positions[i].z - positionFrom.z
        );
        var y =
            -Math.sin(b0) * Math.cos(l0) * dmp.x -
            Math.sin(l0) * Math.sin(b0) * dmp.y +
            Math.cos(b0) * dmp.z;
        var x = -Math.sin(l0) * dmp.x + Math.cos(l0) * dmp.y;
        var z =
            Math.cos(b0) * Math.cos(l0) * dmp.x +
            Math.cos(b0) * Math.sin(l0) * dmp.y +
            Math.sin(b0) * dmp.z;
        localpts.push(new Cesium.Cartesian3(x, y, z));
    }
    return localpts;
}

function calDistance2d(point1, point2) {
    var dx = point2.x - point1.x;
    var dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function toCartographic(cartesian) {
    var cart = Cesium.Cartographic.fromCartesian(cartesian);
    return cart;
}

function getImage({text, font, color}) {
    let particleCanvas;
    if (!Cesium.defined(particleCanvas)) {
        particleCanvas = document.createElement("canvas");
        particleCanvas.width = 90;
        particleCanvas.height = 25;
        var ctx = particleCanvas.getContext("2d");
        var w = ctx.canvas.width;
        var h = ctx.canvas.height;
        //水平对齐方式
        ctx.textAlign = "center";
        //垂直对齐方式
        ctx.textBaseline = "middle";
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.fillText(text, w / 2, h / 2);

    }
    return particleCanvas;
}

export default Draw
