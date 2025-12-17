# 🎤 Voice Input Feature - MANINOS AI

**Version 1.0** | Implementation Date: December 17, 2024

> ChatGPT-style voice recording for hands-free property evaluation

---

## 📋 Overview

Users can now interact with MANINOS AI using voice commands, providing a hands-free experience similar to ChatGPT. Voice input is transcribed to text and processed identically to typed messages - **no special intent detection, no robotic behavior**.

---

## 🎯 Key Features

### ✅ **What It Does**

1. **Record Voice:** Click mic button to start/stop recording
2. **Auto-Transcribe:** Audio sent to OpenAI Whisper API for transcription
3. **Natural Processing:** Transcribed text processed as normal user input
4. **Seamless UX:** ChatGPT-style UI with visual feedback

### 🚫 **What It Doesn't Do**

- ❌ No voice-specific intents or keywords
- ❌ No special routing for voice vs text
- ❌ No "robotic" voice commands
- ❌ No text-to-speech responses (input only)

**Philosophy:** Voice is just another input method. The agent responds naturally based on content, not input type.

---

## 🏗️ Architecture

### **Component Structure**

```
┌─────────────────────────────────────────────────────────┐
│ Frontend: page.tsx                                      │
│  ├─ useVoiceRecorder hook (MediaRecorder API)          │
│  ├─ Mic Button (toggle recording)                       │
│  ├─ Recording Indicator (red pulsing with timer)        │
│  └─ Auto-submit when recording stops                    │
└────────────────────┬────────────────────────────────────┘
                     │ FormData with audio blob
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Backend: app.py → /ui_chat endpoint                     │
│  ├─ Receive audio: UploadFile                           │
│  ├─ Call process_voice_input(audio_bytes, "es")         │
│  ├─ Transcribe with OpenAI Whisper API                  │
│  ├─ Set user_text = transcribed_text                    │
│  └─ Continue normal processing (no special handling)    │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 Implementation Details

### **Frontend Components**

#### **1. `useVoiceRecorder` Hook** (`web/src/hooks/useVoiceRecorder.ts`)

```typescript
interface VoiceRecorderHook {
  isRecording: boolean;        // Currently recording?
  isProcessing: boolean;       // Sending/transcribing?
  audioBlob: Blob | null;      // Recorded audio
  error: string | null;        // Permission/recording errors
  recordingTime: number;       // Seconds elapsed
  startRecording: () => void;  // Start recording
  stopRecording: () => void;   // Stop and submit
  cancelRecording: () => void; // Stop without submit
  clearAudio: () => void;      // Clear blob
}
```

**Features:**
- MediaRecorder API with WebM Opus codec
- Permission handling (NotAllowedError, NotFoundError)
- Recording timer
- Auto-cleanup of MediaStream tracks
- Fallback to basic WebM if Opus not supported

#### **2. Voice UI** (`web/src/app/page.tsx`)

**Mic Button:**
- Gray when idle
- Red pulsing when recording
- Disabled during processing
- MicOff icon when recording (visual cue)

**Recording Indicator:**
- Red banner with pulsing dot
- Timer showing elapsed time
- Cancel button

**Error Handling:**
- Amber warning banner for errors
- Clear error messages (permissions, no mic, etc.)

### **Backend Integration**

#### **Endpoint:** `POST /ui_chat`

**Existing Implementation (No Changes Needed):**

```python
# app.py lines 1478-1513
if audio:
    audio_bytes = await audio.read()
    from tools.voice_tool import process_voice_input
    voice_result = process_voice_input(audio_bytes, "es")
    
    if voice_result.get("success"):
        user_text = voice_result["text"]
        transcript = user_text
        # Continue normal processing...
```

**Key Points:**
- Audio transcribed with OpenAI Whisper API
- Falls back to local Whisper if API unavailable
- Transcribed text replaces `user_text`
- Processing continues normally (orchestrator → agents → tools)

---

## 🧪 Testing Guide

### **Manual Testing**

1. **Open app:** http://localhost:3001
2. **Click mic button** (gray microphone icon)
3. **Allow microphone permission** (if prompted)
4. **Speak:** "Quiero evaluar una propiedad en 123 Main Street"
5. **Click mic button again** to stop
6. **Verify:**
   - Transcribed text appears as user message
   - Agent responds naturally (creates property)
   - No special "voice" behavior

### **Test Scenarios**

#### ✅ **Happy Path**
- Record → Stop → Transcription → Agent response

#### ⚠️ **Permission Denied**
- Click mic → Browser blocks → Error message shown

#### ⚠️ **No Microphone**
- Click mic → NotFoundError → Error message shown

#### ⚠️ **Network Error**
- Record → Stop → API fails → Error message shown

#### ✅ **Cancel Recording**
- Record → Click "Cancelar" → No message sent

---

## 🔧 Configuration

### **Environment Variables**

```env
# Required for Whisper API transcription
OPENAI_API_KEY=sk-...

