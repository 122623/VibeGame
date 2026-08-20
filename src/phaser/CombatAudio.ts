export class CombatAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: OscillatorNode[];

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
      this.startAmbience();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(effectType: string): void {
    if (!this.context || !this.master || this.context.state !== "running") return;
    if (effectType === "slash" || effectType === "skillSlash") this.tone(190, 75, 0.09, "sawtooth", 0.28);
    else if (effectType === "damage") this.noise(0.07, 0.2);
    else if (effectType === "death") this.tone(120, 38, 0.34, "square", 0.24);
    else if (effectType === "heal") this.tone(360, 720, 0.2, "sine", 0.22);
    else if (effectType === "dash" || effectType === "jump") this.tone(110, 230, 0.1, "triangle", 0.16);
    else if (effectType === "ring") this.tone(260, 150, 0.18, "triangle", 0.18);
  }

  dispose(): void {
    for (const oscillator of this.ambience ?? []) oscillator.stop();
    this.ambience = undefined;
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }

  private startAmbience(): void {
    if (!this.context || !this.master) return;
    const ambienceGain = this.context.createGain();
    ambienceGain.gain.value = 0.025;
    ambienceGain.connect(this.master);
    this.ambience = [43, 65].map((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index * 7;
      oscillator.connect(ambienceGain);
      oscillator.start();
      return oscillator;
    });
  }

  private tone(from: number, to: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private noise(duration: number, volume: number): void {
    if (!this.context || !this.master) return;
    const frameCount = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.master);
    source.start();
  }
}
