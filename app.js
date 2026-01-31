// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// OrbitControls setup (global zoom, mode-based rotation)
let controls;
try {
    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableRotate = false; // Controlled by mode
        controls.enableZoom = true;    // ✅ Always enabled (global)
        controls.enablePan = false;    // Disabled
        controls.screenSpacePanning = false;
        controls.minDistance = 5;
        controls.maxDistance = 60;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controls.target.set(0, 0, 0);
        // Configure touch: TWO fingers = zoom only
        controls.touches = {
            ONE: THREE.TOUCH.ROTATE,  // Only works when enableRotate = true
            TWO: THREE.TOUCH.DOLLY_PAN // Pinch to zoom (pan disabled)
        };
        // Keep enabled for zoom, rotation controlled separately
        controls.enabled = true;
    }
} catch (e) {
    console.warn("OrbitControls not available:", e);
}

// Camera controls state
let isRotating = false;
let isPanning = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraRotation = { x: 0.5, y: 0.8 };
let cameraTarget = new THREE.Vector3(0, 0, 0);
let cameraDistance = 25;

// Touch state
let touchStartDistance = 0;
let touchStartRotation = 0;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Grid helper - aligned with block edges
const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0xcccccc);
gridHelper.position.set(0, -0.5, 0);
scene.add(gridHelper);

// State
const colors = [0x4A90E2, 0xFF8C42, 0x50C878, 0xE040FB];
let currentColorIndex = 0;
const placedBlocks = [];
const occupiedPositions = new Set();
let ghostBlock = null;
let transparencyMode = false;
let shiftPressed = false;
let selectionMode = false;
let selectedBlocks = new Set();

// Device detection (must be declared before use in updateGhostBlock)
let isTouchMode = false;

// Create ghost block
function createGhostBlock() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
        color: colors[currentColorIndex],
        transparent: true,
        opacity: 0.5
    });
    ghostBlock = new THREE.Mesh(geometry, material);
    ghostBlock.visible = false;
    scene.add(ghostBlock);
}

// Create block
function createBlock(position, colorIndex) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
        color: colors[colorIndex],
        metalness: 0.3,
        roughness: 0.7
    });

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);

    const block = new THREE.Mesh(geometry, material);
    block.position.copy(position);
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.originalColor = colors[colorIndex];

    wireframe.position.copy(position);

    scene.add(block);
    scene.add(wireframe);

    placedBlocks.push({ mesh: block, wireframe: wireframe });
    occupiedPositions.add(positionKey(position));
}

// Selection functions
function selectBlock(block) {
    if (selectedBlocks.has(block)) {
        // Deselect
        selectedBlocks.delete(block);
        block.material.color.setHex(block.userData.originalColor);
        block.material.emissive.setHex(0x000000);
    } else {
        // Select
        selectedBlocks.add(block);
        block.material.emissive.setHex(0xFFFF00);
        block.material.emissiveIntensity = 0.5;
    }
}

function clearSelection() {
    selectedBlocks.forEach(block => {
        block.material.color.setHex(block.userData.originalColor);
        block.material.emissive.setHex(0x000000);
    });
    selectedBlocks.clear();
}

function deleteSelectedBlocks() {
    const blocksToDelete = Array.from(selectedBlocks);
    blocksToDelete.forEach(blockMesh => {
        const index = placedBlocks.findIndex(b => b.mesh === blockMesh);
        if (index !== -1) {
            const block = placedBlocks[index];
            scene.remove(block.mesh);
            scene.remove(block.wireframe);
            occupiedPositions.delete(positionKey(block.mesh.position));
            placedBlocks.splice(index, 1);
        }
    });
    selectedBlocks.clear();
}

// Helper functions
function positionKey(pos) {
    return `${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}`;
}

function roundVector(vec) {
    return new THREE.Vector3(
        Math.round(vec.x),
        Math.round(vec.y),
        Math.round(vec.z)
    );
}

function getAllNeighbors(pos) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                neighbors.push(new THREE.Vector3(
                    pos.x + dx,
                    pos.y + dy,
                    pos.z + dz
                ));
            }
        }
    }
    return neighbors;
}

