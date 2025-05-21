class CustomLayer {
  constructor(options) {
    this.id = "TestLayer"; //图层id
    this.type = "custom"; //写死，必须为该值
    this.renderingMode = "3d"; //2d 或3d
  }
  // method called when the layer is added to the map
  // https://docs.mapbox.com/mapbox-gl-js/api/#styleimageinterface#onadd
  onAdd(map, gl) {
    //定义三个点坐标，每个点都是 经度 纬度 高度
    const coors = [
    //   25.004, 60.239, 0, 13.403, 52.562, 1000, 30.498, 50.541, 2000,
    94.9674, 29.6441,0,  96.9674, 28.6441, 1000, 94.9674, 27.6441, 2000,
    ];
    //定义着色器代码
    const vs = `#version 300 es
            uniform mat4 u_matrix;
            layout(location=0) in vec3 a_pos;
            void main() {
                gl_Position = u_matrix * vec4(a_pos, 1.0);
            }`;
    const fs = `#version 300 es
            precision highp float;
            out vec4 outColor;
            void main() {
                outColor = vec4(1.0, 0.0, 0.0, 0.5);
            }`;

    //创建着色器
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vs);
    gl.compileShader(vertexShader);
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fs);
    gl.compileShader(fragmentShader);
    //创建program并link着色器
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    //将三角形经纬度点转墨卡托投影，mapboxgl提供了墨卡托坐标转webgl裁剪坐标系的转换矩阵
    const positions = new Float32Array(coors.length);
    for (let i = 0; i < coors.length; i = i + 3) {
      const mkt_coor = mapboxgl.MercatorCoordinate.fromLngLat(
        {
          lng: coors[i],
          lat: coors[i + 1],
        },
        coors[i + 2]
      );
      positions[i] = mkt_coor.x;
      positions[i + 1] = mkt_coor.y;
      positions[i + 2] = mkt_coor.z;
    }
    //创建vao对象绑定顶点
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    //创建buffer
    let buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    //绑定结束记得一定要设置 null，释放资源，不然地图出不来
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
  }
  render(gl, matrix) {
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.program, "u_matrix"),
      false,
      matrix
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
    gl.bindVertexArray(null);
  }
  onRemove(map, gl) {
    /*
            根据实际情况将定义的webgl对象删掉，以下为回收资源的webgl api
            gl.deleteBuffer()
            gl.deleteFramebuffer()
            gl.deleteProgram()
            gl.deleteRenderbuffer()
            gl.deleteShader()
            gl.deleteTexture()
        */
    gl.deleteProgram(this.program);
  }
}

export default CustomLayer;
