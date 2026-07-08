// Game State
const gameState = {
    score: 0,
    dirtParticles: [],
    cleanedParticles: new Set(),
    gameActive: false,
    startTime: 0,
    elapsedTime: 0,
    handDetections: [],
    gameTime: 120, // 2 Minuten Spielzeit
    cameraMode: 'user', // 'user' oder 'environment'
    devMode: false, // Dev-Mode für Hand-Tracking
    referenceDistance: 100, // Referenzdistanz für Depth-Berechnung
};

// Audio Context für Bubble Sound
let audioContext;
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Bubble Sound Generator
function playBubbleSound() {
    initAudio();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.start(now);
    osc.stop(now + 0.15);
}

// Video Setup
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('canvas-overlay');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Hand Detection Model
let handDetector;
async function loadHandDetector() {
    try {
        const model = await handPoseDetection.createDetector(
            handPoseDetection.SupportedModels.MediaPipeHands,
            {
                runtime: 'mediapipe',
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
            }
        );
        handDetector = model;
        console.log('Hand detector loaded!');
    } catch (error) {
        console.error('Error loading hand detector:', error);
    }
}

// Kamera aktivieren
async function setupCamera() {
    try {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                facingMode: gameState.cameraMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
    } catch (error) {
        console.error('Kamera-Fehler:', error);
        document.getElementById('status').textContent = '❌ Kamera nicht verfügbar!';
    }
}

// Kamera wechseln
async function toggleCamera() {
    gameState.cameraMode = gameState.cameraMode === 'user' ? 'environment' : 'user';
    await setupCamera();
    document.querySelector('.control-button').textContent = 
        gameState.cameraMode === 'user' ? '📷 Vorderkamera' : '📷 Rückkamera';
}

// Dev-Mode Toggle
function toggleDevMode() {
    gameState.devMode = document.getElementById('devModeToggle').checked;
}

// Dirt Particles Generator - FIXIERT AUF WAND
function generateDirtParticles() {
    gameState.dirtParticles = [];
    const particleCount = 50;
    const minDistance = 300; // Minimale Distanz vom Betrachter

    for (let i = 0; i < particleCount; i++) {
        const depth = Math.random() * 200 + minDistance; // 300-500px Distanz
        gameState.dirtParticles.push({
            id: i,
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            depth: depth, // 3D Tiefe
            baseSize: Math.random() * 8 + 4,
            opacity: 0.8 + Math.random() * 0.2,
            fixed: true, // Fixiert auf der Wand!
        });
    }
    document.getElementById('dirt-count').textContent = `Schmutz: ${gameState.dirtParticles.length}`;
}