function findBestSnapPosition(hitPoint, hitBlock) {
    if (!hitBlock) return null;

    const basePos = hitBlock.position;
    const neighbors = getAllNeighbors(basePos);

    const validNeighbors = neighbors.filter(n =>
        !occupiedPositions.has(positionKey(n))
    );

    if (validNeighbors.length === 0) return null;

    let bestPos = validNeighbors[0];
    let minDist = hitPoint.distanceTo(bestPos);

    for (const neighbor of validNeighbors) {
        const dist = hitPoint.distanceTo(neighbor);
        if (dist < minDist) {
            minDist = dist;
            bestPos = neighbor;
        }
    }

    return bestPos;
}

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function updateGhostBlock(event) {
    if (selectionMode && !isTouchMode) return; // Allow selection updates in touch mode

    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = event.clientX || (event.touches && event.touches[0].clientX);
    const clientY = event.clientY || (event.touches && event.touches[0].clientY);

    if (!clientX || !clientY) return;

    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const blockMeshes = placedBlocks.map(b => b.mesh);
    const intersects = raycaster.intersectObjects(blockMeshes);

    if (intersects.length > 0) {
        // We hit a block
        const hitBlock = intersects[0].object;

        if (isTouchMode) {
            // Touch Mode: Highlight the block we hit "underneath" the finger
            // This serves as "Selection" for deletion if the user presses Delete
            // BUT we also want to show the Ghost for potential placement.
            // Conflict: Tapping a block -> Select it OR snap ghost to it for building?

            // Decision: Always show Ghost (Placement priority).
            // But ALSO select the block for potential deletion.
            // Visual feedback might be cluttered.

            // Simplification:
            // If we hit a block, we highlight it (Selection Mode logic).
            // AND we show ghost at snap position.

            clearSelection();
            selectBlock(hitBlock);
        }

        const hitPoint = intersects[0].point;
        const snapPos = findBestSnapPosition(hitPoint, hitBlock);
        if (snapPos) {
            ghostBlock.position.copy(snapPos);
            ghostBlock.visible = true;
        } else {
            ghostBlock.visible = false;
        }
    } else {
        // Hit nothing or ground
        if (isTouchMode) clearSelection();

        const intersectPlane = raycaster.intersectObject(gridHelper);
        if (intersectPlane.length > 0) {
            const pos = roundVector(intersectPlane[0].point);
            ghostBlock.position.copy(pos);
            ghostBlock.visible = true;
        }
    }
}

function onClick(event) {
    if (isTouchMode) return; // Touch mode uses buttons, disable direct click placement
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const blockMeshes = placedBlocks.map(b => b.mesh);
    const intersects = raycaster.intersectObjects(blockMeshes);

    if (selectionMode) {
        // Selection mode
        if (intersects.length > 0) {
            selectBlock(intersects[0].object);
        } else {
            // Clicked empty space - exit selection mode
            selectionMode = false;
            clearSelection();
            ghostBlock.visible = false;
        }
    } else {
        // Placement mode
        if (shiftPressed && intersects.length > 0) {
            // Delete with shift
            const hitBlock = intersects[0].object;
            const index = placedBlocks.findIndex(b => b.mesh === hitBlock);
            if (index !== -1) {
                const block = placedBlocks[index];
                scene.remove(block.mesh);
                scene.remove(block.wireframe);
                occupiedPositions.delete(positionKey(block.mesh.position));
                placedBlocks.splice(index, 1);
            }
        } else if (ghostBlock.visible) {
            createBlock(ghostBlock.position.clone(), currentColorIndex);
        }
    }
}


// Camera controls
function updateCameraTarget() {
    if (placedBlocks.length === 0) {
        cameraTarget.set(0, 0, 0);
        return;
    }

    // Calculate center of all blocks
    const center = new THREE.Vector3();
    placedBlocks.forEach(block => {
        center.add(block.mesh.position);
    });
    center.divideScalar(placedBlocks.length);

    // Directly set camera target to center (no lerp during rotation)
    cameraTarget.copy(center);
}

// Camera controls
function updateCamera() {
    const x = cameraDistance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
    const y = cameraDistance * Math.sin(cameraRotation.x);
    const z = cameraDistance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);

    camera.position.set(
        cameraTarget.x + x,
        cameraTarget.y + y,
        cameraTarget.z + z
    );
    camera.lookAt(cameraTarget);
}

// Mouse controls
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        isRotating = true;
        updateCameraTarget(); // Center on blocks when starting rotation
        previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    } else if (e.button === 1) {
        isPanning = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    }
});

