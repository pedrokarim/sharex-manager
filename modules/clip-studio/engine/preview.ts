/**
 * Lecture de l'aperçu dans le navigateur.
 *
 * L'horloge est celle de l'AudioContext : le son est mixé par la Web Audio
 * API (volumes, fondus), et les vidéos, muettes, sont recalées sur cette
 * horloge à chaque image. C'est ce qui garde l'image et le son synchrones,
 * même quand une vidéo peine à suivre.
 */

import { drawFrame, heldFrameOf, type VisualResolver } from "./render";
import { isActive, projectDuration, sourceTimeAt, transitionAt } from "./timeline";
import {
  hasAudio,
  type AudioItem,
  type ClipProject,
  type VideoItem,
  type VisualItem,
} from "./types";

// ─── Médias chargés ──────────────────────────────────────────────

export class MediaLibrary {
  private images = new Map<string, HTMLImageElement>();
  private videos = new Map<string, HTMLVideoElement>();
  private audio = new Map<string, Promise<AudioBuffer | null>>();
  private decoded = new Map<string, AudioBuffer | null>();

  /** Appelé quand un média finit de charger, pour redessiner. */
  onChange: () => void = () => {};

  constructor(readonly audioContext: BaseAudioContext) {}

  image(url: string): HTMLImageElement | null {
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.onload = () => this.onChange();
      image.src = url;
      this.images.set(url, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
  }

  /** Un élément vidéo par élément de timeline : deux coupes d'une même source ne se gênent pas. */
  video(item: VideoItem): HTMLVideoElement {
    let video = this.videos.get(item.id);
    if (!video || video.dataset.src !== item.source.url) {
      video?.pause();
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.dataset.src = item.source.url;
      video.src = item.source.url;
      video.addEventListener("seeked", () => this.onChange());
      video.addEventListener("loadeddata", () => this.onChange());
      this.videos.set(item.id, video);
    }
    return video;
  }

  /** Son décodé d'un média ; `null` s'il n'en contient pas. */
  audioBuffer(url: string): Promise<AudioBuffer | null> {
    let pending = this.audio.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => this.audioContext.decodeAudioData(data))
        .catch(() => null)
        .then((buffer) => {
          this.decoded.set(url, buffer);
          return buffer;
        });
      this.audio.set(url, pending);
    }
    return pending;
  }

  decodedAudio(url: string): AudioBuffer | null | undefined {
    return this.decoded.get(url);
  }

  pauseAll() {
    for (const video of this.videos.values()) video.pause();
  }

  dispose() {
    for (const video of this.videos.values()) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    this.videos.clear();
    this.images.clear();
  }
}

// ─── Lecteur ─────────────────────────────────────────────────────

export class PreviewPlayer {
  frame = 0;
  playing = false;

