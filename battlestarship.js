// Game State
let gameState = 'playing'; // 'playing', 'gameOverTransition', 'gameOver'

// Game Objects
let smokeParticles = [], stars = [], explosionParticles = [], sparkParticles = [];
let kamikazes = [], tanks = [], enemyMissiles = [], activeMissiles = [], powerUps = [];

// Player & Camera
let shuttlePos, shuttleVel, cameraPos;

// Player Stats
let playerHealth, playerIsAlive, multiShotCharges = 0;
const MAX_PLAYER_HEALTH = 3;

// Scoring & Waves
let score = 0, waveNumber = 0;

// Timers & Constants
let gameOverStartTime = 0;
const GAMEOVER_TRANSITION_TIME = 2500;
const THROTTLE_RADIUS = 300, MAX_THRUST = 0.4, MISSILE_LIFESPAN = 5000;
const SHUTTLE_RADIUS = 30, KAMIKAZE_RADIUS = 35, TANK_RADIUS = 40;
const POWERUP_DROP_CHANCE = 0.15;

function setup() {
    createCanvas(windowWidth, windowHeight);
    rectMode(CENTER); textAlign(CENTER, CENTER); noCursor();
    restartGame();
}

function draw() {
    if (gameState === 'playing' || gameState === 'gameOverTransition') {
        drawPlaying();
    } else if (gameState === 'gameOver') {
        drawGameOver();
    }
}

function drawPlaying() {
    background(10, 20, 40);

    // --- LOGIC UPDATES ---
    let visualAngle = atan2(mouseY - (height / 2), mouseX - (width / 2));

    if (playerIsAlive) {
        let mouseDist = dist(width / 2, height / 2, mouseX, mouseY);
        let throttle = constrain(map(mouseDist, 0, THROTTLE_RADIUS, 0, 1), 0, 1);
        let thrustForce = p5.Vector.fromAngle(visualAngle).mult(MAX_THRUST * throttle);
        shuttleVel.add(thrustForce);
        shuttlePos.add(shuttleVel);
        shuttleVel.mult(0.98);
    } else { shuttlePos.add(shuttleVel); shuttleVel.mult(0.99); }

    cameraPos.lerp(shuttlePos, 0.08);

    // --- Collision & Updates for all entities ---
    handleKamikazes();
    handleTanks();
    handleEnemyMissiles();
    handlePlayerMissiles();
    handlePowerUps();

    // Particle & Wave Logic
    updateParticles(smokeParticles); updateParticles(explosionParticles); updateParticles(sparkParticles);
    if (kamikazes.length === 0 && tanks.length === 0 && gameState === 'playing') { waveNumber++; spawnWave(waveNumber); }
    if (gameState === 'gameOverTransition' && millis() - gameOverStartTime > GAMEOVER_TRANSITION_TIME) { gameState = 'gameOver'; }

    // --- World Rendering ---
    push();
    translate(width / 2 - cameraPos.x, height / 2 - cameraPos.y);

    let dynamicDrift = p5.Vector.fromAngle(visualAngle).mult(0.25);
    let totalParallaxVel = p5.Vector.add(shuttleVel, dynamicDrift);
    for (let star of stars) { star.update(totalParallaxVel, cameraPos); star.show(); }

    for (let p of powerUps) p.show();
    for (let p of smokeParticles) p.show();
    for (let p of explosionParticles) p.show();
    for (let m of activeMissiles) m.show();
    for (let m of enemyMissiles) m.show();

    if (playerIsAlive) {
        let throttle = constrain(map(dist(width / 2, height / 2, mouseX, mouseY), 0, THROTTLE_RADIUS, 0, 1), 0, 1);
        let engineOffset = 50;
        let emitX = shuttlePos.x + engineOffset * cos(visualAngle + PI);
        let emitY = shuttlePos.y + engineOffset * sin(visualAngle + PI);
        for (let i = 0; i < lerp(2, 25, throttle); i++) smokeParticles.push(new Particle(emitX, emitY, visualAngle, throttle));
        if (playerHealth <= 1 && random() < 0.3) sparkParticles.push(new SparkParticle(shuttlePos));

        push(); translate(shuttlePos.x, shuttlePos.y); rotate(visualAngle + HALF_PI); drawShuttle(throttle, playerHealth); pop();
        for (let p of sparkParticles) p.show();
    }
    for (let k of kamikazes) k.show();
    for (let t of tanks) t.show();

    pop();

    // --- UI ---
    if (gameState === 'playing') { drawReticle(); drawHUD(); }
}

