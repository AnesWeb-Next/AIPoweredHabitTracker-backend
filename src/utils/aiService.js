import { GoogleGenAI } from "@google/genai";

let client = null;
const getClient = () => {
  if (client) return client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  client = new GoogleGenAI({ apiKey: key });
  return client;
};

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export const isAIEnabled = () => !!process.env.GEMINI_API_KEY;

export const parseJSON = (text) => {
  let cleaned = (text || "").trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/```json\n?/g, "").replace(/^```\n?$/g, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\n?/g, "");
  }
  return JSON.parse(cleaned.trim());
};

export const chatCompletion = async ({ system, user, temperature = 0.7 }) => {
  const c = getClient();
  if (!c) {
    return {
      ok: false,
      content:
        "AI features are disabled. Set GEMINI_API_KEY in the backend.env to enable real AI responses. Meanwhi",
    };
  }
  try {
    const res = await c.models.generateContent({
      model: MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        temperature,
      },
    });
    return { ok: true, content: (res.text || "").trim() };
  } catch (err) {
    console.error("AI error:", err.message);
    return { ok: false, content: "AI request failed. Please try again later." };
  }
};

export const SYSTEM_PROMPTS = {
  weekly:
    "You are a warm, encouraging habit coach. Analyze the user's last 7 days of habit data and write a short p",
  suggestion:
    "You are a helpful habit coach. Based on the user's goals, productive time, and past struggles, suggest ex",
  recovery:
    "You are a compassionate habit recovery coach. The user broke a streak. Write a 3-day recovery plan tailored to them.",
  chat: "You are a helpful habit analysis assistant. Answer the user's question using ONLY the provided habit",
  morning:
    "You are a warm, motivating friend. Write a single short morning message (30-60 words) using the user's a",
};
