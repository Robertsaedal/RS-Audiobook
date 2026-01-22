<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

  <h1>R.S Archive</h1>
  <p><i>A Premium, High-Performance Audiobookshelf Client</i></p>

  <p>
    <img src="https://img.shields.io/badge/Vue.js-3.x-4fc08d?logo=vue.js" alt="Vue">
    <img src="https://img.shields.io/badge/Tailwind-3.x-38bdf8?logo=tailwind-css" alt="Tailwind">
    <img src="https://img.shields.io/badge/PWA-Ready-ff69b4?logo=pwa" alt="PWA">
    <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
  </p>
</div>

---

## 📱 App Overview

R.S Archive is a modern, mobile-first PWA designed specifically for the **Audiobookshelf** ecosystem. It focuses on a cinematic "Midnight" aesthetic, real-time synchronization, and a seamless listening experience across all device orientations.

View your app in AI Studio: [https://ai.studio/apps/drive/1FKZkq810By4UyccXiWR5Dm5nBc9fF6pL](https://ai.studio/apps/drive/1FKZkq810By4UyccXiWR5Dm5nBc9fF6pL)

---

## 🎧 Key Features

### **The Listening Experience**
* **Dual Progress Tracking:** Stay oriented with simultaneous progress bars for the current **Chapter** and the **Total Book** duration.
* **Smart Sleep Timer:** Flexible options including a minute-based countdown or a **Chapter-based timer** (use `+` or `-` to choose exactly how many chapters to play before stopping).
* **Live Syncing:** Real-time updates powered by WebSockets. If you change your position on another device, R.S Archive reflects it instantly.
* **Offline Mode:** Support for **Offline Downloads**, allowing you to keep your stories going without a data connection.

### **Library & UI**
* **Visual Library:** High-fidelity book covers with a clean, high-contrast grid layout.
* **Series Awareness:** Dedicated views that group your collections logically.
* **Adaptive Layout:** Optimized for both **Standard Vertical** phones and **Landscape Mode**.
* **Status Page:** Track your listening habits and progress over time.

---

## ⚠️ Requirements

> [!IMPORTANT]
> **HTTPS is Required**
> To use PWA features (Offline Downloads, Add to Home Screen, and Service Workers), this app **must** be served over a secure **https://** address.

---

## 🛠️ Run Locally

**Prerequisites:** Node.js

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set the API Key:**
    Set your `GEMINI_API_KEY` in [`.env.local`](.env.local).
3.  **Run the app:**
    ```bash
    npm run dev
    ```

---

<div align="center">
  <h3>Screenshots</h3>
  <p><i>Optimized for Portrait & Landscape</i></p>
   <p align="center">
  <img width="300" alt="Screenshot 2026-01-22 104902" src="https://github.com/user-attachments/assets/de66f722-6952-4327-972d-22d1cb5822bf" />
  <img width="300" alt="Screenshot 2026-01-22 104853" src="https://github.com/user-attachments/assets/41e75bde-0883-4021-870d-4eaf46407aa6" />
  <img width="300" alt="Screenshot 2026-01-22 104839" src="https://github.com/user-attachments/assets/e95398af-fae4-43b6-ba84-cee77ca1ca51" />
</p>

  <p align="center">
<img width="600" alt="Screenshot 2026-01-22 104756" src="https://github.com/user-attachments/assets/68570714-f5a5-4f8d-8be0-6b97fe30fe96" />
<img width="600" alt="Screenshot 2026-01-22 104742" src="https://github.com/user-attachments/assets/b97e90cc-20af-4282-8077-9d107da48cd2" />
<img width="600" alt="Screenshot 2026-01-22 104724" src="https://github.com/user-attachments/assets/6d2e96b9-675d-4666-95fa-3fd080172e84" />

</p>