function handlePlayerMissiles() {
    for (let i = activeMissiles.length - 1; i >= 0; i--) {
        let m = activeMissiles[i];
        m.update();
        if (m.isExpired()) { m.explode(); activeMissiles.splice(i, 1); continue; }

        let hit = false;

        // --- NEW: Check for collision with enemy missiles ---
        for (let j = enemyMissiles.length - 1; j >= 0; j--) {
            let em = enemyMissiles[j];
            if (dist(m.pos.x, m.pos.y, em.pos.x, em.pos.y) < 15) {
                createExplosion(m.pos, 50); // Mid-size explosion for missile intercept
                enemyMissiles.splice(j, 1);
                hit = true;
                break;
            }
        }
        if (hit) { activeMissiles.splice(i, 1); continue; }

        // Check for collision with kamikazes
        for (let j = kamikazes.length - 1; j >= 0; j--) {
            if (dist(m.pos.x, m.pos.y, kamikazes[j].pos.x, kamikazes[j].pos.y) < KAMIKAZE_RADIUS + 10) {
                handleEnemyDestroyed(kamikazes[j].pos);
                kamikazes.splice(j, 1);
                hit = true; break;
            }
        }
        if (hit) { activeMissiles.splice(i, 1); continue; }

        // Check for collision with tanks
        for (let j = tanks.length - 1; j >= 0; j--) {
            if (dist(m.pos.x, m.pos.y, tanks[j].pos.x, tanks[j].pos.y) < TANK_RADIUS + 10) {
                tanks[j].hit();
                if (tanks[j].health <= 0) {
                    handleEnemyDestroyed(tanks[j].pos);
                    tanks.splice(j, 1);
                }
                hit = true; break;
            }
        }
        if (hit) { activeMissiles.splice(i, 1); continue; }
    }
}

