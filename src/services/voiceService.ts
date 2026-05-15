import { transliterateDevanagari } from '../lib/transliterator';

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
    'yield': 'यील्ड'
  }
};

class AgriVoiceService {
  private synth: SpeechSynthesis;
  private isSpeaking: boolean = false;
  private language: string = 'en';

  constructor() {
    this.synth = window.speechSynthesis;
  }

  setLanguage(lang: string) {
    this.language = lang;
  }

  private detectScript(text: string): 'devanagari' | 'latin' | 'other' {
    const devanagariRange = /[\u0900-\u097F]/;
    if (devanagariRange.test(text)) return 'devanagari';
    const latinRange = /[a-zA-Z]/;
    if (latinRange.test(text)) return 'latin';
    return 'other';
  }

  private async getBestVoice(lang: string, script?: string): Promise<SpeechSynthesisVoice | null> {
    let voices = this.synth.getVoices();
    if (voices.length === 0) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        this.synth.onvoiceschanged = () => {
          clearTimeout(timer);
          resolve(true);
        };
      });
      voices = this.synth.getVoices();
    }

    const voiceLangs: Record<string, string> = {
      hi: 'hi-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN',
      bn: 'bn-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN',
      pa: 'pa-IN', en: 'en-IN'
    };

    let effectiveLang = lang;
    if (script === 'devanagari' && lang === 'en') {
        effectiveLang = 'hi';
    }

    const targetLangCode = voiceLangs[effectiveLang] || 'en-IN';
    
    // 1. Filter voices for the target language or country code
    let available = voices.filter(v => 
      v.lang.toLowerCase().includes(effectiveLang.toLowerCase()) || 
      v.lang.toLowerCase().includes(targetLangCode.toLowerCase())
    );

    // 2. If no Marathi/other regional voice, fallback to Hindi for Devanagari script
    if (available.length === 0 && (effectiveLang === 'mr' || script === 'devanagari')) {
      available = voices.filter(v => v.lang.toLowerCase().startsWith('hi'));
    }

    // 3. Fallback to English if nothing else works
    if (available.length === 0) {
      available = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    }

    // 4. Prioritize high-quality voices
    const preferred = PREFERRED_VOICES[effectiveLang] || PREFERRED_VOICES['hi'] || [];
    for (const name of preferred) {
      const found = available.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (found) return found;
    }

    const highQuality = available.find(v => /neural|wavenet|premium|online|google/i.test(v.name));
    if (highQuality) return highQuality;

    return available[0] || voices[0] || null;
  }

  private prepareText(text: string, lang: string): string {
    let cleanText = text
      .replace(/^[\s]*[-+*][\s]+/gm, '')                 // list markers
      .replace(/[*#`_~]/g, '')                         // strip markdown
      .replace(/\*\*(.*?)\*\*/g, '$1')                 // bold
      .replace(/__(.*?)__/g, '$1')                      // underline
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')              // links → label only
      .replace(/(\d+)\.(\d+)/g, '$1 point $2')         // decimals
      .replace(/(\d+)%/g, '$1 percent')                // percentages
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ')
      .replace(/>/g, ' greater than ')
      .replace(/</g, ' less than ')
      .replace(/\bkg\b/gi, 'kilograms')
      .replace(/\bkm\b/gi, 'kilometres')
      .replace(/\bcm\b/gi, 'centimetres')
      .replace(/\bL\b/g, 'litres')
      .replace(/\.{2,}/g, '.')                          // ellipses → single pause
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // strip emojis
      .replace(/\s+/g, ' ')
      .trim();

    // Handle mixed-language technical terms phonetically
    if (lang !== 'en' && AGRI_PHONETIC_MAP[lang]) {
      const map = AGRI_PHONETIC_MAP[lang];
      Object.keys(map).forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleanText = cleanText.replace(regex, map[word]);
      });
    }

    return cleanText;
  }

  private splitIntoSentences(text: string): string[] {
    const sentences = text.match(/[^.!?।॥]+[.!?।॥]+|[^.!?।॥]+$/g) || [text];
    const merged: string[] = [];
    let buffer = '';
    for (const s of sentences) {
      const wordCount = s.trim().split(/\s+/).length;
      buffer = buffer ? `${buffer} ${s.trim()}` : s.trim();
      if (wordCount >= 5) { // Slightly longer chunks for better natural flow
        merged.push(buffer);
        buffer = '';
      }
    }
    if (buffer) merged.push(buffer);
    return merged.filter(s => s.trim().length > 0);
  }

  async speak(text: string, onStart?: () => void, onEnd?: () => void) {
    this.stop();
    this.isSpeaking = true;
    if (onStart) onStart();

    const script = this.detectScript(text);
    const voice = await this.getBestVoice(this.language, script);
    let cleanText = this.prepareText(text, this.language);

    // If text is Devanagari but voice is English-only, transliterate
    if (script === 'devanagari' && (!voice || !voice.lang.startsWith('hi') && !voice.lang.startsWith('mr'))) {
        cleanText = transliterateDevanagari(cleanText);
    }

    const sentences = this.splitIntoSentences(cleanText);
    const isEnglish = this.language === 'en';
    
    // REDUCED RATE FOR CLARITY: Regional languages often sound better when slightly slower
    const baseRate = isEnglish ? 0.92 : 0.78; 
    const basePitch = 1.02; // Slightly higher pitch for better frequency clarity

    for (const sentence of sentences) {
      if (!this.isSpeaking) break;

      const utterance = new SpeechSynthesisUtterance(sentence);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = isEnglish ? 'en-IN' : 'hi-IN';
      }

      utterance.rate = baseRate;
      utterance.pitch = basePitch;
      utterance.volume = 1.0;

      const isQuestion = sentence.trimEnd().endsWith('?');
      const pauseMs = isQuestion ? 700 : 500; // Longer pauses between sentences

      await new Promise<void>((resolve) => {
        utterance.onend = () => setTimeout(resolve, pauseMs);
        utterance.onerror = () => setTimeout(resolve, pauseMs);
        this.synth.speak(utterance);
      });
    }

    this.isSpeaking = false;
    if (onEnd) onEnd();
  }

  stop() {
    this.isSpeaking = false;
    this.synth.cancel();
  }
}

export const agriVoice = new AgriVoiceService();
