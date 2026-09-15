"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { resolveExerciseMedia, type ExerciseMediaContext, type ResolvableExerciseMedia } from "@/src/lib/exercise-media-resolver";

type MediaLike = ResolvableExerciseMedia;

function extOf(path: string) {
  const value = path.split("?")[0] ?? "";
  const dot = value.lastIndexOf(".");
  return dot > -1 ? value.slice(dot + 1).toLowerCase() : "";
}

export function ExerciseVisual({
  media,
  fallbackImage,
  fallbackAnimation,
  frameAnimationUrls = [],
  frameIntervalMs = 700,
  preferFallbackImage = false,
  context = "CATALOG",
  title,
  className = "",
  compact = false,
}: {
  media: MediaLike[];
  fallbackImage?: string | null;
  fallbackAnimation?: string | null;
  frameAnimationUrls?: string[];
  frameIntervalMs?: number;
  preferFallbackImage?: boolean;
  context?: ExerciseMediaContext;
  title: string;
  className?: string;
  compact?: boolean;
}) {
  const [animationFailed, setAnimationFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  // `preferFallbackImage` is retained for backward-compatible callers but no
  // longer changes precedence: central media resolution prevents historic JPGs
  // from winning over an available technical asset.
  void preferFallbackImage;
  const resolved = resolveExerciseMedia({
    media,
    fallbackThumbnailPath: fallbackImage,
    fallbackImagePath: fallbackImage,
    fallbackAnimationPath: fallbackAnimation,
    primaryAnimationPath: fallbackAnimation,
  }, context);
  const animSrc = resolved.animation || "";
  const imageSrc = resolved.image || "";
  const animation = media.find((item) => (item.publicUrl || item.url) === animSrc);
  const format = (animation?.format || extOf(animSrc)).toLowerCase();

  const isVideo = format === "mp4" || format === "webm";
  const isGifOrWebp = format === "gif" || format === "webp" || format === "apng";
  const isLottie = format === "lottie" || format === "json";
  const hasFrameAnimation = frameAnimationUrls.length > 0;
  const activeFrameSrc = useMemo(() => {
    if (!hasFrameAnimation) return "";
    const safeIndex = Math.max(0, Math.min(frameAnimationUrls.length - 1, frameIndex));
    return frameAnimationUrls[safeIndex] ?? "";
  }, [frameAnimationUrls, frameIndex, hasFrameAnimation]);

  useEffect(() => {
    if (!hasFrameAnimation || !isPlaying) return;
    const interval = window.setInterval(() => {
      setFrameIndex((value) => (value + 1) % frameAnimationUrls.length);
    }, Math.max(200, frameIntervalMs));
    return () => window.clearInterval(interval);
  }, [frameAnimationUrls.length, frameIntervalMs, hasFrameAnimation, isPlaying]);

  if (!animationFailed && hasFrameAnimation && activeFrameSrc) {
    return (
      <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
        <Image
          className="exercise-visual-media exercise-visual-media-contain"
          src={activeFrameSrc}
          alt={title}
          width={960}
          height={540}
          onError={() => setAnimationFailed(true)}
        />
        <button
          type="button"
          className="exercise-visual-toggle"
          onClick={() => setIsPlaying((prev) => !prev)}
          aria-label={isPlaying ? "Mettre en pause l'animation" : "Relancer l'animation"}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
    );
  }

  if (!animationFailed && animSrc && isVideo) {
    return (
      <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
        <video
          className="exercise-visual-media"
          src={animSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setAnimationFailed(true)}
        />
      </div>
    );
  }

  if (!animationFailed && animSrc && isGifOrWebp) {
    return (
      <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
        <Image
          className="exercise-visual-media"
          src={animSrc}
          alt={title}
          width={960}
          height={540}
          onError={() => setAnimationFailed(true)}
        />
      </div>
    );
  }

  if (!animationFailed && animSrc && isLottie) {
    return (
      <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
        <div className="exercise-visual-placeholder lottie-ready" />
      </div>
    );
  }

  if (!imageFailed && imageSrc) {
    return (
      <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
        <Image
          className="exercise-visual-media"
          src={imageSrc}
          alt={title}
          width={960}
          height={540}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`exercise-visual ${compact ? "compact" : ""} ${className}`.trim()}>
      <div className="exercise-visual-placeholder">
        <div className="silhouette" aria-hidden="true" />
      </div>
    </div>
  );
}
