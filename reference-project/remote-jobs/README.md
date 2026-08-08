# Remote Jobs (丈月尺) - Industrial-Grade AI Remote Careers Platform

**Remote Jobs (丈月尺)** is an intelligent career accelerator designed for developers and remote workers. More than just a job aggregator, it is a sophisticated resume tailoring engine powered by Google Gemini 3.0 multi-modal capabilities, ensuring that "every application is a perfect match."

## 💎 Flagship Highlights

- **AI Dynamic Resume Tailoring**: Say goodbye to one-size-fits-all resumes. Our AI automatically optimizes keywords, descriptions, and emphasis based on the Job Description (JD), increasing interview conversion rates by up to 300%.
- **Multi-modal Screenshot Engine**: Deeply integrated with Gemini Vision. Users can simply upload a job post screenshot, and the system completes the "Capture -> JD Extraction -> Tailored Resume" loop instantly.
- **Ultra-Minimalist UX**: Follows the "Three-Click Goal" design principle, significantly reducing redundancy in the job-seeking journey.

## 🏗️ Industrial-Grade Architecture

This project is built to enterprise standards, far exceeding typical mini-program demos:

### 1. Full-Stack Bootstrap Orchestrator
A transparent initialization orchestrator implemented in the `onLaunch` phase:
- **Atomic State Switching**: Orchestrates Auth, Membership, Quota, System Config, and i18n initialization using parallelized Promises.
- **Guaranteed Smoothness**: Features a mandatory 1.5s minimal splash duration combined with physical projection fade-out algorithms, ensuring a seamless transition between data readiness and UI presentation while eliminating "data flickering."

### 2. Standardized UI Instruction System (Design System)
- **Tokenized Management**: Utilizes CSS variables (`--primary-dark`, `--radius-md`, etc.) to manage the UI specification, achieving full-app visual atomization and minimizing long-term maintenance costs.
- **High-Performance Componentization**: Employs a standardized custom component library with strict Shadow DOM styling isolation to ensure rendering pipeline efficiency.

### 3. Advanced Auth & Animation Lifecycle
- **Core Flow Control**: Operates on a global distribution system driven by `bootStatus`. The **Login Wall** acts as a high-level interceptor that precisely perceives the "Ready" signal from underlying pages, synchronizing the entire loop from splash to silent auth to ceremonial entrance.

### 4. Enterprise-Grade i18n Core
- **Kernel-Driven Localization**: Supports Standard Chinese/English and AI Chinese/English modes. It doesn't just translate UI text; it drives the AI engine to switch semantic output, ensuring a consistent global application experience.

### 5. Reactive Event Bus (Observer Pattern)
- **Granular Reactivity**: Implements a lightweight Pub/Sub architecture for Theme and Language contexts, enabling instant hot-swapping without full page reloads.
- **State Decoupling**: Ensures critical updates propagate instantly across the component tree without prop drilling.

### 6. Optimistic Hydration Strategy ("Flash-load")
- **Instant-On Session**: Hydrates user session immediately from encrypted local storage (`user_cache`) for perceived zero-latency startup.
- **Stale-While-Revalidate**: Network validation happens asynchronously in the background, updating constraints without blocking user interaction.

### 7. Adaptive Environment Networking
- **Resiliency Layer**: Built-in automatic retry capabilities and "Offline Mode" detection allow graceful degradation into read-only states when connectivity is compromised.

## 🚀 Features

- ✂️ **One-Click AI Rewriting**: Precisely extracts and optimizes project experience keywords based on the target role.
- 📸 **Vision/OCR Assistant**: Instant JD recognition from images with automated core requirement analysis.
- 🌎 **Remote Career Hub**: Real-time synchronization of premium Global, Web3, Design, and Ops roles.
- 📄 **Bilingual Profile System**: Build and export professional, high-readability PDF resumes in both English and Chinese.

## 🛠️ Tech Stack

- **Frontend Core**: WeChat Mini Program (Native) / TypeScript / WXSS (PostCSS)
- **Engineering**: Custom Boot-Orchestrator / Design Token System
- **AI Engine**: Google Gemini 3 Flash / Pro (2.5/3.0)
- **Quality Control**: Stylelint (Strict Color Validation) / EsLint / i18n Runtime

## ⚖️ License

MIT Licensed.
