# CodeCoach Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 GitHub Pages 주소와 색상을 유지하면서 CodeCoach의 실제 동작과 학습 철학이 바로 이해되는 한국어·영어 TypeScript 랜딩 페이지를 만든다.

**Architecture:** Vite의 multi-page build로 `/`와 `/ko/` HTML 진입점을 생성하고, 두 페이지는 하나의 React 애플리케이션과 타입이 지정된 번역 콘텐츠를 공유한다. 빌드 결과는 기존 GitHub Pages 소스인 `docs/`에 생성하며 개인정보처리방침·검색엔진 파일·Google 검증 파일도 함께 복사한다.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, CSS, GitHub Pages

---

### Task 1: Build foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `ko/index.html`
- Modify: `.gitignore`

- [x] **Step 1: Add build configuration and scripts**

Define `dev`, `build`, `typecheck`, `test`, and `preview` scripts. Configure Vite with `base: "/CodeCoach/"`, two HTML inputs, `landing/public` as the public directory, and `docs` as the output directory.

- [x] **Step 2: Install locked dependencies**

Run: `npm install`
Expected: `package-lock.json` is created and installation exits with code 0.

- [x] **Step 3: Verify the missing entry fails clearly**

Run: `npm run build`
Expected: FAIL because `landing/main.tsx` does not exist yet.

### Task 2: Typed bilingual content

**Files:**
- Create: `landing/content.test.ts`
- Create: `landing/content.ts`

- [x] **Step 1: Write failing locale tests**

Test that `getLocaleFromPath("/CodeCoach/ko/")` returns `ko`, other paths return `en`, both locales expose five product features, and each locale retains the published store, GitHub, and demo destinations.

- [x] **Step 2: Verify the test fails**

Run: `npm test -- landing/content.test.ts`
Expected: FAIL because `landing/content.ts` does not exist.

- [x] **Step 3: Implement typed content**

Define `Locale`, `LandingContent`, feature/step/FAQ types, shared external links, Korean and English content, and `getLocaleFromPath`.

- [x] **Step 4: Verify the content tests pass**

Run: `npm test -- landing/content.test.ts`
Expected: PASS.

### Task 3: Accessible interactions and application structure

**Files:**
- Create: `landing/App.test.tsx`
- Create: `landing/App.tsx`
- Create: `landing/main.tsx`
- Create: `landing/components/Icons.tsx`
- Create: `landing/components/ProductDemo.tsx`

- [x] **Step 1: Write failing interaction tests**

Render the Korean page and assert that the install action, GitHub action, language links, product demo, feature headings, and FAQ controls are present. Activate one FAQ and assert its answer becomes visible without opening other items.

- [x] **Step 2: Verify the test fails**

Run: `npm test -- landing/App.test.tsx`
Expected: FAIL because `App` is not implemented.

- [x] **Step 3: Implement the semantic page**

Build a sticky header, asymmetric hero, real demo video, product-flow sections, local-first trust section, FAQ disclosure controls, final CTA, and footer. Use one inline SVG icon language and preserve every external destination.

- [x] **Step 4: Verify interaction tests pass**

Run: `npm test -- landing/App.test.tsx`
Expected: PASS.

### Task 4: Visual system, responsive layout, and motion

**Files:**
- Create: `landing/styles.css`
- Create: `landing/public/fonts/PretendardVariable.woff2`
- Create: `landing/public/codecoach-demo-poster.png`

- [x] **Step 1: Add the approved visual system**

Implement the `DESIGN.md` palette, Pretendard Variable loading, asymmetric first viewport, product-led section rhythm, restrained buttons, thin dividers, and a single dark trust section.

- [x] **Step 2: Add responsive composition**

Provide layouts for compact mobile, tablet, laptop, and wide desktop widths. Keep Korean headings on semantic lines without mid-word breaks, ensure nav controls remain reachable, and avoid horizontal overflow.

- [x] **Step 3: Add purposeful motion**

Use one page-load sequence and small state transitions. Disable nonessential CSS motion and video autoplay under `prefers-reduced-motion`.

- [x] **Step 4: Run automated checks**

Run: `npm test && npm run typecheck && npm run build`
Expected: all commands pass and `docs/index.html` plus `docs/ko/index.html` exist.

### Task 5: Preserve GitHub Pages assets and SEO

**Files:**
- Create: `landing/public/privacy-policy.html`
- Create: `landing/public/robots.txt`
- Create: `landing/public/sitemap.xml`
- Create: `landing/public/google554fd5ed1b7980ea.html`
- Modify: `vite.config.ts`
- Delete: `docs/site.css`

- [x] **Step 1: Preserve static assets in the Vite public source**

Keep the current privacy-policy content, robots directives, sitemap URLs, and Google verification unchanged so every build reproduces them.

- [x] **Step 2: Preserve per-locale metadata**

Keep canonical, hreflang, Open Graph, Twitter, and SoftwareApplication JSON-LD metadata in the two HTML entry files.

- [x] **Step 3: Preserve repository documentation during builds**

Clean only generated GitHub Pages files before Vite builds. Keep `docs/STORE_LISTING.md` and `docs/superpowers/` intact while removing stale hashed assets.

- [x] **Step 4: Verify output paths and URLs**

Run: `npm run build`
Expected: generated assets use `/CodeCoach/` prefixes and all persistent files exist at the `docs/` root.

### Task 6: Browser verification

**Files:**
- Modify: implementation files only when a verified defect is found

- [x] **Step 1: Start the local GitHub Pages-equivalent preview**

Run: `npm run preview -- --host 127.0.0.1 --port 4173`
Expected: the preview server serves the built site below `/CodeCoach/`.

- [x] **Step 2: Inspect desktop, tablet, and mobile**

Verify `/CodeCoach/` and `/CodeCoach/ko/` at 1280×720, 768×1024, and 390×844. Confirm headings wrap naturally, no horizontal overflow exists, and the actual product remains visible while the video loads.

- [x] **Step 3: Verify navigation and interaction**

Check language routes, Chrome Web Store destinations, GitHub destination, privacy path, FAQ toggling, video readiness, font loading, and absence of Vite error overlays.

- [x] **Step 4: Run final quality checks**

Run: `npm test && npm run typecheck && npm run build && git diff --check`
Expected: all checks pass with no whitespace errors.
