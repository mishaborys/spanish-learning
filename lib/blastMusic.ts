/**
 * Фонова музика для Blast: спокійний «космічний» луп, синтезований Web Audio (без аудіофайлів).
 * Мют — це просто `pause()`: аудіо повністю зупиняється й не забирає звук у інших застосунків.
 * Акорди Am – F – C – G по такту; арпеджіо восьмими, бас, тихий пед і легка луна.
 *
 * Браузери дозволяють звук лише після дії користувача, тож `start()` треба викликати з обробника кліку.
 */

const BPM = 96;
const EIGHTH = 60 / BPM / 2;
/** Акорди (MIDI-ноти), по одному на такт з 8 восьмих. */
const CHORDS = [
  [57, 60, 64, 69], // Am
  [53, 57, 60, 65], // F
  [48, 55, 60, 64], // C
  [55, 59, 62, 67], // G
];
/** Порядок нот арпеджіо в такті (індекси в акорді, +12 — октавою вище). */
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
const VOLUME = 0.14;
/** Наскільки наперед плануємо ноти (с) і як часто перевіряємо (мс). */
const LOOKAHEAD = 0.15;
const TICK_MS = 30;

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class BlastMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private step = 0;
  private nextTime = 0;
  /** Запустити (або продовжити після паузи). Викликати з обробника кліку. */
  start() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return; // браузер без Web Audio — гра працює й без музики
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = VOLUME;
      // Легка луна: затримка зі зворотним зв'язком
      const delay = this.ctx.createDelay();
      delay.delayTime.value = EIGHTH * 3;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      this.master.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.ctx.destination);
      this.nextTime = this.ctx.currentTime + 0.05;
    }
    void this.ctx.resume();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Пауза: звук зупиняється, позиція в лупі зберігається. */
  pause() {
    clearInterval(this.timer);
    this.timer = undefined;
    void this.ctx?.suspend();
  }

  /** Зупинити й звільнити аудіо. */
  dispose() {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    // Після довгої паузи вкладки не надолужуємо пропущені ноти
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (CHORDS.length * 8);
      this.nextTime += EIGHTH;
    }
  }

  private playStep(step: number, t: number) {
    const chord = CHORDS[Math.floor(step / 8)];
    const i = step % 8;
    // Арпеджіо: м'який трикутник октавою вище
    this.note(freq(chord[ARP[i]] + 12), t, EIGHTH * 1.6, "triangle", 0.5);
    if (i === 0) {
      // Бас і пед на початку такту
      this.note(freq(chord[0] - 12), t, EIGHTH * 7.5, "sine", 0.9);
      for (const n of chord.slice(1, 3)) this.note(freq(n), t, EIGHTH * 8, "sine", 0.18, 0.4);
    }
  }

  private note(hz: number, t: number, length: number, type: OscillatorType, level: number, attack = 0.01) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}

const MUTE_KEY = "blast-music-muted";
const listeners = new Set<() => void>();
let memoryMuted: boolean | null = null; // якщо сховище недоступне

/** Чи вимкнено музику (запам'ятовується в браузері). */
export function readMuted(): boolean {
  if (memoryMuted !== null) return memoryMuted;
  try { return window.localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function saveMuted(muted: boolean) {
  try { window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { memoryMuted = muted; }
  listeners.forEach(l => l());
}

/** Підписка для useSyncExternalStore: на сервері музика «увімкнена», у браузері — як збережено (і в інших вкладках). */
export function subscribeMuted(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