// ---UNCHANGED CODE---
function handleKamikazes() { for (let i = kamikazes.length - 1; i >= 0; i--) { let k = kamikazes[i]; k.update(shuttlePos); if (playerIsAlive && dist(shuttlePos.x, shuttlePos.y, k.pos.x, k.pos.y) < SHUTTLE_RADIUS + KAMIKAZE_RADIUS) { takeDamage(); createExplosion(k.pos, 50); kamikazes.splice(i, 1); } } }
function handleTanks() { for (let i = tanks.length - 1; i >= 0; i--) { let t = tanks[i]; t.update(shuttlePos); if (playerIsAlive && dist(shuttlePos.x, shuttlePos.y, t.pos.x, t.pos.y) < SHUTTLE_RADIUS + TANK_RADIUS) { takeDamage(); createExplosion(t.pos, 100); tanks.splice(i, 1); } } }
function handleEnemyMissiles() { for (let i = enemyMissiles.length - 1; i >= 0; i--) { let m = enemyMissiles[i]; m.update(shuttlePos); if (m.isExpired()) { m.explode(); enemyMissiles.splice(i, 1); continue; } if (playerIsAlive && dist(shuttlePos.x, shuttlePos.y, m.pos.x, m.pos.y) < SHUTTLE_RADIUS + 10) { takeDamage(); m.explode(); enemyMissiles.splice(i, 1); } } }
function handlePowerUps() { for (let i = powerUps.length - 1; i >= 0; i--) { let p = powerUps[i]; p.update(); if (playerIsAlive && dist(shuttlePos.x, shuttlePos.y, p.pos.x, p.pos.y) < SHUTTLE_RADIUS + p.size / 2) { p.applyEffect(); powerUps.splice(i, 1); } } }
function takeDamage() { playerHealth--; if (playerHealth <= 0) { playerIsAlive = false; createExplosion(shuttlePos, 300); gameState = 'gameOverTransition'; gameOverStartTime = millis(); } }
function handleEnemyDestroyed(pos) { createExplosion(pos, 100); if (random() < POWERUP_DROP_CHANCE) { powerUps.push(new PowerUp(pos, random() < 0.5 ? 'repair' : 'missile')); } score++; }
function mousePressed() { if (gameState === 'playing' && playerIsAlive) { let visualAngle = atan2(mouseY - (height / 2), mouseX - (width / 2)); if (multiShotCharges > 0) { activeMissiles.push(new Missile(shuttlePos, shuttleVel, visualAngle - 0.2)); activeMissiles.push(new Missile(shuttlePos, shuttleVel, visualAngle)); activeMissiles.push(new Missile(shuttlePos, shuttleVel, visualAngle + 0.2)); multiShotCharges--; } else { activeMissiles.push(new Missile(shuttlePos, shuttleVel, visualAngle)); } } else if (gameState === 'gameOver') { restartGame(); } }
function spawnWave(waveNum) { if (waveNum % 2 !== 0) { let numToSpawn = (waveNum + 1) / 2; for (let i = 0; i < numToSpawn; i++) kamikazes.push(new Kamikaze(shuttlePos)); } else { let numToSpawn = waveNum / 2; for (let i = 0; i < numToSpawn; i++) tanks.push(new Tank(shuttlePos)); } }
class Tank { constructor(playerPos) { this.pos = getSpawnPosition(playerPos); this.vel = createVector(); this.maxSpeed = 2; this.maxForce = 0.05; this.health = 3; this.cannonAngle = 0; this.fireCooldown = 3000; this.lastFireTime = millis() + random(-500, 500); this.flashTime = 0; } update(targetPos) { let desired = p5.Vector.sub(targetPos, this.pos); if (desired.mag() > 250) { desired.setMag(this.maxSpeed); let steering = p5.Vector.sub(desired, this.vel); steering.limit(this.maxForce); this.vel.add(steering); } this.pos.add(this.vel); this.vel.mult(0.98); this.cannonAngle = atan2(targetPos.y - this.pos.y, targetPos.x - this.pos.x); if (millis() - this.lastFireTime > this.fireCooldown) { enemyMissiles.push(new EnemyMissile(this.pos, this.cannonAngle)); this.lastFireTime = millis(); } if (this.flashTime > 0) this.flashTime--; } hit() { this.health--; this.flashTime = 10; createExplosion(this.pos, 15); } show() { push(); translate(this.pos.x, this.pos.y); if (this.flashTime > 0) { fill(255); } else { fill(80, 90, 80); } stroke(150); strokeWeight(3); ellipse(0, 0, TANK_RADIUS * 2); rotate(this.cannonAngle); fill(50); stroke(100); rect(TANK_RADIUS * 0.8, 0, TANK_RADIUS, 15); pop(); } }
class EnemyMissile { constructor(pos, angle) { this.pos = pos.copy(); this.vel = p5.Vector.fromAngle(angle, 6); this.maxSpeed = 4.5; this.maxForce = 0.2; this.creationTime = millis(); this.lifespan = 4000; } update(targetPos) { let desired = p5.Vector.sub(targetPos, this.pos); desired.setMag(this.maxSpeed); let steering = p5.Vector.sub(desired, this.vel); steering.limit(this.maxForce); this.vel.add(steering); this.pos.add(this.vel); } isExpired() { return millis() - this.creationTime > this.lifespan; } explode() { createExplosion(this.pos, 30); } show() { push(); translate(this.pos.x, this.pos.y); rotate(this.vel.heading()); fill(255, 100, 0); noStroke(); ellipse(0, 0, 20, 6); fill(255, 200, 0); ellipse(-5, 0, 15, 4); pop(); } }
function drawGameOver() { background(10, 20, 40, 50); fill(255, 0, 0); textSize(80); text('GAME OVER', width / 2, height / 2 - 50); fill(255); textSize(40); text(`Final Score: ${score}`, width / 2, height / 2 + 20); textSize(24); text('Click to Restart', width / 2, height / 2 + 80); }
function restartGame() { shuttlePos = createVector(width / 2, height / 2); shuttleVel = createVector(0, 0); cameraPos = createVector(width / 2, height / 2); playerHealth = MAX_PLAYER_HEALTH; playerIsAlive = true; multiShotCharges = 0; kamikazes = []; tanks = []; enemyMissiles = []; smokeParticles = []; explosionParticles = []; sparkParticles = []; activeMissiles = []; powerUps = []; score = 0; waveNumber = 0; if (stars.length === 0) { for (let i = 0; i < 600; i++) stars.push(new Star()); } gameState = 'playing'; }
function drawShuttle(throttle, health) { noStroke(); let flameSize = lerp(0.8, 1.7, throttle); for (let i = -1; i <= 1; i += 2) { let engineX = i * 20; fill(255, 180, 0, 150); triangle(engineX, 40, engineX - 10 * flameSize, 40 + 20 * flameSize, engineX + 10 * flameSize, 40 + 20 * flameSize); fill(255, 220, 0, 200); triangle(engineX, 40, engineX - 6 * flameSize, 40 + 30 * flameSize, engineX + 6 * flameSize, 40 + 30 * flameSize); } stroke(100, 110, 120); strokeWeight(2); fill(60, 70, 80); beginShape(); vertex(0, -60); vertex(20, -10); vertex(20, 30); vertex(10, 50); vertex(-10, 50); vertex(-20, 30); vertex(-20, -10); endShape(CLOSE); fill(90, 100, 110); quad(-20, -5, -60, 10, -60, 30, -20, 25); quad(20, -5, 60, 10, 60, 30, 20, 25); fill(50, 60, 70); rect(-40, 5, 12, 30); rect(40, 5, 12, 30); noStroke(); fill(40); ellipse(-40, -10, 10, 10); ellipse(40, -10, 10, 10); stroke(100, 110, 120); fill(45, 55, 65); rect(-20, 38, 18, 25); rect(20, 38, 18, 25); fill(0, 200, 255, 200); stroke(200, 255, 255); beginShape(); vertex(0, -45); vertex(12, -25); vertex(0, -20); vertex(-12, -25); endShape(CLOSE); noStroke(); fill(150, 0, 0); triangle(40, 15, 50, 15, 45, 25); triangle(-40, 15, -50, 15, -45, 25); if (health < 3) { noStroke(); fill(20, 20, 20, 180); beginShape(); vertex(20, -10); vertex(40, 5); vertex(30, 20); vertex(15, 15); endShape(CLOSE); } if (health < 2) { noStroke(); fill(20, 20, 20, 180); rect(-35, 12, 30, 8); stroke(0, 150, 180, 100); strokeWeight(1.5); line(0, -45, -5, -28); } }
function drawHUD() {
    fill(255);
    textSize(32);
    textAlign(LEFT, TOP);
    text(`Score: ${score}`, 20, 20);

    for (let i = 0; i < playerHealth; i++) {
        drawHealthIcon(30 + i * 40, 70);
    }

    if (multiShotCharges > 0) {
        textAlign(RIGHT, TOP);
        fill(255, 100, 50);
        text(`Tri-Shot x${multiShotCharges}`, width - 20, 20);
    }
    drawRadar();
}

