import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/models/gltf/facecap.glb';

let scene, camera, renderer, controls, headMesh, headModel, clock, containerEl, mixer;
let morphTargets = {}; // name -> index mapping
let targetInfluences = {}; // name -> target value for smooth animation
let idleTime = 0;
let nextBlinkTime = 2;

export async function initScene(container) {
  containerEl = container;
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const w = container.clientWidth;
  const h = container.clientHeight;

  // Camera — pulled back to show head at ~50% screen height, centered
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(0, 0, 6.5); // will be adjusted after model loads

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  container.appendChild(renderer.domElement);

  // Subtle environment for reflections
  const environment = new RoomEnvironment(renderer);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(environment).texture;

  // Dramatic directional lighting (from previous setup)
  const ambient = new THREE.AmbientLight(0x222222);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.5);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.8);
  fillLight.position.set(-4, 2, 3);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x8899bb, 1.5);
  rimLight.position.set(0, 2, -5);
  scene.add(rimLight);

  const underLight = new THREE.PointLight(0x443322, 0.5, 100);
  underLight.position.set(0, -20, 30);
  scene.add(underLight);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0); // will be adjusted after model loads
  controls.enablePan = false;
  controls.update();

  // Load head
  await loadHead();

  // Resize
  window.addEventListener('resize', onResize);

  // Start render loop
  animate();

  return { scene, camera, renderer };
}

async function loadHead() {
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r172/examples/jsm/libs/basis/')
    .detectSupport(renderer);

  const loader = new GLTFLoader();
  loader.setKTX2Loader(ktx2Loader);
  loader.setMeshoptDecoder(MeshoptDecoder);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        headModel = gltf.scene;
        scene.add(headModel);

        // --- Head material presets (uncomment one) ---

        // Chrome robot
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0xc0c0c8,
        //   roughness: 0.1,
        //   metalness: 0.3,
        //   clearcoat: 1.0,
        //   clearcoatRoughness: 0.5,
        // });

        // // Porcelain
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0xf5efe6,
        //   roughness: 0.3,
        //   metalness: 0,
        //   clearcoat: 0.8,
        //   clearcoatRoughness: 0.2,
        // });

        // Obsidian
        const headMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x111111,
          roughness: 0.05,
          metalness: 0.1,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0
        });

        // // Hologram
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0x88ccff,
        //   transmission: 0.6,
        //   thickness: 0.5,
        //   ior: 1.5,
        //   roughness: 0.1,
        //   metalness: 0,
        // });

        // // Iridescent
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0x999999,
        //   roughness: 0.2,
        //   metalness: 0.5,
        //   iridescence: 1.0,
        //   iridescenceIOR: 1.3,
        //   clearcoat: 0.5,
        // });

        // // Blue emissive glow
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0x1a1a2e,
        //   emissive: 0x0044aa,
        //   emissiveIntensity: 0.3,
        //   roughness: 0.4,
        //   metalness: 0.1,
        //   clearcoat: 0.8,
        //   clearcoatRoughness: 0.2,
        //   transparent: true,
        //   opacity: 0.92,
        // });

        // // Matte synthetic (Westworld)
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0xb0b0b8,
        //   roughness: 0.8,
        //   metalness: 0.0,
        //   clearcoat: 0.1,
        // });

        // // Gold
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0xd4a843,
        //   roughness: 0.15,
        //   metalness: 0.9,
        //   clearcoat: 0.6,
        //   clearcoatRoughness: 0.1,
        // });

        // // Warm skin tone (realistic attempt)
        // const headMaterial = new THREE.MeshPhysicalMaterial({
        //   color: 0xD4A574,
        //   roughness: 0.7,
        //   metalness: 0.0,
        //   clearcoat: 0.1,
        //   sheen: 0.3,
        //   sheenColor: new THREE.Color(0xff9977),
        //   sheenRoughness: 0.5,
        // });

        // Obsidian eyes — dark with a glossy reflective surface
        const eyeMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x050505,
          roughness: 0.0,
          metalness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          ior: 1.8,
        });

        headModel.traverse((child) => {
          if (child.isMesh) {
            if (child.morphTargetDictionary) {
              // Head mesh
              child.material = headMaterial;
              headMesh = child;
              // Build clean name -> index mapping (strip 'blendShape1.' prefix)
              for (const [key, value] of Object.entries(child.morphTargetDictionary)) {
                const cleanName = key.replace('blendShape1.', '');
                morphTargets[cleanName] = value;
              }
            } else {
              // Eyes and teeth
              child.material = eyeMaterial;
            }
          }
        });

        if (headMesh) {
          console.log('Face morph targets:', Object.keys(morphTargets).join(', '));
          console.log('Total:', Object.keys(morphTargets).length);
        }

        // Center camera on model's bounding box
        const box = new THREE.Box3().setFromObject(headModel);
        const center = box.getCenter(new THREE.Vector3());
        console.log('Model center:', center);
        camera.position.set(center.x, center.y, 5.2);
        controls.target.copy(center);
        controls.update();


        // Play built-in animation if available
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(headModel);
        }


        resolve(headModel);
      },
      (xhr) => { console.log(`Model ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`); },
      (err) => { console.error('Model load error:', err); reject(err); }
    );
  });
}

