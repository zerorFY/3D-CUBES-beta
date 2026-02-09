// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

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
    // Allow mouse clicks even in Touch Mode (for Hybrid devices)
    // if (isTouchMode) return; 
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
}

// --- Device Detection & UI Update ---
function detectDevice() {
    // Check URL param for forced testing: ?touch=1
    const urlParams = new URLSearchParams(window.location.search);
    const forceTouch = urlParams.get('touch') === '1';

    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // "Touch Mode" enables OrbitControls and Touch UI.
    // For Hybrid PCs, we want to KEEP PC controls (Mouse) but maybe allow Touch gestures?
    // Current design binaries: PC Mode vs Touch Mode.
    // Let's force Touch Mode ONLY on actual Mobile UAs or forced touch.
    const isTouch = isMobileUA || forceTouch;
    // NOTE: We ignore navigator.maxTouchPoints for the "Mobile UI" switch 
    // to prevent Hybrid PCs from losing their Mouse Interface.

    isTouchMode = isTouch;

    const pcInstructions = document.getElementById('pc-instructions');
    const mobileInstructions = document.getElementById('mobile-instructions');
    const toolBar = document.getElementById('tool-bar');
    const debugBtn = document.getElementById('debug-touch-btn');
    const pcMuteBtn = document.getElementById('pc-mute-btn');

    if (isTouch) {
        if (pcInstructions) pcInstructions.style.display = 'none';
        if (mobileInstructions) mobileInstructions.style.display = 'none'; // Hide text instr
        if (toolBar) toolBar.style.display = 'flex';
        if (pcMuteBtn) pcMuteBtn.style.display = 'none';
        console.log("Touch Mode ENABLED");
        selectionMode = false;
        setTool('place');
    } else {
        if (pcInstructions) pcInstructions.style.display = 'block';
        if (toolBar) toolBar.style.display = 'none';
        // Ensure PC Mute Button is visible
        if (pcMuteBtn) {
            pcMuteBtn.style.display = 'block';
            console.log("PC Mute Button Enabled");
        }
        if (debugBtn) debugBtn.style.display = 'block';
    }
    return isTouch;
}

detectDevice(); // Initial Run

// --- Unified Touch logic ---
let isRotatingTouch = false;

const handleInputStart = (e, x, y) => {
    if (!isTouchMode) return;

    // --- Initialize Touch Data for Tap Detection ---
    touchStartTime = Date.now();
    touchStartPos.set(x, y);

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

    // --- Strict Tap Detection ---
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - touchStartTime;
    const dist = touchStartPos.distanceTo(new THREE.Vector2(x, y));

    // --- Tap Detection ---
    // Relaxed threshold: 30px movement allowed.
    if (dist > 30) return;

    // For PLACEMENT, we want to be strict about time (accidental taps).
    // For DELETION, we allow "press and hold" (ignore duration).
    if (currentTool === 'place' && touchDuration > 500) return;
    // if (currentTool === 'delete') -> Proceed regardless of duration

    // --- Perform Action ---
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
}


// --- Mute & Transparency Logic ---

window.toggleMute = function () {
    const audio = document.getElementById('bg-music');
    if (audio) {
        audio.muted = !audio.muted;
        const icon = audio.muted ? '🔇' : '🔊';
        // Update all buttons (PC and Touch)
        const btns = document.querySelectorAll('#tool-mute, #pc-mute-btn');
        btns.forEach(btn => btn.innerText = icon);
    }
}

window.toggleTransparency = function () {
    // Reuse existing transparencyMode logic
    transparencyMode = !transparencyMode;
    placedBlocks.forEach(block => {
        block.mesh.material.transparent = transparencyMode;
        block.mesh.material.opacity = transparencyMode ? 0.2 : 1.0;
        block.mesh.material.needsUpdate = true; // Force update
    });

    // Update button style
    const btn = document.getElementById('tool-transparency');
    if (btn) {
        if (transparencyMode) btn.classList.add('active');
        else btn.classList.remove('active');
    }
}

