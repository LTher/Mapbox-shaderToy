class CustomLayer {
    constructor(options = {}) {
      this.id = options.id || "BoxLayer"; // 图层 ID
      this.type = "custom"; // 固定值
      this.renderingMode = "3d"; // 3D 渲染模式
  
      // 默认 Box 参数（minLngLat, maxLngLat, minHeight, maxHeight）
      this.box = options.box || {
        minLng: 94.9674, minLat: 27.6441, minHeight: 0,
        maxLng: 96.9674, maxLat: 29.6441, maxHeight: 20000,
      };
  
      // 默认顶点着色器（支持光照计算）
      this.vertexShader = options.vertexShader || `#version 300 es
        uniform mat4 u_matrix;
        layout(location=0) in vec3 a_pos;
        out vec3 v_pos;
        void main() {
          v_pos = a_pos;
          gl_Position = u_matrix * vec4(a_pos, 1.0);
        }`;
  
      // 默认片段着色器（带简单光照）
      this.fragmentShader = options.fragmentShader || `#version 300 es
        precision highp float;
        in vec3 v_pos;
        out vec4 outColor;
        uniform vec3 u_color;
        void main() {
          // 简单光照计算（基于法线）
          float light = max(0.0, dot(normalize(v_pos), vec3(0.0, 0.0, 1.0)));
          outColor = vec4(u_color * (0.7 + 0.3 * light), 1.0);
        }`;
  
      // 默认颜色（可传入自定义）
      this.uniforms = options.uniforms || {
        u_color: [0.5, 0.5, 1.0], // 盒子颜色（RGB）
      };
    }
  
    onAdd(map, gl) {
      this.gl = gl;
  
      // 创建 Shader 和 Program
      const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, this.vertexShader);
      const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShader);
      this.program = this.createProgram(gl, vertexShader, fragmentShader);
  
      // 生成 Box 的顶点数据（8 个顶点）
      const { minLng, minLat, minHeight, maxLng, maxLat, maxHeight } = this.box;
      const corners = [
        [minLng, minLat, minHeight], // 0: 左前下
        [maxLng, minLat, minHeight], // 1: 右前下
        [maxLng, maxLat, minHeight], // 2: 右后下
        [minLng, maxLat, minHeight], // 3: 左后下
        [minLng, minLat, maxHeight], // 4: 左前上
        [maxLng, minLat, maxHeight], // 5: 右前上
        [maxLng, maxLat, maxHeight], // 6: 右后上
        [minLng, maxLat, maxHeight], // 7: 左后上
      ];
  
      // 转换为墨卡托坐标（WebGL 可用）
      const positions = [];
      corners.forEach(corner => {
        const mkt = mapboxgl.MercatorCoordinate.fromLngLat(
          { lng: corner[0], lat: corner[1] },
          corner[2]
        );
        positions.push(mkt.x, mkt.y, mkt.z);
      });
  
      // 定义 Box 的三角形索引（12 个三角形，共 36 个索引）
      const indices = new Uint16Array([
        // 底面
        0, 1, 2, 0, 2, 3,
        // 顶面
        4, 5, 6, 4, 6, 7,
        // 前面
        0, 1, 5, 0, 5, 4,
        // 后面
        3, 2, 6, 3, 6, 7,
        // 左面
        0, 3, 7, 0, 7, 4,
        // 右面
        1, 2, 6, 1, 6, 5,
      ]);
  
      // 创建 VAO 和 VBO
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
  
      // 顶点 Buffer
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  
      // 索引 Buffer
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  
      // 清理
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
  
      // 获取 Uniform 位置
      this.uniformLocations = {
        u_matrix: gl.getUniformLocation(this.program, "u_matrix"),
        u_color: gl.getUniformLocation(this.program, "u_color"),
      };
    }
  
    render(gl, matrix) {
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
  
      // 设置 Uniform
      gl.uniformMatrix4fv(this.uniformLocations.u_matrix, false, matrix);
      gl.uniform3fv(this.uniformLocations.u_color, this.uniforms.u_color);
  
      // 启用深度测试（3D 盒子需要）
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
  
      // 绘制盒子（36 个顶点）
      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  
      // 清理
      gl.bindVertexArray(null);
    }
  
    onRemove(map, gl) {
      gl.deleteProgram(this.program);
      gl.deleteVertexArray(this.vao);
      gl.deleteBuffer(this.indexBuffer);
    }
  
    // Helper: 创建 Shader
    createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }
  
    // Helper: 创建 Program
    createProgram(gl, vertexShader, fragmentShader) {
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      return program;
    }
  }
  
  export default CustomLayer;