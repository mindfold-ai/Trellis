---
name: frontend-fullchain-optimization
description: Frontend full-chain performance optimization guide based on Web Vitals metrics. Provides metric thresholds, diagnostic methods, and optimization strategies for LCP, FCP, INP, CLS, TTFB, TBT. Use when optimizing frontend performance, analyzing Web Vitals, reducing page load time, fixing layout shifts, improving interaction responsiveness, or reviewing frontend code for performance issues.
---

# Frontend Full-Chain Performance Optimization Guide

A frontend performance diagnostic and optimization system based on Web Vitals core metrics. Core principle: **User-centric — optimization is about doing less, not more.**

## Metric Threshold Quick Reference

| Metric | Good | Needs Improvement | Poor | Unit | Focus |
| ------ | ------ | ------------------- | ------ | ------ | -------- |
| LCP | ≤ 2.5s | 2.5s - 4s | > 4s | Time | Largest Contentful Paint |
| FCP | ≤ 1.8s | 1.8s - 3s | > 3s | Time | First Contentful Paint |
| INP | ≤ 200ms | 200ms - 500ms | > 500ms | Time | Interaction to Next Paint |
| CLS | ≤ 0.1 | 0.1 - 0.25 | > 0.25 | Score | Visual Stability |
| TTFB | ≤ 800ms | 800ms - 1.8s | > 1.8s | Time | Time to First Byte |
| FID | ≤ 100ms | 100ms - 300ms | > 300ms | Time | First Input Delay |
| TBT | Tasks > 50ms are long tasks | — | — | Time | Total Blocking Time |

**Measurement advice**: Don't rely on a single P75. Combine P60/P75/P90/P99 percentiles with daily avg/max/min trend lines. Desktop: target P98+; Mobile core pages: target P95–P99.

## Diagnostic Decision Tree

```text
Page loads slowly?
├── TTFB > 800ms → Network/server issue → See "TTFB Optimization"
├── FCP > 1.8s → Resource blocking/large files → See "FCP Optimization"
├── LCP > 2.5s
│   ├── TTFB & FCP normal → Slow viewport resource loading → See "LCP Optimization"
│   └── TTFB or FCP abnormal → Fix upstream metrics first
├── INP > 200ms → Long tasks blocking main thread → See "INP Optimization"
├── CLS > 0.1 → Layout shifts → See "CLS Optimization"
└── Lighthouse Performance Score
    ├── > 80: Few issues
    ├── 60-80: Needs focused analysis, priority: FCP → LCP → CLS
    └── < 60: Severe issues, full audit required
```

## INP Optimization (Interaction Responsiveness)

**Diagnosis**: Chrome Performance panel — look for long tasks (> 50ms, highlighted red); inspect event handler duration in the flame chart.

**Strategy — Break long tasks into shorter ones**:

| Method | Mechanism | Use Case |
| ------ | ------ | ---------- |
| `setTimeout(fn, 0)` | Creates a new macrotask at the end of the queue | Non-urgent network requests, DB operations |
| `Promise.resolve().then(fn)` | Creates a microtask, runs immediately after current macrotask | Secondary tasks needing faster execution |
| `requestAnimationFrame(fn)` | Runs before next repaint | Rendering-related tasks |
| `requestIdleCallback(fn)` | Lowest priority, runs when main thread is idle | Analytics, logging |
| `scheduler.postTask(fn, {priority})` | Fine-grained priority control | Scenarios requiring precise scheduling |

**postTask priorities**: `user-blocking` (high) > `user-visible` (medium) > `background` (low)

**Layout & Rendering Optimization**:
- Reduce `calc()` usage frequency; avoid unnecessary pseudo-class selectors (`nth-child`, `nth-last-child`, `not()`)
- Avoid frequent JS modifications to element position/size; use className or cssText for batch updates
- Avoid alternating DOM read/write in loops (layout thrashing): cache reads into variables first, then batch write
- Use skeleton screens for lazy-loaded content
- Use `<></>` (Fragment) instead of meaningless `<div>` wrappers
- DOM nodes > 800: caution; > 1400: excessive
- Use virtualization for long lists (react-window / vue-virtual-scroll-list)
- Swiper lists: preload only current item ± 1

