class CustomLayer {
  constructor(options = {}) {
    this.id = options.id || "BoxLayer"; // 图层 ID
    this.type = "custom"; // 固定值
    this.renderingMode = "3d"; // 3D 渲染模式

    // 默认 Box 参数（minLngLat, maxLngLat, minHeight, maxHeight）
    this.box = options.box || {
      minLng: 94.9674,
      minLat: 27.6441,
      minHeight: 0,
      maxLng: 96.9674,
      maxLat: 29.6441,
      maxHeight: 2000,
    };

    // 默认顶点着色器（支持自定义attributes和uniforms）
    this.vertexShader =
      options.vertexShader ||
      `#version 300 es
      uniform mat4 u_matrix;
      layout(location=0) in vec3 a_pos;
      layout(location=1) in vec2 a_texCoord;
      out vec3 v_pos;
      out vec2 v_texCoord;
      void main() {
        v_pos = a_pos;
        v_texCoord = a_texCoord;
        gl_Position = u_matrix * vec4(a_pos, 1.0);
      }`;

    // 默认片段着色器（支持自定义uniforms）
    this.fragmentShader =
      options.fragmentShader ||
      `#version 300 es
      precision highp float;
      in vec3 v_pos;
      in vec2 v_texCoord;
      out vec4 outColor;
      
      // 内置uniforms
      uniform vec3 u_color;
      uniform bool u_useTexture;
      
      // 自定义uniforms将通过字符串替换插入到这里
      /* CUSTOM_UNIFORMS */
      
      void main() {
        // 简单光照计算
        float light = max(0.0, dot(normalize(v_pos), vec3(0.0, 0.0, 1.0)));
        vec4 baseColor = vec4(u_color * (0.7 + 0.3 * light), 1.0);
        
        // 自定义uniforms处理可以通过字符串替换插入到这里
        /* CUSTOM_UNIFORM_PROCESSING */
      }`;

    // 移除内置纹理相关参数，完全由用户自定义
    this.uniforms = {
      u_color: [0.5, 0.5, 1.0],
      ...(options.uniforms || {}),
    };
    // 处理自定义uniforms的shader代码
    if (options.customShaderCode) {
      const { uniformDeclarations, uniformProcessing } =
        options.customShaderCode;

      // 插入自定义uniform声明
      if (uniformDeclarations) {
        this.fragmentShader = this.fragmentShader.replace(
          "/* CUSTOM_UNIFORMS */",
          uniformDeclarations
        );
      }

      // 插入自定义uniform处理逻辑
      if (uniformProcessing) {
        this.fragmentShader = this.fragmentShader.replace(
          "/* CUSTOM_UNIFORM_PROCESSING */",
          uniformProcessing
        );
      }
    }

    // 纹理对象
    this.texture = null;
    // 其他WebGL资源
    this.glResources = {};
  }