/**
 * Set a morph target by name (0-1).
 * Smoothly interpolates in the animation loop.
 */
export function setMorph(name, value) {
  if (morphTargets[name] !== undefined) {
    targetInfluences[name] = THREE.MathUtils.clamp(value, 0, 1);
  }
}

/**
 * Drive mouth animation from audio amplitude (0-1).
 * Maps amplitude to multiple blend shapes for natural-looking speech.
 */
let isSpeaking = false;

export function setMouthOpenness(value) {
  if (value > 0.01) {
    isSpeaking = true;

    // Core jaw movement
    setMorph('jawOpen', value * 0.7);

    // Cycle through mouth shapes based on time for variety
    const t = Date.now() * 0.01;
    const cycle = Math.sin(t) * 0.5 + 0.5; // 0-1 oscillation

    // Alternate between different mouth shapes to simulate speech
    setMorph('mouthFunnel', value * 0.3 * Math.max(0, Math.sin(t * 1.1)));
    setMorph('mouthPucker', value * 0.2 * Math.max(0, Math.sin(t * 0.7)));
    setMorph('mouthStretch_L', value * 0.15 * Math.max(0, Math.sin(t * 1.3)));
    setMorph('mouthStretch_R', value * 0.15 * Math.max(0, Math.sin(t * 1.3)));
    setMorph('mouthUpperUp_L', value * 0.1 * Math.max(0, Math.sin(t * 0.9)));
    setMorph('mouthUpperUp_R', value * 0.1 * Math.max(0, Math.sin(t * 0.9)));
    setMorph('mouthLowerDown_L', value * 0.2 * Math.max(0, Math.cos(t * 1.2)));
    setMorph('mouthLowerDown_R', value * 0.2 * Math.max(0, Math.cos(t * 1.2)));
    setMorph('mouthSmile_L', value * 0.05);
    setMorph('mouthSmile_R', value * 0.05);
  } else if (isSpeaking) {
    // Reset all mouth shapes when done
    isSpeaking = false;
    setMorph('jawOpen', 0);
    setMorph('mouthFunnel', 0);
    setMorph('mouthPucker', 0);
    setMorph('mouthStretch_L', 0);
    setMorph('mouthStretch_R', 0);
    setMorph('mouthUpperUp_L', 0);
    setMorph('mouthUpperUp_R', 0);
    setMorph('mouthLowerDown_L', 0);
    setMorph('mouthLowerDown_R', 0);
    setMorph('mouthSmile_L', 0);
    setMorph('mouthSmile_R', 0);
  }
}

/**
 * Get available morph target names.
 */
export function getMorphTargets() {
  return Object.keys(morphTargets);
}


