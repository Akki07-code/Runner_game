import React, { useState, useRef, useEffect } from 'react';
import './index.css';

const GAME_WIDTH = 500;
const GAME_HEIGHT = 200;
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 60;
const OBSTACLE_SPEED = 4;
const PLAYER_LEFT = 30;
const JUMP_HEIGHT = 150;
const GRAVITY = 3;

const CLOUD_WIDTH = 60;
const CLOUD_HEIGHT = 24;
const CLOUD_SPEED = 1;

const PLAYER_QUEUE = [
  { name: 'Player 1', color: '#4287f5' },
  { name: 'Player 2', color: '#f54242' },
  { name: 'Player 3', color: '#42f554' },
  { name: 'Player 4', color: '#f5e142' },
];

const RunnerGame = () => {
  // characterY: distance from ground (bottom), 0 = ground
  const [characterY, setCharacterY] = useState(0);
  const [isJumping, setIsJumping] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [clouds, setClouds] = useState([]);
  const jumpAnimRef = useRef(null);
  const jumpYRef = useRef(0);
  const jumpVRef = useRef(0);
  const obstacleAnimRef = useRef(null);
  const obstacleGenRef = useRef(null);
  const scoreIntervalRef = useRef(null);
  const milestoneAudioRef = useRef(null);
  const tickleAudioRef = useRef(null);
  const toggleAudioRef = useRef(null);
  const cloudAnimRef = useRef(null);
  const cloudGenRef = useRef(null);
  const lastTickleScoreRef = useRef(0);
  const jumpLockRef = useRef(false);
  // New sound refs
  const jumpAudioRef = useRef(null);
  const passAudioRef = useRef(null);
  const gameOverAudioRef = useRef(null);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [playerScores, setPlayerScores] = useState(Array(PLAYER_QUEUE.length).fill(0));
  const [showResults, setShowResults] = useState(false);
  const [characterX, setCharacterX] = useState(-50);
  const [isEntering, setIsEntering] = useState(true);

  // Load milestone, tickle, and toggle sounds
  useEffect(() => {
    milestoneAudioRef.current = new Audio(process.env.PUBLIC_URL + '/milestone.mp3');
    tickleAudioRef.current = new Audio(process.env.PUBLIC_URL + '/tickle.mp3');
    toggleAudioRef.current = new Audio(process.env.PUBLIC_URL + '/toggle.wav');
    // Load new sounds
    jumpAudioRef.current = new Audio(process.env.PUBLIC_URL + '/jump.wav');
    passAudioRef.current = new Audio(process.env.PUBLIC_URL + '/pass.wav');
    gameOverAudioRef.current = new Audio(process.env.PUBLIC_URL + '/gameover.mp3');
    gameOverAudioRef.current.volume = 0.05; // Set volume to 5%
  }, []);

  // Animate character running in at the start of each turn
  useEffect(() => {
    setCharacterX(-50);
    setIsEntering(true);
    let animId;
    function animateIn() {
      setCharacterX((prev) => {
        if (prev < PLAYER_LEFT) {
          return Math.min(prev + 3, PLAYER_LEFT); // Slower run-in
        } else {
          setIsEntering(false);
          return PLAYER_LEFT;
        }
      });
      animId = requestAnimationFrame(animateIn);
    }
    animateIn();
    return () => cancelAnimationFrame(animId);
  }, [currentPlayerIdx]);

  // Debounced jump using requestAnimationFrame
  const handleJump = () => {
    if (isGameOver || isJumping || jumpLockRef.current || isEntering) return;
    setIsJumping(true);
    jumpLockRef.current = true;
    jumpYRef.current = characterY;
    jumpVRef.current = 12; // Lower jump velocity for a shorter jump
    // Play jump sound
    if (jumpAudioRef.current) {
      jumpAudioRef.current.currentTime = 0;
      jumpAudioRef.current.play().catch(() => {});
    }
    jumpAnimRef.current = requestAnimationFrame(jumpStep);
  };

  // Jump animation using requestAnimationFrame
  const jumpStep = () => {
    jumpVRef.current -= GRAVITY * 0.18; // scale gravity for smoothness
    jumpYRef.current += jumpVRef.current;
    if (jumpYRef.current <= 0) {
      jumpYRef.current = 0;
      setCharacterY(0);
      setIsJumping(false);
      jumpLockRef.current = false;
      cancelAnimationFrame(jumpAnimRef.current);
      return;
    }
    setCharacterY(jumpYRef.current);
    jumpAnimRef.current = requestAnimationFrame(jumpStep);
  };

  // Allow jump with up arrow key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'ArrowUp') {
        handleJump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameOver, isJumping, characterY]);

  // Generate obstacles every 1.5-2 seconds
  useEffect(() => {
    if (isGameOver) return;
    function generateObstacle() {
      // Randomize cactus size
      const minWidth = 40, maxWidth = 70;
      const minHeight = 80, maxHeight = 140;
      const width = Math.floor(Math.random() * (maxWidth - minWidth + 1)) + minWidth;
      const height = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
      setObstacles((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          x: GAME_WIDTH,
          width,
          height,
        },
      ]);
      const nextTime = 1500 + Math.random() * 500;
      obstacleGenRef.current = setTimeout(generateObstacle, nextTime);
    }
    generateObstacle();
    return () => clearTimeout(obstacleGenRef.current);
  }, [isGameOver]);

  // Move obstacles and check collision
  useEffect(() => {
    if (isGameOver) return;
    function checkCollision(playerRect, obsRect) {
      return !(
        playerRect.right < obsRect.left ||
        playerRect.left > obsRect.right ||
        playerRect.bottom < obsRect.top ||
        playerRect.top > obsRect.bottom
      );
    }

    function animateObstacles() {
      setObstacles((prev) => {
        let passed = false;
        const updated = prev
          .map((obs) => {
            const newX = obs.x - OBSTACLE_SPEED;
            // Play pass sound if obstacle just passed the player
            if (!obs.passed && obs.x >= PLAYER_LEFT + PLAYER_SIZE && newX < PLAYER_LEFT + PLAYER_SIZE) {
              passed = true;
            }
            return { ...obs, x: newX, passed: obs.passed || (obs.x >= PLAYER_LEFT + PLAYER_SIZE && newX < PLAYER_LEFT + PLAYER_SIZE) };
          })
          .filter((obs) => obs.x + OBSTACLE_WIDTH > 0);

        // Collision detection
        const playerRect = {
          left: PLAYER_LEFT,
          right: PLAYER_LEFT + PLAYER_SIZE,
          top: GAME_HEIGHT - PLAYER_SIZE - characterY,
          bottom: GAME_HEIGHT - characterY,
        };
        for (let obs of updated) {
          const obsRect = {
            left: obs.x,
            right: obs.x + OBSTACLE_WIDTH,
            top: GAME_HEIGHT - OBSTACLE_HEIGHT,
            bottom: GAME_HEIGHT,
          };
          if (checkCollision(playerRect, obsRect)) {
            setIsGameOver(true);
            // Play game over sound with debug logging
            if (gameOverAudioRef.current) {
              console.log('Attempting to play game over sound');
              gameOverAudioRef.current.currentTime = 0;
              gameOverAudioRef.current.play().then(() => {
                console.log('Game over sound played successfully');
              }).catch((e) => {
                console.warn('Game over audio play failed:', e);
              });
            }
            return updated;
          }
        }
        // Play pass sound outside the loop
        if (passed && passAudioRef.current) {
          passAudioRef.current.currentTime = 0;
          passAudioRef.current.play().catch(() => {});
        }
        return updated;
      });
      if (!isGameOver) {
        obstacleAnimRef.current = requestAnimationFrame(animateObstacles);
      }
    }
    obstacleAnimRef.current = requestAnimationFrame(animateObstacles);
    return () => cancelAnimationFrame(obstacleAnimRef.current);
  }, [isGameOver, characterY]);

  // Increment score over time
  useEffect(() => {
    if (isGameOver) return;
    scoreIntervalRef.current = setInterval(() => {
      setScore((prev) => prev + 1);
    }, 100);
    return () => clearInterval(scoreIntervalRef.current);
  }, [isGameOver]);

  // Play milestone sound at 100
  useEffect(() => {
    if (score === 100 && milestoneAudioRef.current) {
      milestoneAudioRef.current.currentTime = 0;
      milestoneAudioRef.current.play().catch((e) => {
        console.warn('Audio play failed:', e);
      });
    }
  }, [score]);

  // Play tickle and toggle sound every 100 points (100, 200, 300, ...)
  useEffect(() => {
    if (!isGameOver && score > 0 && score % 100 === 0 && lastTickleScoreRef.current !== score) {
      if (tickleAudioRef.current) {
        tickleAudioRef.current.currentTime = 0;
        tickleAudioRef.current.play().catch((e) => {
          console.warn('Tickle audio play failed:', e);
        });
      }
      if (toggleAudioRef.current) {
        toggleAudioRef.current.currentTime = 0;
        console.log('Playing toggle sound');
        toggleAudioRef.current.play().catch((e) => {
          console.warn('Toggle audio play failed:', e);
        });
      }
      lastTickleScoreRef.current = score;
    }
  }, [score, isGameOver]);

  // Clouds: generate and animate
  useEffect(() => {
    if (isGameOver) return;
    function generateCloud() {
      setClouds((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          x: GAME_WIDTH,
          y: Math.random() * 60 + 100, // random height in upper half
        },
      ]);
      const nextTime = 2000 + Math.random() * 2000;
      cloudGenRef.current = setTimeout(generateCloud, nextTime);
    }
    generateCloud();
    return () => clearTimeout(cloudGenRef.current);
  }, [isGameOver]);

  useEffect(() => {
    if (isGameOver) return;
    function animateClouds() {
      setClouds((prev) =>
        prev
          .map((cloud) => ({ ...cloud, x: cloud.x - CLOUD_SPEED }))
          .filter((cloud) => cloud.x + CLOUD_WIDTH > 0)
      );
      cloudAnimRef.current = requestAnimationFrame(animateClouds);
    }
    cloudAnimRef.current = requestAnimationFrame(animateClouds);
    return () => cancelAnimationFrame(cloudAnimRef.current);
  }, [isGameOver]);

  // Game Over UI
  const handleTryAgain = () => {
    setObstacles([]);
    setIsGameOver(false);
    setCharacterY(0);
    setScore(0);
    setClouds([]);
    lastTickleScoreRef.current = 0; // <-- Add this line
    // Stop and reset game over sound
    if (gameOverAudioRef.current) {
      gameOverAudioRef.current.pause();
      gameOverAudioRef.current.currentTime = 0;
    }
  };

  // On game over, move to next player or show results
  useEffect(() => {
    if (isGameOver) {
      setPlayerScores((prev) => {
        const updated = [...prev];
        updated[currentPlayerIdx] = score;
        return updated;
      });
      const timeout = setTimeout(() => {
        if (currentPlayerIdx < PLAYER_QUEUE.length - 1) {
          setCurrentPlayerIdx((idx) => idx + 1);
          setScore(0);
          setObstacles([]);
          setIsGameOver(false);
          setCharacterY(0);
          setClouds([]);
          lastTickleScoreRef.current = 0;
        } else {
          setShowResults(true);
        }
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [isGameOver]);

  // Reset everything for a new round of all players
  const handleRestartAll = () => {
    setCurrentPlayerIdx(0);
    setPlayerScores(Array(PLAYER_QUEUE.length).fill(0));
    setShowResults(false);
    setObstacles([]);
    setIsGameOver(false);
    setCharacterY(0);
    setScore(0);
    setClouds([]);
    lastTickleScoreRef.current = 0;
    if (gameOverAudioRef.current) {
      gameOverAudioRef.current.pause();
      gameOverAudioRef.current.currentTime = 0;
    }
  };

  // Results sorted by score
  const sortedResults = playerScores
    .map((score, idx) => ({ name: PLAYER_QUEUE[idx].name, score, color: PLAYER_QUEUE[idx].color }))
    .sort((a, b) => b.score - a.score);

  // Unique styles for each player
  const playerStyles = [
    // Player 1: Blue head, default body
    {
      head: { background: '#4287f5', border: '2px solid #222' },
      body: { background: '#222' },
      accessories: null,
    },
    // Player 2: Red head, yellow body
    {
      head: { background: '#f54242', border: '2px solid #222' },
      body: { background: '#ffe066' },
      accessories: null,
    },
    // Player 3: Green head, glasses
    {
      head: { background: '#42f554', border: '2px solid #222', position: 'relative' },
      body: { background: '#222' },
      accessories: (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 7,
          width: 18,
          height: 6,
          borderRadius: 4,
          background: 'none',
          border: '2px solid #333',
          borderLeft: 'none',
          borderRight: 'none',
          transform: 'translateX(-50%)',
          zIndex: 3,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', border: '2px solid #333', background: '#fff', marginRight: 2 }} />
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', border: '2px solid #333', background: '#fff', marginLeft: 2 }} />
        </div>
      ),
    },
    // Player 4: Purple head, hat
    {
      head: { background: '#a142f5', border: '2px solid #222', position: 'relative' },
      body: { background: '#222' },
      accessories: (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: -6,
          width: 18,
          height: 8,
          background: '#333',
          borderRadius: '8px 8px 4px 4px',
          transform: 'translateX(-50%)',
          zIndex: 3,
        }} />
      ),
    },
  ];

  if (showResults) {
    return (
      <div style={{ width: GAME_WIDTH, height: GAME_HEIGHT, position: 'relative', overflow: 'hidden', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#fff', textAlign: 'center', marginTop: 0, marginBottom: 30 }}>Results</h2>
        <ol style={{ fontSize: 22, margin: '0 auto 40px auto', width: 220, color: '#fff', paddingLeft: 30 }}>
          {sortedResults.map((res, i) => (
            <li key={res.name} style={{ color: res.color, fontWeight: i === 0 ? 'bold' : 'normal', marginBottom: 10 }}>
              {res.name}: <span style={{ color: '#fff' }}>{res.score}</span>
            </li>
          ))}
        </ol>
        <button style={{ display: 'block', margin: '0 auto', padding: '12px 32px', fontSize: '1.1rem', background: '#fff', color: '#222', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }} onClick={handleRestartAll}>Play Again</button>
      </div>
    );
  }

  return (
    <div>
      {/* Player Avatars Queue */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '20px 0 10px 0' }}>
        {PLAYER_QUEUE.map((p, idx) => (
          <div key={p.name} style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: p.color,
            margin: '0 16px',
            border: idx === currentPlayerIdx ? '4px solid #222' : '2px solid #bbb',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#fff',
            fontSize: 18,
            position: 'relative',
            opacity: 1,
            flexDirection: 'column',
          }}>
            {idx === currentPlayerIdx && <span style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 13, color: '#222' }}>Current</span>}
            {idx + 1}
            {/* Show score below avatar */}
            <span style={{ display: 'block', fontSize: 13, color: '#222', marginTop: 4, fontWeight: 'normal' }}>{playerScores[idx]}</span>
          </div>
        ))}
      </div>
      <div
        className="runner-game"
        style={{ 
          width: GAME_WIDTH, 
          height: GAME_HEIGHT, 
          position: 'relative', 
          overflow: 'hidden',
          background: 'linear-gradient(to top, #e0eafc 60%, #cfdef3 100%)',
        }}
        onClick={handleJump}
      >
        {/* Sun */}
        <div style={{
          position: 'absolute',
          left: 30,
          top: 20,
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 60% 40%, #fffde4 60%, #f7d358 100%)',
          zIndex: 1,
          opacity: 0.8,
        }} />
        {/* Hills */}
        <div style={{
          position: 'absolute',
          left: 0,
          bottom: 30,
          width: 200,
          height: 60,
          background: 'radial-gradient(circle at 60% 100%, #b7e2a5 60%, #7ec850 100%)',
          borderTopLeftRadius: 100,
          borderTopRightRadius: 100,
          zIndex: 1,
          opacity: 0.7,
        }} />
        <div style={{
          position: 'absolute',
          left: 120,
          bottom: 40,
          width: 120,
          height: 40,
          background: 'radial-gradient(circle at 40% 100%, #c2e59c 60%, #64b678 100%)',
          borderTopLeftRadius: 80,
          borderTopRightRadius: 80,
          zIndex: 1,
          opacity: 0.6,
        }} />
        {/* Ground */}
        <div style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: 30,
          background: 'linear-gradient(to top, #bca77b 60%, #e5d7b7 100%)',
          borderTop: '2px solid #a38b5f',
          zIndex: 2,
        }} />
        {/* Clouds */}
        {clouds.map((cloud) => (
          <div
            key={cloud.id}
            className="cloud"
            style={{ left: cloud.x, top: cloud.y, width: CLOUD_WIDTH, height: CLOUD_HEIGHT }}
          />
        ))}
        {/* Score */}
        <div className="score">{score}</div>
        {/* Speed */}
        <div style={{
          position: 'absolute',
          top: 10,
          right: 20,
          fontSize: 18,
          color: '#333',
          fontWeight: 'bold',
          background: 'rgba(255,255,255,0.7)',
          padding: '2px 10px',
          borderRadius: 8,
          zIndex: 10,
        }}>
          Speed: {OBSTACLE_SPEED}
        </div>
        {/* Player */}
        <div
          className="character"
          style={{
            left: characterX,
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
            bottom: characterY,
            zIndex: 5,
          }}
        >
          {/* Head with player color */}
          <div className="head" style={{ background: PLAYER_QUEUE[currentPlayerIdx].color, border: '2px solid #222' }} />
          <div className="body" />
          <div className="arm left" />
          <div className="arm right" />
          <div className="leg left" />
          <div className="leg right" />
        </div>
        {/* Obstacles */}
        {obstacles.map((obs) => (
          <div
            key={obs.id}
            className="cactus"
            style={{ left: obs.x, width: obs.width || OBSTACLE_WIDTH, height: obs.height || OBSTACLE_HEIGHT, bottom: 0, position: 'absolute' }}
          >
            <div className="cactus-body" />
            <div className="cactus-arm left" />
            <div className="cactus-arm right" />
          </div>
        ))}
        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="game-over-overlay">
            <h2>Game Over</h2>
            <p>Score: {score}</p>
            <button onClick={handleTryAgain}>Try Again</button>
          </div>
        )}
        {/* Show overlay while entering */}
        {isEntering && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.15)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#222',
            pointerEvents: 'none',
          }}>
            Running in...
          </div>
        )}
      </div>
    </div>
  );
};

export default RunnerGame;
