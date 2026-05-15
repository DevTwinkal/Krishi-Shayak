# 🌾 Krishi Shayak (कृषि सहायक)
### *Empowering Indian Farmers with AI-Driven Insights & Care*

[![Vercel Deployment](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://krishi-shayak.vercel.app)
[![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com)

---

## 📖 Overview

**Krishi Shayak** is a state-of-the-art agricultural assistant designed specifically for the Indian farming landscape. By leveraging cutting-edge AI models (Llama 3.3 & Llama 4), it provides farmers with instant diagnostic tools, real-time weather-based advice, and an expert conversational partner — all accessible in **10 Indian languages** with high-quality voice support.

Our mission is to bridge the gap between scientific agricultural research and ground-level farming, helping reduce crop loss and improve yields through accessible technology.

---

## ✨ Key Features

### 📸 Smart Plant Disease Detection
- **Instant Diagnosis**: Upload or capture a leaf/crop photo to identify pests, diseases, or deficiencies.
- **Expert Recommendations**: Get detailed treatment plans including both **Organic (Prakritik Kheti)** and **Chemical (IPM)** options.
- **High Confidence**: Powered by multimodal AI models trained on diverse agricultural datasets.

### 🎙️ Advanced Multilingual TTS
- **Regional Clarity**: Natural-sounding voice output in 10 languages (Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati, Kannada, Malayalam, Punjabi, and English).
- **Intelligent Script Detection**: Automatically detects script types (e.g., Devanagari vs. Latin) to ensure perfect pronunciation of regional terms.
- **Listen to Results**: Farmers can listen to diagnostic reports and weather updates, making the app accessible to everyone.

### ⛅ AI-Powered Weather Insights
- **Precision Advice**: Location-aware farming suggestions based on real-time temperature, humidity, and wind conditions.
- **Risk Alerts**: Specific warnings for disease outbreaks, irrigation needs, and optimal spraying windows.

### 🤖 Krishi Expert AI Chat
- **Conversational Companion**: A friendly, knowledgeable AI that understands regional farming terminology and Indian agricultural contexts.
- **Context-Aware**: Remembers your farm's history and current weather to provide personalized advice.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS, Framer Motion |
| **Backend** | Node.js (Express), Vercel Serverless Functions |
| **Database/Auth** | Firebase Auth, Firestore |
| **AI Infrastructure** | GROQ Cloud (Llama 3.3 70B & Llama 4 Scout 17B) |
| **Voice Synthesis** | Web Speech API with Regional Optimization |
| **Icons & UI** | Lucide React |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js v20+** installed.
- **Firebase Project**: Set up at [console.firebase.google.com](https://console.firebase.google.com).
- **GROQ API Key**: Obtain for free at [console.groq.com](https://console.groq.com).

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/DevTwinkal/Krishi-Shayak.git

# Navigate to project folder
cd Krishi_Shayak

# Install dependencies
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory and add the following keys:

```env
# AI API Keys
GROQ_API_KEY=your_groq_key_here
OPENWEATHER_API_KEY=your_optional_weather_key_here

# Firebase Config (Get these from Project Settings > Your Apps)
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
```

### 4. Running the App
```bash
# Start both Frontend & API Server
npm run dev:all
```
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:3001](http://localhost:3001)

---

## 📦 Deployment

### Vercel Deployment
This project is pre-configured for Vercel:
1. Connect your GitHub repository to Vercel.
2. Add your `.env` variables in the Vercel Dashboard.
3. **Critical**: Add your Vercel domain to the **Authorized Domains** list in the Firebase Console (Authentication > Settings).

---

## 🗺️ Roadmap
- [ ] **Offline Mode**: Local caching of AI models for zero-connectivity areas.
- [ ] **Market Prices**: Real-time Mandi price tracking for local crops.
- [ ] **Soil Testing Integration**: Direct upload of soil reports for fertilization plans.
- [ ] **Community Forum**: A space for farmers to share knowledge locally.

---

## 🤝 Contribution
Contributions are welcome! Please feel free to submit a Pull Request or open an issue for any bugs or feature requests.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with ❤️ for the Farmers of India.*
