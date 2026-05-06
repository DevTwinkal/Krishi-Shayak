import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  MessageSquare, 
  History, 
  CloudSun, 
  Languages, 
  Volume2, 
  Mic, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertTriangle,
  ChevronRight,
  LogOut,
  Leaf,
  Bug,
  Info,
  Menu,
  Settings,
  User,
  MapPin,
  LayoutDashboard,
  Wind,
  Droplets,
  Thermometer,
  Waves,
  Sprout,
  RefreshCcw,
  Clock,
  Bot,
  ShieldCheck,
  Trash2,
  Paperclip,
  Send,
  VolumeX,
  Search,
  CloudRain
} from 'lucide-react';
import { useFirebase } from './components/FirebaseProvider';
import { analyzePlantImage, chatWithExpert, enhanceImageQuality, getAIPoweredWeather, generateEmbedding, cosineSimilarity, getAppSentientBriefing } from './services/geminiService';
import { transliterateDevanagari } from './lib/transliterator';
import { compressImage } from './lib/utils';
import { agriVoice } from './services/voiceService';
// import { fetchWeather, WeatherData, fetchWeatherByCity } from './services/weatherService';
import ReactMarkdown from 'react-markdown';
import { collection, addDoc, query, where, orderBy, onSnapshot, Timestamp, getDocFromServer, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './lib/firebase';

type Tab = 'dashboard' | 'detect' | 'chat' | 'history' | 'settings';

// Helper to strip markdown and prepare text for TTS
const AGRI_PHONETIC_MAP: Record<string, Record<string, string>> = {
  mr: {
    'watering': 'वॉटरिंग',
    'fertilizer': 'फर्टिलायझर',
    'pesticide': 'पेस्टिसाइड',
    'soil': 'सॉइल',
    'crop': 'क्रॉप',
    'disease': 'डिसीज',
    'organic': 'ऑरगॅनिक',
    'chemical': 'केमिकल',
    'spray': 'स्प्रे',
    'yield': 'यील्ड',
    'nitrogen': 'नायट्रोजन',
    'phosphorus': 'फॉस्फरस',
    'potassium': 'पोटॅशियम'
  },
  hi: {
    'watering': 'वाटरिंग',
    'fertilizer': 'फर्टिलाइजर',
    'pesticide': 'पेस्टिसाइड',
    'soil': 'सॉइल',
    'crop': 'क्रॉप',
    'disease': 'डिसीज',
    'organic': 'ऑर्गेनिक',
    'chemical': 'केमिकल',
    'spray': 'स्प्रे',
    'pa': 'यील्ड'
    }
    };

    export const PREFERRED_VOICES: Record<string, string[]> = {
  'hi': ['hi-IN-Neural2-A', 'hi-IN-Neural2-D', 'Google हिन्दी', 'hi-IN-Wavenet-A', 'hi-IN-Standard-A', 'Microsoft Hemant'],
  'mr': ['Google मराठी', 'mr-IN-Wavenet-A', 'mr-IN-Standard-A', 'Microsoft Yashwant'],
  'te': ['Google తెలుగు', 'te-IN-Standard-A', 'Microsoft Shruti'],
  'ta': ['Google தமிழ்', 'ta-IN-Wavenet-A', 'ta-IN-Standard-A', 'Microsoft Valluvar'],
  'bn': ['Google বাংলা', 'bn-IN-Wavenet-A', 'bn-IN-Standard-A', 'Microsoft Hemant'],
  'gu': ['Google ગુજરાતી', 'gu-IN-Wavenet-A', 'gu-IN-Standard-A', 'Microsoft Kalpana'],
  'kn': ['Google ಕನ್ನಡ', 'kn-IN-Wavenet-A', 'kn-IN-Standard-A', 'Microsoft Sapna'],
  'ml': ['Google മലയാളം', 'ml-IN-Wavenet-A', 'ml-IN-Standard-A', 'Microsoft Midhun'],
  'pa': ['Google ਪੰਜਾਬੀ', 'pa-IN-Wavenet-A', 'pa-IN-Standard-A', 'Microsoft Hemant'],
  'en': ['en-IN-Neural2-A', 'en-IN-Neural2-D', 'en-US-Neural2-F', 'Google UK English Female', 'Google US English', 'en-IN-Wavenet-A', 'en-GB-Wavenet-A']
};

    const prepareTextForSpeech = (text: string, lang: string, shouldTransliterate: boolean = false) => {

  let cleanText = text
    .replace(/^[\s]*[-+*][\s]+/gm, '') // Remove list markers
    .replace(/[#*`~]/g, '') // Remove Markdown symbols
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract text from links
    .replace(/\s+/g, ' ') // Collapse spaces
    .trim();

  // If not English, handle mixed-language technical terms
  if (lang !== 'en' && AGRI_PHONETIC_MAP[lang]) {
    const map = AGRI_PHONETIC_MAP[lang];
    Object.keys(map).forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      cleanText = cleanText.replace(regex, map[word]);
    });
  }

  // Transliterate Devanagari to Latin for English-only engines
  if (shouldTransliterate && (lang === 'hi' || lang === 'mr')) {
    return transliterateDevanagari(cleanText);
  }

  return cleanText;
};

const POPULAR_CITIES = [
  "Wardha", "Nagpur", "Pune", "Nashik", "Mumbai", 
  "Aurangabad", "Satara", "Kolhapur", "Amravati", "Akola", 
  "Delhi", "Ludhiana", "Patiala", "Amritsar", "Chandigarh", 
  "Ahmedabad", "Surat", "Rajkot", "Hyderabad", "Bengaluru", 
  "Chennai", "Kolkata", "Lucknow", "Indore"
];

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  locationName: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  farmingSuggestion: string;
  irrigationAdvice: string;
  sprayingAlert: string;
  lat?: number;
  lon?: number;
  feelsLike?: number;
  diseaseRisk?: string;
}