  private raf = 0;
  private startedAt = 0;
  private startFrame = 0;
  private nodes: AudioScheduledSourceNode[] = [];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resolver: VisualResolver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getProject: () => ClipProject,
    readonly library: MediaLibrary,
    private readonly onTick: (frame: number, playing: boolean) => void
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.library.onChange = () => {
      if (!this.playing) this.render();
    };
    this.resolver = (item) => {
      if (item.type === "image") return this.library.image(item.source.url);
      const video = this.library.video(item);
      return video.readyState >= 2 ? video : null;
    };
  }

  get audioContext(): AudioContext {
    return this.library.audioContext as AudioContext;
  }

  /** Précharge le son des éléments, pour que la lecture démarre sans trou. */
  prefetchAudio() {
    for (const track of this.getProject().tracks) {
      for (const item of track.items) {
        if (hasAudio(item)) void this.library.audioBuffer(item.source.url);
      }
    }
  }

  render() {
    const project = this.getProject();
    if (this.canvas.width !== project.width || this.canvas.height !== project.height) {
      this.canvas.width = project.width;
      this.canvas.height = project.height;
    }
    this.syncVideos(project);
    drawFrame(this.ctx, project, this.frame, this.resolver);
  }

  async play() {
    if (this.playing) return;
    const project = this.getProject();
    if (this.frame >= projectDuration(project) - 1) this.frame = 0;
    await this.audioContext.resume();
    this.playing = true;
    this.startedAt = this.audioContext.currentTime;
    this.startFrame = this.frame;
    this.scheduleAudio(project);
    this.loop();
    this.onTick(this.frame, true);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    this.library.pauseAll();
    this.render();
    this.onTick(this.frame, false);
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(frame: number) {
    const project = this.getProject();
    this.frame = Math.max(0, Math.min(Math.round(frame), projectDuration(project) - 1));
    if (this.playing) {
      this.stopAudio();
      this.startedAt = this.audioContext.currentTime;
      this.startFrame = this.frame;
      this.scheduleAudio(project);
    }
    this.render();
    this.onTick(this.frame, this.playing);
  }

  /** À appeler quand le projet change pendant la lecture (volume, coupe…). */
  refreshAudio() {
    if (!this.playing) return;
    this.stopAudio();
    this.startedAt = this.audioContext.currentTime;
    this.startFrame = this.frame;
    this.scheduleAudio(this.getProject());
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.stopAudio();
    this.library.dispose();
  }

  private loop = () => {
    if (!this.playing) return;
    const project = this.getProject();
    const elapsed = this.audioContext.currentTime - this.startedAt;
    const frame = this.startFrame + Math.floor(elapsed * project.fps);
    const end = projectDuration(project);
    if (frame >= end) {
      this.frame = end - 1;
      this.pause();
      return;
    }
    if (frame !== this.frame) {
      this.frame = frame;
      this.render();
      this.onTick(frame, true);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private syncVideos(project: ClipProject) {
    for (const track of project.tracks) {
      if (track.kind !== "visual") continue;
      // Vidéos qui s'en vont pendant une transition : figées sur leur fin.
      const held = new Set<string>();
      for (const item of track.items as VisualItem[]) {
        if (!isActive(item, this.frame)) continue;
        const from = transitionAt(track.items as VisualItem[], item, this.frame)?.from;
        if (from?.type === "video") held.add(from.id);
      }
      for (const item of track.items) {
        if (item.type !== "video") continue;
        const video = this.library.video(item);
        if (!track.hidden && held.has(item.id)) {
          if (!video.paused) video.pause();
          const end = sourceTimeAt(item, heldFrameOf(item), project.fps);
          if (Math.abs(video.currentTime - end) > 0.5 / project.fps) video.currentTime = end;
          continue;
        }
        if (track.hidden || !isActive(item, this.frame)) {
          if (!video.paused) video.pause();
          continue;
        }
        const target = sourceTimeAt(item, this.frame, project.fps);
        if (this.playing) {
          if (video.paused) {
            video.currentTime = target;
            void video.play().catch(() => undefined);
          } else if (Math.abs(video.currentTime - target) > 0.25) {
            video.currentTime = target;
          }
        } else if (Math.abs(video.currentTime - target) > 0.5 / project.fps) {
          if (!video.paused) video.pause();
          video.currentTime = target;
        }
      }
    }
  }

  private scheduleAudio(project: ClipProject) {
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const fromFrame = this.frame;
    for (const track of project.tracks) {
      if (track.muted || (track.kind === "visual" && track.hidden)) continue;
      for (const item of track.items) {
        if (!hasAudio(item)) continue;
        const end = item.start + item.duration;
        if (end <= fromFrame) continue;
        const buffer = this.library.decodedAudio(item.source.url);
        if (!buffer) continue;

        const fps = project.fps;
        const delay = Math.max(0, (item.start - fromFrame) / fps);
        const skip = Math.max(0, (fromFrame - item.start) / fps);
        const offset = item.trimStart / fps + skip;
        const length = item.duration / fps - skip;
        if (offset >= buffer.duration || length <= 0) continue;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        applyGainEnvelope(gain.gain, item, now + delay - skip, fps);
        source.connect(gain).connect(ctx.destination);
        source.start(now + delay, offset, length);
        this.nodes.push(source);
      }
    }
  }

  private stopAudio() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Déjà arrêté.
      }
    }
    this.nodes = [];
  }
}

/**
 * Volume et fondus d'un élément sonore. `itemStartTime` est l'instant, sur
 * l'horloge du contexte, où l'élément commencerait s'il était lu depuis son
 * début : les fondus restent justes même quand la lecture démarre au milieu.
 */
export function applyGainEnvelope(
  param: AudioParam,
  item: AudioItem | VideoItem,
  itemStartTime: number,
  fps: number
) {
  const volume = item.volume;
  const duration = item.duration / fps;
  const fadeIn = item.type === "audio" ? item.fadeIn / fps : 0;
  const fadeOut = item.type === "audio" ? item.fadeOut / fps : 0;
  param.setValueAtTime(fadeIn > 0 ? 0 : volume, Math.max(0, itemStartTime));
  if (fadeIn > 0) param.linearRampToValueAtTime(volume, Math.max(0, itemStartTime + fadeIn));
  if (fadeOut > 0) {
    param.setValueAtTime(volume, Math.max(0, itemStartTime + duration - fadeOut));
    param.linearRampToValueAtTime(0, Math.max(0, itemStartTime + duration));
  }
}
