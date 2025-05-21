class GPGPUComputeLayer {
  constructor(options = {}) {
    this.id = options.id || "GPGPUComputeLayer";
    this.type = "custom";
    this.renderingMode = "3d";

    // 着色器配置
    this.vertexShader =
      options.vertexShader ||
      `#version 300 es
        in vec2 a_position;
        out vec2 v_texCoord;
        void main() {
          v_texCoord = a_position * 0.5 + 0.5; // 转换为 [0,1] 纹理坐标
          gl_Position = vec4(a_position, 0.0, 1.0);
        }`;

    this.fragmentShader = options.fragmentShader; // 必须传入

    // Uniforms 配置（支持 texture 类型）
    this.uniforms = options.uniforms || {};

    // 纹理 Uniform 配置 { name: { texture: WebGLTexture, unit: number } }
    this.textureUniforms = options.textureUniforms || {};

    // 输出纹理配置
    this.textureOptions = {
      width: options.textureWidth || 512,
      height: options.textureHeight || 512,
      format: options.textureFormat || gl.RGBA,
      type: options.textureType || gl.FLOAT,
      ...options.textureOptions,
    };
  }

  onAdd(map, gl) {
    this.gl = gl;
    this.map = map;

    // 创建着色器程序
    const vs = this.createShader(gl, gl.VERTEX_SHADER, this.vertexShader);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShader);
    this.program = this.createProgram(gl, vs, fs);

    // 创建全屏四边形
    this.createFullscreenQuad(gl);

    // 创建 FBO 和输出纹理
    this.setupFramebuffer(gl);

    // 初始化 Uniform 位置
    this.initUniforms(gl);
  }

  initUniforms(gl) {
    gl.useProgram(this.program);
    this.uniformLocations = {};

    // 标准 Uniforms
    for (const name in this.uniforms) {
      this.uniformLocations[name] = gl.getUniformLocation(this.program, name);
    }

    // 纹理 Uniforms
    this.textureUnits = {};
    let textureUnit = 0;
    for (const name in this.textureUniforms) {
      const uniformInfo = this.textureUniforms[name];
      this.uniformLocations[name] = gl.getUniformLocation(this.program, name);

      // 分配纹理单元
      this.textureUnits[name] = textureUnit;
      gl.uniform1i(this.uniformLocations[name], textureUnit);
      textureUnit++;
    }
  }

  createFullscreenQuad(gl) {
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  setupFramebuffer(gl) {
    // 创建输出纹理
    this.outputTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.textureOptions.format,
      this.textureOptions.width,
      this.textureOptions.height,
      0,
      this.textureOptions.format,
      this.textureOptions.type,
      null
    );

    // 创建 FBO
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(gl, matrix) {
    // 绑定到 FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.textureOptions.width, this.textureOptions.height);

    // 清除缓冲区
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 使用着色器
    gl.useProgram(this.program);
    gl.bindVertexArray(this.quadVAO);

    // 绑定纹理 Uniforms
    for (const name in this.textureUniforms) {
      const { texture } = this.textureUniforms[name];
      const unit = this.textureUnits[name];

      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }

    // 设置标准 Uniforms
    for (const [name, value] of Object.entries(this.uniforms)) {
      this.setUniform(gl, name, value);
    }

    // 绘制
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 清理状态
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 恢复视口
    const canvas = gl.canvas;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  setUniform(gl, name, value) {
    const location = this.uniformLocations[name];
    if (location === null) return;

    if (typeof value === "number") {
      gl.uniform1f(location, value);
    } else if (value.length === 2) {
      gl.uniform2fv(location, value);
    } else if (value.length === 3) {
      gl.uniform3fv(location, value);
    } else if (value.length === 4) {
      gl.uniform4fv(location, value);
    } else if (value.length === 9) {
      gl.uniformMatrix3fv(location, false, value);
    } else if (value.length === 16) {
      gl.uniformMatrix4fv(location, false, value);
    }
  }

  // 添加/更新纹理 Uniform
  setTextureUniform(name, texture, unit = null) {
    if (!this.textureUniforms[name]) {
      if (unit === null) {
        // 自动分配新单元
        unit = Object.keys(this.textureUniforms).length;
      }
      this.textureUniforms[name] = { texture, unit };
    } else {
      this.textureUniforms[name].texture = texture;
      if (unit !== null) this.textureUniforms[name].unit = unit;
    }
  }

  getOutputTexture() {
    return this.outputTexture;
  }

  onRemove(map, gl) {
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.quadVAO);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.outputTexture);
  }

  createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`Shader error: ${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  createProgram(gl, vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Program error: ${gl.getProgramInfoLog(program)}`);
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }
}

export default GPGPUComputeLayer;