export default function App() {
  const { user, loading, login, logout } = useFirebase();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [language, setLanguage] = useState('en');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isWeatherAutoUpdate, setIsWeatherAutoUpdate] = useState(true);
  const [locationMode, setLocationMode] = useState<'auto' | 'manual'>('auto');
  const [manualLocation, setManualLocation] = useState('Central India');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshingWeather, setIsRefreshingWeather] = useState(false);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatFilePreview, setChatFilePreview] = useState<string | null>(null);
  const [isUploadingChatFile, setIsUploadingChatFile] = useState(false);
  const [lastSpeakableText, setLastSpeakableText] = useState<string>("");

  useEffect(() => {
    agriVoice.setLanguage(language);
  }, [language]);

  const speak = async (text: string, forceInterrupt = false) => {
    if (!isVoiceEnabled && !forceInterrupt) return;
    setLastSpeakableText(text);
    if (forceInterrupt) agriVoice.stop();
    await agriVoice.speak(text, () => setIsSpeaking(true), () => setIsSpeaking(false));
  };

  const handleBriefMe = async () => {
    const stateData = {
      userName: user?.displayName?.split(' ')[0] || 'Kisan Bhai',
      location: weather?.locationName || manualLocation || 'your farm',
      weather: weather,
      recentDetection: detectionResult ? { plant: detectionResult.plantName, issue: detectionResult.issueDetected } : null
    };
    
    setIsSpeaking(true);
    try {
      const briefing = await getAppSentientBriefing(stateData, language);
      setLastSpeakableText(briefing);
      await speak(briefing, true);
    } catch (err) {
      console.error("Briefing failed:", err);
      setIsSpeaking(false);
    }
  };
  const [isOnboarded, setIsOnboarded] = useState(true); // Default true for now, will check in useEffect
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Initial load and voice change listener
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };

    const storedOnboard = localStorage.getItem(`onboarded_${user?.uid}`);
    if (!storedOnboard && user) {
      setIsOnboarded(false);
      // Greet the user personally on first visit
      const firstName = user.displayName?.split(' ')[0] || 'Farmer';
      const welcomeMsg = language === 'hi' ? `नमस्ते ${firstName}! कृषि सहायक में आपका स्वागत है। मैं आपकी फसलों की देखभाल में कैसे मदद कर सकता हूँ?` :
                         `Hello ${firstName}! Welcome to Krishi Shayak. How can I help you with your crops today?`;
      setLastSpeakableText(welcomeMsg);
      // Wait a bit for voices to load
      setTimeout(() => speak(welcomeMsg), 1500);
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [user]);

  const [locationError, setLocationError] = useState<string | null>(null);

  const loadWeather = async (locNameOrCoords?: string) => {
    setIsRefreshingWeather(true);
    const locationToFetch = locNameOrCoords || manualLocation || 'Nagpur, India';
    console.log(`[App] Loading AI weather insights for: ${locationToFetch}`);
    try {
      const data = await getAIPoweredWeather(locationToFetch, language);
      console.log("[App] AI Weather data received:", data);
      setWeather(data);
      setLastUpdated(new Date());
      setLocationError(null);
      if (data) {
        const weatherSummary = `${t.fieldWeather} for ${data.locationName}. ${data.temp}°C. ${data.condition}. ${t.diseaseRisk}: ${data.riskLevel}. ${data.farmingSuggestion}`;
        setLastSpeakableText(weatherSummary);
      }
    } catch (error: any) {
      console.error("[App] Weather load failed:", error);
      setLocationError("Unable to fetch weather insights at this moment.");
    } finally {
      setIsRefreshingWeather(false);
    }
  };

  const translations: Record<string, any> = {
    en: {
      appTitle: "Krishi Shayak",
      tagline: "Smart Agriculture Assistant",
      fieldWeather: "Field Weather",
      humidity: "Humidity",
      warning: "Warning",
      visionSystem: "Vision Detection System",
      realTime: "Real-time",
      readyToScan: "Ready to Scan",
      uploadPhoto: "Upload a photo to start the AI vision analysis.",
      openScanner: "Open Scanner",
      agriBot: "AgriBot Assistant",
      online: "Online",
      askCrops: "Ask about crops...",
      pastReports: "Past Reports",
      viewAll: "View All",
      noReports: "No reports yet.",
      home: "Home",
      scan: "Scan",
      expert: "Expert",
      history: "History",
      plantDetection: "Plant Detection",
      uploadAffected: "Upload or take a photo of the affected plant part",
      choosePhoto: "Choose Photo",
      analyzing: "Analyzing...",
      confidence: "Confidence",
      issueDetected: "Issue Detected",
      organicTreatment: "Organic Treatment",
      chemicalTreatment: "Chemical Treatment",
      askExpertDetails: "Ask Expert for Details",
      yourReports: "Your Reports",
      voiceOn: "Voice On",
      voiceOff: "Voice Off",
      listening: "Listening...",
      helloFarmer: "Hello, Farmer! I'm your AI assistant. How can I help you today?",
      dashboard: "Dashboard",
      settings: "Settings",
      profile: "Farmer Profile",
      location: "Location",
      smartInsights: "Smart Farming Insights",
      diseaseRisk: "Disease Risk",
      farmingSuggestion: "Suggested Activity",
      irrigationAdvice: "Irrigation Advice",
      sprayingAlert: "Spraying Alert",
      windSpeed: "Wind Speed",
      listenToInsights: "Listen to Insights",
      feelsLike: "Feels Like",
      latitude: "Latitude",
      longitude: "Longitude",
      lastUpdated: "Last updated",
      refresh: "Refresh",
      yourFarm: "Your Farm",
      delete: "Delete",
      accuracy: "Accuracy",
      atScan: "@ Scan",
      chatSuggestions: ["Pest Control", "Best Fertilizer", "Irrigation Tips", "Crop Rotation"],
      welcome: "Welcome to Krishi Shayak",
      onboarding1: "Identify plant diseases instantly with your camera.",
      onboarding2: "Get real-time weather and smart hints for your farm.",
      onboarding3: "Chat with Krishi Bot for expert agricultural advice.",
      getStarted: "Get Started"
    },
    hi: {
      appTitle: "कृषि सहायक",
      tagline: "स्मार्ट कृषि सहायक",
      fieldWeather: "खेत का मौसम",
      humidity: "नमी",
      warning: "चेतावनी",
      visionSystem: "दृष्टि पहचान प्रणाली",
      realTime: "रियल-टाइम",
      readyToScan: "स्कैन के लिए तैयार",
      uploadPhoto: "एआई दृष्टि विश्लेषण शुरू करने के लिए एक फोटो अपलोड करें।",
      openScanner: "स्कैनर खोलें",
      agriBot: "एग्रीबॉट सहायक",
      online: "ऑनलाइन",
      askCrops: "फसलों के बारे में पूछें...",
      pastReports: "पिछले रिपोर्ट",
      viewAll: "सभी देखें",
      noReports: "अभी तक कोई रिपोर्ट नहीं।",
      home: "होम",
      scan: "स्कैन",
      expert: "विशेषज्ञ",
      history: "इतिहास",
      plantDetection: "पौधे की पहचान",
      uploadAffected: "पौधे के प्रभावित हिस्से की फोटो अपलोड करें या लें",
      choosePhoto: "फोटो चुनें",
      analyzing: "विश्लेषण कर रहा है...",
      confidence: "आत्मविश्वास",
      issueDetected: "समस्या का पता चला",
      organicTreatment: "जैविक उपचार",
      chemicalTreatment: "रासायनिक उपचार",
      askExpertDetails: "विवरण के लिए विशेषज्ञ से पूछें",
      yourReports: "आपकी रिपोर्ट",
      voiceOn: "आवाज चालू",
      voiceOff: "आवाज बंद",
      listening: "सुन रहा है...",
      helloFarmer: "नमस्ते, किसान! मैं आपका एआई सहायक हूं। मैं आज आपकी कैसे मदद कर सकता हूं?",
      dashboard: "डैशबोर्ड",
      settings: "सेटिंग्स",
      profile: "किसान प्रोफाइल",
      location: "स्थान",
      smartInsights: "स्मार्ट खेती अंतर्दृष्टि",
      diseaseRisk: "रोग का जोखिम",
      farmingSuggestion: "सुझाया गया कार्य",
      irrigationAdvice: "सिंचाई सलाह",
      sprayingAlert: "छिड़काव चेतावनी",
      windSpeed: "हवा की गति",
      listenToInsights: "अंतर्दृष्टि सुनें",
      feelsLike: "का एहसास",
      latitude: "अक्षांश",
      longitude: "देशांतर",
      lastUpdated: "पिछला अपडेट",
      refresh: "रिफ्रेश",
      delete: "हटाएं",
      accuracy: "सटीकता",
      atScan: "स्कैन के समय",
      chatSuggestions: ["कीट नियंत्रण", "सर्वश्रेष्ठ उर्वरक", "सिंचाई युक्तियाँ", "फसल चक्रण"],
      welcome: "कृषि सहायक में आपका स्वागत है",
      onboarding1: "अपने कैमरे से तुरंत पौधों की बीमारियों की पहचान करें।",
      onboarding2: "अपने खेत के लिए वास्तविक समय के मौसम और स्मार्ट संकेत प्राप्त करें।",
      onboarding3: "विशेषज्ञ कृषि सलाह के लिए कृषि बॉट के साथ चैट करें।",
      getStarted: "शुरू करें"
    },
    mr: {
      appTitle: "कृषि सहायक",
      tagline: "स्मार्ट कृषी सहाय्यक",
      fieldWeather: "शेतातील हवामान",
      humidity: "आद्रता",
      warning: "सूचना",
      visionSystem: "व्हिजन डिटेक्शन सिस्टम",
      realTime: "रिअल-टाइम",
      readyToScan: "स्कॅनसाठी तयार",
      uploadPhoto: "एआय व्हिजन विश्लेषण सुरू करण्यासाठी फोटो अपलोड करा.",
      openScanner: "स्कॅनर उघडा",
      agriBot: "एग्रीबॉट सहाय्यक",
      online: "ऑनलाइन",
      askCrops: "पिकांबद्दल विचारा...",
      pastReports: "मागील अहवाल",
      viewAll: "सर्व पहा",
      noReports: "अद्याప कोणतेही अहवाल नाहीत.",
      home: "होम",
      scan: "स्कॅन",
      expert: "तज्ञ",
      history: "इतिहास",
      plantDetection: "वनस्पती ओळख",
      uploadAffected: "प्रभावित वनस्पती भागाचा फोटो अपलोड करा किंवा घ्या",
      choosePhoto: "फोटो निवडा",
      analyzing: "विश्लेषण करत आहे...",
      confidence: "आत्मविश्वास",
      issueDetected: "समस्या आढळली",
      organicTreatment: "सेंद्रिय उपचार",
      chemicalTreatment: "रासायनिक उपचार",
      askExpertDetails: "तपशीलांसाठी तज्ञांना विचारा",
      yourReports: "तुमचे अहवाल",
      voiceOn: "आवाज चालू",
      voiceOff: "आवाज बंद",
      listening: "ऐकत आहे...",
      helloFarmer: "नमस्कार, शेतकरी! मी तुमचा एआय सहाय्यक आहे. मी आज तुम्हाला कशी मदत करू शकतो?",
      dashboard: "डॅशबोर्ड",
      settings: "सेटिंग्ज",
      profile: "शेतकरी प्रोफाइल",
      location: "स्थान",
      smartInsights: "स्मार्ट शेती अंतर्दृष्टी",
      diseaseRisk: "रोगाचा धोका",
      farmingSuggestion: "सुचविलेले कार्य",
      irrigationAdvice: "सिंचन सल्ला",
      sprayingAlert: "फवारणी चेतावणी",
      windSpeed: "वाऱ्याचा वेग",
      listenToInsights: "अंतर्दृष्टी ऐका",
      feelsLike: "असे वाटते",
      latitude: "अक्षांश",
      longitude: "रेखांश",
      lastUpdated: "शेवटचे अपडेट",
      refresh: "रिफ्रेश",
      delete: "हटवा",
      chatSuggestions: ["कीड नियंत्रण", "सर्वोत्तम खत", "सिंचन टिप्स", "पीक आवर्तन"]
    },
    te: {
      appTitle: "కృషి సహాయక్",
      tagline: "స్మార్ట్ అగ్రికల్చర్ అసిస్టెంట్",
      fieldWeather: "క్షేత్ర వాతావరణం",
      humidity: "తేమ",
      warning: "హెచ్చరిక",
      visionSystem: "విజన్ డిటెక్షన్ సిస్టమ్",
      realTime: "రియల్-టైమ్",
      readyToScan: "స్కాన్ చేయడానికి సిద్ధంగా ఉంది",
      uploadPhoto: "AI విజన్ విశ్లేషణను ప్రారంభించడానికి ఫోటోను అప్‌లోడ్ చేయండి.",
      openScanner: "స్కానర్ తెరవండి",
      agriBot: "అగ్రిబోట్ అసిస్టెంట్",
      online: "ఆన్‌లైన్",
      askCrops: "పంటల గురించి అడగండి...",
      pastReports: "గత నివేదికలు",
      viewAll: "అన్నీ చూడండి",
      noReports: "ఇంకా నివేదికలు లేవు.",
      home: "హోమ్",
      scan: "స్కాన్",
      expert: "నిపుణుడు",
      history: "చరిత్ర",
      plantDetection: "మొక్కల గుర్తింపు",
      uploadAffected: "ప్రభావిత మొక్క భాగం యొక్క ఫోటోను అప్‌లోడ్ చేయండి లేదా తీయండి",
      choosePhoto: "ఫోటోను ఎంచుకోండి",
      analyzing: "విశ్లేషిస్తోంది...",
      confidence: "విశ్వాసం",
      issueDetected: "సమస్య కనుగొనబడింది",
      organicTreatment: "సేంద్రియ చికిత్స",
      chemicalTreatment: "రసాయన చికిత్స",
      askExpertDetails: "వివరాల కోసం నిపుణుడిని అడగండి",
      yourReports: "మీ నివేదికలు",
      voiceOn: "వాయిస్ ఆన్",
      voiceOff: "వాయిస్ ఆఫ్",
      listening: "వింటున్నాను...",
      helloFarmer: "హలో, రైతు! నేను మీ AI అసిస్టెంట్. ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?",
      dashboard: "డ్యాష్‌బోర్డ్",
      settings: "సెట్టింగ్‌లు",
      profile: "రైతు ప్రొఫైల్",
      location: "స్థానం",
      smartInsights: "స్మార్ట్ ఫార్మింగ్ అంతర్దృష్టులు",
      diseaseRisk: "వ్యాధి ప్రమాదం",
      farmingSuggestion: "సూచించిన కార్యాచరణ",
      irrigationAdvice: "నీటిపారుదల సలహా",
      sprayingAlert: "స్ప్రేయింగ్ అలర్ట్",
      windSpeed: "గాలి వేగం",
      listenToInsights: "అంతర్దృష్టులను వినండి",
      feelsLike: "అనిపిస్తుంది",
      latitude: "అక్షాంశం",
      longitude: "రేఖాంశం",
      lastUpdated: "చివరిసారిగా అప్‌డేట్ చేయబడింది",
      refresh: "రిఫ్రెష్",
      delete: "తొలగించు",
      accuracy: "ఖచ్చితత్వం",
      atScan: "స్కాన్ వద్ద",
      chatSuggestions: ["తెగుళ్ల నివారణ", "ఉత్తమ ఎరువులు", "నీటిపారుదల చిట్కాలు", "పంట మార్పిడి"]
    },
    ta: {
      appTitle: "கிருஷி ஷாயக்",
      tagline: "ஸ்மார்ட் விவசாய உதவியாளர்",
      fieldWeather: "வயல் வானிலை",
      humidity: "ஈரப்பதம்",
      warning: "எச்சரிக்கை",
      visionSystem: "பார்வை கண்டறிதல் அமைப்பு",
      realTime: "நிகழ்நேரம்",
      readyToScan: "ஸ்கேன் செய்ய தயார்",
      uploadPhoto: "AI பார்வை பகுப்பாய்வைத் தொடங்க புகைப்படத்தைப் பதிவேற்றவும்.",
      openScanner: "ஸ்கேனரைத் திறக்கவும்",
      agriBot: "அக்ரிபாட் உதவியாளர்",
      online: "ஆன்லைன்",
      askCrops: "பயிர்களைப் பற்றி கேளுங்கள்...",
      pastReports: "கடந்த கால அறிக்கைகள்",
      viewAll: "அனைத்தையும் பார்",
      noReports: "இன்னும் அறிக்கைகள் இல்லை.",
      home: "முகப்பு",
      scan: "ஸ்கேன்",
      expert: "நிபுணர்",
      history: "வரலாறு",
      plantDetection: "தாவர கண்டறிதல்",
      uploadAffected: "பாதிக்கப்பட்ட தாவரப் பகுதியின் புகைப்படத்தைப் பதிவேற்றவும் அல்லது எடுக்கவும்",
      choosePhoto: "புகைப்படத்தைத் தேர்ந்தெடுக்கவும்",
      analyzing: "பகுப்பாய்வு செய்கிறது...",
      confidence: "நம்பிக்கை",
      issueDetected: "சிக்கல் கண்டறியப்பட்டது",
      organicTreatment: "இயற்கை சிகிச்சை",
      chemicalTreatment: "ரசாயன சிகிச்சை",
      askExpertDetails: "விவரங்களுக்கு நிபுணரிடம் கேளுங்கள்",
      yourReports: "உங்கள் அறிக்கைகள்",
      voiceOn: "குரல் ஆன்",
      voiceOff: "குரல் ஆஃப்",
      listening: "கேட்கிறது...",
      helloFarmer: "வணக்கம், விவசாயி! நான் உங்கள் AI உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
      dashboard: "டாஷ்போர்டு",
      settings: "அமைப்புகள்",
      profile: "விவசாயி சுயவிவரம்",
      location: "இடம்",
      smartInsights: "ஸ்மார்ட் விவசாய நுண்ணறிவு",
      diseaseRisk: "நோய் ஆபத்து",
      farmingSuggestion: "பரிந்துரைக்கப்பட்ட செயல்பாடு",
      irrigationAdvice: "நீர்ப்பாசன ஆலோசனை",
      sprayingAlert: "தெளிப்பு எச்சரிக்கை",
      windSpeed: "காற்றின் வேகம்",
      listenToInsights: "நுண்ணறிவுகளைக் கேளுங்கள்",
      feelsLike: "போல உணர்கிறேன்",
      latitude: "அட்சரேகை",
      longitude: "தீர்க்கரேகை",
      lastUpdated: "கடைசியாக புதுப்பிக்கப்பட்டது",
      refresh: "புதுப்பிக்கவும்",
      chatSuggestions: ["பூச்சி கட்டுப்பாடு", "சிறந்த உரங்கள்", "நீர்ப்பாசன குறிப்புகள்", "பயிர் சுழற்சி"]
    },
    bn: {
      appTitle: "কৃষি সহায়ক",
      tagline: "স্মার্ট কৃষি সহকারী",
      fieldWeather: "মাঠের আবহাওয়া",
      humidity: "আর্দ্রতা",
      warning: "সতর্কবার্তা",
      visionSystem: "ভিশন ডিটেকশন সিস্টেম",
      realTime: "রিয়েল-টাইম",
      readyToScan: "স্ক্যানের জন্য প্রস্তুত",
      uploadPhoto: "AI ভিশন বিশ্লেষণ শুরু করতে একটি ফটো আপলোড করুন।",
      openScanner: "স্ক্যানার খুলুন",
      agriBot: "AgriBot সহকারী",
      online: "অনলাইন",
      askCrops: "ফসল সম্পর্কে জিজ্ঞাসা করুন...",
      pastReports: "আগের রিপোর্ট",
      viewAll: "সব দেখুন",
      noReports: "এখনো কোনো রিপোর্ট নেই।",
      home: "হোম",
      scan: "স্ক্যান",
      expert: "বিশেষজ্ঞ",
      history: "ইতিহাস",
      plantDetection: "গাছ সনাক্তকরণ",
      uploadAffected: "আক্রান্ত গাছের অংশের একটি ফটো আপলোড করুন বা নিন",
      choosePhoto: "ফটো নির্বাচন করুন",
      analyzing: "বিশ্লেষণ করা হচ্ছে...",
      confidence: "নিশ্চয়তা",
      issueDetected: "সমস্যা সনাক্ত হয়েছে",
      organicTreatment: "জৈব প্রতিকার",
      chemicalTreatment: "রাসায়নিক প্রতিকার",
      askExpertDetails: "বিস্তারিত জানতে বিশেষজ্ঞকে জিজ্ঞাসা করুন",
      yourReports: "আপনার রিপোর্ট",
      voiceOn: "ভয়েস অন",
      voiceOff: "ভয়েস অফ",
      listening: "শুনছি...",
      helloFarmer: "নমস্কার, কৃষক ভাই! আমি আপনার AI সহকারী। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
      dashboard: "ড্যাশবোর্ড",
      settings: "সেটিংস",
      profile: "কৃষক প্রোফাইল",
      location: "অবস্থান",
      smartInsights: "স্মার্ট কৃষি পরামর্শ",
      diseaseRisk: "রোগের ঝুঁকি",
      farmingSuggestion: "পরামর্শিত কাজ",
      irrigationAdvice: "সেচ পরামর্শ",
      sprayingAlert: "স্প্রে করার সতর্কতা",
      windSpeed: "বাতাসের গতি",
      listenToInsights: "পরামর্শ শুনুন",
      feelsLike: "অনুভূত তাপমাত্রা",
      latitude: "অক্ষাংশ",
      longitude: "দ্রাঘিমাংশ",
      lastUpdated: "শেষ আপডেট",
      refresh: "রিফ্রেশ",
      chatSuggestions: ["কীটপতঙ্গ নিয়ন্ত্রণ", "সেরা সার", "সেচের টিপস", "শস্য আবর্তন"]
    },
    gu: {
      appTitle: "કૃષિ સહાયક",
      tagline: "સ્માર્ટ કૃષિ સહાયક",
      fieldWeather: "ખેતરનું હવામાન",
      humidity: "ભેજ",
      warning: "ચેતવણી",
      visionSystem: "વિઝન ડિટેક્શન સિસ્ટમ",
      realTime: "રીઅલ-ટાઇમ",
      readyToScan: "સ્કેન માટે તૈયાર",
      uploadPhoto: "AI વિઝન વિશ્લેષણ શરૂ કરવા માટે ફોટો અપલોડ કરો.",
      openScanner: "સ્કેનર ખોલો",
      agriBot: "AgriBot સહાયક",
      online: "ઓનલાઇન",
      askCrops: "પાક વિશે પૂછો...",
      pastReports: "ભૂતકાળના અહેવાલો",
      viewAll: "બધું જુઓ",
      noReports: "હજુ સુધી કોઈ અહેવાલ નથી.",
      home: "હોમ",
      scan: "સ્કેન",
      expert: "નિષ્ણાત",
      history: "ઇતિહાસ",
      plantDetection: "છોડની ચકાસણી",
      uploadAffected: "છોડના અસરગ્રસ્ત ભાગનો ફોટો અપલોડ કરો અથવા લો",
      choosePhoto: "ફોટો પસંદ કરો",
      analyzing: "વિશ્લેષણ કરી રહ્યું છે...",
      confidence: "આત્મવિશ્વાસ",
      issueDetected: "સમસ્યા પકડાઈ",
      organicTreatment: "જૈવિક સારવાર",
      chemicalTreatment: "રાસાયણિક સારવાર",
      askExpertDetails: "નિષ્ણાતને વિગત પૂછો",
      yourReports: "તમારા અહેવાલો",
      voiceOn: "અવાજ ચાલુ",
      voiceOff: "અવાજ બંધ",
      listening: "સાંભળી રહ્યું છે...",
      helloFarmer: "નમસ્તે, ખેડૂત મિત્ર! હું તમારો AI સહાયક છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
      dashboard: "ડેશબોર્ડ",
      settings: "સેટિંગ્સ",
      profile: "ખેડૂત પ્રોફાઇલ",
      location: "સ્થાન",
      smartInsights: "સ્માર્ટ ખેતીની સમજ",
      diseaseRisk: "રોગનું જોખમ",
      farmingSuggestion: "સૂચવેલ પ્રવૃત્તિ",
      irrigationAdvice: "સિંચાઈ સલાહ",
      sprayingAlert: "છંટકાવ એલર્ટ",
      windSpeed: "પવનની ગતિ",
      listenToInsights: "સમજ સાંભળો",
      feelsLike: "જેવું લાગે છે",
      latitude: "અક્ષાંશ",
      longitude: "રેખાંશ",
      lastUpdated: "છેલ્લે અપડેટ કર્યું",
      refresh: "રિફ્રેશ",
      chatSuggestions: ["જીવાત નિયંત્રણ", "શ્રેષ્ઠ ખાતર", "સિંચાઈ ટિપ્સ", "પાકની ફેરબદલી"]
    },
    kn: {
      appTitle: "ಕೃಷಿ ಸಹಾಯಕ",
      tagline: "ಸ್ಮಾರ್ಟ್ ಕೃಷಿ ಅಸಿಸ್ಟೆಂಟ್",
      fieldWeather: "ಹವಾಮಾನ ಮಾಹಿತಿ",
      humidity: "ಆರ್ದ್ರತೆ",
      warning: "ಎಚ್ಚರಿಕೆ",
      visionSystem: "ವಿಷನ್ ಡಿಟೆಕ್ಷನ್ ಸಿಸ್ಟಮ್",
      realTime: "ರಿಯಲ್-ಟೈಮ್",
      readyToScan: "ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಸಿದ್ಧ",
      uploadPhoto: "AI ವಿಶ್ಲೇಷಣೆ ಪ್ರಾರಂಭಿಸಲು ಫೋಟೋ ಅಪ್ಲೋಡ್ ಮಾಡಿ.",
      openScanner: "ಸ್ಕ್ಯಾನರ್ ತೆರೆಯಿರಿ",
      agriBot: "AgriBot ಸಹಾಯಕ",
      online: "ಆನ್‌ಲೈನ್",
      askCrops: "ಬೆಳೆಗಳ ಬಗ್ಗೆ ಕೇಳಿ...",
      pastReports: "ಹಳೆಯ ವರದಿಗಳು",
      viewAll: "ಎಲ್ಲವನ್ನೂ ನೋಡಿ",
      noReports: "ಇನ್ನೂ ಯಾವುದೇ ವರದಿಗಳಿಲ್ಲ.",
      home: "ಮನೆ",
      scan: "ಸ್ಕ್ಯಾನ್",
      expert: "ತಜ್ಞರು",
      history: "ಇತಿಹಾಸ",
      plantDetection: "ಸಸ್ಯ ತಪಾಸಣೆ",
      uploadAffected: "ಸಸ್ಯದ ಪೀಡಿತ ಭಾಗದ ಫೋಟೋ ಅಪ್ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ತೆಗೆದುಕೊಳ್ಳಿ",
      choosePhoto: "ಫೋಟೋ ಆರಿಸಿ",
      analyzing: "ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ...",
      confidence: "ನಂಬಿಕೆ",
      issueDetected: "ಸಮಸ್ಯೆ ಪತ್ತೆಯಾಗಿದೆ",
      organicTreatment: "ಸಾವಯವ ಚಿಕಿತ್ಸೆ",
      chemicalTreatment: "ರಾಸಾಯನಿಕ ಚಿಕಿತ್ಸೆ",
      askExpertDetails: "ವಿವರಗಳಿಗಾಗಿ ತಜ್ಞರನ್ನು ಕೇಳಿ",
      yourReports: "ನಿಮ್ಮ ವರದಿಗಳು",
      voiceOn: "ಧ್ವನಿ ಆನ್",
      voiceOff: "ಧ್ವನಿ ಆಫ್",
      listening: "ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದೆ...",
      helloFarmer: "ನಮಸ್ಕಾರ ರೈತ ಮಿತ್ರರೇ! ನಾನು ನಿಮ್ಮ AI ಸಹಾಯಕ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
      dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
      settings: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
      profile: "ರೈತರ ಪ್ರೊಫೈಲ್",
      location: "ಸ್ಥಳ",
      smartInsights: "ಸ್ಮಾರ್ಟ್ ಕೃಷಿ ಮಾಹಿತಿ",
      diseaseRisk: "ರೋಗದ ಅಪಾಯ",
      farmingSuggestion: "ಸೂಚಿಸಿದ ಚಟುವಟಿಕೆ",
      irrigationAdvice: "ನೀರಾವರಿ ಸಲಹೆ",
      sprayingAlert: "ಸಿಂಪರಣೆ ಎಚ್ಚರಿಕೆ",
      windSpeed: "ಗಾಳಿಯ ವೇಗ",
      listenToInsights: "ಮಾಹಿತಿ ಕೇಳಿ",
      feelsLike: "ಅನಿಸಿಕೆ ತಾಪಮಾನ",
      latitude: "ಅಕ್ಷಾಂಶ",
      longitude: "ರೇಖಾಂಶ",
      lastUpdated: "ಕೊನೆಯ ಅಪ್‌ಡೇಟ್",
      refresh: "ರಿಫ್ರೆಶ್",
      chatSuggestions: ["ಕೀಟ ನಿಯಂತ್ರಣ", "ಉತ್ತಮ ಗೊಬ್ಬರ", "ನೀರಾವರಿ ಸಲಹೆಗಳು", "ಬೆಳೆ ಸರದಿ"]
    },
    ml: {
      appTitle: "കൃഷി സഹായക്",
      tagline: "സ്മാർട്ട് അഗ്രിക്കൾച്ചറൽ അസിസ്റ്റന്റ്",
      fieldWeather: "കാലാവസ്ഥ",
      humidity: "ആർദ്രത",
      warning: "മുന്നറിയിപ്പ്",
      visionSystem: "വിഷൻ ഡിറ്റക്ഷൻ സിസ്റ്റം",
      realTime: "റിയൽ-ടൈം",
      readyToScan: "സ്കാൻ ചെയ്യാൻ തയ്യാറാണ്",
      uploadPhoto: "AI വിശകലനം തുടങ്ങാൻ ഒരു ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക.",
      openScanner: "സ്കാനർ തുറക്കുക",
      agriBot: "AgriBot അസിസ്റ്റന്റ്",
      online: "ഓൺലൈൻ",
      askCrops: "കൃഷിയെക്കുറിച്ച് ചോദിക്കൂ...",
      pastReports: "പഴയ റിപ്പോർട്ടുകൾ",
      viewAll: "എല്ലാം കാണുക",
      noReports: "റിപ്പോർട്ടുകൾ ഒന്നുമില്ല.",
      home: "ഹോം",
      scan: "സ്കാൻ",
      expert: "വിദഗ്ദ്ധൻ",
      history: "ചരിത്രം",
      plantDetection: "സസ്യ പരിശോധന",
      uploadAffected: "ബാധിക്കപ്പെട്ട സസ്യഭാഗത്തിന്റെ ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക",
      choosePhoto: "ഫോട്ടോ തിരഞ്ഞെടുക്കുക",
      analyzing: "പരിശോധിക്കുന്നു...",
      confidence: "വിശ്വാസ്യത",
      issueDetected: "പ്രശ്നം കണ്ടെത്തി",
      organicTreatment: "ജൈവ ചികിത്സ",
      chemicalTreatment: "രാസ ചികിത്സ",
      askExpertDetails: "കൂടുതൽ വിവരങ്ങൾക്കായി ചോദിക്കൂ",
      yourReports: "നിങ്ങളുടെ റിപ്പോർട്ടുകൾ",
      voiceOn: "ശബ്ദം ഓൺ",
      voiceOff: "ശബ്ദം ഓഫ്",
      listening: "കേൾക്കുന്നു...",
      helloFarmer: "നമസ്കാരം കർഷക സുഹൃത്തേ! ഞാൻ നിങ്ങളുടെ AI സഹായിയാണ്. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?",
      dashboard: "ഡാഷ്‌ബോർഡ്",
      settings: "സെറ്റിംഗ്സ്",
      profile: "കർഷക പ്രൊഫൈൽ",
      location: "സ്ഥലം",
      smartInsights: "സ്മാർട്ട് കൃഷി അറിവുകൾ",
      diseaseRisk: "രോഗസാധ്യത",
      farmingSuggestion: "നിർദ്ദേശിച്ച പ്രവർത്തനം",
      irrigationAdvice: "ജലസേചന ഉപദേശം",
      sprayingAlert: "മരുന്ന് തളിക്കൽ മുന്നറിയിപ്പ്",
      windSpeed: "കാറ്റിന്റെ വേഗത",
      listenToInsights: "അറിവുകൾ കേൾക്കുക",
      feelsLike: "അനുഭവപ്പെടുന്ന ചൂട്",
      latitude: "അക്ഷാംശം",
      longitude: "രേഖാംശം",
      lastUpdated: "അവസാനം പുതുക്കിയത്",
      refresh: "പുതുക്കുക",
      chatSuggestions: ["കീട നിയന്ത്രണം", "മികച്ച വളം", "നനയ്ക്കൽ ടിപ്‌സ്", "വിള പരിക്രമണം"]
    },
    pa: {
      appTitle: "ਕ੍ਰਿਸ਼ੀ ਸਹਾਇਕ",
      tagline: "ਸਮਾਰਟ ਐਗਰੀਕਲਚਰ ਅਸਿਸਟੈਂਟ",
      fieldWeather: "ਖੇਤ ਦਾ ਮੌਸਮ",
      humidity: "ਨਮੀ",
      warning: "ਚੇਤਾਵਨੀ",
      visionSystem: "ਵਿਜ਼ਨ ਡਿਟੈਕਸ਼ਨ ਸਿਸਟਮ",
      realTime: "ਰੀਅਲ-ਟਾਈਮ",
      readyToScan: "ਸਕੈਨ ਲਈ ਤਿਆਰ",
      uploadPhoto: "AI ਵਿਸ਼ਲੇਸ਼ਣ ਸ਼ੁਰੂ ਕਰਨ ਲਈ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ।",
      openScanner: "ਸਕੈਨਰ ਖੋਲ੍ਹੋ",
      agriBot: "AgriBot ਸਹਾਇਕ",
      online: "ਆਨਲਾਈਨ",
      askCrops: "ਫਸਲਾਂ ਬਾਰੇ ਪੁੱਛੋ...",
      pastReports: "ਪਿਛਲੀਆਂ ਰਿਪੋਰਟਾਂ",
      viewAll: "ਸਭ ਦੇਖੋ",
      noReports: "ਅਜੇ ਤੱਕ ਕੋਈ ਰਿਪੋਰਟ ਨਹੀਂ ਹੈ।",
      home: "ਹੋਮ",
      scan: "ਸਕੈਨ",
      expert: "ਮਾਹਿਰ",
      history: "ਇਤਿਹਾસ",
      plantDetection: "ਪੌਦੇ ਦੀ ਜਾਂਚ",
      uploadAffected: "ਪੌਦੇ ਦੇ ਪ੍ਰਭਾਵਿਤ ਹਿੱਸੇ ਦੀ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ",
      choosePhoto: "ਫੋਟੋ ਚੁਣੋ",
      analyzing: "ਵਿਸ਼ਲੇਸ਼ਣ ਕਰ ਰਿਹਾ ਹੈ...",
      confidence: "ਭਰੋਸਾ",
      issueDetected: "ਸਮੱਸਿਆ ਲੱਭੀ ਗਈ",
      organicTreatment: "ਜੈਵਿਕ ਇਲਾજ",
      chemicalTreatment: "ਰਸਾਇણਕ ਇਲਾજ",
      askExpertDetails: "ਵੇരਵਿਆਂ ਲਈ ਮਾਹਿਰ ਨੂੰ ਪੁੱਛੋ",
      yourReports: "ਤੁਹਾਡੀਆਂ ਰਿਪੋਰਟਾਂ",
      voiceOn: "ਆਵਾਜ਼ ਚਾਲੂ",
      voiceOff: "ਆਵਾਜ਼ ਬੰਦ",
      listening: "ਸੁਣ ਰਿਹਾ ਹੈ...",
      helloFarmer: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਕਿਸਾਨ ਵੀਰੋ! ਮੈਂ ਤੁਹਾਡਾ AI ਸਹਾਇਕ ਹਾਂ। ਮੈਂ ਅੱਜ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
      dashboard: "ਡੈਸ਼ਬੋਰਡ",
      settings: "ਸੈਟਿੰਗਾਂ",
      profile: "ਕਿਸਾਨ ਪ੍ਰੋਫਾਈਲ",
      location: "ਸਥਾਨ",
      smartInsights: "ਸਮਾਰਟ ਖੇਤੀ ਜਾਣਕਾਰੀ",
      diseaseRisk: "ਬਿਮਾਰੀ ਦਾ ਖਤਰਾ",
      farmingSuggestion: "ਸੁਝਾਈ ਗਈ ਗਤੀਵਿਧੀ",
      irrigationAdvice: "ਸਿੰਚਾਈ ਸਲਾਹ",
      sprayingAlert: "ਛਿੜਕਾਅ ਅਲਰਟ",
      windSpeed: "ਹਵਾ ਦੀ ਰਫ਼ਤਾਰ",
      listenToInsights: "ਜਾਣਕਾਰੀ ਸੁਣੋ",
      feelsLike: "ਮਹਿਸੂਸ ਹੁੰਦਾ ਹੈ",
      latitude: "ਅਕਸ਼ਾਂਸ਼",
      longitude: "ਦੇਸ਼ਾਂਤਰ",
      lastUpdated: "ਆਖਰੀ ਅਪਡੇਟ",
      refresh: "ਤਾਜ਼ਾ ਕਰੋ",
      chatSuggestions: ["ਕੀੜੇਮਾਰ ਕੰਟਰੋલ", "ਵਧੀਆ ਖાਦ", "ਸਿੰਚਾਈ ਸੁਝਾਅ", "ਫਸਲੀ ਚੱਕਰ"]
    }
  };
  const t = translations[language] || translations.en;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setIsCameraActive(true);
    setDetectionResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Could not access camera. Please ensure permissions are granted.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        stopCamera();
        const compressedUrl = await compressImage(dataUrl);
        handleBase64ImageAnalysis(compressedUrl);
      }
    }
  };

  const handleBase64ImageAnalysis = async (base64Url: string) => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
      const base64 = base64Url.split(',')[1];
      const quality = await enhanceImageQuality(base64);
      if (!quality.isUsable) {
        alert(`Image not usable: ${quality.reason}`);
        setIsAnalyzing(false);
        return;
      }

      const result = await analyzePlantImage(base64, language);
      setDetectionResult(result);

      await addDoc(collection(db, 'reports'), {
        userId: user.uid,
        imageUrl: base64Url,
        detectionResult: result.issueDetected,
        confidence: result.confidence,
        treatment: JSON.stringify(result.treatments),
        plantName: result.plantName,
        explanation: result.explanation,
        timestamp: Timestamp.now(),
        weatherContext: weather
      });

      if (result.issueDetected && result.explanation) {
        const tr = result.treatments;
        // Language-specific conversational structure
        const intro = language === 'hi' ? `मैंने फोटो का विश्लेषण किया है। आपके ${result.plantName} में ${result.issueDetected} की समस्या लग रही है।` : 
                      language === 'mr' ? `मी फोटोचे विश्लेषण केले आहे. तुमच्या ${result.plantName} मध्ये ${result.issueDetected} ची समस्या असल्याचे दिसून येत आहे.` :
                      `I've analyzed the photo. It looks like your ${result.plantName} has ${result.issueDetected}.`;
        
        const treatmentInfo = language === 'hi' ? `जैविक उपचार के लिए, ${tr.organic}। रासायनिक विकल्प के लिए, ${tr.chemical}।` :
                             language === 'mr' ? `सेंद्रिय उपचारासाठी, ${tr.organic}। रासायनिक पर्यायासाठी, ${tr.chemical}।` :
                             `For organic treatment, you can try ${tr.organic}. For chemical options, ${tr.chemical}.`;

        const textToSpeak = `${intro} ${result.explanation} ${treatmentInfo}`;
        setLastSpeakableText(textToSpeak);
        speak(textToSpeak);
      }
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChatFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Please upload an image file (JPG, PNG etc.)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Max size is 5MB.");
      return;
    }

    setChatFile(file);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result as string);
      setChatFilePreview(compressedUrl);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    // Pre-warm voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      
      // Unlock speech synthesis on first interaction
      const unlockSpeech = () => {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
        window.removeEventListener('click', unlockSpeech);
        window.removeEventListener('touchstart', unlockSpeech);
      };
      window.addEventListener('click', unlockSpeech);
      window.addEventListener('touchstart', unlockSpeech);
      
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        window.removeEventListener('click', unlockSpeech);
        window.removeEventListener('touchstart', unlockSpeech);
      };
    }
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error) {
          console.warn("Firestore connection test completed.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (user) {
      const getLocationAndWeather = async () => {
        if (!isWeatherAutoUpdate) return;

        if (locationMode === 'manual') {
          if (manualLocation) {
            loadWeather(manualLocation);
          }
          return;
        }

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              loadWeather(`${latitude}, ${longitude}`);
            },
            () => {
              loadWeather(manualLocation);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        } else {
          loadWeather(manualLocation);
        }
      };

      getLocationAndWeather();
      const refreshInterval = setInterval(getLocationAndWeather, 15 * 60 * 1000); 

      const q = query(
        collection(db, 'reports'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc')
      );

      const unsubscribeHistory = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setHistory(docs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      });

      return () => {
        clearInterval(refreshInterval);
        unsubscribeHistory();
      };
    }
  }, [user, language, locationMode, manualLocation, isWeatherAutoUpdate]);

  useEffect(() => {
    if (activeTab !== 'detect') {
      stopCamera();
    }
  }, [activeTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleManualLocationSearch = async (cityOverride?: string) => {
    const cityToSearch = cityOverride || manualLocation;
    if (!cityToSearch.trim()) return;
    
    if (cityOverride) setManualLocation(cityOverride);
    setLocationMode('manual');
    loadWeather(cityToSearch);
    setTimeout(() => setActiveTab('dashboard'), 500);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result as string);
      handleBase64ImageAnalysis(compressedUrl);
    };
    reader.readAsDataURL(file);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const handleDeleteReport = async (reportId: string) => {
    if (confirmDeleteId !== reportId) {
      setConfirmDeleteId(reportId);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    setDeletingReportId(reportId);
    setConfirmDeleteId(null);
    try {
      await deleteDoc(doc(db, 'reports', reportId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `reports/${reportId}`);
    } finally {
      setDeletingReportId(null);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() && !chatFile) return;
    if (!user) return;

    const messageText = text.trim() || (chatFile ? "Analyze this image" : "");
    const currentMessages = [...chatMessages];
    const displayMessage = chatFilePreview ? `[Image Attached] ${messageText}` : messageText;
    const newMessages = [...currentMessages, { role: 'user' as const, text: displayMessage }];
    setChatMessages(newMessages);

    const imageToSend = chatFilePreview ? chatFilePreview.split(',')[1] : undefined;
    setChatFile(null);
    setChatFilePreview(null);

    try {
      // --- Context Enhancement from Recent History ---
      // Instead of client-side embedding search which is slow and hits quotas,
      // we provide a concise summary of the last 3 reports for the AI to reason about.
      let historyContext = "";
      if (history.length > 0) {
        const recentReports = history.slice(0, 3).map(r => 
          `- ${new Date(r.timestamp.seconds * 1000).toLocaleDateString()}: Detected ${r.issueDetected} on ${r.plantName}`
        ).join('\n');
        historyContext = `\nRecent Activity History:\n${recentReports}`;
      }

      const extraContext = `
        Farmer Name: ${user?.displayName || 'Kisan Bhai'}
        Current Location: ${weather?.locationName || manualLocation}
        Weather: ${weather ? `${weather.temp}°C, ${weather.condition}, Humidity: ${weather.humidity}%` : 'Unknown'}
        Agricultural Risk: ${weather?.riskLevel || 'Unknown'}
        Last Detection: ${detectionResult ? `${detectionResult.plantName} - ${detectionResult.issueDetected}` : 'None'}
        ${historyContext}
      `;
      
      console.log("[Chat] Sending message with context:", extraContext);
      const response = await chatWithExpert(currentMessages, messageText, language, imageToSend, extraContext);
      
      if (!response) throw new Error("No response from AI expert.");

      setChatMessages([...newMessages, { role: 'model' as const, text: response }]);
      setLastSpeakableText(response);
      speak(response);
    } catch (error: any) {
      console.error("[Chat] Send failed:", error);
      alert(`Failed to send message: ${error.message || 'Unknown error'}`);
    }
  };

  const toggleVoice = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else if (lastSpeakableText) {
      speak(lastSpeakableText, true);
    } else {
      // Fallback: speak hello or current context
      const welcome = t.helloFarmer;
      speak(welcome, true);
    }
  };

  const speakWeatherInsights = () => {
    if (!weather) return;
    const firstName = user?.displayName?.split(' ')[0] || 'Kisan Bhai';
    
    const weatherText = language === 'hi' ? 
      `नमस्ते ${firstName}, यहाँ ${weather.locationName} का मौसम अपडेट है। अभी तापमान ${weather.temp} डिग्री है और ${weather.condition} की स्थिति है। रोग का जोखिम ${weather.riskLevel} है। मेरा सुझाव है कि आप ${weather.farmingSuggestion} पर ध्यान दें।` :
      `Hello ${firstName}, here is your weather update for ${weather.locationName}. It's currently ${weather.temp} degrees with ${weather.condition}. The disease risk is ${weather.riskLevel}, so I suggest you focus on ${weather.farmingSuggestion}.`;
      
    setLastSpeakableText(weatherText);
    speak(weatherText, true);
  };

  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    if (!isMicEnabled) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    const recognitionLangs: Record<string, string> = {
      en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
      bn: 'bn-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN'
    };

    recognition.lang = recognitionLangs[language] || 'en-IN';
    recognition.onstart = () => {
      setIsListening(true);
      window.speechSynthesis.cancel();
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) handleSendMessage(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Leaf className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg text-center">
        <Leaf className="w-16 h-16 text-primary mb-6" />
        <h1 className="text-4xl font-bold text-primary mb-4">Krishi Shayak</h1>
        <button onClick={login} className="btn-bento py-4 px-8 text-lg">Sign in with Google</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex overflow-hidden relative">
      <AnimatePresence>
        {(isSidebarOpen) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-border z-[70] flex flex-col shadow-xl lg:hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl">K</div>
                    <span className="font-bold text-2xl text-primary">{t.appTitle}</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-muted hover:text-primary"><X className="w-6 h-6" /></button>
                </div>
                <nav className="space-y-2">
                  <div onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} className={`sidebar-item ${activeTab === 'dashboard' ? 'sidebar-item-active' : ''}`}><LayoutDashboard /> {t.dashboard}</div>
                  <div onClick={() => { setActiveTab('detect'); setIsSidebarOpen(false); }} className={`sidebar-item ${activeTab === 'detect' ? 'sidebar-item-active' : ''}`}><Camera /> {t.scan}</div>
                  <div onClick={() => { setActiveTab('chat'); setIsSidebarOpen(false); }} className={`sidebar-item ${activeTab === 'chat' ? 'sidebar-item-active' : ''}`}><Bot /> {t.expert}</div>
                  <div onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }} className={`sidebar-item ${activeTab === 'history' ? 'sidebar-item-active' : ''}`}><History /> {t.history}</div>
                  <div onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} className={`sidebar-item ${activeTab === 'settings' ? 'sidebar-item-active' : ''}`}><Settings /> {t.settings}</div>
                </nav>
              </div>
              <div className="mt-auto p-6"><button onClick={logout} className="w-full flex items-center gap-3 text-error font-bold p-3">Logout</button></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-border flex-col shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg transform -rotate-3">K</div>
            <span className="font-black text-2xl text-primary tracking-tight">{t.appTitle}</span>
          </div>
          <nav className="space-y-3">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: t.dashboard },
              { id: 'detect', icon: Camera, label: t.scan },
              { id: 'chat', icon: Bot, label: t.expert },
              { id: 'history', icon: History, label: t.history },
              { id: 'settings', icon: Settings, label: t.settings },
            ].map((item) => (
              <div 
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)} 
                className={`sidebar-item group ${activeTab === item.id ? 'sidebar-item-active' : 'hover:translate-x-1'}`}
              >
                <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110`} /> 
                <span className="font-bold tracking-tight">{item.label}</span>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 pt-4">
          <div className="p-4 bg-bg rounded-2xl border border-border/40 mb-6 font-bold">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 overflow-hidden bg-white flex items-center justify-center">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs text-primary truncate">{user.displayName}</div>
                <div className="text-[0.6rem] text-muted font-bold truncate">Professional Farmer</div>
              </div>
            </div>
            <button onClick={logout} className="w-full py-2 bg-white border border-border rounded-xl text-error font-black text-[0.65rem] uppercase tracking-widest hover:bg-error hover:text-white transition-all shadow-sm flex items-center justify-center gap-2">
              <LogOut className="w-3 h-3" /> {t.logout || "Logout"}
            </button>
          </div>
          <p className="text-[0.6rem] text-muted font-bold text-center opacity-40">Krishi Shayak v2.4.0</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-border px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 lg:hidden hover:bg-[#f0fdf4] rounded-xl text-primary transition-colors"><Menu /></button>
            <div className="flex flex-col">
              <span className="font-black text-xl text-primary tracking-tighter leading-none">{t.appTitle}</span>
              <span className="text-[0.65rem] text-muted font-bold uppercase tracking-widest mt-1 opacity-70 lg:hidden">{t.tagline}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-[#f0fdf4] border border-primary/10 rounded-xl">
               <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
               <span className="text-[0.7rem] font-black text-primary uppercase tracking-wide">{t.online}</span>
            </div>
            <button
              onClick={() => isSpeaking ? agriVoice.stop() : handleBriefMe()}
              className={`p-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${isSpeaking ? 'bg-error text-white shadow-lg shadow-error/20' : 'bg-primary text-white shadow-lg shadow-primary/20'}`}
              title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
            >

              {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="relative">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="appearance-none bg-white border border-border rounded-xl pl-3 pr-8 py-2.5 text-xs font-black text-primary hover:border-primary/40 transition-all outline-none cursor-pointer shadow-sm">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
                <option value="bn">বাংলা</option>
                <option value="gu">ગુજરાતી</option>
                <option value="te">తెలుగు</option>
                <option value="ta">தமிழ்</option>
                <option value="kn">ಕನ್ನಡ</option>
                <option value="ml">മലയാളം</option>
                <option value="pa">ਪੰਜਾਬੀ</option>
              </select>
              <Languages className="w-3 h-3 text-primary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-10 lg:p-12 overflow-y-auto pb-32 lg:pb-12 bg-[#f9fbf9] custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="dashboard-container bento-grid max-w-7xl mx-auto"
              >
                {/* Weather Card */}
                <div className="bento-card col-span-12 md:col-span-12 lg:col-span-8 row-span-4 lg:row-span-8 flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 px-2">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform">
                        <CloudSun className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-primary tracking-tight">{t.fieldWeather}</h2>
                        {locationError && (
                          <div className="bg-red-50 text-red-600 text-[0.6rem] font-bold px-2 py-0.5 rounded-lg border border-red-100 flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3" />
                            {locationError}
                          </div>
                        )}
                        <p className="text-xs text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3 h-3 text-accent" />
                          {isRefreshingWeather ? (
                            <span className="flex items-center gap-1">
                              <RefreshCcw className="w-2 h-2 animate-spin" />
                              Fetching...
                            </span>
                          ) : (
                            weather?.locationName || manualLocation || 'Detecting...'
                          )}
                          <button 
                            onClick={() => setActiveTab('settings')}
                            className="ml-2 text-primary hover:underline lowercase font-normal tracking-normal flex items-center gap-1 transition-opacity hover:opacity-80"
                          >
                            (change city)
                          </button>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          if (locationMode === 'manual') {
                            loadWeather(manualLocation);
                            return;
                          }
                          
                          if (navigator.geolocation) {
                            setIsRefreshingWeather(true);
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                loadWeather(`${pos.coords.latitude}, ${pos.coords.longitude}`);
                              },
                              (err) => {
                                setIsRefreshingWeather(false);
                                setLocationError(err.code === 1 ? "Location access denied." : "Location request timed out.");
                              },
                              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                            );
                          } else {
                            setLocationError("Geolocation not supported.");
                          }
                        }}
                        className={`p-3 bg-[#f0fdf4] text-primary rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm ${isRefreshingWeather ? 'animate-spin' : ''}`}
                        title={t.refresh}
                        disabled={isRefreshingWeather}
                      >
                        <RefreshCcw className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mb-8 p-6 bg-[#f8faf8] rounded-3xl border border-border/50">
                    <div className="flex items-center gap-4 flex-1 min-w-[140px]">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-border/20">
                        <Thermometer className="w-7 h-7 text-orange-500" />
                      </div>
                      <div>
                        <div className="text-3xl font-black text-primary tracking-tighter">{weather ? `${weather.temp}°C` : '--°C'}</div>
                        <div className="text-[0.7rem] text-muted font-bold tracking-tight uppercase">
                          {weather?.feelsLike ? `${t.feelsLike} ${weather.feelsLike}°C` : weather?.condition || 'Loading'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 min-w-[140px] border-l lg:border-l border-border/50 pl-4">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-border/20">
                        <Droplets className="w-7 h-7 text-blue-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-black text-primary tracking-tighter">{weather?.humidity || '--'}%</div>
                        <div className="text-[0.7rem] text-muted font-bold tracking-tight uppercase">{t.humidity}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 min-w-[140px] border-l lg:border-l border-border/50 pl-4">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-border/20">
                        <Wind className="w-7 h-7 text-slate-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-black text-primary tracking-tighter">{weather?.windSpeed ? Math.round(weather.windSpeed) : '--'}</div>
                        <div className="text-[0.7rem] text-muted font-bold tracking-tight uppercase">KM/H Wind</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 px-1">
                    <div className="flex items-center justify-between mb-2">
                       <span className="text-[0.65rem] font-black text-muted uppercase tracking-[0.2em]">{t.smartInsights}</span>
                       <div className="h-px flex-1 bg-border/40 ml-4"></div>
                    </div>
                    
                    <div className={`p-5 rounded-3xl border-2 flex gap-5 transition-all ${weather?.riskLevel === 'High' ? 'bg-red-50/50 border-red-100 text-red-950' : weather?.riskLevel === 'Medium' ? 'bg-amber-50/50 border-amber-100 text-amber-950' : 'bg-green-50/50 border-green-100 text-green-950'}`}>
                      <div className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center shadow-sm ${weather?.riskLevel === 'High' ? 'bg-white text-red-500' : weather?.riskLevel === 'Medium' ? 'bg-white text-amber-500' : 'bg-white text-green-500'}`}>
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-black text-sm mb-1 tracking-tight uppercase">{t.diseaseRisk}: {weather?.riskLevel}</div>
                        <p className="text-[0.9rem] leading-relaxed font-medium opacity-80">{weather?.diseaseRisk || 'Waiting for real-time field data...'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { icon: Sprout, label: t.farmingSuggestion, value: weather?.farmingSuggestion, color: 'emerald' },
                        { icon: Waves, label: t.irrigationAdvice, value: weather?.irrigationAdvice, color: 'blue' },
                        { icon: Bug, label: t.sprayingAlert, value: weather?.sprayingAlert, color: 'amber' }
                      ].map((insight, idx) => (
                        <div key={idx} className="bg-white border border-border/40 p-5 rounded-3xl flex flex-col gap-3 group hover:border-primary/30 transition-all shadow-sm">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${insight.color}-50 text-${insight.color}-600 group-hover:scale-110 transition-transform`}>
                            <insight.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className={`font-black text-[0.65rem] uppercase tracking-wider text-${insight.color}-600/80 mb-1`}>{insight.label}</div>
                            <p className="text-[0.8rem] text-primary font-bold leading-tight line-clamp-3">{insight.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {weather?.lat && (
                      <div className="mt-4 pt-4 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-4 text-[0.65rem] text-muted font-bold tracking-widest uppercase">
                          <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {t.latitude}: {weather.lat.toFixed(4)}°</span>
                          <span className="flex items-center gap-1.5">{t.longitude}: {weather.lon.toFixed(4)}°</span>
                        </div>
                        {lastUpdated && (
                          <div className="flex items-center gap-1.5 text-[0.65rem] text-muted font-bold tracking-widest uppercase opacity-60">
                            <Clock className="w-3 h-3" />
                            {t.lastUpdated}: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Vision Card */}
                <div className="bento-card col-span-12 md:col-span-6 lg:col-span-4 row-span-4 lg:row-span-5 flex flex-col">
                  <div className="card-title justify-between mb-4">
                    <span className="flex items-center gap-2">
                      <Camera className="w-5 h-5 text-primary" />
                      {t.visionSystem}
                    </span>
                    <span className="text-[0.6rem] font-black tracking-widest uppercase px-2 py-0.5 bg-sky-50 text-sky-600 rounded-md border border-sky-100">{t.realTime}</span>
                  </div>
                  <div className="flex-1 bg-[#1a1a1a] rounded-[2rem] overflow-hidden relative group border-[4px] border-white shadow-inner flex items-center justify-center min-h-[160px]">
                    <div className="text-white/20 text-center uppercase tracking-[0.3em] font-black text-xs group-hover:text-white/40 transition-colors">
                      {t.readyToScan}
                    </div>
                    <div className="absolute inset-0 border-2 border-white/5 m-8 rounded-2xl pointer-events-none"></div>
                    <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-primary/40"></div>
                    <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-primary/40"></div>
                    <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-primary/40"></div>
                    <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-primary/40"></div>
                    
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-primary/20 backdrop-blur-md flex items-center justify-center">
                        <motion.div animate={{ rotate: 360, scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                          <Leaf className="w-12 h-12 text-white" />
                        </motion.div>
                      </div>
                    )}
                  </div>
                  <div className="mt-6 flex flex-col gap-3">
                    <p className="text-[0.8rem] text-muted font-bold italic opacity-80 leading-snug">
                      {t.uploadPhoto}
                    </p>
                    <button 
                      onClick={() => setActiveTab('detect')}
                      className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-primary/20 active:scale-95"
                    >
                      {t.openScanner}
                    </button>
                  </div>
                </div>

                {/* Chat Card (Quick Access) */}
                <div className="bento-card col-span-12 md:col-span-6 lg:col-span-4 row-span-4 lg:row-span-8 flex flex-col">
                  <div className="card-title justify-between mb-6">
                    <span className="flex items-center gap-2">
                      <Bot className="w-5 h-5 text-primary" />
                      {t.agriBot}
                    </span>
                    <button 
                      onClick={startListening}
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white transition-all shadow-md ${isListening ? 'bg-red-500 animate-pulse' : 'bg-primary hover:scale-105'}`}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar p-1">
                    {chatMessages.length === 0 ? (
                      <div className="p-5 bg-[#f0fdf4] rounded-2xl border border-primary/10 text-[0.9rem] font-bold text-primary leading-relaxed">
                        {t.helloFarmer}
                      </div>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] px-4 py-3 rounded-2xl font-bold text-[0.85rem] shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-border/50 text-text rounded-tl-none'}`}>
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/50">
                    <div className="flex gap-2">
                       <input 
                        type="text" 
                        placeholder={t.askCrops}
                        className="flex-1 bg-bg border border-border/50 rounded-2xl px-4 py-3 text-sm font-bold text-primary outline-none focus:border-primary/50 transition-all"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val.trim()) {
                              handleSendMessage(val);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <button 
                         onClick={() => setActiveTab('chat')}
                         className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-emerald-700 transition-all"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* History Card (Horizontal) */}
                <div className="bento-card col-span-12 md:col-span-12 lg:col-span-8 row-span-4 flex flex-col min-h-0">
                  <div className="card-title justify-between mb-6 shrink-0">
                    <span className="flex items-center gap-2">
                      <History className="w-5 h-5 text-primary" />
                      {t.pastReports}
                    </span>
                    <button onClick={() => setActiveTab('history')} className="text-primary text-[0.7rem] font-black uppercase tracking-widest hover:underline decoration-2 underline-offset-4">
                      {t.viewAll}
                    </button>
                  </div>
                  
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                      {history.slice(0, 6).map((report) => (
                        <div key={report.id} className="group p-5 bg-white border border-border/50 rounded-[2.5rem] hover:border-primary/30 transition-all shadow-md flex flex-col gap-4 relative overflow-hidden h-full">
                          <div className="flex gap-5 items-start">
                            <div className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-border/20 shadow-inner">
                               <img src={report.imageUrl} className="w-full h-full object-cover bg-bg transform group-hover:scale-110 transition-transform duration-500" alt="Report" referrerPolicy="no-referrer" />
                               <div className="absolute inset-0 bg-black/5"></div>
                            </div>
                            <div className="flex-1 min-w-0 py-0.5">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-black text-primary text-[0.95rem] truncate leading-none">{report.plantName}</div>
                                <button 
                                  onClick={() => {
                                    let text = `${report.plantName}. ${report.detectionResult}. ${report.explanation || ''}. `;
                                    try {
                                      const tr = typeof report.treatment === 'string' ? JSON.parse(report.treatment) : report.treatment;
                                      if (tr) text += `${t.organicTreatment}: ${tr.organic}.`;
                                    } catch(e) {}
                                    speak(text, true);
                                  }}
                                  className="p-1.5 text-primary/40 hover:text-primary transition-colors"
                                  title="Listen to report"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="font-bold text-error text-[0.7rem] line-clamp-1 mb-1.5 uppercase tracking-tight">
                                {report.detectionResult}
                              </div>
                              <div className="flex items-center gap-1.5 text-[0.6rem] text-muted font-bold tracking-tighter">
                                <Clock className="w-2.5 h-2.5" />
                                {report.timestamp?.seconds ? new Date(report.timestamp.seconds * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                              </div>
                            </div>
                          </div>
                          
                          {report.explanation && (
                            <div className="bg-bg/40 p-3.5 rounded-2xl border border-border/20">
                              <span className="text-[0.6rem] font-black text-primary/30 uppercase tracking-widest flex items-center gap-1 mb-1">
                                <Info className="w-3 h-3" /> {t.diagnosis}
                              </span>
                              <p className="text-[0.75rem] text-text/80 leading-relaxed italic line-clamp-3">
                                {report.explanation}
                              </p>
                            </div>
                          )}
  
                          <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-border/50">
                            {report.treatment && (
                              <div className="bg-emerald-50/30 p-3 rounded-2xl border border-emerald-100/40">
                                 <span className="text-[0.6rem] font-black text-emerald-700/60 uppercase tracking-widest flex items-center gap-1 mb-1">
                                    <Sprout className="w-3 h-3" /> {t.organicTreatment}
                                 </span>
                                 <p className="text-[0.75rem] text-emerald-900/90 line-clamp-2 leading-tight font-medium">
                                   {(() => {
                                      try {
                                        const tr = typeof report.treatment === 'string' ? JSON.parse(report.treatment) : report.treatment;
                                        return tr.organic;
                                      } catch(e) { return "N/A"; }
                                   })()}
                                 </p>
                               </div>
                            )}
                            
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-primary/5 px-2 py-1 rounded-lg">
                                  <CheckCircle2 className="w-3 h-3 text-primary/60" />
                                  <span className="text-[0.65rem] font-black text-primary/60 uppercase tracking-widest">{report.confidence}% Match</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => setActiveTab('history')}
                                className="p-1.5 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm"
                              >
                                 <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    {history.length === 0 && (
                      <div className="col-span-full h-full flex flex-col items-center justify-center text-muted italic font-bold gap-2 py-8">
                        <div className="w-12 h-12 bg-bg rounded-2xl flex items-center justify-center opacity-40">
                          <Leaf className="w-6 h-6" />
                        </div>
                        <p className="text-sm opacity-50">{t.noReports}</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          {activeTab === 'detect' && (
            <motion.div 
              key="detect"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="dashboard-container space-y-6"
            >
              {!isCameraActive ? (
                <div className="bento-card p-8 text-center space-y-6">
                  <div className="w-24 h-24 bg-[#f0f4ef] rounded-full flex items-center justify-center mx-auto transition-transform hover:rotate-12">
                    <Camera className="w-12 h-12 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2">{t.plantDetection}</h2>
                    <p className="text-muted">{t.uploadAffected}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <button 
                      onClick={startCamera}
                      disabled={isAnalyzing}
                      className="group p-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-3 hover:opacity-95 active:scale-95 transition-all shadow-lg border-b-4 border-emerald-800 w-full"
                    >
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                        <Camera className="w-5 h-5" />
                      </div>
                      <div className="font-black uppercase tracking-widest text-[11px] leading-tight text-left">
                        {t.openScanner}
                      </div>
                    </button>

                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAnalyzing}
                      className="group p-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-3 hover:opacity-95 active:scale-95 transition-all shadow-lg border-b-4 border-emerald-800 w-full"
                    >
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:rotate-12 transition-transform shrink-0">
                        {isAnalyzing ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                            <Leaf className="w-5 h-5" />
                          </motion.div>
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <div className="font-black uppercase tracking-widest text-[11px] leading-tight text-left">
                        {isAnalyzing ? t.analyzing : t.choosePhoto}
                      </div>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                    />
                  </div>
                </div>
              ) : (
                <div className="bento-card p-4 overflow-hidden relative min-h-[400px] flex flex-col">
                  {/* Camera Header */}
                  <div className="p-4 flex items-center justify-between border-b border-border/50 bg-white/10 backdrop-blur-md sticky top-0 z-10 rounded-t-2xl">
                    <h3 className="font-bold flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-error animate-pulse"></div>
                       {t.readyToScan}
                    </h3>
                    <button 
                      onClick={stopCamera}
                      className="p-2 hover:bg-bg rounded-full transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="relative flex-1 bg-black rounded-2xl overflow-hidden mt-4 group">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Capture UI overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-10 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                       <button 
                        onClick={capturePhoto}
                        className="group relative w-24 h-24 flex items-center justify-center"
                       >
                         {/* Outer Ring */}
                         <div className="absolute inset-0 border-4 border-white/40 rounded-full group-active:scale-90 transition-transform"></div>
                         {/* Inner Ring */}
                         <div className="absolute inset-2 border-2 border-white rounded-full"></div>
                         {/* Shutter Button */}
                         <div className="w-16 h-16 bg-white rounded-full group-active:scale-95 transition-transform flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                           <div className="w-12 h-12 border-2 border-primary/20 rounded-full"></div>
                         </div>
                       </button>
                    </div>

                    {/* Corner Guides */}
                    <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-white/60 rounded-tl-xl pointer-events-none"></div>
                    <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-white/60 rounded-tr-xl pointer-events-none"></div>
                    <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-white/60 rounded-bl-xl pointer-events-none"></div>
                    <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-white/60 rounded-br-xl pointer-events-none"></div>

                    {/* Scanning Animation */}
                    <motion.div 
                      className="absolute inset-x-0 top-0 h-1 bg-primary shadow-[0_0_15px_rgba(33,150,243,0.5)] z-20"
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                  
                  <canvas ref={canvasRef} className="hidden" />
                  
                  <p className="text-center text-sm text-muted mt-4 font-medium italic">
                    Position the plant leaf within the frame for best results
                  </p>
                </div>
              )}

              {detectionResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bento-card p-6 space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-primary">{detectionResult.plantName}</h3>
                    <div className="bg-[#e8f5e9] text-[#2e7d32] px-4 py-1 rounded-full font-bold">
                      {detectionResult.confidence}% {t.confidence}
                    </div>
                  </div>

                  <div className="bg-[#fbe9e7] border border-[#ffccbc] rounded-2xl p-4 flex gap-4">
                    <AlertTriangle className="w-6 h-6 text-[#d84315] shrink-0" />
                    <div>
                      <h4 className="font-bold text-[#d84315]">{t.issueDetected}: {detectionResult.issueDetected}</h4>
                      <p className="text-sm text-[#d84315] mt-1">{detectionResult.explanation}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#f0f4ef] rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Leaf className="w-5 h-5 text-primary" />
                        <h4 className="font-bold text-primary">{t.organicTreatment}</h4>
                      </div>
                      <p className="text-sm text-text leading-relaxed">{detectionResult.treatments.organic}</p>
                    </div>
                    <div className="bg-[#e3f2fd] rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bug className="w-5 h-5 text-[#1976d2]" />
                        <h4 className="font-bold text-[#1976d2]">{t.chemicalTreatment}</h4>
                      </div>
                      <p className="text-sm text-text leading-relaxed">{detectionResult.treatments.chemical}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      setActiveTab('chat');
                      handleSendMessage(`Tell me more about ${detectionResult.issueDetected} on ${detectionResult.plantName}.`);
                    }}
                    className="w-full py-3 text-primary font-bold border-2 border-primary rounded-xl hover:bg-primary hover:text-white transition-colors"
                  >
                    {t.askExpertDetails}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="dashboard-container flex-1 flex flex-col min-h-0 h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] max-w-7xl mx-auto w-full"
            >
              <div className="bento-card flex-1 flex flex-col p-0 overflow-hidden relative border-none sm:border border-border bg-white shadow-xl">
                {/* Chat Header */}
                <div className="px-6 py-4 border-b border-border bg-white/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 lg:w-12 lg:h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg ring-4 ring-primary/10">
                        <Bot className="w-6 h-6 lg:w-7 lg:h-7" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-success rounded-full border-2 border-white shadow-sm ring-2 ring-success/20 transition-all hover:scale-110"></div>
                    </div>
                    <div>
                      <h3 className="font-bold text-primary flex items-center gap-2 tracking-tight text-sm lg:text-base">
                        {t.agriBot}
                        <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      </h3>
                      <p className="text-[0.65rem] lg:text-[0.7rem] text-muted font-semibold flex items-center gap-1.5 capitalize">
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
                        {t.online}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-2 hover:bg-bg rounded-xl text-muted transition-all hover:text-primary">
                      <Info className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setChatMessages([]);
                        setLastSpeakableText("");
                      }}
                      className="p-2 hover:bg-bg rounded-xl text-muted transition-all hover:text-error"
                      title="Clear Chat"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 bg-[#f8fafc] custom-scrollbar scroll-smooth">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center px-6">
                      <motion.div 
                        initial={{ scale: 0.8, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="w-20 h-20 lg:w-24 lg:h-24 bg-white rounded-[2.5rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-border/50 flex items-center justify-center mx-auto mb-8"
                      >
                        <MessageSquare className="w-10 h-10 lg:w-12 lg:h-12 text-primary" />
                      </motion.div>
                      <h3 className="text-xl lg:text-2xl font-black mb-3 text-primary tracking-tight">{t.agriBot}</h3>
                      <p className="text-muted leading-relaxed mb-10 text-sm lg:text-base font-medium">{t.helloFarmer}</p>
                      
                      <div className="w-full">
                        <p className="text-[0.65rem] font-bold text-muted uppercase tracking-[0.2em] mb-4 text-center">Recommended Topics</p>
                        <div className="flex flex-wrap gap-2.5 justify-center">
                          {t.chatSuggestions?.map((suggestion: string) => (
                            <button 
                              key={suggestion}
                              onClick={() => handleSendMessage(suggestion)}
                              className="px-4 py-2 bg-white border border-border rounded-xl text-xs font-bold text-primary hover:bg-primary hover:text-white hover:border-primary hover:-translate-y-1 transition-all shadow-sm active:scale-95"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-8">
                    {chatMessages.map((msg, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-3`}
                      >
                        {msg.role !== 'user' && (
                          <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center shrink-0 mb-1 ring-4 ring-primary/5">
                            <Bot className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div className={`group relative max-w-[85%] lg:max-w-[70%] ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                          <div className={`py-3.5 px-5 lg:px-6 shadow-sm transition-all hover:shadow-md ${msg.role === 'user' ? 'bg-primary text-white rounded-2xl rounded-tr-none' : 'bg-white border border-border rounded-2xl rounded-tl-none text-text'}`}>
                            <div className={`prose prose-sm lg:prose-base max-w-none ${msg.role === 'user' ? 'prose-invert text-white [&_*]:text-white font-medium' : 'text-text font-medium leading-relaxed'}`}>
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                          </div>
                          <div className={`text-[0.6rem] mt-1.5 text-muted font-bold tracking-wider uppercase opacity-60 ${msg.role === 'user' ? 'text-right mr-1' : 'text-left ml-1'}`}>
                            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center shrink-0 mb-1 overflow-hidden ring-4 ring-primary/5">
                            <img src={user.photoURL || 'https://picsum.photos/seed/farmer/100/100'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                  <div ref={chatEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="p-4 lg:p-6 bg-white border-t border-border shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.05)]">
                  {chatFilePreview && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4 relative inline-block group"
                    >
                      <img src={chatFilePreview} className="w-24 h-24 lg:w-32 lg:h-32 object-cover rounded-2xl border-4 border-white shadow-xl group-hover:brightness-90 transition-all" alt="Preview" />
                      <button 
                        onClick={() => { setChatFile(null); setChatFilePreview(null); }}
                        className="absolute -top-3 -right-3 bg-white rounded-full p-2 shadow-2xl border border-border text-muted hover:text-error transition-all hover:scale-110 active:scale-90"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}

                  <div className="flex items-center gap-2 lg:gap-4 lg:px-2">
                    <div className="flex-1 flex items-center gap-2 bg-[#f8fafc] border border-border/50 rounded-2xl p-1.5 pl-3 lg:pl-4 focus-within:ring-4 focus-within:ring-primary/10 focus-within:bg-white focus-within:border-primary/30 transition-all group overflow-hidden">
                      <button 
                        onClick={startListening}
                        className={`p-2.5 lg:p-3 rounded-xl transition-all relative ${isListening ? 'bg-red-500 text-white shadow-lg' : 'text-muted hover:bg-white hover:text-primary hover:shadow-md'}`}
                      >
                        <Mic className={`w-5 h-5 ${isListening ? 'animate-pulse' : ''}`} />
                        {isListening && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          </span>
                        )}
                      </button>
                      
                      <input 
                        type="text" 
                        ref={chatInputRef}
                        placeholder={t.askCrops}
                        className="bg-transparent flex-1 py-3 px-1 outline-none text-sm lg:text-base font-medium placeholder:text-muted/60"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val.trim() || chatFile) {
                              handleSendMessage(val);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      
                      <input 
                        type="file"
                        ref={chatFileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleChatFileUpload}
                      />
                      <button 
                        onClick={() => chatFileInputRef.current?.click()}
                        className="p-2.5 lg:p-3 text-muted hover:bg-white rounded-xl transition-all hover:text-primary hover:shadow-md"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => {
                        if (chatInputRef.current) {
                          const val = chatInputRef.current.value;
                          if (val.trim() || chatFile) {
                            handleSendMessage(val);
                            chatInputRef.current.value = '';
                          }
                        }
                      }}
                      className="w-12 h-12 lg:w-14 lg:h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all hover:opacity-95 shrink-0"
                    >
                      <Send className="w-6 h-6 lg:w-7 lg:h-7" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="dashboard-container max-w-7xl mx-auto"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                   <h2 className="text-3xl lg:text-4xl font-black text-primary tracking-tight">{t.yourReports}</h2>
                   <p className="text-muted text-sm font-bold mt-1">Review and manage your previous plant diagnostics</p>
                </div>
                <div className="text-sm font-black text-primary bg-primary/5 px-5 py-3 rounded-2xl border border-primary/10 shadow-sm flex items-center gap-2 self-start md:self-auto">
                   <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                   {history.length} {t.pastReports}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="bento-card items-center justify-center py-20 text-center opacity-40">
                  <div className="w-20 h-20 bg-bg rounded-[2.5rem] flex items-center justify-center mb-6">
                    <History className="w-10 h-10" />
                  </div>
                  <p className="text-xl font-bold">{t.noReports}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                  {history.map((report) => (
                    <div key={report.id} className="bento-card p-0 overflow-hidden group hover:border-primary/30 transition-all flex flex-col md:flex-row shadow-xl bg-white border border-border/50 relative">
                      <div className="relative w-full md:w-72 h-64 md:h-auto overflow-hidden shrink-0">
                        <img src={report.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Report" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                        <div className="absolute bottom-6 left-6 right-6">
                           <div className="font-black text-white text-2xl leading-tight mb-2 truncate">{report.plantName}</div>
                           <div className="flex items-center gap-3 text-white/90 text-sm font-bold">
                             <Clock className="w-4 h-4" />
                             {new Date(report.timestamp?.seconds * 1000).toLocaleDateString()}
                           </div>
                        </div>
                      </div>

                      <div className="flex-1 p-6 md:p-8 flex flex-col gap-6 relative">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                           <div className="flex items-center gap-3">
                             <span className="text-[0.7rem] font-black text-error uppercase tracking-[0.2em] bg-error/5 border border-error/10 px-3 py-1.5 rounded-xl">
                               {report.detectionResult}
                             </span>
                             <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10">
                               <CheckCircle2 className="w-4 h-4 text-primary" />
                               <span className="text-sm font-black text-primary">{report.confidence}% Match</span>
                             </div>
                           </div>
                           <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  let text = `${report.plantName}. ${report.detectionResult}. ${report.explanation || ''}. `;
                                  try {
                                    const tr = typeof report.treatment === 'string' ? JSON.parse(report.treatment) : report.treatment;
                                    if (tr) text += `${t.organicTreatment}: ${tr.organic}. ${t.chemicalTreatment}: ${tr.chemical}.`;
                                  } catch(e) {}
                                  speak(text, true);
                                }}
                                className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                                title="Listen to report"
                              >
                                <Volume2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteReport(report.id)}
                                className="w-10 h-10 bg-error/5 text-error rounded-xl flex items-center justify-center hover:bg-error hover:text-white transition-all shadow-sm"
                                title="Delete update"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                           </div>
                        </div>

                        <div className="space-y-4">
                          {report.explanation && (
                            <div className="bg-bg/50 p-4 rounded-2xl border border-border/20">
                              <span className="text-[0.65rem] font-black text-primary/40 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4" /> {t.diagnosis}
                              </span>
                              <p className="text-[0.95rem] text-text/80 leading-relaxed italic font-medium">
                                {report.explanation}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100/50">
                               <span className="text-[0.65rem] font-black text-emerald-700 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                 <Sprout className="w-4 h-4" /> {t.organicTreatment}
                               </span>
                               <p className="text-[0.85rem] text-emerald-900 leading-relaxed font-bold">
                                 {(() => {
                                    try {
                                      const tr = typeof report.treatment === 'string' ? JSON.parse(report.treatment) : report.treatment;
                                      return tr.organic;
                                    } catch(e) { return "N/A"; }
                                 })()}
                               </p>
                            </div>
                            <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-100/50">
                               <span className="text-[0.65rem] font-black text-orange-700 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                 <AlertTriangle className="w-4 h-4" /> {t.chemicalTreatment}
                               </span>
                               <p className="text-[0.85rem] text-orange-900 leading-relaxed font-bold">
                                 {(() => {
                                    try {
                                      const tr = typeof report.treatment === 'string' ? JSON.parse(report.treatment) : report.treatment;
                                      return tr.chemical;
                                    } catch(e) { return "N/A"; }
                                 })()}
                               </p>
                            </div>
                          </div>
                        </div>

                        {report.weatherContext && (
                          <div className="mt-auto pt-6 border-t border-border/50 flex flex-wrap gap-3">
                             <div className="flex items-center gap-2 bg-orange-100/40 text-orange-800 px-3 py-1.5 rounded-xl text-xs font-black border border-orange-200/50">
                               <CloudSun className="w-3.5 h-3.5" />
                               <span>{report.weatherContext.temp}°C</span>
                             </div>
                             <div className="flex items-center gap-2 bg-blue-100/40 text-blue-800 px-3 py-1.5 rounded-xl text-xs font-black border border-blue-200/50">
                               <Droplets className="w-3.5 h-3.5" />
                               <span>{report.weatherContext.humidity}% {t.humidity}</span>
                             </div>
                             <div className="flex-1 flex items-center gap-3 ml-auto px-2 opacity-50">
                                <div className="flex-1 h-1 bg-bg rounded-full overflow-hidden">
                                   <div className="h-full bg-primary/40" style={{ width: `${report.confidence}%` }}></div>
                                </div>
                                <span className="text-[0.6rem] font-black text-muted uppercase tracking-widest leading-none">Scored</span>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="dashboard-container space-y-6"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Settings className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-primary tracking-tight">{t.settings}</h2>
                  <p className="text-muted font-medium">Manage your profile and application preferences</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                  <div className="bento-card p-6 flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full border-4 border-primary/20 p-1 mb-4">
                      <img 
                        src={user.photoURL || 'https://picsum.photos/seed/farmer/150/150'} 
                        className="w-full h-full rounded-full object-cover" 
                        alt="Profile"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <h3 className="font-bold text-xl mb-1">{user.displayName}</h3>
                    <p className="text-muted text-sm mb-4">{user.email}</p>
                    <button className="w-full py-2 bg-primary/10 text-primary rounded-xl font-bold text-sm hover:bg-primary/20 transition-all">
                      Edit Profile
                    </button>
                  </div>

                  <div className="bento-card p-6">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <Languages className="w-4 h-4 text-primary" /> Preferred Language
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {['en', 'hi', 'mr', 'bn', 'gu', 'te', 'ta', 'kn', 'ml', 'pa'].map((lang) => (
                        <button 
                          key={lang}
                          onClick={() => setLanguage(lang)}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${language === lang ? 'bg-primary border-primary text-white shadow-md' : 'bg-white border-border text-muted hover:border-primary/50'}`}
                        >
                          {lang === 'en' ? 'English' : 
                           lang === 'hi' ? 'हिंदी' : 
                           lang === 'mr' ? 'मराठी' : 
                           lang === 'bn' ? 'বাংলা' : 
                           lang === 'gu' ? 'ગુજરાતી' :
                           lang === 'te' ? 'తెలుగు' :
                           lang === 'ta' ? 'தமிழ்' :
                           lang === 'kn' ? 'ಕನ್ನಡ' :
                           lang === 'ml' ? 'മലയാളം' : 'ਪੰਜਾਬੀ'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bento-card p-8">
                    <h3 className="font-bold text-xl mb-6 flex items-center gap-2 text-primary">
                      <User className="w-5 h-5" /> Farmer Details
                    </h3>
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-6">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-bold text-sm tracking-tight">{t.location}</h4>
                              <p className="text-xs text-muted font-medium">Set your field location for smart insights</p>
                            </div>
                          </div>

                          <div className="p-4 bg-bg rounded-2xl border border-primary/20 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20">
                            <div className="flex items-center gap-3">
                              <MapPin className="w-5 h-5 text-primary" />
                              <div className="flex-1">
                                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">
                                  Current: <span className="text-primary">{weather?.locationName || manualLocation || 'Not Set'}</span>
                                </p>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text"
                                    value={manualLocation}
                                    onChange={(e) => setManualLocation(e.target.value)}
                                    placeholder="Enter city or village name..."
                                    className="bg-transparent font-bold text-primary outline-none flex-1 text-sm md:text-base"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        setLocationMode('manual');
                                        loadWeather(manualLocation);
                                      }
                                    }}
                                  />
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => {
                                        setLocationMode('auto');
                                        if (navigator.geolocation) {
                                          setIsRefreshingWeather(true);
                                          navigator.geolocation.getCurrentPosition(
                                            (pos) => loadWeather(`${pos.coords.latitude}, ${pos.coords.longitude}`),
                                            () => {
                                              setIsRefreshingWeather(false);
                                              alert("Location access denied. Please type manually.");
                                            }
                                          );
                                        }
                                      }}
                                      title="Detect GPS Location"
                                      className="p-2 bg-secondary/50 text-primary rounded-xl hover:bg-secondary transition-all"
                                    >
                                      <RefreshCcw className={`w-4 h-4 ${isRefreshingWeather && locationMode === 'auto' ? 'animate-spin' : ''}`} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setLocationMode('manual');
                                        loadWeather(manualLocation);
                                      }}
                                      disabled={isRefreshingWeather}
                                      className="p-2 bg-primary text-white rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md disabled:bg-muted"
                                    >
                                      {isRefreshingWeather && locationMode === 'manual' ? (
                                        <RefreshCcw className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Search className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4">
                                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Quick Select City</p>
                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 custom-scrollbar">
                                  {POPULAR_CITIES.map(city => (
                                    <button 
                                      key={city}
                                      onClick={() => handleManualLocationSearch(city)}
                                      disabled={isRefreshingWeather}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
                                        manualLocation === city 
                                          ? 'bg-primary border-primary text-white shadow-sm' 
                                          : 'bg-white border-border text-primary hover:border-primary/50'
                                      } ${isRefreshingWeather && manualLocation === city ? 'opacity-70 cursor-wait' : ''}`}
                                    >
                                      {city}
                                      {isRefreshingWeather && manualLocation === city && (
                                        <RefreshCcw className="w-3 h-3 animate-spin" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                          <label className="font-bold cursor-pointer" onClick={() => setIsWeatherAutoUpdate(!isWeatherAutoUpdate)}>
                            Weather Auto-Update
                          </label>
                          <button 
                            onClick={() => setIsWeatherAutoUpdate(!isWeatherAutoUpdate)}
                            className={`w-12 h-6 rounded-full relative transition-all duration-300 ${isWeatherAutoUpdate ? 'bg-primary' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${isWeatherAutoUpdate ? 'right-1' : 'left-1'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-muted font-medium">Automatically fetch and update weather data at regular intervals</p>
                      </div>

                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                          <label className="font-bold cursor-pointer" onClick={() => setIsMicEnabled(!isMicEnabled)}>
                            Microphone (Voice-to-Text)
                          </label>
                          <button 
                            onClick={() => setIsMicEnabled(!isMicEnabled)}
                            className={`w-12 h-6 rounded-full relative transition-all duration-300 ${isMicEnabled ? 'bg-primary' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${isMicEnabled ? 'right-1' : 'left-1'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-muted font-medium">Allow application to use your microphone for voice commands</p>
                      </div>

                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between mb-2">
                          <label className="font-bold cursor-pointer" onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}>
                            Text-to-Speech Guidance
                          </label>
                          <button 
                            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                            className={`w-12 h-6 rounded-full relative transition-all duration-300 ${isVoiceEnabled ? 'bg-primary' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${isVoiceEnabled ? 'right-1' : 'left-1'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-muted font-medium">Automatically read out farming insights and chat responses</p>
                      </div>
                    </div>
                  </div>

                  <div className="bento-card p-8 bg-black/5 border-dashed border-2 border-border/50">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                        <ShieldCheck className="w-8 h-8 text-success" />
                      </div>
                      <h3 className="font-bold text-lg mb-2">Data Protection</h3>
                      <p className="text-sm text-muted mb-6 max-w-sm">Your farm data and detection history are securely stored using enterprise-grade encryption.</p>
                      <button className="px-6 py-2 bg-white border border-border rounded-xl font-bold text-sm hover:bg-gray-50 transition-all">
                        Privacy Policy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border px-6 py-4 flex items-center justify-around z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'dashboard' ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <Leaf className={`w-6 h-6 ${activeTab === 'dashboard' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{t.home}</span>
        </button>
        <button 
          onClick={() => setActiveTab('detect')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'detect' ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <Camera className={`w-6 h-6 ${activeTab === 'detect' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{t.scan}</span>
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'chat' ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <Bot className={`w-6 h-6 ${activeTab === 'chat' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{t.expert}</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'history' ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <History className={`w-6 h-6 ${activeTab === 'history' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{t.history}</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-primary' : 'text-muted hover:text-primary'}`}
        >
          <Settings className={`w-6 h-6 ${activeTab === 'settings' ? 'fill-current' : ''}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{t.settings}</span>
        </button>
      </nav>
      
      <AnimatePresence>
        {!isOnboarded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center border border-gray-100"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Leaf className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.welcome}</h2>
              <p className="text-gray-600 mb-8">{t.tagline}</p>
              
              <div className="space-y-6 text-left mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.onboarding1}</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <CloudRain className="w-5 h-5 text-orange-600" />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.onboarding2}</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.onboarding3}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsOnboarded(true);
                  if (user) localStorage.setItem(`onboarded_${user.uid}`, 'true');
                  const welcomeMsg = language === 'hi' ? 
                    `नमस्ते! मैं हूँ आपका कृषि सहायक। मैं आपकी फसलों की बीमारियों को पहचानने, आपको मौसम की जानकारी देने और खेती के लिए सही सलाह देने में आपकी मदद करूँगा। चलिए शुरू करते हैं!` :
                    `Hello! I am Krishi Shayak, your personal farming assistant. I am here to help you identify plant diseases, give you weather updates, and provide expert farming advice. Let's get started!`;
                  speak(welcomeMsg);
                }}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
              >
                {t.getStarted}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}