renderer.domElement.addEventListener('mousemove', (e) => {
    if (isRotating) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;
        cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x));

        updateCamera();
        previousMousePosition = { x: e.clientX, y: e.clientY };
    } else if (isPanning) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        camera.getWorldDirection(right);
        right.cross(up).normalize();

        const panSpeed = cameraDistance * 0.001;
        cameraTarget.add(right.multiplyScalar(-deltaX * panSpeed));
        cameraTarget.y += deltaY * panSpeed;

        updateCamera();
        previousMousePosition = { x: e.clientX, y: e.clientY };
    } else {
        updateGhostBlock(e);
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    isRotating = false;
    isPanning = false;
});

renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraDistance += e.deltaY * 0.01;
    cameraDistance = Math.max(5, Math.min(50, cameraDistance));
    updateCamera();
});

// Touch controls (Old logic removed - replaced by Unified Touch Logic below)
// See 'handleInputStart' and subsequent listeners.

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', onClick);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        selectionMode = !selectionMode;
        if (selectionMode) {
            ghostBlock.visible = false;
            clearSelection();
        }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionMode && selectedBlocks.size > 0) {
            deleteSelectedBlocks();
        }
    }

    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === '1') currentColorIndex = 0;
    if (e.key === '2') currentColorIndex = 1;
    if (e.key === '3') currentColorIndex = 2;
    if (e.key === '4') currentColorIndex = 3;

    if (e.key === 't' || e.key === 'T') {
        if (!transparencyMode) {
            transparencyMode = true;
            placedBlocks.forEach(block => {
                block.mesh.material.transparent = true;
                block.mesh.material.opacity = 0.2;
            });
        }
    }

    ghostBlock.material.color.setHex(colors[currentColorIndex]);
    updateColorPalette();
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') shiftPressed = false;

    if (e.key === 't' || e.key === 'T') {
        if (transparencyMode) {
            transparencyMode = false;
            placedBlocks.forEach(block => {
                block.mesh.material.transparent = false;
                block.mesh.material.opacity = 1.0;
            });
        }
    }
});

// Color palette UI
function updateColorPalette() {
    document.querySelectorAll('.color-box').forEach((box, index) => {
        if (index === currentColorIndex) {
            box.classList.add('active');
        } else {
            box.classList.remove('active');
        }
    });
}

document.querySelectorAll('.color-box').forEach((box, index) => {
    box.addEventListener('click', () => {
        currentColorIndex = index;
        ghostBlock.material.color.setHex(colors[currentColorIndex]);
        updateColorPalette();
    });
});

// Window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update(); // Update OrbitControls for damping
    renderer.render(scene, camera);
}

// Initialize
createGhostBlock();
updateColorPalette();
updateCamera();

// --- Device Detection & UI Update ---


// --- Tool & Device State ---
// isTouchMode is declared at top of file
let currentTool = 'rotate'; // Default to rotate

