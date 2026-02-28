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
let touchStartTime = 0;
const touchStartPos = new THREE.Vector2();

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
let pcMouseDownPos = { x: 0, y: 0 };
let pcMouseDownTime = 0;
let isLeftDragging = false;

renderer.domElement.addEventListener('mousedown', (e) => {
    if (isTouchMode) return; // Touch has its own handlers
    if (e.button === 0) {
        // Left click: record for tap detection, also start rotation
        pcMouseDownPos = { x: e.clientX, y: e.clientY };
        pcMouseDownTime = Date.now();
        isLeftDragging = true;
        isRotating = true;
        updateCameraTarget();
        previousMousePosition = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
        isRotating = true;
        updateCameraTarget();
        previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    } else if (e.button === 1) {
        isPanning = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
    }
});

renderer.domElement.addEventListener('mousemove', (e) => {
    if (isTouchMode) return;
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

renderer.domElement.addEventListener('mouseup', (e) => {
    if (isTouchMode) return;
    if (e.button === 0 && isLeftDragging) {
        isLeftDragging = false;
        isRotating = false;
        // Tap detection: short time + small distance = click to place
        const dist = Math.hypot(e.clientX - pcMouseDownPos.x, e.clientY - pcMouseDownPos.y);
        const duration = Date.now() - pcMouseDownTime;
        if (dist < 5 && duration < 200) {
            onClick(e);
        }
    } else {
        isRotating = false;
        isPanning = false;
    }
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
let currentTool = 'place'; // Default to place

// --- Tool Switching ---
window.setTool = function (tool) {
    if (tool === 'transparency' || tool === 'mute') return; // Handled by separate toggles

    currentTool = tool;

    // Update UI
    ['place', 'delete'].forEach(t => {
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

    // iPadOS 13+ reports desktop UA, but maxTouchPoints > 0
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    const isTouch = isMobileUA || forceTouch || hasTouch;

    isTouchMode = isTouch;

    const pcInstructions = document.getElementById('pc-instructions');
    const touchInstructions = document.getElementById('touch-instructions');
    const touchToolBar = document.getElementById('touch-tool-bar');
    const pcMuteBtn = document.getElementById('pc-mute-btn');

    if (isTouch) {
        if (pcInstructions) pcInstructions.style.display = 'none';
        if (touchInstructions) touchInstructions.style.display = 'block';
        if (touchToolBar) touchToolBar.style.display = 'flex';
        if (pcMuteBtn) pcMuteBtn.style.display = 'none';
        console.log("Touch Mode ENABLED");
        selectionMode = false;
        setTool('place');
    } else {
        if (pcInstructions) pcInstructions.style.display = 'block';
        if (touchInstructions) touchInstructions.style.display = 'none';
        if (touchToolBar) touchToolBar.style.display = 'none';
        if (pcMuteBtn) {
            pcMuteBtn.style.display = 'block';
            console.log("PC Mute Button Enabled");
        }
    }
    return isTouch;
}

detectDevice(); // Initial Run

// --- State Machine Touch Logic ---
// States: IDLE → PENDING (on touchstart) → ROTATING (on drag) or TAP (on lift)
// No setTimeout needed: drag = rotate, lift without move = tap (place/delete)
const TOUCH_STATE = { IDLE: 0, PENDING: 1, ROTATING: 2 };
let touchState = TOUCH_STATE.IDLE;
let twoFingerActive = false;
let lastPinchDist = 0;
let lastTwoFingerCenter = { x: 0, y: 0 };
let lastTwoFingerAngle = 0; // Angle between two fingers for rotation
let lastTouchEndTime = 0; // Block synthetic mouse events
const DRAG_THRESHOLD = 8; // px — movement beyond this = rotation, not tap

function getTouchDistance(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function getTouchCenter(t1, t2) {
    return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    };
}

function getTouchAngle(t1, t2) {
    return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
}

function doPlaceOrDelete(screenX, screenY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (currentTool === 'place') {
        if (ghostBlock.visible) {
            createBlock(ghostBlock.position.clone(), currentColorIndex);
        }
    } else if (currentTool === 'delete') {
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

// --- Touch Start ---
renderer.domElement.addEventListener('touchstart', (e) => {
    if (!isTouchMode) return;

    if (e.touches.length === 1 && !twoFingerActive) {
        const t = e.touches[0];
        touchStartPos.set(t.clientX, t.clientY);
        touchState = TOUCH_STATE.PENDING;
        // Show ghost at tap position
        updateGhostBlock({ clientX: t.clientX, clientY: t.clientY });
    }
    else if (e.touches.length === 2) {
        touchState = TOUCH_STATE.IDLE;
        twoFingerActive = true;
        lastPinchDist = getTouchDistance(e.touches[0], e.touches[1]);
        lastTwoFingerCenter = getTouchCenter(e.touches[0], e.touches[1]);
        lastTwoFingerAngle = getTouchAngle(e.touches[0], e.touches[1]);
        updateCameraTarget();
        ghostBlock.visible = false;
    }
}, { passive: true });

// --- Touch Move ---
renderer.domElement.addEventListener('touchmove', (e) => {
    if (!isTouchMode) return;
    e.preventDefault();

    if (e.touches.length === 1 && !twoFingerActive) {
        const t = e.touches[0];

        if (touchState === TOUCH_STATE.PENDING) {
            const dist = Math.hypot(t.clientX - touchStartPos.x, t.clientY - touchStartPos.y);
            if (dist > DRAG_THRESHOLD) {
                touchState = TOUCH_STATE.ROTATING;
                updateCameraTarget();
                previousMousePosition = { x: t.clientX, y: t.clientY };
                ghostBlock.visible = false;
            }
        }

        if (touchState === TOUCH_STATE.ROTATING) {
            const deltaX = t.clientX - previousMousePosition.x;
            const deltaY = t.clientY - previousMousePosition.y;
            cameraRotation.y += deltaX * 0.008;
            cameraRotation.x += deltaY * 0.008;
            cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x));
            updateCamera();
            previousMousePosition = { x: t.clientX, y: t.clientY };
        }
    }
    else if (e.touches.length === 2) {
        twoFingerActive = true;
        touchState = TOUCH_STATE.IDLE;

        // 1. Pinch zoom (distance change)
        const newDist = getTouchDistance(e.touches[0], e.touches[1]);
        if (lastPinchDist > 0) {
            const scale = lastPinchDist / newDist;
            cameraDistance *= scale;
            cameraDistance = Math.max(5, Math.min(50, cameraDistance));
        }
        lastPinchDist = newDist;

        // 2. Pan (center movement)
        const newCenter = getTouchCenter(e.touches[0], e.touches[1]);
        const panDX = newCenter.x - lastTwoFingerCenter.x;
        const panDY = newCenter.y - lastTwoFingerCenter.y;

        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        camera.getWorldDirection(right);
        right.cross(up).normalize();
        const panSpeed = cameraDistance * 0.001;
        cameraTarget.add(right.multiplyScalar(-panDX * panSpeed));
        cameraTarget.y += panDY * panSpeed;

        lastTwoFingerCenter = newCenter;

        // 3. Rotate (angle change between two fingers)
        const newAngle = getTouchAngle(e.touches[0], e.touches[1]);
        let angleDelta = newAngle - lastTwoFingerAngle;
        // Normalize to [-PI, PI] to handle wrap-around
        if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
        if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
        cameraRotation.y -= angleDelta;
        lastTwoFingerAngle = newAngle;

        updateCamera();
    }
}, { passive: false });

// --- Touch End ---
renderer.domElement.addEventListener('touchend', (e) => {
    if (!isTouchMode) return;

    // Two-finger gesture ended
    if (twoFingerActive) {
        if (e.touches.length === 0) {
            twoFingerActive = false;
            lastPinchDist = 0;
        }
        touchState = TOUCH_STATE.IDLE;
        lastTouchEndTime = Date.now();
        return;
    }

    // Single finger lifted while still PENDING = TAP → place or delete
    if (touchState === TOUCH_STATE.PENDING && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        doPlaceOrDelete(t.clientX, t.clientY);
    }
    // If ROTATING, just stop — no action on lift

    touchState = TOUCH_STATE.IDLE;
    lastTouchEndTime = Date.now();
}, { passive: true });


// --- Mute & Transparency Logic ---

window.toggleMute = function () {
    const audio = document.getElementById('bg-music');
    if (audio) {
        audio.muted = !audio.muted;
        const icon = audio.muted ? '🔇' : '🔊';
        const btns = document.querySelectorAll('#tool-mute, #pc-mute-btn');
        btns.forEach(btn => btn.innerText = icon);
    }
}

window.toggleTransparency = function () {
    transparencyMode = !transparencyMode;
    placedBlocks.forEach(block => {
        block.mesh.material.transparent = transparencyMode;
        block.mesh.material.opacity = transparencyMode ? 0.2 : 1.0;
        block.mesh.material.needsUpdate = true;
    });
    const btn = document.getElementById('tool-transparency');
    if (btn) {
        if (transparencyMode) btn.classList.add('active');
        else btn.classList.remove('active');
    }
}

// --- Touch Help Toggle ---
window.toggleTouchHelp = function () {
    const helpPanel = document.getElementById('touch-help');
    if (helpPanel) {
        helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
    }
}

// --- Simulator Events (desktop ?touch=1 testing only) ---
// Skip synthetic mouse events that browsers fire after real touch events
renderer.domElement.addEventListener('mousedown', (e) => {
    if (isTouchMode && e.button === 0) {
        if (Date.now() - lastTouchEndTime < 500) return;
        touchStartPos.set(e.clientX, e.clientY);
        touchState = TOUCH_STATE.PENDING;
        updateGhostBlock({ clientX: e.clientX, clientY: e.clientY });
    }
});
renderer.domElement.addEventListener('mousemove', (e) => {
    if (isTouchMode) {
        if (Date.now() - lastTouchEndTime < 500) return;
        if (touchState === TOUCH_STATE.PENDING) {
            const dist = Math.hypot(e.clientX - touchStartPos.x, e.clientY - touchStartPos.y);
            if (dist > DRAG_THRESHOLD) {
                touchState = TOUCH_STATE.ROTATING;
                updateCameraTarget();
                previousMousePosition = { x: e.clientX, y: e.clientY };
                ghostBlock.visible = false;
            }
        }
        if (touchState === TOUCH_STATE.ROTATING) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            cameraRotation.y += deltaX * 0.008;
            cameraRotation.x += deltaY * 0.008;
            cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x));
            updateCamera();
            previousMousePosition = { x: e.clientX, y: e.clientY };
        } else if (touchState === TOUCH_STATE.IDLE) {
            updateGhostBlock({ clientX: e.clientX, clientY: e.clientY });
        }
    }
});
renderer.domElement.addEventListener('mouseup', (e) => {
    if (isTouchMode && e.button === 0) {
        if (Date.now() - lastTouchEndTime < 500) return;
        if (touchState === TOUCH_STATE.PENDING) {
            doPlaceOrDelete(e.clientX, e.clientY);
        }
        touchState = TOUCH_STATE.IDLE;
    }
});

// Debug Toggle
window.toggleDebugTouch = function () {
    const currentInfo = new URLSearchParams(window.location.search);
    if (currentInfo.get('touch') === '1') currentInfo.delete('touch');
    else currentInfo.set('touch', '1');
    window.location.search = currentInfo.toString();
}




animate();