**CSS Optimization**:
- Avoid `table` layout; reduce deeply nested CSS selectors
- Use GPU-accelerated animations: `transform`/`opacity` trigger compositing layer; avoid `top`/`left` which trigger reflow
- Use semantic HTML elements; avoid meaningless tags (e.g., use `<button>` not `<div>` for buttons)

## TTFB Optimization (Network & Server)

**Diagnostic formula**: `TTFB ≈ HTTP request time + Server processing time + HTTP response time`

**Diagnosis**: DevTools Network panel → click request → Timing → "Waiting for server response" = TTFB.

**TTFB differences by page type**: Static pages (CDN direct, fastest) < SPA (tiny HTML shell, near-static) < SSR (Node.js computation required, slowest). Adjust baseline by page type.

| Direction | Strategy |
| ------ | ------ |
| General | CDN acceleration (solves 90%+; proactively purge CDN cache after deploys), HTTP/2 multiplexing, Gzip compression, code splitting & dynamic imports |
| UX | Web Workers for heavy requests, DNS prefetch `<link rel="dns-prefetch">`, preconnect `<link rel="preconnect">` |
| Server (SSR) | Internal network for APIs, Redis cache for low-frequency data, reduce redirects, pre-generate static pages at build time |
| Resource Caching | App hot-update: pre-download HTML/JS/CSS locally (TTFB ≈ 0), PWA Service Worker offline cache |

## FCP Optimization (White Screen & First Content)

**Diagnostic formula**: `FCP ≈ TTFB + Resource download time + DOM parse time + Render time`

**White screen time ≈ FCP time**. Target: instant open (< 1s).

| Strategy | Details |
| ------ | ------ |
| Remove render-blocking resources | Add `defer` or `async` to script tags; non-critical JS → NPM bundle or framework components (e.g., `next/script`) |
| Reduce JS/CSS size | Remove unused code, Tree Shaking, code splitting |
| Control network payload | Compress above-fold images, use WebP/AVIF, lazy-load videos with placeholders |
| Caching strategy | `Cache-Control: max-age=31536000` (static assets cached 1 year); JS/CSS as needed |
| Shorten critical request depth | Reduce nested resource dependencies (e.g., CSS @import chains); flatten critical resource request chains |
| Font optimization | See "Font Optimization Strategies" below |
| White screen solutions | PWA (international markets); App hot-update local loading (domestic markets) |

## Font Optimization Strategies

| Approach | Description |
| ------ | ------ |
| Limit font count | Use only one custom font + system font fallback; don't use different Web Fonts for body and p |
| Prefer WOFF2 | 30% better compression than WOFF, supported by all modern browsers |
| `unicode-range` subsetting | Define character ranges (e.g., CJK U+4E00-9FA5); browser downloads only needed subsets |
| `local()` local fonts | For apps with bundled fonts: `src: local('Font Name'), url(...)` reads local font first, no network request |
| `font-display` strategy | `swap`: system font first then replace (lowest CLS); `optional`: with preload (no re-layout on failure); `block`: wait (blocks rendering); `fallback`/`auto`: compromise |
| CSS Font Loading API | `new FontFace()` + `font.load()` + `document.fonts.ready.then()` — programmatic control of font download timing and swap logic |
| Slow network fallback | Use `navigator.connection` to detect; slow users get system default fonts |

## LCP Optimization (Largest Contentful Paint)

**Diagnosis**: Performance panel — find the LCP marker element; Lighthouse report "Largest Contentful Paint element" entry.

**4 element types LCP can mark**:
1. `<img>` elements (most common) and `<image>` within SVG
2. `<video>` `poster` attribute image or first frame
3. Elements with CSS `url()` background images
4. Block-level elements containing text nodes

**Key insights**:
- LCP time is always ≥ FCP time
- If TTFB and FCP are normal but LCP is abnormal → problem is viewport resource loading
- SPA: FCP matters more than LCP; SSR/MPA: LCP matters more than FCP

| Strategy | Details |
| ------ | ------ |
| Preload LCP image | `<link rel="preload" href="..." as="image">` |
| Framework image components | Use `next/image` (includes priority & format optimization); set `priority={true}` |
| Split large images | Slice large background images into smaller pieces |
| Image format | PNG/JPEG → WebP/AVIF, saves 30%+ size |
| Cloud image params | Dynamically set image size/quality/format per device (e.g., Alibaba Cloud OSS params) |
| Rich text images | Extract image URLs from content, set `<link rel="preload">` in advance |
| Avoid duplicate preloads | When using framework image components (e.g., `next/image`) with `priority`, don't also add manual `<link rel="preload">` — duplicates waste bandwidth |

