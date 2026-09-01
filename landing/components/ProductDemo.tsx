import { externalLinks, type LandingContent } from "../content";

interface ProductDemoProps {
  content: LandingContent["demo"];
}

export function ProductDemo({ content }: ProductDemoProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <figure className="product-demo">
      <div className="product-demo__bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <div className="product-demo__address">leetcode.com · CodeCoach</div>
      </div>
      <video
        className="product-demo__video"
        autoPlay={!prefersReducedMotion}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        poster="/CodeCoach/codecoach-demo-poster.png"
        aria-label={content.videoLabel}
      >
        <source src={externalLinks.demo} type="video/mp4" />
      </video>
    </figure>
  );
}
