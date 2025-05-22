class ComputeLayer {
  constructor(options = {}) {
    this.id = options.id || "ComputeLayer"; // 图层 ID
    this.type = "custom"; // 固定值
    this.renderingMode = "3d"; // 3D 渲染模式

    this.texR = options.texR;

    // 默认顶点着色器（简单全屏四边形）
    this.vertexShader =
      options.vertexShader ||
      `#version 300 es
      in vec2 a_position;
      out vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

    // 默认片段着色器（输出到纹理）
    this.fragmentShader =
      options.fragmentShader ||
      `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      uniform sampler2D u_inputTexture;
      out vec4 outColor;
      
      // 自定义uniforms将通过字符串替换插入到这里
      /* CUSTOM_UNIFORMS */
      
      void main() {
        // 默认输出输入纹理（可以被自定义处理覆盖）
        outColor = texture(u_inputTexture, v_texCoord);
        
        // 自定义uniforms处理可以通过字符串替换插入到这里
        /* CUSTOM_UNIFORM_PROCESSING */
      }`;

    // 默认uniforms
    this.uniforms = {
      // 合并自定义uniforms
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

    // 输出纹理（由外部传入）
    this.outputTexture = options.outputTexture || null;
    // 帧缓冲区对象
    this.fbo = null;
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

    // 创建全屏四边形顶点数据
    const positions = new Float32Array([
      -1.0,
      -1.0, // 左下
      1.0,
      -1.0, // 右下
      -1.0,
      1.0, // 左上
      1.0,
      1.0, // 右上
    ]);

    // 创建VAO和VBO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // 顶点Buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.glResources.positionBuffer = positionBuffer;

    // 清理
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // 初始化uniform locations
    this.uniformLocations = {};
    this.initUniformLocations(gl);

    // 检查输入纹理是否有效
    // if (!this.uniforms.u_inputTexture) {
    //   console.warn("Input texture not provided to ComputeLayer");
    // }

    // 创建帧缓冲区对象
    this.fbo = gl.createFramebuffer();
  }

  // 初始化所有uniform locations
  initUniformLocations(gl) {
    // this.uniformLocations.u_resolution = gl.getUniformLocation(
    //   this.program,
    //   "u_resolution"
    // );

    // 自定义uniforms
    for (const name in this.uniforms) {
      if (!this.uniformLocations[name]) {
        this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
      }
    }
  }

  // 设置uniform值
  setUniform(name, value) {
    if (this.uniforms.hasOwnProperty(name)) {
      this.uniforms[name] = value;

      // 如果是输入纹理，直接更新
      if (name === "u_inputTexture" && value instanceof WebGLTexture) {
        this.map.triggerRepaint();
      }

      this.map?.triggerRepaint();
      return true;
    }
    return false;
  }

  // 设置输出纹理
  setOutputTexture(texture) {
    this.outputTexture = texture;
    if (this.map) {
      this.map.triggerRepaint();
    }
  }

  render(gl, matrix) {
    if (!this.outputTexture) {
      console.warn("No output texture set for ComputeLayer");
      return;
    }
    // 绑定帧缓冲区到输出纹理
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0
    );

    // 设置视口大小匹配纹理尺寸
    // const textureSize = this.getTextureSize(gl, this.outputTexture);
    const textureSize = this.texR;
    gl.viewport(0, 0, textureSize.width, textureSize.height);

    // 使用我们的计算着色器程序
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

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

    // // 设置内置uniforms
    // gl.uniform2fv(this.uniformLocations.u_resolution, [
    //   textureSize.width,
    //   textureSize.height,
    // ]);

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

    // 禁用深度测试（对于全屏四边形不需要）
    gl.disable(gl.DEPTH_TEST);

    // 绘制全屏四边形
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 清理
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // 获取纹理尺寸
  getTextureSize(gl, texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const width = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_WIDTH);
    const height = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_HEIGHT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { width, height };
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

    // 删除帧缓冲区对象（但不删除输出纹理，因为它由外部管理）
    if (this.fbo) {
      gl.deleteFramebuffer(this.fbo);
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

export default ComputeLayer;