function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  idleTime += delta;

  if (mixer) mixer.update(delta);

  if (headMesh) {
    // Smooth interpolation for all morph targets
    for (const [name, targetValue] of Object.entries(targetInfluences)) {
      const index = morphTargets[name];
      if (index !== undefined) {
        const current = headMesh.morphTargetInfluences[index];
        headMesh.morphTargetInfluences[index] += (targetValue - current) * 0.3;
      }
    }

    // --- Idle behaviors ---

    // Blinking (regular + occasional double blink)
    if (idleTime > nextBlinkTime) {
      setMorph('eyeBlink_L', 1);
      setMorph('eyeBlink_R', 1);
      setTimeout(() => {
        setMorph('eyeBlink_L', 0);
        setMorph('eyeBlink_R', 0);
      }, 120);
      if (Math.random() < 0.2) {
        setTimeout(() => {
          setMorph('eyeBlink_L', 1);
          setMorph('eyeBlink_R', 1);
          setTimeout(() => {
            setMorph('eyeBlink_L', 0);
            setMorph('eyeBlink_R', 0);
          }, 100);
        }, 250);
      }
      nextBlinkTime = idleTime + 2 + Math.random() * 5;
    }

    // Eye look — both eyes move together, slow and gentle
    const lookX = Math.sin(idleTime * 0.2) * 0.35;
    const lookY = Math.sin(idleTime * 0.15) * 0.2;

    // Horizontal: positive lookX = look right (character's right)
    // Look right: In_L (left eye toward nose) + Out_R (right eye away from nose)
    // Look left:  Out_L (left eye away from nose) + In_R (right eye toward nose)
    setMorph('eyeLookIn_L', Math.max(0, lookX));
    setMorph('eyeLookOut_L', Math.max(0, -lookX));
    setMorph('eyeLookIn_R', Math.max(0, -lookX));
    setMorph('eyeLookOut_R', Math.max(0, lookX));

    // Vertical: both eyes together
    setMorph('eyeLookUp_L', Math.max(0, lookY));
    setMorph('eyeLookUp_R', Math.max(0, lookY));
    setMorph('eyeLookDown_L', Math.max(0, -lookY));
    setMorph('eyeLookDown_R', Math.max(0, -lookY));

    // Brow movement
    const browShift = Math.sin(idleTime * 0.13) * 0.3;
    setMorph('browInnerUp', Math.max(0, browShift));
    setMorph('browDown_L', Math.max(0, -browShift * 0.5));
    setMorph('browDown_R', Math.max(0, -browShift * 0.5));

    // Breathing — jaw + head movement
    const breathe = Math.sin(idleTime * 0.5);
    setMorph('jawOpen', Math.max(0, breathe * 0.05));
    headModel.rotation.x = breathe * 0.02;

    // Head sway
    headModel.rotation.y = Math.sin(idleTime * 0.15) * 0.08;
    headModel.rotation.z = Math.sin(idleTime * 0.1) * 0.015;

    // Occasional micro-expressions
    const microPhase = Math.sin(idleTime * 0.08);
    if (microPhase > 0.9) {
      setMorph('eyeSquint_L', 0.4);
      setMorph('eyeSquint_R', 0.4);
      setMorph('mouthSmile_L', 0.15);
      setMorph('mouthSmile_R', 0.15);
    } else if (microPhase < -0.9) {
      setMorph('mouthPress_L', 0.2);
      setMorph('mouthPress_R', 0.2);
      setMorph('mouthFrown_L', 0.1);
      setMorph('mouthFrown_R', 0.1);
    } else {
      setMorph('eyeSquint_L', 0);
      setMorph('eyeSquint_R', 0);
      setMorph('mouthSmile_L', 0);
      setMorph('mouthSmile_R', 0);
      setMorph('mouthPress_L', 0);
      setMorph('mouthPress_R', 0);
      setMorph('mouthFrown_L', 0);
      setMorph('mouthFrown_R', 0);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
