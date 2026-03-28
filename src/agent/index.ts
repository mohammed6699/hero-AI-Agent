import { generateCompletion, Message } from '../llm/index.js';
import { executeTool } from '../tools/index.js';
import { saveMessage, getMessages } from '../db/index.js';

const SYSTEM_PROMPT = `You are "Hero", a highly capable, versatile personal AI Agent.
You run in a cloud environment and use Telegram as your interface.
You are not just a simple tool; you can handle complex reasoning, creative writing, general knowledge questions, and tasks "out of the box." Never say you are "only a text AI" or that you are limited in scope.
Capabilities:
- Text Generation & Reasoning: You can answer any general question, help with coding, explain complex topics, or just chat.
- Voice Interface: You have native text-to-speech (TTS) voice capabilities! If the user sends a voice note, respond via voice. If they ask if you can talk, say YES.
- Location Features: Use tools to search nearby (pharmacies, cafes, etc.), find location info, or calculate distances. 
- Instructions: If you don't know the user's location but they ask for something nearby, ask them to use the /location command in Telegram.
- Thinking: If a request is complex, break it down and use your tools where appropriate.
Respond helpfully, concisely, and with a premium, proactive personality.`;

export async function processUserMessage(userId: string, text: string): Promise<string> {
  // Save user message to DB
  await saveMessage(userId, 'user', text);

  // Load history
  const dbMessages = await getMessages(userId, 20); // Limit to last 20 messages for context window
  
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    // Filter history to just user/assistant for reliable prompt flow across providers
    ...dbMessages.filter(m => m.role === 'user' || m.role === 'assistant')
                 .map(m => ({ role: m.role, content: m.content } as Message))
  ];

  let iterations = 0;
  const maxIterations = 5;
  let finalResponse = '';

  while (iterations < maxIterations) {
    iterations++;
    
    // Call LLM
    const response = await generateCompletion(messages);
    
    // Check if tool calls are present
    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls
      });
      
      // Execute tools
      for (const tc of response.tool_calls) {
        const funcName = tc.function.name;
        let funcArgs = {};
        console.log(`[Agent] Calling tool: ${funcName}`);
        try {
          funcArgs = JSON.parse(tc.function.arguments || '{}');
          console.log(`[Agent] Tool args:`, funcArgs);
        } catch (e) {
          console.error(`[Agent] Error parsing tool args for ${funcName}:`, tc.function.arguments);
        }
        
        const result = await executeTool(funcName, funcArgs, userId);
        console.log(`[Agent] Tool result:`, result.substring(0, 50), result.length > 50 ? '...' : '');
        
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: funcName,
          content: result
        });
      }
    } else {
      // Final response obtained
      finalResponse = response.content || 'I processed your request but have no text to display.';
      break;
    }
  }

  if (iterations >= maxIterations && !finalResponse) {
    finalResponse = "I've considered several options but reached my limit. Could you rephrase or ask something else?";
  }

  // Ensure we never return an empty string (Grammy requirement)
  if (!finalResponse || finalResponse.trim() === '') {
    finalResponse = "I'm sorry, I couldn't formulate a response. How else can I help?";
  }

  // Save the final response to DB
  await saveMessage(userId, 'assistant', finalResponse);

  return finalResponse;
}
