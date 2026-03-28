import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

console.log("Gemini SDK Version Check:");
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
console.log("genAI object keys:", Object.keys(genAI));
console.log("Type of genAI.getGenerativeModel:", typeof (genAI as any).getGenerativeModel);

try {
    const model = (genAI as any).getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("Successfully called getGenerativeModel");
} catch(e: any) {
    console.error("Failed to call getGenerativeModel:", e.message);
}