  onAdd(map, gl) {
    this.gl = gl;
    this.map = map;

    // 创建Shader和Program
    const vertexShader = this.createShader(
      gl,
      gl.VERTEX_SHADER,
      this.vertexShader
    );
    const fragmentShader = this.createShader(
      gl,
      gl.FRAGMENT_SHADER,
      this.fragmentShader
    );
    this.program = this.createProgram(gl, vertexShader, fragmentShader);

    // 生成Box的顶点数据
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

    // 转换为墨卡托坐标
    const positions = [];
    corners.forEach((corner) => {
      const mkt = mapboxgl.MercatorCoordinate.fromLngLat(
        { lng: corner[0], lat: corner[1] },
        corner[2]
      );
      positions.push(mkt.x, mkt.y, mkt.z);
    });

    // 定义纹理坐标
    const texCoords = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1], // 底面
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1], // 顶面
    ];

    // 定义Box的三角形索引
    const indices = new Uint16Array([
      0,
      1,
      2,
      0,
      2,
      3, // 底面
      4,
      5,
      6,
      4,
      6,
      7, // 顶面
      0,
      1,
      5,
      0,
      5,
      4, // 前面
      3,
      2,
      6,
      3,
      6,
      7, // 后面
      0,
      3,
      7,
      0,
      7,
      4, // 左面
      1,
      2,
      6,
      1,
      6,
      5, // 右面
    ]);

    // 创建VAO和VBO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 顶点Buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.glResources.positionBuffer = positionBuffer;

    // 纹理坐标Buffer
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(texCoords.flat()),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    this.glResources.texCoordBuffer = texCoordBuffer;

    // 索引Buffer
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // 清理
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // 初始化uniform locations
    this.uniformLocations = {};
    this.initUniformLocations(gl);
  }

  // 初始化所有uniform locations
  initUniformLocations(gl) {
    // 内置uniforms
    this.uniformLocations.u_matrix = gl.getUniformLocation(
      this.program,
      "u_matrix"
    );
    this.uniformLocations.u_color = gl.getUniformLocation(
      this.program,
      "u_color"
    );

    // 自定义uniforms
    for (const name in this.uniforms) {
      if (!this.uniformLocations[name]) {
        this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
      }
    }
  }

  // 加载纹理
  loadTexture(textureUrl) {
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // 临时填充纹理
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255])
    );

    // 设置纹理参数
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 加载实际纹理图像
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = textureUrl;
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      this.map.triggerRepaint();
    };
  }

  // 设置uniform值
  setUniform(name, value) {
    if (this.uniforms.hasOwnProperty(name)) {
      this.uniforms[name] = value;
      this.map?.triggerRepaint();
      return true;
    }
    return false;
  }

  render(gl, matrix) {
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // 设置内置uniforms
    gl.uniformMatrix4fv(this.uniformLocations.u_matrix, false, matrix);
    gl.uniform3fv(this.uniformLocations.u_color, this.uniforms.u_color);

    // 设置纹理uniforms
    let textureUnit = 0;
    for (const name in this.uniforms) {
      const value = this.uniforms[name];
      if (value instanceof WebGLTexture) {
        const location = this.uniformLocations[name];
        if (location != null) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, value);
          gl.uniform1i(location, textureUnit);
          textureUnit++;
        }
      }
    }

    // 设置自定义uniforms
    for (const name in this.uniforms) {
      if (
        // name.startsWith("u_") &&
        this.uniformLocations[name] !== null &&
        this.uniformLocations[name] !== undefined
      ) {
        const value = this.uniforms[name];
        const location = this.uniformLocations[name];

        if (Array.isArray(value)) {
          switch (value.length) {
            case 2:
              gl.uniform2fv(location, value);
              break;
            case 3:
              gl.uniform3fv(location, value);
              break;
            case 4:
              gl.uniform4fv(location, value);
              break;
            default:
              gl.uniform1f(location, value[0]);
              break;
          }
        } else if (typeof value === "number") {
          if (name === "iFrame") gl.uniform1i(location, value);
          else gl.uniform1f(location, value);
        } else if (typeof value === "boolean") {
          gl.uniform1i(location, value ? 1 : 0);
        }
      }
    }
    // 启用深度测试
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // 绘制盒子
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

    // 清理
    gl.bindVertexArray(null);
  }

  onRemove(map, gl) {
    // 删除program和shaders
    if (this.program) {
      gl.deleteProgram(this.program);
    }

    // 删除VAO和VBOs
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }

    // 删除所有缓冲区和纹理
    for (const resource in this.glResources) {
      if (this.glResources[resource] instanceof WebGLBuffer) {
        gl.deleteBuffer(this.glResources[resource]);
      }
    }

    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
    }

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }
  }

  // Helper: 创建Shader
  createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(shader));
      console.error("Shader source:", source);
    }
    return shader;
  }

  // Helper: 创建Program
  createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program linking error:", gl.getProgramInfoLog(program));
    }
    return program;
  }
}

export default CustomLayer;