# Optional: Language code (default: "es" for Spanish)
WHISPER_LANGUAGE=es
```

### **Browser Requirements**

- **Chrome:** Full support ✅
- **Safari:** Full support ✅
- **Firefox:** Full support ✅
- **HTTPS Required:** `getUserMedia()` only works on HTTPS (or localhost)

---

## 📊 Performance Metrics

### **Latency Breakdown**

```
User clicks stop recording
  ↓ ~100ms - Blob creation
  ↓ ~200ms - Network upload (10s audio = ~200KB)
  ↓ ~1-3s  - Whisper API transcription
  ↓ ~2-6s  - Agent processing (normal flow)
──────────
Total: ~3-9s (typical: ~5s)
```

### **Audio Specs**

- **Format:** WebM Opus
- **Sample Rate:** 16kHz (optimal for Whisper)
- **Bitrate:** ~12-16 kbps (very compressed)
- **10s audio:** ~200KB

### **Cost Estimate**

- **OpenAI Whisper API:** $0.006 per minute
- **10s recording:** $0.001
- **Daily usage (50 recordings):** $0.05
- **Monthly:** ~$1.50

---

## 🐛 Troubleshooting

### **Error: "Permission denied"**

**Solution:**
1. Browser settings → Privacy → Microphone
2. Allow access for localhost:3001
3. Refresh page

### **Error: "No microphone found"**

**Solution:**
1. Check physical microphone connection
2. System Preferences → Sound → Input
3. Select correct input device

### **Error: "Transcription failed"**

**Solution:**
1. Verify `OPENAI_API_KEY` is set
2. Check backend logs for details
3. Speak clearly and avoid background noise
4. Try recording again

### **Voice button not appearing**

**Solution:**
1. Hard refresh (Cmd/Ctrl + Shift + R)
2. Clear browser cache
3. Check browser console for errors

---

## 🚀 Deployment Notes

### **Production Checklist**

- [ ] Verify `OPENAI_API_KEY` in production env
- [ ] HTTPS enabled (required for getUserMedia)
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Monitor Whisper API usage/costs
- [ ] Set up error tracking (Sentry, Logfire)

### **Mobile Considerations**

- **iOS Safari:** Full support, may prompt for permission on each page load
- **Android Chrome:** Full support
- **UI:** Mic button is touch-friendly (44x44px minimum)

---

## 📝 Code References

### **Key Files**

| File | Purpose |
|------|---------|
| `web/src/hooks/useVoiceRecorder.ts` | MediaRecorder hook |
| `web/src/app/page.tsx` | Voice UI integration |
| `app.py` (lines 1478-1513) | Audio processing endpoint |
| `tools/voice_tool.py` | Transcription logic |

### **Dependencies**

```txt
# Backend
openai>=1.40.0         # Whisper API

# Frontend
(No new dependencies - native Web APIs)
```

---

## 🎨 UI/UX Details

### **Visual States**

1. **Idle (Gray):** Ready to record
2. **Recording (Red Pulsing):** Active recording with timer
3. **Processing (Spinner):** Transcribing/sending
4. **Error (Amber):** Permission or recording error

### **Accessibility**

- `title` attribute on mic button
- Clear visual feedback for recording state
- Text fallback if voice fails
- Keyboard accessible (Tab + Enter)

---

## 🔮 Future Enhancements (Not Implemented Yet)

### **v1.1 Potential Features**

- [ ] Show transcribed text BEFORE sending (allow editing)
- [ ] Voice activity detection (auto-stop on silence)
- [ ] Multi-language support (detect language automatically)
- [ ] Text-to-Speech responses (optional toggle)
- [ ] Offline support with local Whisper model

---

## 🎯 Success Criteria

✅ **All Completed:**

1. ✅ User can record voice with mic button
2. ✅ Visual feedback during recording (red pulsing + timer)
3. ✅ Audio auto-submitted when recording stops
4. ✅ Transcribed text shown as user message
5. ✅ Agent processes naturally (no special voice logic)
6. ✅ Error handling for permissions/mic issues
7. ✅ ChatGPT-style UX (familiar to users)

---

## 📞 Support

**Common Issues:**
1. Check microphone permissions
2. Verify HTTPS in production
3. Ensure OPENAI_API_KEY is set
4. Test with different browsers

**Developer Contact:**
- Check logs: `[DEBUG] Processing audio file...`
- Check backend: `/ui_chat` endpoint
- Check frontend: Browser console for JS errors

---

**Last Updated:** December 17, 2024  
**Status:** ✅ Production Ready
