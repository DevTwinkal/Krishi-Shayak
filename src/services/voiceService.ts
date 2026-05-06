import { PREFERRED_VOICES } from '../App';

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

  private async getBestVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
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

    const targetLang = voiceLangs[lang] || 'en-IN';
    const available = voices.filter(v =>
      v.lang.toLowerCase().startsWith(lang.toLowerCase()) ||
      v.lang.toLowerCase().startsWith(targetLang.toLowerCase())
    );

    const preferred = PREFERRED_VOICES[lang] || [];
    for (const name of preferred) {
      const found = available.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (found) return found;
    }

    // Prefer online/neural voices — they sound far more natural
    const neural = available.find(v => /neural|wavenet|premium|online/i.test(v.name));
    if (neural) return neural;

    const google = available.find(v => /google/i.test(v.name));
    if (google) return google;

    return available[0] || null;
  }

  private prepareText(text: string): string {
    return text
      .replace(/[*#`_~]/g, '')                         // strip markdown
      .replace(/\*\*(.*?)\*\*/g, '$1')                 // bold
      .replace(/__(.*?)__/g, '$1')                      // underline
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')              // links → label only
      .replace(/(\d+)\.(\d+)/g, '$1 point $2')         // decimals
      .replace(/(\d+)%/g, '$1 percent')                // percentages
      .replace(/\bkg\b/gi, 'kilograms')
      .replace(/\bkm\b/gi, 'kilometres')
      .replace(/\bcm\b/gi, 'centimetres')
      .replace(/\bmm\b/gi, 'millimetres')
      .replace(/\bml\b/gi, 'millilitres')
      .replace(/\bL\b/g, 'litres')
      .replace(/\.{2,}/g, '.')                          // ellipses → single pause
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Split only at sentence boundaries so TTS has enough context for natural prosody
  private splitIntoSentences(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    // Re-join very short fragments (< 4 words) with the next sentence to avoid choppy delivery
    const merged: string[] = [];
    let buffer = '';
    for (const s of sentences) {
      const wordCount = s.trim().split(/\s+/).length;
      buffer = buffer ? `${buffer} ${s.trim()}` : s.trim();
      if (wordCount >= 4) {
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

    const voice = await this.getBestVoice(this.language);
    const cleanText = this.prepareText(text);
    const sentences = this.splitIntoSentences(cleanText);

    // Natural speech parameters — pitch ≤ 1.0 sounds human; >1.05 sounds robotic
    const isEnglish = this.language === 'en';
    const baseRate = isEnglish ? 0.90 : 0.82;
    const basePitch = 0.97; // Slightly below neutral — warm, calm, natural

    for (const sentence of sentences) {
      if (!this.isSpeaking) break;

      const utterance = new SpeechSynthesisUtterance(sentence);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      // Micro-variation per sentence simulates natural rhythm drift
      utterance.rate = baseRate + (Math.random() * 0.06 - 0.03);
      utterance.pitch = basePitch + (Math.random() * 0.06 - 0.03);
      utterance.volume = 1.0;

      // Pause after sentence — question marks get a slightly longer pause
      const isQuestion = sentence.trimEnd().endsWith('?');
      const pauseMs = isQuestion ? 600 : 420;

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
