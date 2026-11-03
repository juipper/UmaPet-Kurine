import * as THREE from 'three';

const gradientCache = new Map();

/**
 * 生成卡通渲染使用的分级色阶贴图。
 * @param {number} steps 色阶数量（2~5 之间效果最好）
 */
export function toonGradient(steps = 3) {
  const key = String(steps);
  if (gradientCache.has(key)) return gradientCache.get(key);

  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i += 1) {
    data[i] = Math.round(((i + 1) / steps) * 255);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientCache.set(key, texture);
  return texture;
}

/**
 * 创建卡通材质。
 */
export function toonColor(color, options = {}) {
  const {
    steps = 3,
    emissive = 0x000000,
    emissiveIntensity = 1,
    side = THREE.FrontSide,
    transparent = false,
    opacity = 1,
    map = null,
    depthWrite = true
  } = options;

  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradient(steps),
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
    side,
    transparent,
    opacity,
    map,
    depthWrite
  });
  return material;
}

/**
 * 创建标准 PBR 材质（用于金属扣、眼睛高光等需要反光的部件）。
 */
export function glossyColor(color, options = {}) {
  const { roughness = 0.35, metalness = 0.0, emissive = 0x000000, transparent = false, opacity = 1 } = options;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
    emissive: new THREE.Color(emissive),
    transparent,
    opacity
  });
}

const outlineCache = new Map();

function outlineMaterial(thickness, color) {
  const key = `${thickness}_${color}`;
  if (outlineCache.has(key)) return outlineCache.get(key);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 expanded = position + normal * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: true
  });
  outlineCache.set(key, material);
  return material;
}

/**
 * 给网格挂一层描边壳，形成赛璐璐勾线。
 */
export function withOutline(mesh, thickness = 0.014, color = 0x2b2136) {
  if (!mesh || !mesh.geometry) return mesh;
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  shell.name = `${mesh.name || 'part'}_outline`;
  shell.raycast = () => {};
  shell.renderOrder = -1;
  mesh.add(shell);
  return mesh;
}

/**
 * 球体快速构造，减少样板代码。
 */
export function sphere(radius, material, segments = 40) {
  const geo = new THREE.SphereGeometry(radius, segments, Math.max(16, Math.round(segments * 0.7)));
  return new THREE.Mesh(geo, material);
}

/**
 * 胶囊体（用于四肢），three 的 CapsuleGeometry 原点在中心。
 */
export function capsule(radius, length, material, capSegments = 12, radialSegments = 24) {
  const geo = new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
  return new THREE.Mesh(geo, material);
}

/**
 * 圆角圆柱（近似圆角盒的替代，供裙子、帽檐使用）。
 */
export function tapered(radiusTop, radiusBottom, height, material, radialSegments = 48, openEnded = false) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, 1, openEnded);
  return new THREE.Mesh(geo, material);
}

/**
 * 把网格整体做一次非等比缩放（会同步调整描边厚度观感）。
 */
export function scaleMesh(mesh, x, y, z) {
  mesh.scale.set(x, y, z);
  return mesh;
}

/**
 * 沿曲线生成一条渐细发丝/尾毛。
 */
export function strand(points, radiusStart, radiusEnd, material, radialSegments = 10, tubularSegments = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const pos = geo.attributes.position;
  const normals = geo.attributes.normal;
  const uvs = geo.attributes.uv;
  const v3 = new THREE.Vector3();
  const center = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 1) {
    const t = uvs.getX(i);
    const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, t);
    const curvePoint = curve.getPointAt(Math.min(1, Math.max(0, t)));
    // TubeGeometry 的顶点按环分布，用 uv.x 找中心点后沿法线偏移
    center.copy(curvePoint);
    v3.fromBufferAttribute(pos, i).sub(center).multiplyScalar(radius).add(center);
    pos.setXYZ(i, v3.x, v3.y, v3.z);
  }
  pos.needsUpdate = true;
  normals.needsUpdate = true;
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
