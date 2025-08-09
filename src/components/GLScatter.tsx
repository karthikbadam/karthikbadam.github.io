import React, { useEffect, useRef } from "react";

interface GLScatterProps {
  positions: Float32Array; // [x0,y0,x1,y1,...] in clip space [-1,1]
  colors?: Float32Array; // [r,g,b,r,g,b,...]
  pointSize?: number;
}

export const GLScatter: React.FC<GLScatterProps> = ({
  positions,
  colors,
  pointSize = 2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;

    // Resize canvas to device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const vertexSrc = `#version 300 es
    in vec2 aPosition;
    in vec3 aColor;
    out vec3 vColor;
    void main() {
      vColor = aColor;
      gl_PointSize = ${pointSize.toFixed(1)};
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
    `;
    const fragmentSrc = `#version 300 es
    precision mediump float;
    in vec3 vColor;
    out vec4 outColor;
    void main() {
      outColor = vec4(vColor, 1.0);
    }
    `;

    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("createShader failed");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "shader error");
      }
      return shader;
    }

    const program = gl.createProgram();
    if (!program) return;
    const vs = compile(gl.VERTEX_SHADER, vertexSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSrc);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // color buffer
    let colorLoc: number | null = null;
    if (colors) {
      const colorBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
      colorLoc = gl.getAttribLocation(program, "aColor");
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    } else {
      // default color white
      const colorBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      const defaultColors = new Float32Array(positions.length / 2 * 3).fill(1);
      gl.bufferData(gl.ARRAY_BUFFER, defaultColors, gl.STATIC_DRAW);
      colorLoc = gl.getAttribLocation(program, "aColor");
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, positions.length / 2);
  }, [positions, colors, pointSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
};
export default GLScatter;
