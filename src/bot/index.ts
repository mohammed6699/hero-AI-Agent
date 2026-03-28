import { Bot, InputFile, Keyboard, webhookCallback } from 'grammy';
import { config } from '../config/index.js';
import { processUserMessage } from '../agent/index.js';
import { generateSpeech } from '../tts/index.js';
import { saveUserLocation } from '../db/index.js';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

export let bot: Bot | null = null;
let groq: Groq | null = null;

export function initBot() {
  if (bot) return;
  bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  
  if (config.GROQ_API_KEY && config.GROQ_API_KEY !== 'REPLACE_WITH_YOURS') {
    groq = new Groq({ apiKey: config.GROQ_API_KEY });
  }

  // Whitelist Middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;
    if (config.ALLOWED_USER_IDS.length > 0 && !config.ALLOWED_USER_IDS.includes(userId)) {
      console.log(`Unauthorized access attempt from User ID: ${userId}`);
      return;
    }
    await next();
  });

  bot.command('start', (ctx) => {
    ctx.reply('Hello! I am Hero, your personal AI Agent. How can I help you today?');
  });

  bot.command('location', async (ctx) => {
    const keyboard = new Keyboard()
      .requestLocation('Send Location')
      .oneTime()
      .resized();
    await ctx.reply('Please share your location to enable location-based features (e.g. searching nearby).', {
      reply_markup: keyboard
    });
  });

  bot.on('message:location', async (ctx) => {
    const userId = ctx.from.id.toString();
    const { latitude, longitude } = ctx.message.location;
    await saveUserLocation(userId, latitude, longitude);
    await ctx.reply('Location saved successfully! Now I can help you find nearby places.');
  });

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;

    await ctx.replyWithChatAction('typing');

    try {
      const response = await processUserMessage(userId, text);
      await ctx.reply(response);
    } catch (err: any) {
      console.error('[Bot Error - Message Handler]:', err);
      await ctx.reply('Sorry, I encountered an error while processing your request.');
    }
  });

  bot.on('message:voice', async (ctx) => {
    const userId = ctx.from.id.toString();
    await ctx.replyWithChatAction('typing');
    
    try {
      if (!groq) {
        throw new Error('Groq is not initialized for audio transcription.');
      }

      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      
      const tempPath = path.join(process.cwd(), `temp_audio_${Date.now()}.ogg`);
      fs.writeFileSync(tempPath, Buffer.from(buffer));

      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-large-v3',
        language: 'en'
      });

      fs.unlinkSync(tempPath);

      const text = transcription.text;
      await ctx.reply(`*Transcript:* ${text}`, { parse_mode: 'Markdown' });
      
      const agentResponse = await processUserMessage(userId, text);

      // Generate voice response
      const audioBuffer = await generateSpeech(agentResponse);
      if (audioBuffer) {
        await ctx.replyWithVoice(new InputFile(audioBuffer, 'response.mp3'), {
          caption: agentResponse
        });
      } else {
        await ctx.reply(agentResponse);
      }
      
    } catch (err: any) {
      console.error('[Bot Error - Voice Handler]:', err);
      await ctx.reply('Sorry, I could not process your voice command.');
    }
  });

  bot.catch((err) => {
    console.error('Bot Error:', err);
  });
}

export function startBot() {
  if (bot) {
    // If a webhook URL is provided, set it. Otherwise, use long polling.
    if (config.WEBHOOK_URL && config.WEBHOOK_URL !== '') {
      console.log(`Setting up webhook at ${config.WEBHOOK_URL}...`);
      bot.api.setWebhook(config.WEBHOOK_URL).catch(e => console.error('Failed to set webhook:', e));
    } else {
      console.log('Starting bot with Long Polling (Local/Development mode)...');
      bot.start({
        onStart: (botInfo) => {
          console.log(`Bot initialized successfully as @${botInfo.username}`);
        }
      });
    }
  }
}

let memoizedWebhookHandler: any = null;

export const handleWebhook = (req: any, res: any) => {
  if (!bot) {
    // In some environments, we might need to initialize the bot on the first request
    initBot();
  }
  if (!memoizedWebhookHandler) {
    memoizedWebhookHandler = webhookCallback(bot!, 'vercel');
  }
  return memoizedWebhookHandler(req, res);
};