function drawRadar() {
    let radarX = width - 100;
    let radarY = height - 10;
    let radarRadius = 80;
    let radarWorldRange = 3000;

    push();
    translate(radarX, radarY);

    // Draw radar semi-circle background (arc pointing up)
    fill(0, 50, 100, 150);
    stroke(0, 150, 255, 200);
    strokeWeight(2);
    arc(0, 0, radarRadius * 2, radarRadius * 2, PI, TWO_PI, PIE);

    // Draw grid lines
    stroke(0, 150, 255, 100);
    strokeWeight(1);
    line(0, 0, 0, -radarRadius); // Forward
    line(0, 0, radarRadius * cos(PI + PI / 4), radarRadius * sin(PI + PI / 4));
    line(0, 0, radarRadius * cos(TWO_PI - PI / 4), radarRadius * sin(TWO_PI - PI / 4));
    noFill();
    arc(0, 0, radarRadius * 1.5, radarRadius * 1.5, PI, TWO_PI);
    arc(0, 0, radarRadius, radarRadius, PI, TWO_PI);
    arc(0, 0, radarRadius * 0.5, radarRadius * 0.5, PI, TWO_PI);

    // Plot enemies
    let enemies = [...kamikazes, ...tanks, ...enemyMissiles];
    let shuttleAngle = atan2(mouseY - (height / 2), mouseX - (width / 2));

    for (let enemy of enemies) {
        let relativePos = p5.Vector.sub(enemy.pos, shuttlePos);
        let distance = relativePos.mag();

        if (distance < radarWorldRange) {
            let enemyAngle = relativePos.heading();
            let relativeAngle = enemyAngle - shuttleAngle;

            // Normalize angle to be between -PI and PI
            while (relativeAngle <= -PI) relativeAngle += TWO_PI;
            while (relativeAngle > PI) relativeAngle -= TWO_PI;

            // Check if the enemy is in the forward 180-degree arc
            if (abs(relativeAngle) <= PI / 2) {
                let radarDist = map(distance, 0, radarWorldRange, 0, radarRadius);

                // Calculate dot position: 0 angle is forward (up), PI/2 is right, -PI/2 is left
                let dotX = radarDist * sin(relativeAngle);
                let dotY = -radarDist * cos(relativeAngle);

                fill(255, 0, 0);
                noStroke();
                ellipse(dotX, dotY, 5, 5);
            }
        }
    }

    // Draw player ship icon at the center, pointing up
    fill(0, 255, 100);
    noStroke();
    triangle(0, 2, -4, -2, 4, -2);

    pop();
}

