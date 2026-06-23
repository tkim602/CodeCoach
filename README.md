# CodeCoach

CodeCoach is a Chrome extension that helps users practice coding interview problems more deliberately on LeetCode and Programmers. Instead of giving away full solutions, CodeCoach provides progressive hints, code analysis, debugging guidance, efficiency feedback, timed practice, and local weakness tracking.

The goal is simple: help users learn how to solve problems, not just copy answers.

---

## Features

### Progressive AI Hints

CodeCoach gives hints in controlled levels so users can choose how much help they want:

- **Light Hint** — a small nudge without revealing the approach
- **Direction Hint** — points toward the right algorithm or data structure
- **Specific Hint** — gives a concrete next step while avoiding full answer code

The assistant is designed to guide the user's thinking instead of immediately producing a complete solution.

### Code Analysis

Users can ask CodeCoach to review their current code and receive feedback on:

- logic mistakes
- edge cases
- incorrect assumptions
- readability issues
- possible runtime errors

### Efficiency Feedback

CodeCoach can explain whether the current approach is efficient enough and suggest better strategies when needed, such as changing from brute force to hashing, sorting, two pointers, BFS/DFS, dynamic programming, or other common coding-test patterns.

### Weakness Tracking

CodeCoach tracks learning patterns locally, including repeated weakness categories such as:

- implementation mistakes
- edge cases
- time complexity
- data structure choice
- algorithm selection
- debugging habits

This helps users understand what they repeatedly struggle with across practice sessions.

### Wrong-Answer Notes

After solving or reviewing a problem, users can save short learning notes so they can revisit mistakes later. The notes are meant to support review, not replace problem solving.

### Debugging Lab

The Debugging Lab helps users inspect their current code more carefully. It can provide:

- line-level explanations
- testcase-based reasoning
- bug localization help
- improvement suggestions

### Timed Practice Mode

Users can set a time limit for a problem, such as 30, 60, 90, 120 minutes, or a custom time. This helps simulate real coding-test conditions.

---

## Supported Platforms

CodeCoach is designed for:

- [LeetCode](https://leetcode.com/problemset/)
- [Programmers/프로그래머스](https://school.programmers.co.kr/learn/challenges?order=acceptance_desc&page=1)

Support for additional coding-practice platforms may be added later.

---

## Tech Stack

- Chrome Extension Manifest V3
- JavaScript / HTML / CSS
- Chrome Side Panel API
- Chrome Storage API
- Chrome Notifications API
- Firebase Authentication
- AI model integration for hints, code review, and learning guidance

---

## Project Structure

```txt
CodeCoach/
├── manifest.json
├── src/
│   ├── background/
│   ├── content/
│   ├── sidepanel/
│   ├── auth/
│   ├── services/
│   └── utils/
├── icons/
├── privacy-policy.html
└── README.md
```

The exact structure may vary depending on the release build.

---

## Local Installation

1. Clone the repository.

```bash
git clone https://github.com/tkim602/CodeCoach.git
cd CodeCoach
```

2. Open Chrome and go to:

```txt
chrome://extensions
```

3. Enable **Developer mode**.

4. Click **Load unpacked**.

5. Select the CodeCoach project folder.

6. Open LeetCode or Programmers and launch the CodeCoach side panel.

---

## Privacy and Data Handling

CodeCoach is designed as a learning assistant with privacy-conscious defaults.

- Learning statistics and weakness tracking are stored locally through Chrome storage.
- CodeCoach does not intentionally sell user data.
- CodeCoach does not use user data for advertising.
- AI requests may include the user’s current question, selected code, and problem context when needed to generate a helpful response.
- Authentication may be used to manage access and user sessions.
- Sensitive credentials and API keys should never be committed to this repository.

For more detail, see the project privacy policy.

---

## Security Notes

- Do not commit API keys, Firebase secrets, service account files, or private credentials.
- Keep production configuration separate from public source code.
- Review Chrome extension permissions carefully before publishing.
- Use the minimum permissions required for the extension to work.

---

## What CodeCoach Is Not

CodeCoach is not intended to be an answer generator or cheating tool. Its purpose is to help users practice more effectively by giving structured guidance, feedback, and review support.

Users are expected to write, test, and understand their own solutions.

---

## Roadmap

Planned improvements include:

- better automatic question classification
- more accurate weakness analysis from free-form chat
- improved wrong-answer note organization
- richer review summaries after each solved problem
- better support for edge-case detection
- cleaner UI/UX for long-term study tracking
- optional cloud sync for users who want cross-device continuity

---

## Disclaimer

CodeCoach is an independent project and is not affiliated with LeetCode, Programmers, or their parent companies.

Users should follow the terms and policies of each coding-practice platform they use.

---

## Author

Created by [TaeHo Kim](https://github.com/tkim602).
