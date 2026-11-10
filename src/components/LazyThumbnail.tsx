import React, { useState, useEffect, useRef } from 'react';
import { Car } from 'lucide-react';

interface LazyThumbnailProps {
  base64Src: string;
  alt: string;
  className?: string;
  size?: number;
}

export const LazyThumbnail: React.FC<LazyThumbnailProps> = ({
  base64Src,
  alt,
  className = '',
  size = 96,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<any>(null);

  // Reset error/loaded states if the src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
    setRetryCount(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [base64Src]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Use IntersectionObserver with conservative rootMargin so only cards near viewport render image bytes
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsVisible(true);
            } else {
              // When scrolled far out of viewport (more than 400px), drop decoded image to reclaim RAM on weak devices!
              const bounding = entry.boundingClientRect;
              const rootBounding = entry.rootBounds;
              if (
                rootBounding &&
                (bounding.bottom < rootBounding.top - 400 || bounding.top > rootBounding.bottom + 400)
              ) {
                setIsVisible(false);
                setIsLoaded(false);
              }
            }
          });
        },
        {
          rootMargin: '120px 0px',
          threshold: 0.01,
        }
      );

      observer.observe(el);
      return () => {
        observer.unobserve(el);
        observer.disconnect();
      };
    } else {
      setIsVisible(true);
    }
  }, []);

  const activeSrc =
    retryCount > 0 && base64Src.startsWith('/api/images')
      ? `${base64Src}${base64Src.includes('?') ? '&' : '?'}retry=${retryCount}`
      : base64Src;

  const handleImageError = () => {
    // If it's a server image endpoint and retries < 3, auto-retry with exponential backoff
    if (retryCount < 3 && base64Src.startsWith('/api/images')) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
      }, (retryCount + 1) * 1200);
    } else {
      setIsLoaded(true);
      setHasError(true);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` }}
      className={`relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-xs ${className}`}
    >
      {isVisible && !hasError ? (
        <img
          key={`${base64Src}_${retryCount}`}
          src={activeSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => {
            setIsLoaded(true);
            setHasError(false);
          }}
          onError={handleImageError}
          style={{ width: `${size}px`, height: `${size}px` }}
          className={`object-cover w-full h-full transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}

      {hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400">
          <Car className="w-6 h-6 text-slate-400 opacity-60" />
        </div>
      ) : !isLoaded ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
          <Car className="w-6 h-6 animate-pulse opacity-40 text-slate-500" />
        </div>
      ) : null}
    </div>
  );
};