// --- Bind Events ---
renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) handleInputStart(e, e.touches[0].clientX, e.touches[0].clientY);
});
renderer.domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) handleInputMove(e, e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
});
renderer.domElement.addEventListener('touchend', (e) => {
    if (e.changedTouches.length > 0) handleInputEnd(e, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    e.preventDefault();
});

// Simulator Events
renderer.domElement.addEventListener('mousedown', (e) => {
    if (isTouchMode && e.button === 0) handleInputStart(e, e.clientX, e.clientY);
});
renderer.domElement.addEventListener('mousemove', (e) => {
    if (isTouchMode) handleInputMove(e, e.clientX, e.clientY);
});
renderer.domElement.addEventListener('mouseup', (e) => {
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

// ==========================================
// BETA FEATURE: iPad/Touch Support (OrbitControls)
// ==========================================
// This section is appended to the stable code to add Touch capabilities
// WITHOUT modifying the existing PC mouse/click logic above.

// 1. Initialize OrbitControls (only if available)
let controls;
if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableRotate = false; // Disabled by default
    controls.enableZoom = true;    // Always allow zoom
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.enabled = false; // Disabled initially to prevent conflict with PC

    // Custom touch behavior for OrbitControls
    controls.touches = {
        ONE: THREE.TOUCH.ROTATE, // 1 finger rotates
        TWO: THREE.TOUCH.DOLLY_ROTATE // 2 fingers: Pinch to Zoom + Twist to Rotate
    };

    // IMPORTANT: Disable Mouse support in OrbitControls to prevent conflict on Hybrid PCs
    // This ensures that even if controls are enabled (due to touch detection), 
    // the mouse still triggers the standard PC events defined above.
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: null,
        RIGHT: null
    };
}

// 2. Detect Touch Device
let isTouchDevice = false;
function checkTouchDevice() {
    isTouchDevice = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (new URLSearchParams(window.location.search).get('touch') === '1');

    if (isTouchDevice && controls) {
        console.log("Beta: Touch device detected, enabling OrbitControls");
        controls.enabled = true;

        // Hide PC instructions if on mobile
        const pcInstr = document.getElementById('pc-instructions');
        if (pcInstr) pcInstr.style.display = 'none';

        // Show Toolbar
        const toolbar = document.getElementById('tool-bar');
        if (toolbar) toolbar.style.display = 'flex';

        // Ensure PC Mute Button is HIDDEN in Touch Mode (Beta Logic)
        const pcMuteBtn = document.getElementById('pc-mute-btn');
        if (pcMuteBtn) pcMuteBtn.style.display = 'none';

        // Initial Tool State for Touch - Default to PLACE
        setTouchTool('place');
    }
}

// 3. Touch Tool Logic
// We use a separate function to avoid redefining the PC 'setTool' if it exists, 
// or we can hijack the toolbar buttons.
// Since the Stable version DOES NOT have a 'setTool' function exposed (it's hardcoded or missing),
// we will add a simple one for the Touch UI.

let currentTouchTool = 'place'; // Default to place

window.setTouchTool = function (tool) {
    currentTouchTool = tool;
    currentTool = tool; // Sync with main tool state for consistency

    // Update UI Buttons
    ['place', 'rotate', 'delete'].forEach(t => {
        const btn = document.getElementById('tool-' + t);
        if (btn) {
            if (t === tool) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    // Update OrbitControls state based on tool
    if (controls) {
        // Rotation is ALWAYS enabled now for Unified Experience
        controls.enableRotate = true;
    }

    // Reset selection/ghost
    if (typeof ghostBlock !== 'undefined') ghostBlock.visible = false;
    if (typeof clearSelection === 'function') clearSelection();

    // Sync Rotation Center for OrbitControls
    if (controls && tool === 'rotate') {
        if (typeof updateCameraTarget === 'function') {
            updateCameraTarget(); // Recalculate cameraTarget from block center
            // cameraTarget is a global variable from the PC code
            if (typeof cameraTarget !== 'undefined') {
                controls.target.copy(cameraTarget);
                controls.update();
            }
        }
    }
}

// 4. Touch Event Handlers for Placement/Deletion
let touchStartTime = 0;
let touchStartPos = new THREE.Vector2();

renderer.domElement.addEventListener('touchstart', (e) => {
    if (!isTouchDevice) return;

    // Sync Rotation Center logic (ensure we rotate around structure)
    if (controls && typeof cameraTarget !== 'undefined') {
        if (typeof updateCameraTarget === 'function') updateCameraTarget();
        controls.target.copy(cameraTarget);
        controls.update();
    }

    if (e.touches.length === 1) {
        touchStartTime = Date.now();
        touchStartPos.set(e.touches[0].clientX, e.touches[0].clientY);
    }

    // Always enable rotation for touch
    if (controls) controls.enableRotate = true;

    // Show Ghost Block immediately for feedback (aiming)
    if (e.touches.length === 1 && currentTouchTool !== 'rotate') {
        const touch = e.touches[0];
        // Only update ghost, logic reused from updateGhostBlock essentially but manual here
        // or we can rely on touchmove. 
        // Let's force an update here so user sees where they tapped.
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // ... (Simplified: trigger standard updateGhostBlock logic if possible or copy)
        updateGhostBlock({ clientX: touch.clientX, clientY: touch.clientY, touches: [touch] });
    }
}, { passive: false });

renderer.domElement.addEventListener('touchmove', (e) => {
    if (!isTouchDevice) return;

    // If dragging significantly, hide ghost block to indicate "Rotation Mode"
    // and prevent visual confusion that "dropping" will place block.
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const dist = touchStartPos.distanceTo(new THREE.Vector2(touch.clientX, touch.clientY));
        if (dist > 5 && ghostBlock) { // Strict 5px threshold
            ghostBlock.visible = false;
        }

        // Standard update if not hidden (and not rotating fast)
        if (dist <= 5 && currentTouchTool === 'place') {
            updateGhostBlock({ clientX: touch.clientX, clientY: touch.clientY, touches: [touch] });
        }
    }
}, { passive: false });

renderer.domElement.addEventListener('touchend', (e) => {
    if (!isTouchDevice) return;

    // Tap Detection
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - touchStartTime;

    let isTap = false;
    if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const dist = touchStartPos.distanceTo(new THREE.Vector2(touch.clientX, touch.clientY));

        // STRICT Threshold: 300ms time, 5px movement
        if (touchDuration < 300 && dist < 5) {
            isTap = true;
        }
    }

    // Handle Action on Lift (Only if it was a Tap)
    if (!isTap) return; // Ignore drags/long presses

    // If Ghost is visible (it should be if we didn't drag) and tool is place
    if (currentTouchTool === 'place') {
        // Recalculate hit to be sure
        const lastTouch = e.changedTouches[0];
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((lastTouch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((lastTouch.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Check for block hit (snap) or ground
        // Reuse logic? Or direct create if ghost visible?
        // Ghost visibility is controlled by move/down.
        // Let's trust ghostBlock position IF it's visible.
        if (ghostBlock && ghostBlock.visible) {
            createBlock(ghostBlock.position.clone(), currentColorIndex);
            ghostBlock.visible = false;
        } else {
            // If ghost was hidden (maybe bug), try raycast one last time
            // ... (Skipping for simplicity, ghost logic should cover it)
        }
    }

    // If Selection exists and tool is delete -> Delete
    if (currentTouchTool === 'delete') {
        // Perform delete Logic
        if (selectedBlocks.size > 0) {
            deleteSelectedBlocks();
        } else {
            // Try to select and delete in one tap?
            // User flow: Tap to select (handled by touchstart/move updateGhostBlock calling select)?
            // In updateGhostBlock (original code), it handles selection highlight.
            // So if we tapped a block, it is likely already selected.
            // We just check if we hit something.
            // Let's re-raycast to be safe.
            // ...
            // Actually, the original touchstart/updateGhost logic handles selection.
            // So here we just confirm delete.
            if (selectedBlocks.size > 0) deleteSelectedBlocks();
        }
    }
});


// 5. Update Loop Injection
// We need controls.update() to run. 
// Since we can't easily modify the 'animate' function defined above, 
// we'll set up a separate interval or use a hack.
// Hack: Override window.requestAnimationFrame? No, that's dangerous.
// Safe way: Add a second animation loop just for controls? Or hook into renderer.
// Simplest safe way:
setInterval(() => {
    if (controls && isTouchDevice) controls.update();
}, 16); // ~60fps

// 6. Hook up UI Buttons
// We assume the HTML elements exist (tool-place, tool-rotate, tool-delete)
document.getElementById('tool-place')?.addEventListener('touchstart', (e) => { e.preventDefault(); setTouchTool('place'); });
document.getElementById('tool-rotate')?.addEventListener('touchstart', (e) => { e.preventDefault(); setTouchTool('rotate'); });
document.getElementById('tool-delete')?.addEventListener('touchstart', (e) => { e.preventDefault(); setTouchTool('delete'); });

// Initial Check
checkTouchDevice();

