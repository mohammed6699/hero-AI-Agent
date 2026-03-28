import { config } from '../config/index.js';

export async function generateSpeech(text: string): Promise<Buffer | null> {
  if (!config.ELEVENLABS_API_KEY) {
    console.warn('ElevenLabs API key is not set. Skipping voice generation.');
    return null;
  }

  const voiceId = config.ELEVENLABS_VOICE_ID;

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': config.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      let errorDetail = 'Unknown Error';
      try {
        const errorData = await response.json();
        errorDetail = JSON.stringify(errorData);
        if (errorData.detail?.status === 'quota_exceeded') {
          console.error('❌ ElevenLabs Quota Exceeded! Please check your billing/dashboard.');
        } else {
          console.error(`❌ ElevenLabs TTS Error (${response.status}): ${errorDetail}`);
        }
      } catch (e) {
        errorDetail = await response.text();
        console.error(`❌ ElevenLabs TTS Error (${response.status}): ${errorDetail}`);
      }
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`✅ TTS generated successfully (${arrayBuffer.byteLength} bytes)`);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('TTS request failed:', error);
    return null;
  }
}