**Sampling advice**: PV < 1M → full LCP collection; above that → ratio sampling or threshold-based reporting.

## CLS Optimization (Layout Shift)

**Diagnostic formula**: `Layout shift score = Impact fraction × Distance fraction`, `CLS = SUM(all shift scores)`

**Key conclusion**: The farther the element shifts + the more viewport area affected → higher CLS.

| Scenario | Optimization Strategy |
| ------ | ---------- |
| Images | Set `width`/`height` on all `<img>`; use `aspect-ratio` for mobile; use `srcset`/`<picture>` for responsive images |
| Dynamic content | Reserve fixed-size placeholder containers for ads/iframes; avoid inserting content at top of viewport without interaction; inserting near bottom has less CLS impact |
| CSS animations | Use `transform` instead of `top/left/width/height`; use `transform: scale()` instead of changing dimensions |
| Fonts | `font-display: optional` + preload; or `font-display: swap` to reduce CLS impact |

## General Optimization Tips

| Tip | Description |
| ------ | ------ |
| Network awareness | `navigator.connection.effectiveType` to detect 2G/3G/4G; degrade for slow users (smaller images, system fonts, less loading) |
| SVG icons | All small icons (< 5KB / < 50px) should use SVG instead of images to reduce async requests |
| Responsive degradation | CSS media queries split CSS by screen size; skip background images on small screens |
| Cache-first | Cache list data in LocalStorage; render cache first then async refresh to reduce white screen |
| Request merging | Merge resources, reduce HTTP request count and domain count |
| Rendering mode | Choose SSR (fast first paint) / CSR (strong interactivity) / SSG (static content) by scenario |

## Practical Examples with External Services

The following examples demonstrate how to implement strategies with CDN, OSS, Redis, and other external services.

### Example 1: Alibaba Cloud OSS — Adaptive Image Quality by Network

Use case: Prioritize visible content for slow-network users; reduce image size and download time.

```javascript
const BASE_IMAGE_URL =
  "https://oss-console-img-demo-cn-hangzhou.oss-cn-hangzhou.aliyuncs.com/example.jpg";

function getNetworkLevel() {
  const connection = navigator.connection || {};
  const type = connection.effectiveType || "4g";
  // Slow network: slow-2g / 2g / 3g
  if (/slow-2g|2g|3g/.test(type)) return "slow";
  return "fast";
}

function buildOssImageUrl(baseUrl) {
  const level = getNetworkLevel();
  // OSS image processing params: lower resolution + quality for slow networks
  const ossParams =
    level === "slow"
      ? "x-oss-process=image/resize,w_100/quality,q_60/format,webp"
      : "x-oss-process=image/resize,w_300/quality,q_82/format,webp";

  return `${baseUrl}?${ossParams}`;
}

function updateHeroImage(imgEl) {
  imgEl.src = buildOssImageUrl(BASE_IMAGE_URL);
}

const heroImage = document.querySelector("#hero-image");
if (heroImage) {
  updateHeroImage(heroImage);
  // Update resource strategy on network change
  navigator.connection?.addEventListener("change", () => updateHeroImage(heroImage));
}
```

### Example 2: CDN Proactive Purge (Post-Deploy)

Use case: Prevent CDN serving stale resources after SPA deployment, avoiding version inconsistencies.

```bash
# Executed by CI/CD or server-side — never expose keys in frontend
# Example: proactively purge entry HTML and critical static assets after deploy
curl -X POST "https://your-cdn-provider.example.com/purge" \
  -H "Authorization: Bearer $CDN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example.com/index.html",
      "https://example.com/assets/app.abc123.js",
      "https://example.com/assets/app.abc123.css"
    ]
  }'
```

### Example 3: SSR + Redis Cache to Reduce TTFB

Use case: SSR pages reading low-frequency config or first-screen data; reduce DB/remote API latency per request.

```javascript
// Node.js (SSR) example
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

export async function getHomepageData() {
  const cacheKey = "homepage:data:v1";
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Assume this is a slow API or DB query
  const data = await fetch("https://api.example.com/homepage").then((r) => r.json());

  // Cache for 60s to reduce backend pressure under high concurrency
  await redis.set(cacheKey, JSON.stringify(data), "EX", 60);
  return data;
}
```