// Draw Particles mit Depth-Effekt
function drawDirtParticles() {
    gameState.dirtParticles.forEach((particle) => {
        if (!gameState.cleanedParticles.has(particle.id)) {
            // Größe basierend auf Tiefe (weiter weg = kleiner)
            const sizeScale = gameState.referenceDistance / particle.depth;
            const size = particle.baseSize * sizeScale;

            ctx.beginPath();
            ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
            ctx.fill();

            // Glow effect
            ctx.strokeStyle = `rgba(255, 255, 255, ${particle.opacity * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Optional: Tiefe-Text (nur im Dev-Mode)
            if (gameState.devMode) {
                ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
                ctx.font = '10px Arial';
                ctx.fillText(Math.round(particle.depth), particle.x - 15, particle.y + 20);
            }
        }
    });
}

// Hand Detection & Particle Cleaning
async function detectHandsAndClean() {
    if (!handDetector || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    try {
        const predictions = await handDetector.estimateHands(video, false);

        if (predictions.length > 0) {
            predictions.forEach((hand) => {
                const landmarks = hand.keypoints;
                
                // Index-Finger-Spitze für Präzision
                const indexTip = landmarks[8]; // Index finger tip
                const handX = indexTip.x * canvas.width;
                const handY = indexTip.y * canvas.height;
                const detectRadius = 80; // Erkennungsradius

                // Dev-Mode: Roten Punkt zeichnen
                if (gameState.devMode) {
                    ctx.beginPath();
                    ctx.arc(handX, handY, 10, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 0, 0, 1)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // Check collision mit Dirt Particles
                gameState.dirtParticles.forEach((particle) => {
                    if (!gameState.cleanedParticles.has(particle.id)) {
                        const sizeScale = gameState.referenceDistance / particle.depth;
                        const size = particle.baseSize * sizeScale;

                        const distance = Math.sqrt(
                            Math.pow(handX - particle.x, 2) +
                            Math.pow(handY - particle.y, 2)
                        );

                        if (distance < detectRadius + size) {
                            // Particle gereinigt!
                            gameState.cleanedParticles.add(particle.id);
                            gameState.score += 10;
                            playBubbleSound();
                            createCleanEffect(particle.x, particle.y, size);
                        }
                    }
                });
            });
        }

        gameState.handDetections = predictions;
    } catch (error) {
        console.error('Hand detection error:', error);
    }
}

// Clean Effect Animation
function createCleanEffect(x, y, size) {
    const effect = {
        x,
        y,
        radius: size,
        maxRadius: size + 40,
        opacity: 1,
        startTime: Date.now(),
        duration: 300,
    };

    animateCleanEffect(effect);
}

function animateCleanEffect(effect) {
    const elapsed = Date.now() - effect.startTime;
    const progress = elapsed / effect.duration;

    if (progress < 1) {
        const currentRadius = effect.radius + (effect.maxRadius - effect.radius) * progress;
        const currentOpacity = 1 - progress;

        ctx.beginPath();
        ctx.arc(effect.x, effect.y, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(74, 222, 128, ${currentOpacity * 0.5})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(effect.x, effect.y, currentRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 222, 128, ${currentOpacity * 0.2})`;
        ctx.fill();

        requestAnimationFrame(() => animateCleanEffect(effect));
    }
}

// Game Loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState.gameActive) {
        // Update time
        gameState.elapsedTime = Math.floor((Date.now() - gameState.startTime) / 1000);
        document.getElementById('timer').textContent = `Zeit: ${gameState.elapsedTime}s`;

        // Draw particles
        drawDirtParticles();

        // Detect hands
        detectHandsAndClean();

        // Update Score
        document.getElementById('score').textContent = `Score: ${gameState.score}`;

        // Update Progress
        const cleanedCount = gameState.cleanedParticles.size;
        const totalParticles = gameState.dirtParticles.length;
        const progress = (cleanedCount / totalParticles) * 100;

        const progressBar = document.getElementById('progress-bar');
        progressBar.style.width = progress + '%';
        progressBar.textContent = Math.floor(progress) + '%';
        document.getElementById('progress-text').textContent = `${Math.floor(progress)}% gereinigt`;

        // Update Dirt Count
        document.getElementById('dirt-count').textContent = `Schmutz: ${totalParticles - cleanedCount}`;

        // Win Condition (100% clean)
        if (progress === 100) {
            endGame(true, progress);
        }

        // Timeout (2 Minuten)
        if (gameState.elapsedTime >= gameState.gameTime) {
            endGame(false, progress);
        }
    }

    requestAnimationFrame(gameLoop);
}

// Start Game
async function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('controlPanel').style.display = 'flex';
    document.getElementById('cancelButton').style.display = 'block';
    document.getElementById('status').textContent = '👋 Raum wird gescannt...';

    await loadHandDetector();
    generateDirtParticles();

    setTimeout(() => {
        gameState.gameActive = true;
        gameState.startTime = Date.now();
        document.getElementById('status').textContent = '🧹 Los geht\'s!';
    }, 2000);
}

// Cancel Game
function cancelGame() {
    if (confirm('Möchtest du wirklich abbrechen?')) {
        gameState.gameActive = false;
        gameState.score = 0;
        gameState.dirtParticles = [];
        gameState.cleanedParticles.clear();
        
        document.getElementById('startScreen').classList.remove('hidden');
        document.getElementById('controlPanel').style.display = 'none';
        document.getElementById('cancelButton').style.display = 'none';
        document.getElementById('gameOverScreen').classList.add('hidden');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// End Game
function endGame(won, progress) {
    gameState.gameActive = false;

    const gameOverScreen = document.getElementById('gameOverScreen');
    gameOverScreen.classList.remove('hidden');

    document.getElementById('finalScore').textContent = `Score: ${gameState.score}`;
    document.getElementById('finalStats').innerHTML = `
        <p>Gereinigt: ${Math.floor(progress)}%</p>
        <p>Zeit: ${gameState.elapsedTime}s</p>
        <p>${won ? '🎉 Perfekt sauber!' : '⏰ Zeit vorbei!'}</p>
    `;

    document.getElementById('controlPanel').style.display = 'none';
    document.getElementById('cancelButton').style.display = 'none';
}

// Initialize
window.addEventListener('load', async () => {
    await setupCamera();
    gameLoop();
});
