'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Minus, Play, Plus, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const SYMBOLS = ['7', 'BAR', '⭐', '💎', '🔔', '🍒', '🍋'] as const;
const INITIAL_CREDITS = 1000;
const BET_AMOUNTS = [10, 25, 50, 100];

type Symbol = (typeof SYMBOLS)[number];

interface SlotStats {
  totalSpins: number;
  totalWins: number;
  totalWinnings: number;
  biggestWin: number;
  highScore: number;
}

const PAYOUT_TABLE: Record<Symbol, number> = {
  '7': 100,
  BAR: 50,
  '⭐': 25,
  '💎': 15,
  '🔔': 10,
  '🍒': 5,
  '🍋': 3,
};

// Symbol weights for realistic slot machine odds
const SYMBOL_WEIGHTS: Record<Symbol, number> = {
  '7': 1,
  BAR: 2,
  '⭐': 3,
  '💎': 4,
  '🔔': 5,
  '🍒': 6,
  '🍋': 8,
};

export default function SlotMachine() {
  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [betAmount, setBetAmount] = useState(BET_AMOUNTS[0]);
  const [reels, setReels] = useState<[Symbol, Symbol, Symbol]>(['🍒', '🍋', '💎']);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stats, setStats] = useState<SlotStats>({
    totalSpins: 0,
    totalWins: 0,
    totalWinnings: 0,
    biggestWin: 0,
    highScore: INITIAL_CREDITS,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const spinningRef = useRef(false);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Play sound effect using Web Audio API
  const playSound = useCallback(
    (type: 'spin' | 'win' | 'lose') => {
      if (!soundEnabled || !audioContextRef.current) return;

      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'spin') {
        oscillator.frequency.value = 200;
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
      } else if (type === 'win') {
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.3);
        });
      } else {
        oscillator.frequency.value = 150;
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    },
    [soundEnabled]
  );

  // Get weighted random symbol
  const getRandomSymbol = useCallback((): Symbol => {
    const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
      random -= weight;
      if (random <= 0) return symbol as Symbol;
    }

    // Fallback to last symbol in SYMBOLS array
    return SYMBOLS[SYMBOLS.length - 1];
  }, []);

  // Spin the reels
  const spin = useCallback(async () => {
    if (isSpinning || credits < betAmount) return;

    setIsSpinning(true);
    spinningRef.current = true;
    setCredits(prev => prev - betAmount);
    setLastWin(0);
    playSound('spin');

    // Animate reels
    const spinDuration = 2000;
    const intervalTime = 100;
    let elapsed = 0;

    const animationInterval = setInterval(() => {
      elapsed += intervalTime;
      setReels([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);

      if (elapsed >= spinDuration) {
        clearInterval(animationInterval);
        spinningRef.current = false;

        // Final result
        const finalReels: [Symbol, Symbol, Symbol] = [
          getRandomSymbol(),
          getRandomSymbol(),
          getRandomSymbol(),
        ];
        setReels(finalReels);

        // Check for win
        const [r1, r2, r3] = finalReels;
        let winAmount = 0;

        if (r1 === r2 && r2 === r3) {
          // Three of a kind
          winAmount = betAmount * PAYOUT_TABLE[r1];
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
          // Two of a kind
          const matchedSymbol = r1 === r2 ? r1 : r1 === r3 ? r1 : r2;
          winAmount = Math.floor((betAmount * PAYOUT_TABLE[matchedSymbol]) / 5);
        }

        if (winAmount > 0) {
          setCredits(prev => prev + winAmount);
          setLastWin(winAmount);
          playSound('win');

          setStats(prev => ({
            ...prev,
            totalWins: prev.totalWins + 1,
            totalWinnings: prev.totalWinnings + winAmount,
            biggestWin: Math.max(prev.biggestWin, winAmount),
            highScore: Math.max(prev.highScore, credits - betAmount + winAmount),
          }));
        } else {
          playSound('lose');
        }

        setStats(prev => ({
          ...prev,
          totalSpins: prev.totalSpins + 1,
        }));

        setIsSpinning(false);
      }
    }, intervalTime);
  }, [isSpinning, credits, betAmount, getRandomSymbol, playSound]);

  // Reset game
  const resetGame = useCallback(() => {
    setCredits(INITIAL_CREDITS);
    setReels(['🍒', '🍋', '💎']);
    setLastWin(0);
    setBetAmount(BET_AMOUNTS[0]);
  }, []);

  // Adjust bet
  const adjustBet = useCallback(
    (direction: 'up' | 'down') => {
      const currentIndex = BET_AMOUNTS.indexOf(betAmount);
      if (direction === 'up' && currentIndex < BET_AMOUNTS.length - 1) {
        setBetAmount(BET_AMOUNTS[currentIndex + 1]);
      } else if (direction === 'down' && currentIndex > 0) {
        setBetAmount(BET_AMOUNTS[currentIndex - 1]);
      }
    },
    [betAmount]
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <span className="text-2xl">🎰</span>
          Kosuke Slots
          <span className="text-2xl">🎰</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">Play while your project is being built!</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Credits Display */}
        <div className="flex justify-between text-lg font-semibold">
          <span>Credits: {credits.toLocaleString()}</span>
          <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>

        {/* Reels */}
        <div className="flex justify-center gap-2">
          {reels.map((symbol, i) => (
            <div
              key={i}
              className={`flex h-24 w-24 items-center justify-center rounded-lg border-2 bg-gradient-to-b from-gray-100 to-gray-200 text-4xl shadow-inner dark:from-gray-800 dark:to-gray-900 ${
                isSpinning ? 'animate-pulse' : ''
              }`}
            >
              {symbol}
            </div>
          ))}
        </div>

        {/* Win Display */}
        {lastWin > 0 && (
          <div className="text-center text-xl font-bold text-green-500 animate-bounce">
            WIN: {lastWin.toLocaleString()} credits!
          </div>
        )}

        {/* Bet Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => adjustBet('down')}
            disabled={isSpinning || betAmount === BET_AMOUNTS[0]}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-24 text-center font-semibold">Bet: {betAmount}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => adjustBet('up')}
            disabled={isSpinning || betAmount === BET_AMOUNTS[BET_AMOUNTS.length - 1]}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Spin Button */}
        <Button
          className="w-full text-lg"
          size="lg"
          onClick={spin}
          disabled={isSpinning || credits < betAmount}
        >
          {isSpinning ? (
            'Spinning...'
          ) : credits < betAmount ? (
            'Not enough credits'
          ) : (
            <>
              <Play className="mr-2 h-5 w-5" />
              SPIN
            </>
          )}
        </Button>

        {/* Reset Button */}
        {credits < BET_AMOUNTS[0] && (
          <Button variant="outline" className="w-full" onClick={resetGame}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Game
          </Button>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          <div>Spins: {stats.totalSpins}</div>
          <div>Wins: {stats.totalWins}</div>
          <div>Total Won: {stats.totalWinnings.toLocaleString()}</div>
          <div>Best Win: {stats.biggestWin.toLocaleString()}</div>
        </div>

        {/* Payout Table */}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Payout Table</summary>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {Object.entries(PAYOUT_TABLE).map(([symbol, multiplier]) => (
              <div key={symbol} className="flex justify-between">
                <span>{symbol} x3:</span>
                <span>{multiplier}x</span>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