function drawHealthIcon(x, y) { push(); translate(x, y); scale(0.4); rotate(-PI / 4); noStroke(); fill(90, 100, 110); beginShape(); vertex(0, -30); vertex(15, 10); vertex(-15, 10); endShape(CLOSE); rect(0, 18, 40, 10); pop(); }
class SparkParticle { constructor(sP) { this.start = sP.copy().add(random(-20, 20), random(-30, 30)); this.end = this.start.copy().add(random(-15, 15), random(-15, 15)); this.life = 50; } isFinished() { return this.life < 0; } update() { this.life -= 5; } show() { stroke(200, 255, 255, this.life * 5); strokeWeight(random(1, 2.5)); line(this.start.x, this.start.y, this.end.x, this.end.y); } }
function getSpawnPosition(p) { let a = random(TWO_PI); let r = max(width, height); return createVector(p.x + r * cos(a), p.y + r * sin(a)); }
function createExplosion(pos, n) { for (let i = 0; i < n; i++) explosionParticles.push(new ExplosionParticle(pos)); }
function updateParticles(arr) { for (let i = arr.length - 1; i >= 0; i--) { arr[i].update(); if (arr[i].isFinished()) arr.splice(i, 1); } }
class Kamikaze { constructor(p) { this.pos = getSpawnPosition(p); this.vel = createVector(); this.maxSpeed = random(2.5, 4); this.maxForce = 0.1; this.numTentacles = 7; } update(t) { let d = p5.Vector.sub(t, this.pos); d.setMag(this.maxSpeed); let s = p5.Vector.sub(d, this.vel); s.limit(this.maxForce); this.vel.add(s); this.pos.add(this.vel); } show() { let a = this.vel.heading(); push(); translate(this.pos.x, this.pos.y); rotate(a); stroke(50, 50, 60, 200); strokeWeight(4); noFill(); for (let i = 0; i < this.numTentacles; i++) { let p = frameCount * 0.1 + i * PI; let s = sin(p) * 15; let t = cos(p) * 10; beginShape(); curveVertex(0, 0); curveVertex(0, 0); curveVertex(-20 + s, i * 5 - 15); curveVertex(-60 - t, i * 2 + s / 2); curveVertex(-60 - t, i * 2 + s / 2); endShape(); } noStroke(); fill(80, 80, 100); ellipse(0, 0, 45, 30); fill(60, 60, 75); ellipse(10, 0, 35, 25); fill(255, 50, 50, 200); ellipse(20, 0, 15, 15); fill(255, 150, 150); ellipse(22, 0, 8, 8); pop(); } }
class Missile { constructor(sPos, sVel, a) { let nOff = 60; this.pos = createVector(sPos.x + nOff * cos(a), sPos.y + nOff * sin(a)); let mSpd = 15; this.vel = p5.Vector.fromAngle(a, mSpd).add(sVel); this.angle = a; this.cTime = millis(); } update() { this.pos.add(this.vel); } isExpired() { return millis() - this.cTime > MISSILE_LIFESPAN; } explode() { createExplosion(this.pos, 100); } show() { push(); translate(this.pos.x, this.pos.y); rotate(this.angle + HALF_PI); fill(255, 255, 200); noStroke(); rect(0, 0, 8, 25); let fS = random(0.8, 1.2); fill(150, 200, 255); triangle(0, 15, -4 * fS, 25 * fS, 4 * fS, 25 * fS); pop(); } }
class ExplosionParticle { constructor(p) { this.pos = p.copy(); this.vel = p5.Vector.random2D().mult(random(1, 8)); this.life = 255; this.size = random(5, 15); this.r = 255; this.g = random(150, 255); this.b = 0; } isFinished() { return this.life < 0; } update() { this.vel.mult(0.95); this.pos.add(this.vel); this.life -= 5; this.g = lerp(this.g, 50, 0.1); } show() { noStroke(); fill(this.r, this.g, this.b, this.life); ellipse(this.pos.x, this.pos.y, this.size); } }
function drawReticle() { let mD = dist(width / 2, height / 2, mouseX, mouseY); let t = constrain(map(mD, 0, THROTTLE_RADIUS, 0, 1), 0, 1); let cS = 15; let g = lerp(10, 20, t); cS = lerp(15, 10, t); stroke(0, 255, 100, 150); strokeWeight(2); line(mouseX - g, mouseY, mouseX - g - cS, mouseY); line(mouseX + g, mouseY, mouseX + g + cS, mouseY); line(mouseX, mouseY - g, mouseX, mouseY - g - cS); line(mouseX, mouseY + g, mouseX, mouseY + g + cS); }
class Particle { constructor(x, y, a, t) { this.pos = createVector(x, y); let tA = a + PI; let s = lerp(2, 9, t); let spr = lerp(0.4, 0.7, t); this.size = lerp(20, 50, t) * random(0.8, 1.2); this.vel = p5.Vector.fromAngle(tA, s).rotate(random(-spr, spr)); this.life = 255; this.r = lerp(220, 255, t); this.g = lerp(180, 120, t); this.b = 0; } isFinished() { return this.life < 0; } update() { this.pos.add(this.vel); this.size *= 1.01; this.life -= 4; this.g = lerp(this.g, 200, 0.02); this.r = lerp(this.r, 200, 0.02); } show() { noStroke(); fill(this.r, this.g, this.b, this.life); ellipse(this.pos.x, this.pos.y, this.size); } }
class Star { constructor() { this.pos = createVector(random(-width, width * 2), random(-height, height * 2)); this.z = random(1, 10); this.p_pos = this.pos.copy(); } update(tV, cP) { this.p_pos.set(this.pos); let pV = tV.copy().div(-this.z * 0.2); this.pos.add(pV); const vL = cP.x - width / 2, vR = cP.x + width / 2; const vT = cP.y - height / 2, vB = cP.y + height / 2; if (this.pos.x < vL) { this.pos.x = vR; this.p_pos.x = this.pos.x; } if (this.pos.x > vR) { this.pos.x = vL; this.p_pos.x = this.pos.x; } if (this.pos.y < vT) { this.pos.y = vB; this.p_pos.y = this.pos.y; } if (this.pos.y > vB) { this.pos.y = vT; this.p_pos.y = this.pos.y; } } show() { let sS = map(this.z, 1, 10, 0.5, 3); let sA = map(this.z, 1, 10, 50, 255); stroke(255, sA); strokeWeight(sS); line(this.p_pos.x, this.p_pos.y, this.pos.x, this.pos.y); } }
function windowResized() { resizeCanvas(windowWidth, windowHeight); }
class PowerUp { constructor(position, type) { this.pos = position.copy(); this.vel = p5.Vector.random2D().mult(random(1.5, 2.5)); this.type = type; this.size = 25; this.rotation = random(TWO_PI); this.rotationSpeed = random(-0.03, 0.03); } update() { this.pos.add(this.vel); this.vel.mult(0.99); this.rotation += this.rotationSpeed; } applyEffect() { if (this.type === 'repair') { if (playerHealth < MAX_PLAYER_HEALTH) playerHealth++; } else if (this.type === 'missile') { multiShotCharges += 3; } } show() { push(); translate(this.pos.x, this.pos.y); rotate(this.rotation); strokeWeight(2.5); if (this.type === 'repair') { fill(10, 30, 10, 200); stroke(50, 255, 50); ellipse(0, 0, this.size * 1.5); rectMode(CENTER); rect(0, 0, this.size * 0.8, this.size * 0.2); rect(0, 0, this.size * 0.2, this.size * 0.8); } else { fill(30, 10, 10, 200); stroke(255, 100, 50); ellipse(0, 0, this.size * 1.5); rectMode(CORNER); fill(255, 180, 150); noStroke(); rect(-8, -8, 4, 16); rect(-1, -8, 4, 16); rect(6, -8, 4, 16); } pop(); } }
