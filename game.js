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
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
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

// Dirt Particles Generator
function generateDirtParticles() {
    gameState.dirtParticles = [];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        gameState.dirtParticles.push({
            id: i,
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 8 + 4,
            opacity: 0.8 + Math.random() * 0.2,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
        });
    }
    document.getElementById('dirt-count').textContent = `Schmutz: ${gameState.dirtParticles.length}`;
}

// Draw Particles
function drawDirtParticles() {
    gameState.dirtParticles.forEach((particle) => {
        if (!gameState.cleanedParticles.has(particle.id)) {
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
            ctx.fill();

            // Glow effect
            ctx.strokeStyle = `rgba(255, 255, 255, ${particle.opacity * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Update position (slight floating motion)
            particle.x += particle.vx;
            particle.y += particle.vy;

            // Bounce off edges
            if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

            // Keep in bounds
            particle.x = Math.max(particle.size, Math.min(canvas.width - particle.size, particle.x));
            particle.y = Math.max(particle.size, Math.min(canvas.height - particle.size, particle.y));
        }
    });
}

// Hand Detection & Particle Cleaning
async function detectHandsAndClean() {
    if (!handDetector || !video.readyState === video.HAVE_ENOUGH_DATA) return;

    try {
        const predictions = await handDetector.estimateHands(video, false);

        if (predictions.length > 0) {
            predictions.forEach((hand) => {
                const landmarks = hand.keypoints;

                // Nutze alle Hand-Punkte für größere Hitbox
                landmarks.forEach((landmark) => {
                    const handX = landmark.x * canvas.width;
                    const handY = landmark.y * canvas.height;
                    const detectRadius = 60; // Erkennungsradius

                    // Check collision mit Dirt Particles
                    gameState.dirtParticles.forEach((particle) => {
                        if (!gameState.cleanedParticles.has(particle.id)) {
                            const distance = Math.sqrt(
                                Math.pow(handX - particle.x, 2) +
                                Math.pow(handY - particle.y, 2)
                            );

                            if (distance < detectRadius) {
                                // Particle gereinigt!
                                gameState.cleanedParticles.add(particle.id);
                                gameState.score += 10;
                                playBubbleSound();
                                createCleanEffect(particle.x, particle.y);
                            }
                        }
                    });
                });
            });
        }

        gameState.handDetections = predictions;
    } catch (error) {
        // Stille Fehlerbehandlung
    }
}

// Clean Effect Animation
function createCleanEffect(x, y) {
    // Kurze Blitz-Animation
    const effect = {
        x,
        y,
        radius: 20,
        maxRadius: 60,
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
    document.getElementById('status').textContent = '👋 Raum wird gescannt...';

    await loadHandDetector();
    generateDirtParticles();

    setTimeout(() => {
        gameState.gameActive = true;
        gameState.startTime = Date.now();
        document.getElementById('status').textContent = '🧹 Los geht\'s!';
    }, 2000);
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
}

// Initialize
window.addEventListener('load', async () => {
    await setupCamera();
    await loadHandDetector();
    gameLoop();
});