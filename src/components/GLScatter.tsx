import React, { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { filteredIndicesAtom } from "../stores/astroStore";

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
  const filteredIndices = useAtomValue(filteredIndicesAtom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = React.useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [lastMousePos, setLastMousePos] = React.useState({ x: 0, y: 0 });

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
    uniform vec2 uOffset;
    uniform float uScale;
    out vec3 vColor;
    void main() {
      vColor = aColor;
      gl_PointSize = ${pointSize.toFixed(1)};
      vec2 scaledPos = aPosition * uScale + uOffset;
      gl_Position = vec4(scaledPos, 0.0, 1.0);
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
      if (!gl) throw new Error("WebGL context is null");
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

    // Set uniforms
    const offsetLoc = gl.getUniformLocation(program, "uOffset");
    const scaleLoc = gl.getUniformLocation(program, "uScale");
    gl.uniform2f(offsetLoc, transform.offsetX, transform.offsetY);
    gl.uniform1f(scaleLoc, transform.scale);

    // position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // color buffer with filtering
    let colorLoc: number | null = null;
    const numPoints = positions.length / 2;
    const filteredColors = new Float32Array(numPoints * 3);
    
    const hasFilter = filteredIndices instanceof Promise || filteredIndices.size < numPoints;
    
    if (colors) {
      for (let i = 0; i < numPoints; i++) {
        const isFiltered = !(filteredIndices instanceof Promise) && 
          (filteredIndices.size === 0 || filteredIndices.has(i));
        const opacity = hasFilter && !isFiltered ? 0.1 : 1.0;
        
        filteredColors[i * 3] = colors[i * 3] * opacity;
        filteredColors[i * 3 + 1] = colors[i * 3 + 1] * opacity;
        filteredColors[i * 3 + 2] = colors[i * 3 + 2] * opacity;
      }
    } else {
      // default color white with filtering
      for (let i = 0; i < numPoints; i++) {
        const isFiltered = !(filteredIndices instanceof Promise) && 
          (filteredIndices.size === 0 || filteredIndices.has(i));
        const opacity = hasFilter && !isFiltered ? 0.1 : 1.0;
        
        filteredColors[i * 3] = opacity;
        filteredColors[i * 3 + 1] = opacity;
        filteredColors[i * 3 + 2] = opacity;
      }
    }
    
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, filteredColors, gl.STATIC_DRAW);
    colorLoc = gl.getAttribLocation(program, "aColor");
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, positions.length / 2);
  }, [positions, colors, pointSize, transform, filteredIndices]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height * 2 - 1);

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, transform.scale * scaleFactor));

    const scaleRatio = newScale / transform.scale;
    const newOffsetX = transform.offsetX + mouseX * (1 - scaleRatio);
    const newOffsetY = transform.offsetY + mouseY * (1 - scaleRatio);

    setTransform({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const deltaX = (e.clientX - lastMousePos.x) / rect.width * 2;
    const deltaY = -(e.clientY - lastMousePos.y) / rect.height * 2;

    setTransform(prev => ({
      ...prev,
      offsetX: prev.offsetX + deltaX,
      offsetY: prev.offsetY + deltaY,
    }));

    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <canvas
      ref={canvasRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ width: "100%", height: "100%", display: "block", cursor: isDragging ? "grabbing" : "grab" }}
    />
  );
};
