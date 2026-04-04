let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(
  freq: number,
  duration: number,
  startTime: number,
  audioCtx: AudioContext
): void {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playNewKot(): void {
  try {
    const c = getCtx();
    const t = c.currentTime;
    playTone(440, 0.15, t, c);
    playTone(550, 0.15, t + 0.18, c);
    playTone(660, 0.25, t + 0.36, c);
  } catch {
    // Audio may not be available
  }
}

export function playOverdue(): void {
  try {
    const c = getCtx();
    const t = c.currentTime;
    playTone(880, 0.2, t, c);
    playTone(440, 0.2, t + 0.25, c);
  } catch {
    // Audio may not be available
  }
}

export function playAllClear(): void {
  try {
    const c = getCtx();
    playTone(440, 0.6, c.currentTime, c);
  } catch {
    // Audio may not be available
  }
}
