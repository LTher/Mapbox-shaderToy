class RockSimulation{
    constructor(){}
}

function getQuaternion(positionEcf, velocityEcf, inPitch) {
  // 1、计算站心到模型坐标系的旋转平移矩阵
  // 速度归一化
  let normal = Cesium.Cartesian3.normalize(
    velocityEcf,
    new Cesium.Cartesian3()
  );
  // 计算模型坐标系的旋转矩阵
  let satRotationMatrix = Cesium.Transforms.rotationMatrixFromPositionVelocity(
    positionEcf,
    normal,
    Cesium.Ellipsoid.WGS84
  );
  // 模型坐标系到地固坐标系旋转平移矩阵
  let m = Cesium.Matrix4.fromRotationTranslation(
    satRotationMatrix,
    positionEcf
  );
  // 站心坐标系（东北天坐标系）到地固坐标系旋转平移矩阵
  var m1 = Cesium.Transforms.eastNorthUpToFixedFrame(
    positionEcf,
    Cesium.Ellipsoid.WGS84,
    new Cesium.Matrix4()
  );
  // 站心到模型坐标系的旋转平移矩阵
  let m3 = Cesium.Matrix4.multiply(
    Cesium.Matrix4.inverse(m1, new Cesium.Matrix4()),
    m,
    new Cesium.Matrix4()
  );

  // 2、模型姿态旋转矩阵（根据实际需要）
  let h1 = 0,
    p1 = inPitch,
    r1 = 0;
  let postureHpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(h1),
    Cesium.Math.toRadians(p1),
    Cesium.Math.toRadians(r1)
  );
  let postureMatrix = Cesium.Matrix3.fromHeadingPitchRoll(postureHpr);

  // 3、模型朝向旋转矩阵
  let h2 = 0,
    p2 = -180,
    r2 = 0;
  let sHpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(h2),
    Cesium.Math.toRadians(p2),
    Cesium.Math.toRadians(r2)
  );
  let sMatrix = Cesium.Matrix3.fromHeadingPitchRoll(sHpr);

  // 4、最终的旋转矩阵
  let mat3 = Cesium.Matrix4.getMatrix3(m3, new Cesium.Matrix3());
  let finalMatrix = Cesium.Matrix3.multiply(
    mat3,
    postureMatrix,
    new Cesium.Matrix3()
  );
  let finalMatrix1 = Cesium.Matrix3.multiply(
    finalMatrix,
    sMatrix,
    new Cesium.Matrix3()
  );
  let quaternion1 = Cesium.Quaternion.fromRotationMatrix(finalMatrix1);
  let hpr = Cesium.HeadingPitchRoll.fromQuaternion(quaternion1);
  let q2 = Cesium.Transforms.headingPitchRollQuaternion(positionEcf, hpr);
  return q2;
}
