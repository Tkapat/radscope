import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { SkyMapBody, SkyPath } from '../types/telescope';
import { THEME } from '../styles/theme';

interface SkyMap3DProps {
  bodies: SkyMapBody[];
  targetPath?: SkyPath;
  trackedTrail?: Array<{ az: number; el: number; time: number }>;
  width?: number | string;
  height?: number | string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const DOME_R = 5;

const BODY_COLORS: Record<string, string> = {
  solar: THEME.orange,
  planet: THEME.amber,
  moon: THEME.moonWhite,
  satellite: THEME.green,
  dso: THEME.purple,
  custom: THEME.pink,
};

function azElToVec3(az: number, el: number, r: number): THREE.Vector3 {
  const phi = (90 - el) * Math.PI / 180;
  const theta = (az - 90) * Math.PI / 180;
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = -r * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

function makeTextSprite(text: string, color: string, fontSize: number = 48): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${fontSize}px JetBrains Mono, Fira Code, monospace`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.4;
  canvas.width = Math.ceil(textWidth + 20);
  canvas.height = Math.ceil(textHeight + 10);
  ctx.font = `bold ${fontSize}px JetBrains Mono, Fira Code, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  const scale = 0.4;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

const SkyMap3D: React.FC<SkyMap3DProps> = ({
  bodies,
  targetPath,
  trackedTrail,
  width = 520,
  height = 500,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const sphericalRef = useRef({ theta: -0.4, phi: 0.82, r: 5.8 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const bodyMeshGroupRef = useRef<THREE.Group>(new THREE.Group());
  const pathGroupRef = useRef<THREE.Group>(new THREE.Group());
  const trailGroupRef = useRef<THREE.Group>(new THREE.Group());
  const bodyMeshesRef = useRef<THREE.Mesh[]>([]);
  const bodyDataRef = useRef<SkyMapBody[]>([]);
  const targetMeshesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());

  const [hoveredBody, setHoveredBody] = useState<SkyMapBody | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Scene initialization
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const w = container.clientWidth;
    const h = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(new THREE.Color(THEME.bg0));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 1. Ground disk
    const groundGeo = new THREE.CircleGeometry(DOME_R, 80);
    const groundMat = new THREE.MeshBasicMaterial({ color: '#090e1f', side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // 2. Horizon ring
    const horizonPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      horizonPoints.push(new THREE.Vector3(
        DOME_R * Math.cos(angle),
        0.01,
        DOME_R * Math.sin(angle)
      ));
    }
    const horizonGeo = new THREE.BufferGeometry().setFromPoints(horizonPoints);
    const horizonMat = new THREE.LineBasicMaterial({ color: '#1e3a6e' });
    const horizonLine = new THREE.LineLoop(horizonGeo, horizonMat);
    scene.add(horizonLine);

    // 3. Dome shell
    const domeGeo = new THREE.SphereGeometry(DOME_R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshBasicMaterial({
      color: '#04080f',
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.95,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    scene.add(dome);

    // 4. Dome wireframe
    const domeWireGeo = new THREE.SphereGeometry(DOME_R * 0.998, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const wireframeGeo = new THREE.WireframeGeometry(domeWireGeo);
    const wireframeMat = new THREE.LineBasicMaterial({ color: '#0d1a30', transparent: true, opacity: 0.28 });
    const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
    scene.add(wireframe);

    // 5. Altitude rings at 30° and 60°
    [30, 60].forEach((alt) => {
      const ringR = DOME_R * Math.cos(alt * Math.PI / 180);
      const ringY = DOME_R * Math.sin(alt * Math.PI / 180);
      const ringPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(
          ringR * Math.cos(angle),
          ringY,
          ringR * Math.sin(angle)
        ));
      }
      const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
      const ringMat = new THREE.LineBasicMaterial({ color: '#14274a', transparent: true, opacity: 0.5 });
      const ring = new THREE.LineLoop(ringGeo, ringMat);
      scene.add(ring);

      // Altitude label
      const altLabel = makeTextSprite(`${alt}°`, '#4a5580', 36);
      altLabel.position.set(ringR + 0.3, ringY, 0);
      scene.add(altLabel);
    });

    // 6. Cardinal lines
    const cardinalDirs = [
      { label: 'N', az: 0 },
      { label: 'E', az: 90 },
      { label: 'S', az: 180 },
      { label: 'W', az: 270 },
    ];
    cardinalDirs.forEach(({ az }) => {
      const theta = (az - 90) * Math.PI / 180;
      const x = DOME_R * Math.cos(theta);
      const z = -DOME_R * Math.sin(theta);
      const linePts = [new THREE.Vector3(0, 0.005, 0), new THREE.Vector3(x, 0.005, z)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({ color: '#111e38' });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
    });

    // 7. Cardinal labels
    cardinalDirs.forEach(({ label, az }) => {
      const theta = (az - 90) * Math.PI / 180;
      const dist = DOME_R * 1.14;
      const x = dist * Math.cos(theta);
      const z = -dist * Math.sin(theta);
      const sprite = makeTextSprite(label, '#6677bb', 52);
      sprite.position.set(x, 0.15, z);
      scene.add(sprite);
    });

    // 8. Zenith dot
    const zenithGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const zenithMat = new THREE.MeshBasicMaterial({ color: THEME.accent });
    const zenith = new THREE.Mesh(zenithGeo, zenithMat);
    zenith.position.set(0, DOME_R * 0.98, 0);
    scene.add(zenith);

    // 9. Observer marker
    const obsGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.15, 8);
    const obsMat = new THREE.MeshBasicMaterial({ color: THEME.accent });
    const observer = new THREE.Mesh(obsGeo, obsMat);
    observer.position.set(0, 0.075, 0);
    scene.add(observer);

    // 10. Star field
    const starPositions: number[] = [];
    for (let i = 0; i < 400; i++) {
      const u = Math.random();
      const v = Math.random();
      const starTheta = u * Math.PI * 2;
      const starPhi = Math.acos(1 - v); // 0 to PI/2 for upper hemisphere
      if (starPhi > Math.PI / 2) continue;
      const sr = DOME_R * 0.95 * (0.7 + Math.random() * 0.3);
      starPositions.push(
        sr * Math.sin(starPhi) * Math.cos(starTheta),
        sr * Math.cos(starPhi),
        sr * Math.sin(starPhi) * Math.sin(starTheta)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#8899cc',
      size: 0.016,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Add body and path groups
    scene.add(bodyMeshGroupRef.current);
    scene.add(pathGroupRef.current);
    scene.add(trailGroupRef.current);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Update camera position from spherical
    const updateCamera = () => {
      const s = sphericalRef.current;
      camera.position.set(
        s.r * Math.sin(s.phi) * Math.cos(s.theta),
        s.r * Math.cos(s.phi),
        s.r * Math.sin(s.phi) * Math.sin(s.theta)
      );
      camera.lookAt(0, 1.0, 0);
    };
    updateCamera();

    // Mouse controls
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();

      // Raycasting
      mouseVecRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVecRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        sphericalRef.current.theta -= dx * 0.005;
        sphericalRef.current.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.01, sphericalRef.current.phi - dy * 0.005));
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        updateCamera();
      }

      // Raycast for hover
      raycasterRef.current.setFromCamera(mouseVecRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(bodyMeshesRef.current, false);
      if (intersects.length > 0) {
        const idx = bodyMeshesRef.current.indexOf(intersects[0].object as THREE.Mesh);
        if (idx >= 0 && bodyDataRef.current[idx]) {
          setHoveredBody(bodyDataRef.current[idx]);
          setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 20 });
        }
      } else {
        setHoveredBody(null);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sphericalRef.current.r = Math.max(1.8, Math.min(12, sphericalRef.current.r + e.deltaY * 0.005));
      updateCamera();
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Rotate target meshes
      targetMeshesRef.current.forEach((mesh) => {
        mesh.rotation.y += 0.01;
        mesh.rotation.x += 0.006;
      });

      updateCamera();
      renderer.render(scene, camera);
    };
    animate();

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m: THREE.Material) => m.dispose());
          } else if (obj.material) {
            (obj.material as THREE.Material).dispose();
          }
        }
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Bodies update
  useEffect(() => {
    const group = bodyMeshGroupRef.current;

    // Clear old bodies
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m: THREE.Material) => m.dispose());
        } else if (child.material) {
          (child.material as THREE.Material).dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }

    const meshes: THREE.Mesh[] = [];
    const dataArr: SkyMapBody[] = [];
    const targets: THREE.Mesh[] = [];

    bodies.forEach((body) => {
      if (body.el < -10) return;

      const pos = azElToVec3(body.az, body.el, DOME_R * 0.92);
      const color = BODY_COLORS[body.type] || THEME.textPrimary;

      // Body mesh
      let bodyMesh: THREE.Mesh;
      if (body.isTarget) {
        const geo = new THREE.OctahedronGeometry(0.1, 0);
        const mat = new THREE.MeshBasicMaterial({ color });
        bodyMesh = new THREE.Mesh(geo, mat);
        targets.push(bodyMesh);

        // Outer glow for target
        const glowGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.copy(pos);
        group.add(glow);
      } else {
        const geo = new THREE.SphereGeometry(0.08, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color });
        bodyMesh = new THREE.Mesh(geo, mat);
      }
      bodyMesh.position.copy(pos);
      group.add(bodyMesh);
      meshes.push(bodyMesh);
      dataArr.push(body);

      // Solar glow
      if (body.type === 'solar') {
        const solarGlowGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const solarGlowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
        });
        const solarGlow = new THREE.Mesh(solarGlowGeo, solarGlowMat);
        solarGlow.position.copy(pos);
        group.add(solarGlow);
      }

      // Drop-line to ground
      const groundPos = new THREE.Vector3(pos.x, 0, pos.z);
      const dropGeo = new THREE.BufferGeometry().setFromPoints([pos, groundPos]);
      const dropMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
      });
      const dropLine = new THREE.Line(dropGeo, dropMat);
      group.add(dropLine);

      // Ground projection circle
      const projPts: THREE.Vector3[] = [];
      const projR = 0.08;
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        projPts.push(new THREE.Vector3(
          pos.x + projR * Math.cos(angle),
          0.01,
          pos.z + projR * Math.sin(angle)
        ));
      }
      const projGeo = new THREE.BufferGeometry().setFromPoints(projPts);
      const projMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
      const projCircle = new THREE.LineLoop(projGeo, projMat);
      group.add(projCircle);

      // Name label
      const label = makeTextSprite(body.name, color, 32);
      label.position.set(pos.x, pos.y + 0.2, pos.z);
      group.add(label);
    });

    bodyMeshesRef.current = meshes;
    bodyDataRef.current = dataArr;
    targetMeshesRef.current = targets;
  }, [bodies]);

  // Path update
  useEffect(() => {
    const group = pathGroupRef.current;

    // Clear old path
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m: THREE.Material) => m.dispose());
        } else if (child.material) {
          (child.material as THREE.Material).dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }

    if (!targetPath || targetPath.points.length < 2) return;

    // Split into above-horizon and below-horizon segments
    const abovePoints: THREE.Vector3[] = [];
    const belowPoints: THREE.Vector3[] = [];
    const groundProjPoints: THREE.Vector3[] = [];

    let riseIndex = -1;
    let setIndex = -1;
    let maxElIndex = 0;
    let maxEl = -Infinity;

    targetPath.points.forEach((pt, i) => {
      const pos = azElToVec3(pt.az, pt.el, DOME_R * 0.92);
      if (pt.el >= 0) {
        abovePoints.push(pos);
        groundProjPoints.push(new THREE.Vector3(pos.x, 0.02, pos.z));
      } else {
        belowPoints.push(pos);
      }

      // Track transitions
      if (i > 0) {
        const prev = targetPath.points[i - 1];
        if (prev.el < 0 && pt.el >= 0 && riseIndex === -1) {
          riseIndex = i;
        }
        if (prev.el >= 0 && pt.el < 0) {
          setIndex = i - 1;
        }
      }

      if (pt.el > maxEl) {
        maxEl = pt.el;
        maxElIndex = i;
      }
    });

    // Above-horizon line
    if (abovePoints.length > 1) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(abovePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: THEME.accent,
        transparent: true,
        opacity: 0.7,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
    }

    // Below-horizon line
    if (belowPoints.length > 1) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(belowPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: THEME.accent,
        transparent: true,
        opacity: 0.18,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
    }

    // Ground arc projection
    if (groundProjPoints.length > 1) {
      const groundGeo = new THREE.BufferGeometry().setFromPoints(groundProjPoints);
      const groundMat = new THREE.LineBasicMaterial({
        color: THEME.accent,
        transparent: true,
        opacity: 0.15,
      });
      const groundLine = new THREE.Line(groundGeo, groundMat);
      group.add(groundLine);
    }

    // Rise label
    if (riseIndex >= 0) {
      const pt = targetPath.points[riseIndex];
      const pos = azElToVec3(pt.az, 0, DOME_R * 0.92);
      const riseLabel = makeTextSprite('Rise', THEME.green, 32);
      riseLabel.position.set(pos.x, 0.3, pos.z);
      group.add(riseLabel);
    }

    // Set label
    if (setIndex >= 0) {
      const pt = targetPath.points[setIndex];
      const pos = azElToVec3(pt.az, 0, DOME_R * 0.92);
      const setLabel = makeTextSprite('Set', THEME.orange, 32);
      setLabel.position.set(pos.x, 0.3, pos.z);
      group.add(setLabel);
    }

    // Transit label
    if (maxElIndex >= 0 && maxEl > 0) {
      const pt = targetPath.points[maxElIndex];
      const pos = azElToVec3(pt.az, pt.el, DOME_R * 0.92);
      const transitLabel = makeTextSprite('Transit', THEME.accent, 32);
      transitLabel.position.set(pos.x, pos.y + 0.25, pos.z);
      group.add(transitLabel);
    }
  }, [targetPath]);

  // Trail update
  useEffect(() => {
    const group = trailGroupRef.current;
    
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m: THREE.Material) => m.dispose());
        } else if (child.material) {
          (child.material as THREE.Material).dispose();
        }
      }
    }

    if (!trackedTrail || trackedTrail.length < 2) return;

    // We can draw a simple line for the trail
    const points: THREE.Vector3[] = [];
    trackedTrail.forEach(pt => {
      // Only draw above horizon or slightly below
      if (pt.el >= -5) {
        points.push(azElToVec3(pt.az, pt.el, DOME_R * 0.92));
      }
    });

    if (points.length > 1) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: THEME.danger, // Or maybe a distinct color like red/pink
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);
    }
  }, [trackedTrail]);

  const setView = useCallback((mode: 'dome' | 'top' | 'reset') => {
    if (mode === 'top') {
      sphericalRef.current = { theta: 0, phi: 0.06, r: 8 };
    } else {
      sphericalRef.current = { theta: -0.4, phi: 0.82, r: 5.8 };
    }
    // Force an update to the camera immediately so it doesn't wait for a mouse move or animation frame if we want it snappy, but animation frame handles it.
  }, []);

  const exportPNG = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'skymap.png';
    a.click();
  }, []);

  const legendItems = [
    { label: 'Solar', color: THEME.orange },
    { label: 'Planet', color: THEME.amber },
    { label: 'Moon', color: THEME.moonWhite },
    { label: 'Satellite', color: THEME.green },
    { label: 'DSO', color: THEME.purple },
    { label: 'Custom', color: THEME.pink },
  ];

  const btnStyle: React.CSSProperties = {
    background: THEME.bg1,
    color: THEME.textMuted,
    border: `1px solid ${THEME.border}`,
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: THEME.font,
    fontSize: 11,
    transition: 'all 0.15s',
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width,
        height,
        background: THEME.bg0,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${THEME.border}`,
      }}
    >
      {/* Top-left: coordinate readout */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(6,7,15,0.85)',
          borderRadius: 6,
          padding: '6px 10px',
          fontFamily: THEME.font,
          fontSize: 11,
          color: THEME.textMuted,
          pointerEvents: 'none',
          minWidth: 120,
        }}
      >
        {hoveredBody ? (
          <>
            <span style={{ color: BODY_COLORS[hoveredBody.type] || THEME.textPrimary, fontWeight: 700 }}>
              {hoveredBody.name}
            </span>
            <br />
            <span>Az {hoveredBody.az.toFixed(1)}° El {hoveredBody.el.toFixed(1)}°</span>
          </>
        ) : (
          <span style={{ color: THEME.textDim }}>Hover a body</span>
        )}
      </div>

      {/* Top-right: legend */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'rgba(6,7,15,0.85)',
          borderRadius: 6,
          padding: '6px 10px',
          fontFamily: THEME.font,
          fontSize: 10,
          pointerEvents: 'none',
        }}
      >
        {legendItems.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.color,
                marginRight: 6,
                flexShrink: 0,
              }}
            />
            <span style={{ color: THEME.textMuted }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredBody && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 20,
            background: 'rgba(6,7,15,0.92)',
            border: `1px solid ${THEME.border}`,
            borderRadius: 4,
            padding: '4px 8px',
            fontFamily: THEME.font,
            fontSize: 11,
            color: THEME.textPrimary,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: BODY_COLORS[hoveredBody.type] || THEME.textPrimary, fontWeight: 700 }}>
            {hoveredBody.name}
          </span>{' '}
          Az {hoveredBody.az.toFixed(2)}° El {hoveredBody.el.toFixed(2)}°
        </div>
      )}

      {/* Bottom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          gap: 6,
        }}
      >
        <button style={btnStyle} onClick={() => setView('dome')}>Dome view</button>
        <button style={btnStyle} onClick={() => setView('top')}>Top down</button>
        <button style={btnStyle} onClick={() => setView('reset')}>Reset</button>
        <button style={btnStyle} onClick={onToggleFullscreen}>
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button style={{ ...btnStyle, color: THEME.accent, borderColor: THEME.accent }} onClick={exportPNG}>
          Export PNG
        </button>
      </div>
    </div>
  );
};

export default SkyMap3D;
