/**
 * Soundboard SFX — plays REAL bundled sound files (web/public/sfx/*.mp3) through
 * the Web Audio API. All files are self-hosted and license-clean (CC0 / public
 * domain / CC-BY — see /sfx/CREDITS.txt). No synthesis, no paid APIs, no runtime
 * third-party calls.
 *
 * The AudioContext is created lazily on the first play (always a user click), so
 * it satisfies the browser autoplay-unlock requirement automatically.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let vol = 0.6;

function ac(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = vol;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Master volume 0..1 (persisted by the UI). */
export function setVolume(v: number) {
  vol = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.01);
}

export type SoundName =
  | "airhorn"
  | "drumroll"
  | "kaching"
  | "fanfare"
  | "applause"
  | "siren"
  | "trombone"
  | "ding"
  | "pump"
  | "dump"
  | "bonk"
  | "success";

const SAMPLE_URLS: Record<SoundName, string> = {
  airhorn: "/sfx/airhorn.mp3",
  drumroll: "/sfx/drumroll.mp3",
  kaching: "/sfx/kaching.mp3",
  fanfare: "/sfx/fanfare.mp3",
  applause: "/sfx/applause.mp3",
  siren: "/sfx/siren.mp3",
  trombone: "/sfx/trombone.mp3",
  ding: "/sfx/ding.mp3",
  pump: "/sfx/pump.mp3",
  dump: "/sfx/dump.mp3",
  bonk: "/sfx/bonk.mp3",
  success: "/sfx/success.mp3",
};

const rawCache = new Map<string, Promise<ArrayBuffer>>();
const bufCache = new Map<string, AudioBuffer>();

function prefetch(url: string): Promise<ArrayBuffer> {
  let p = rawCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`sfx ${r.status}`);
      return r.arrayBuffer();
    });
    rawCache.set(url, p);
  }
  return p;
}
// start downloading the files immediately (decoding waits for the AudioContext)
Object.values(SAMPLE_URLS).forEach((u) => prefetch(u).catch(() => {}));

async function getBuffer(url: string): Promise<AudioBuffer | null> {
  const hit = bufCache.get(url);
  if (hit) return hit;
  try {
    const raw = await prefetch(url);
    const buf = await ac().decodeAudioData(raw.slice(0));
    bufCache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

function playBuffer(buf: AudioBuffer) {
  const a = ac();
  if (!master) return;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start();
}

let warmed = false;
function warmAll() {
  if (warmed) return;
  warmed = true; // after the first gesture, decode the rest so later clicks are instant
  Object.values(SAMPLE_URLS).forEach((u) => getBuffer(u));
}

/**
 * A short, subtle synthesized two-tone cue (no sample needed) for the CLIP IT moment, so
 * the streamer hears chat popping off even while staring at gameplay. Routes through the
 * soundboard master gain (so it respects volume / mute), keyless, gesture-unlocked.
 */
export function playCue() {
  try {
    const a = ac();
    if (!master || a.state !== "running") return; // audio not unlocked yet — stay silent
    const g = a.createGain();
    g.connect(master);
    const t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    [880, 1320].forEach((f, i) => {
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t + i * 0.085);
      o.connect(g);
      o.start(t + i * 0.085);
      o.stop(t + i * 0.085 + 0.22);
    });
  } catch {
    /* audio unsupported — fail silent */
  }
}

export function playSound(name: SoundName) {
  try {
    warmAll();
    const url = SAMPLE_URLS[name];
    const cached = bufCache.get(url);
    if (cached) {
      playBuffer(cached);
      return;
    }
    getBuffer(url).then((buf) => buf && playBuffer(buf));
  } catch {
    /* audio unsupported — fail silent */
  }
}