## Tool Usage Recommendations

| Tool Mode | Use Case |
| ---------- | ---------- |
| Lighthouse Navigation mode | Full process analysis from request to load complete for a single page |
| Lighthouse Timespan mode | INP/CLS analysis for SPA route transitions and form interactions |
| Lighthouse Snapshot mode | Analysis of campaigns, animations, and changing-state pages |
| Performance panel | Flame chart for long tasks, timeline for resource loading order, frame-by-frame layout shift analysis |
| Network panel | Request count/total size/TTFB/queue time — determine if CDN/prefetch/HTTP2 is needed |

**Key Analysis Paths**:
1. FCP appears late → Check JS/CSS load time; for SSR check server API latency
2. Long gap between FP and FCP → Check long tasks blocking rendering
3. Large gap between FCP and LCP → Too many or too large viewport resources; SSR underutilized
4. CLS spikes multiple times → Total > 0.25 needs priority fix

## Manual Measurement Requirement

- By default, treat Lighthouse and Performance evidence as **manually collected** data
- Prefer measuring the same page/route 2–3 times and using the median result
- Record device type, browser version, network condition, and whether the page is SPA / SSR / SSG
- If possible, keep the measurement environment stable between before/after comparisons

### Recommended manual collection flow

1. Open Chrome DevTools
2. Run Lighthouse manually for the target page or route
3. Record the key metrics: LCP / FCP / INP / CLS / TTFB
4. Open the Performance panel and manually record a trace for the same scenario
5. Use the Network panel to confirm TTFB, request waterfalls, and heavy resources
6. Keep screenshots or exported traces as evidence for before/after comparison

## If Manual Measurement Is Missing

If the user has **no manual Lighthouse or Performance measurements yet**, do not claim a root cause with certainty.

Instead:

1. Explicitly state that the diagnosis is **inferred without manual measurement**
2. Give **hypothesis-based suggestions** according to visible symptoms, code structure, and page type
3. Label each suggestion with the metric it is most likely to improve
4. Recommend manually measuring Lighthouse and Performance after the change

### Suggested fallback advice without manual data

- If the page visibly shows a long white screen → prioritize `FCP` suggestions
- If the hero image or first screen content appears late → prioritize `LCP` suggestions
- If clicking or typing feels delayed → prioritize `INP` / `TBT` suggestions
- If the page jumps during load → prioritize `CLS` suggestions
- If the whole page starts slowly before any content appears → prioritize `TTFB` suggestions

These recommendations are **best-effort hypotheses**, not verified conclusions.

## Standalone Usage Mode

This Skill contains executable judgment criteria, optimization strategies, code examples, and external service implementation patterns. It can be used independently without requiring access to any course documents.

### Standard Execution Flow

1. **Collect current state**
   - Get core metrics: LCP/FCP/INP/CLS/TTFB (at least P75 and daily average)
   - Gather evidence from manual Lighthouse + Performance + Network measurements
2. **Determine priority**
   - Fix worst metrics (Poor) first, then Needs Improvement
   - Suggested order: `FCP → LCP → CLS → INP → TTFB` (adjust per business needs)
3. **Match strategy**
   - Follow this Skill's diagnostic decision tree to select the corresponding optimization branch
   - For external services, prefer the "Practical Examples" section above
4. **Implement & verify**
   - Small incremental commits; one type of optimization per change
   - If possible, re-test 2–3 times using median values to confirm real improvement
5. **Document & prevent regression**
   - Record metrics before and after changes
   - Consider adding key checks to CI (Lighthouse / performance budgets)

### Delivery Template

```markdown
## Optimization Target
- Page/Feature:
- Target Metric:
- Current Value:
- Target Value:

## Evidence
- Manual Lighthouse evidence:
- Manual Performance evidence:
- Network evidence:

## Execution Strategy
- Approach:
- External services involved:
- Risk & rollback:

## Result Verification
- Before:
- After:
- Conclusion:
```

### Usage Constraints

- Don't sacrifice core functionality correctness for perceived speed
- Don't treat a single user's anomaly as a global performance issue
- Don't claim optimization success without verification
- If manual Lighthouse / Performance measurement is missing, clearly mark the advice as inferred and recommend follow-up validation
