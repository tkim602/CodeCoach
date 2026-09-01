---
name: CodeCoach
description: 정답 대신 다음 한 걸음을 제안하는 코딩 인터뷰 연습 도구
colors:
  coaching-purple: "#6128FF"
  coaching-purple-hover: "#6A3FFF"
  cool-paper: "#F3F4F8"
  white-surface: "#FFFFFF"
  soft-surface: "#F7F7FB"
  ink: "#111114"
  secondary-ink: "#3B3D4A"
  muted-ink: "#73758A"
typography:
  display:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "clamp(3rem, 6.6vw, 6.3rem)"
    fontWeight: 720
    lineHeight: 0.98
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "clamp(2.25rem, 4.5vw, 4.5rem)"
    fontWeight: 680
    lineHeight: 1.04
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 430
    lineHeight: 1.7
    letterSpacing: "-0.012em"
  label:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 680
    lineHeight: 1.4
    letterSpacing: "-0.01em"
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.coaching-purple}"
    textColor: "{colors.white-surface}"
    rounded: "{rounded.sm}"
    padding: "13px 18px"
  button-secondary:
    backgroundColor: "{colors.white-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 18px"
---

# Design System: CodeCoach

## 1. Overview

**Creative North Star: "The Quiet Practice Desk"**

CodeCoach의 랜딩 페이지는 답을 알려주는 AI 쇼케이스가 아니라, 학습자가 다시 문제에 집중할 수 있게 정돈된 연습 책상처럼 보여야 한다. 연한 쿨 그레이 바탕, 검은 잉크, 제한된 보라색 포인트와 실제 제품 화면으로 차분하지만 분명한 인상을 만든다.

제품 화면과 학습 흐름이 시각적 중심이며, 카피는 화면에서 확인할 수 있는 기능만 설명한다. 거대한 중앙 정렬 영웅 문구, 반복 카드, AI 그라디언트와 글로우를 사용하지 않는다.

**Key Characteristics:**

- 실제 제품 화면이 첫 화면에서 보이는 비대칭 구성
- 긴 문장도 자연스럽게 읽히는 한국어 중심 타이포그래피
- 한 화면에 하나의 중심 메시지가 보이는 충분한 여백
- 보라색을 행동과 현재 상태에만 사용하는 제한된 강조

## 2. Colors

쿨 페이퍼 위에 잉크와 단일 보라색 포인트를 사용하는 절제된 팔레트다.

### Primary