// --- Tool Switching ---
window.setTool = function (tool) {
    currentTool = tool;

    // Update UI
    ['place', 'rotate', 'delete'].forEach(t => {
        const btn = document.getElementById('tool-' + t);
        if (btn) {
            if (t === tool) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    // Reset States
    ghostBlock.visible = false;
    clearSelection();

    // Control rotation based on tool (zoom always enabled)
    if (controls) {
        if (tool === 'rotate') {
            // In rotate mode: enable rotation
            controls.enableRotate = true;
            updateCameraTarget();
            controls.target.copy(cameraTarget);
        } else {
            // In place/delete mode: disable rotation, keep zoom
            controls.enableRotate = false;
        }
        // Zoom is always enabled globally
    }
}

// --- Device Detection & UI Update ---
function detectDevice() {
    // Check URL param for forced testing: ?touch=1
    const urlParams = new URLSearchParams(window.location.search);
    const forceTouch = urlParams.get('touch') === '1';

    const isTouch = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        forceTouch;
    isTouchMode = isTouch;

    const pcInstructions = document.getElementById('pc-instructions');
    const mobileInstructions = document.getElementById('mobile-instructions');
    const toolBar = document.getElementById('tool-bar');
    const debugBtn = document.getElementById('debug-touch-btn');

    if (isTouch) {
        if (pcInstructions) pcInstructions.style.display = 'none';
        // Hide text instructions to clean up UI, toolbar is intuitive
        if (mobileInstructions) mobileInstructions.style.display = 'none';
        if (toolBar) toolBar.style.display = 'flex';
        console.log("Touch Mode ENABLED");

        // Disable PC selection mode
        selectionMode = false;
        setTool('rotate'); // Initialize UI
    } else {
        if (pcInstructions) pcInstructions.style.display = 'block';
        if (toolBar) toolBar.style.display = 'none';
        if (debugBtn) debugBtn.style.display = 'block';
    }
    return isTouch;
}

detectDevice(); // Initial Run

// --- Unified Touch logic ---
let isRotatingTouch = false;

const handleInputStart = (e, x, y) => {
    if (!isTouchMode) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    if (currentTool === 'rotate') {
        isRotatingTouch = true;
        previousMousePosition = { x: x, y: y };
    }
    else if (currentTool === 'place') {
        // Just update ghost, wait for move or end
        updateGhostBlock({ clientX: x, clientY: y });
    }
};

const handleInputMove = (e, x, y) => {
    if (!isTouchMode) return;

    // Update ghost if placing
    if (currentTool === 'place') {
        updateGhostBlock({ clientX: x, clientY: y });
    }
    else if (currentTool === 'rotate' && isRotatingTouch) {
        const deltaX = x - previousMousePosition.x;
        const deltaY = y - previousMousePosition.y;

        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;
        cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x));

        updateCamera();
        previousMousePosition = { x: x, y: y };
    }
};

const handleInputEnd = (e, x, y) => {
    if (!isTouchMode) return;
    isRotatingTouch = false;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (currentTool === 'place' && ghostBlock.visible) {
        createBlock(ghostBlock.position.clone(), currentColorIndex);
    }
    else if (currentTool === 'delete') {
        const blockMeshes = placedBlocks.map(b => b.mesh);
        const intersects = raycaster.intersectObjects(blockMeshes);
        if (intersects.length > 0) {
            const hitBlock = intersects[0].object;
            const index = placedBlocks.findIndex(b => b.mesh === hitBlock);
            if (index !== -1) {
                const block = placedBlocks[index];
                scene.remove(block.mesh);
                scene.remove(block.wireframe);
                occupiedPositions.delete(positionKey(block.mesh.position));
                placedBlocks.splice(index, 1);
            }
        }
    }
};

// --- Bind Events ---
renderer.domElement.addEventListener('touchstart', (e) => {
    // Two-finger: always let OrbitControls handle (zoom)
    if (e.touches.length === 2) return;

    // Single-finger in rotate mode: let OrbitControls handle
    if (currentTool === 'rotate') return;

    // Single-finger in other modes: manual control
    if (e.touches.length === 1) {
        handleInputStart(e, e.touches[0].clientX, e.touches[0].clientY);
    }
});

renderer.domElement.addEventListener('touchmove', (e) => {
    // Two-finger: always let OrbitControls handle (zoom)
    if (e.touches.length === 2) return;

    // Single-finger in rotate mode: let OrbitControls handle
    if (currentTool === 'rotate') return;

    // Single-finger in other modes: manual control
    if (e.touches.length === 1) {
        handleInputMove(e, e.touches[0].clientX, e.touches[0].clientY);
    }
    e.preventDefault();
});

renderer.domElement.addEventListener('touchend', (e) => {
    // Sync camera state when all fingers lifted in rotate mode
    if (currentTool === 'rotate' && e.touches.length === 0) {
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        cameraTarget.copy(controls.target);
        cameraDistance = offset.length();
        cameraRotation.y = Math.atan2(offset.x, offset.z);
        cameraRotation.x = Math.asin(offset.y / cameraDistance);
        return;
    }

    // Handle placement/deletion in other modes
    if (e.changedTouches.length > 0) {
        handleInputEnd(e, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    e.preventDefault();
});

// Simulator Events
renderer.domElement.addEventListener('mousedown', (e) => {
    if (currentTool === 'rotate') return;
    if (isTouchMode && e.button === 0) handleInputStart(e, e.clientX, e.clientY);
});
renderer.domElement.addEventListener('mousemove', (e) => {
    if (currentTool === 'rotate') return;
    if (isTouchMode) handleInputMove(e, e.clientX, e.clientY);
});
renderer.domElement.addEventListener('mouseup', (e) => {
    if (currentTool === 'rotate') return;
    if (isTouchMode && e.button === 0) handleInputEnd(e, e.clientX, e.clientY);
});

// Debug Toggle
window.toggleDebugTouch = function () {
    const currentInfo = new URLSearchParams(window.location.search);
    if (currentInfo.get('touch') === '1') currentInfo.delete('touch');
    else currentInfo.set('touch', '1');
    window.location.search = currentInfo.toString();
}




animate();
