import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';
import { getToolDefinitions } from '../tools/index.js';

let groqClient: Groq | null = null;
let geminiClient: GoogleGenAI | null = null;

export function initLlm() {
  if (config.GROQ_API_KEY && config.GROQ_API_KEY !== 'REPLACE_WITH_YOURS') {
    groqClient = new Groq({ apiKey: config.GROQ_API_KEY });
  }
  if (config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'REPLACE_WITH_YOURS') {
    // Fallback requires correct initialization of the new @google/genai sdk
    geminiClient = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export async function generateCompletion(messages: Message[]) {
  // 1. Primary: Groq
  if (groqClient) {
    try {
      return await callGroq(messages);
    } catch (err: any) {
      if (err.status === 429) {
        console.warn('Groq rate limit hit, falling back to Gemini.');
      } else {
        console.error('Groq failed:', err.message);
      }
    }
  }

  // 2. Secondary Fallback: Gemini (Native SDK)
  if (geminiClient) {
    try {
      return await callGemini(messages);
    } catch (err: any) {
      console.error('Gemini fallback failed:', err.message);
    }
  }

  // 3. Third-party Fallback: OpenRouter (Free Models)
  if (config.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(messages);
    } catch (err: any) {
      console.error('OpenRouter fallback failed:', err.message);
    }
  }

  throw new Error('No available LLM provider could handle the request (all fallbacks exhausted).');
}

async function callGroq(messages: Message[]) {
  const tools = getToolDefinitions();
  const response = await groqClient!.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: messages as any,
    tools: tools.length > 0 ? (tools as any) : undefined,
    tool_choice: 'auto'
  });
  
  const choice = response.choices[0];
  return {
    content: choice.message.content || '',
    tool_calls: (choice.message as any).tool_calls || []
  };
}

async function callOpenRouter(messages: Message[]) {
  const tools = getToolDefinitions();
  
  // Use a reliable free model on OpenRouter
  const model = "google/gemini-2.0-flash-lite:free"; 

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/HeroAgent", // Optional for OpenRouter
      "X-Title": "Hero Agent", 
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: messages.map(m => ({ 
        role: m.role === 'tool' ? 'user' : m.role, // Simplified for OpenRouter free models
        content: m.content,
        name: m.name
      })),
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: "auto"
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${await response.text()}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  
  return {
    content: choice.message.content || '',
    tool_calls: choice.message.tool_calls || []
  };
}

async function callGemini(messages: Message[]) {
  if (!geminiClient) {
    throw new Error('No available LLM provider to handle request.');
  }

  const tools = getToolDefinitions();
  const toolDeclarations = tools.map(t => ({
    function_declarations: [{
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }]
  }));

  const systemMessage = messages.find(m => m.role === 'system');
  
  // Transform all messages for the contents array
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user', // In this SDK, tool results are often marked as user or have a special structure
          parts: [{
            functionResponse: {
              name: m.name,
              response: { content: m.content }
            }
          }]
        };
      }
      
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_calls) {
        m.tool_calls.forEach(tc => {
          try {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments || '{}')
              }
            });
          } catch(e) {}
        });
      }

      return {
        role: m.role === 'user' ? 'user' : 'model',
        parts
      };
    });

  const response = await geminiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: contents as any,
    config: {
      systemInstruction: systemMessage?.content || undefined,
      tools: toolDeclarations as any
    }
  });

  const part = response.candidates?.[0].content?.parts?.find((p: any) => p.functionCall);
  const tool_calls: any[] = [];
  
  if (part && part.functionCall) {
    tool_calls.push({
      id: `gemini-${Date.now()}`,
      type: 'function',
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args)
      }
    });
  }

  return {
    content: response.candidates?.[0].content?.parts?.find((p: any) => p.text)?.text || '',
    tool_calls
  };
}
