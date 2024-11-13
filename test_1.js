import * as THREE from 'three/webgpu';
import {
    cameraProjectionMatrix, modelViewProjection, positionLocal, uv, vec2, vec3, vec4, float, sin, cos, texture, time, 
    timerLocal, rotate, uniform, tslFn, PI2, oneMinus, negate, step, mix, spherizeUV
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, controls;

init();

function init() {
    camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(1, 1, 3);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x201919);

    const textureLoader = new THREE.TextureLoader();
    const cellularTexture = textureLoader.load('https://threejs.org/examples/textures/noises/voronoi/grayscale-256x256.png');
    const perlinTexture = textureLoader.load('https://threejs.org/examples/textures/noises/perlin/rgb-256x256.png');

    // Gradient Canvas Setup
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 128;
    gradientCanvas.height = 1;
    const gradientContext = gradientCanvas.getContext('2d');
    const gradientColors = ['#090033', '#5f1f93', '#e02e96', '#ffbd80', '#fff0db'];

    const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
    gradientTexture.colorSpace = THREE.SRGBColorSpace;

    function updateGradient() {
        const gradient = gradientContext.createLinearGradient(0, 0, gradientCanvas.width, 0);
        gradientColors.forEach((color, i) => {
            gradient.addColorStop(i / (gradientColors.length - 1), color);
        });
        gradientContext.fillStyle = gradient;
        gradientContext.fillRect(0, 0, gradientCanvas.width, gradientCanvas.height);
        gradientTexture.needsUpdate = true;
    }
    updateGradient();

    // Flame 1 Material
    const flame1Material = new THREE.SpriteNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    flame1Material.colorNode = tslFn(() => {
        const mainUv = uv().toVar();
        mainUv.assign(spherizeUV(mainUv, 10).mul(0.6).add(0.2));
        mainUv.assign(mainUv.pow(vec2(1, 2)));
        mainUv.assign(mainUv.mul(2, 1).sub(vec2(0.5, 0)));

        const gradient1 = sin(timerLocal().mul(10).sub(mainUv.y.mul(PI2).mul(2))).toVar();
        const gradient2 = mainUv.y.smoothstep(0, 1).toVar();
        mainUv.x.addAssign(gradient1.mul(gradient2).mul(0.2));

        const cellularUv = mainUv.mul(0.5).add(vec2(0, negate(timerLocal().mul(0.5)))).mod(1);
        const cellularNoise = texture(cellularTexture, cellularUv, 0).r.oneMinus().smoothstep(0, 0.5).oneMinus();
        cellularNoise.mulAssign(gradient2);

        const shape = mainUv.sub(0.5).mul(vec2(3, 2)).length().oneMinus().toVar();
        shape.assign(shape.sub(cellularNoise));

        const gradientColor = texture(gradientTexture, vec2(shape.remap(0, 1, 0, 1), 0));
        const color = mix(gradientColor, vec3(1), shape.step(0.8).oneMinus());
        const alpha = shape.smoothstep(0, 0.3);

        return vec4(color.rgb, alpha);
    })();

    // Flame 2 Material
    const flame2Material = new THREE.SpriteNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    flame2Material.colorNode = tslFn(() => {
        const mainUv = uv().toVar();
        mainUv.assign(spherizeUV(mainUv, 10).mul(0.6).add(0.2));
        mainUv.assign(mainUv.pow(vec2(1, 3)));
        mainUv.assign(mainUv.mul(2, 1).sub(vec2(0.5, 0)));

        const perlinUv = mainUv.add(vec2(0, negate(timerLocal().mul(1)))).mod(1);
        const perlinNoise = texture(perlinTexture, perlinUv, 0).sub(0.5).mul(1);
        mainUv.x.addAssign(perlinNoise.x.mul(0.5));

        const gradient1 = sin(timerLocal().mul(10).sub(mainUv.y.mul(PI2).mul(2)));
        const gradient2 = mainUv.y.smoothstep(0, 1);
        const gradient3 = oneMinus(mainUv.y).smoothstep(0, 0.3);
        mainUv.x.addAssign(gradient1.mul(gradient2).mul(0.2));

        const displacementPerlinUv = mainUv.mul(0.5).add(vec2(0, negate(timerLocal().mul(0.25)))).mod(1);
        const displacementPerlinNoise = texture(perlinTexture, displacementPerlinUv, 0).sub(0.5).mul(1);
        const displacedPerlinUv = mainUv.add(vec2(0, negate(timerLocal().mul(0.5)))).add(displacementPerlinNoise).mod(1);
        const displacedPerlinNoise = texture(perlinTexture, displacedPerlinUv, 0).sub(0.5).mul(1);
        mainUv.x.addAssign(displacedPerlinNoise.mul(0.5));

        const cellularUv = mainUv.add(vec2(0, negate(timerLocal().mul(1.5)))).mod(1);
        const cellularNoise = texture(cellularTexture, cellularUv, 0).r.oneMinus().smoothstep(0.25, 1);

        const shape = mainUv.sub(0.5).mul(vec2(6, 1)).length().step(0.5);
        shape.assign(shape.mul(cellularNoise));
        shape.mulAssign(gradient3);
        shape.assign(step(0.01, shape));

        return vec4(vec3(1), shape);
    })();

    // Billboarding
    flame1Material.vertexNode = flame2Material.vertexNode = modelViewProjection;

    const flame1 = new THREE.Sprite(flame1Material);
    flame1.center.set(0.5, 0);
    flame1.scale.x = 0.5;
    flame1.position.x = -0.5;
    scene.add(flame1);

    const flame2 = new THREE.Sprite(flame2Material);
    flame2.center.set(0.5, 0);
    flame2.position.x = 0.5;
    scene.add(flame2);

    renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 50;

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    controls.update();
    renderer.render(scene, camera);
}