- **Coaching Purple** (#6128FF): 설치 버튼, 활성 상태, 진행 흐름의 핵심 연결선에만 사용한다.
- **Coaching Purple Hover** (#6A3FFF): 주요 행동의 포인터 호버 상태에 사용한다.

### Neutral

- **Cool Paper** (#F3F4F8): 전체 페이지 배경이다.
- **White Surface** (#FFFFFF): 데모 창과 중요한 콘텐츠 표면이다.
- **Soft Surface** (#F7F7FB): 구분이 필요한 보조 표면이다.
- **Ink** (#111114): 제목과 핵심 본문이다.
- **Secondary Ink** (#3B3D4A): 설명 본문이다.
- **Muted Ink** (#73758A): 메타 정보와 보조 설명이다.

**The One Coaching Color Rule.** 보라색은 전체 화면의 10% 이하에서 행동과 진행 상태를 알리는 데만 사용한다.

## 3. Typography

**Display Font:** Pretendard Variable (with system sans-serif fallback)
**Body Font:** Pretendard Variable (with system sans-serif fallback)

**Character:** 한글과 영문이 섞인 제품 문구를 부드럽고 정확하게 읽히게 하는 단일 가변 글꼴 체계다. 크기와 굵기 차이를 분명히 하되, 과도한 자간 압축으로 문장이 인공적으로 보이지 않게 한다.

### Hierarchy

- **Display** (720, `clamp(3rem, 6.6vw, 6.3rem)`, 0.98): 첫 화면의 한 문장에만 사용한다.
- **Headline** (680, `clamp(2.25rem, 4.5vw, 4.5rem)`, 1.04): 주요 섹션 메시지에 사용한다.
- **Title** (650, `clamp(1.25rem, 2vw, 1.75rem)`, 1.25): 기능과 단계 제목에 사용한다.
- **Body** (430, 17px, 1.7): 최대 68ch 안에서 기능과 신뢰 정보를 설명한다.
- **Label** (680, 13px, -0.01em, sentence case): 짧은 상태와 보조 내비게이션에 사용한다.

**The Natural Line Rule.** 한국어 제목의 줄바꿈은 단어 중간을 자르지 않고, 데스크톱에서 최대 두 줄 안에 의미 단위로 배치한다.

## 4. Elevation

기본 표면은 평면적으로 유지하고, 실제 제품 데모 창에만 넓고 옅은 주변 그림자를 사용한다. 나머지 깊이는 배경색 차이와 1px 경계선으로 표현한다.

### Shadow Vocabulary

- **Demo Lift** (`0 32px 90px rgba(24, 20, 48, 0.14)`): 첫 화면의 실제 제품 데모에만 사용한다.
- **Interactive Lift** (`0 10px 28px rgba(24, 20, 48, 0.10)`): 포인터 장치에서 작은 인터랙티브 미리보기가 호버될 때만 사용한다.

**The Flat-By-Default Rule.** 정지 상태의 설명 콘텐츠에는 그림자를 추가하지 않는다.

## 5. Components

### Buttons

- **Shape:** 단정한 8px 모서리와 최소 46px 높이를 사용한다.
- **Primary:** Coaching Purple 배경과 흰색 텍스트, 좌우 18px 패딩을 사용한다.
- **Hover / Focus:** 호버는 색만 조금 밝아지고, 포커스는 3px 반투명 보라색 링으로 표시한다.
- **Secondary:** 흰색 표면, 얇은 경계선, 잉크 텍스트로 GitHub 같은 보조 행동을 표현한다.

### Cards / Containers

- **Corner Style:** 데모 22px, 작은 설명 표면 14px.
- **Background:** 흰색 또는 Soft Surface만 사용한다.
- **Shadow Strategy:** 실제 데모 외에는 그림자를 사용하지 않는다.
- **Border:** `rgba(114, 118, 139, 0.18)` 1px.
- **Internal Padding:** 20px에서 32px 사이의 유동 패딩을 사용한다.

### Navigation

72px 전후의 반투명 고정 헤더를 사용한다. 현재 섹션보다 설치 행동과 언어 전환을 우선하며, 모바일에서는 핵심 링크만 남긴다. 모든 링크는 밑줄 또는 색 변화가 아닌 명확한 포커스 링을 제공한다.

### Product Demo

실제 데모 영상을 브라우저 프레임 안에 표시하며, 재생·일시정지 상태를 사용자가 제어할 수 있다. 자동 재생은 음소거 상태로만 허용하고 reduced-motion 환경에서는 자동 재생하지 않는다.

## 6. Do's and Don'ts

### Do:

- **Do** 첫 화면에서 제품 이름, 핵심 차이, 실제 화면, 설치 행동을 함께 보여준다.
- **Do** Coaching Purple (#6128FF)을 행동과 상태에만 제한한다.
- **Do** 한국어 본문을 17px 이상, 1.65 이상의 행간으로 표시한다.
- **Do** 실제 기능 설명을 제품 흐름과 연결하고, 모든 링크에 목적이 드러나는 레이블을 제공한다.

### Don't:

- **Don't** 거대한 중앙 정렬 문구와 추상적인 문장만 남는 전형적인 AI SaaS 랜딩 페이지를 만든다.
- **Don't** 동일한 아이콘 카드가 반복되어 실제 제품 흐름을 가리는 템플릿형 구성을 사용한다.
- **Don't** 보라색 그라디언트, 글로우, 유리 효과로 AI를 암시하는 장식을 사용한다.
- **Don't** 실제 제품보다 기술 이름과 기능 목록을 먼저 내세운다.
