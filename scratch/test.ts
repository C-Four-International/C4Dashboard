import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (groqApiKey) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{role: 'user', content: 'hello'}]
      })
    });
    console.log('Groq 20b status:', r.status);
    console.log(await r.text());
  } else {
    console.log('No GROQ_API_KEY');
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`;
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: 'What is the weather?'}]}],
        tools: [{googleSearchRetrieval: {}}]
      })
    });
    console.log('Gemini status:', resp.status);
    console.log(await resp.text());
    
    // Test alternative tool syntax
    const resp2 = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: 'What is the weather?'}]}],
        tools: [{googleSearch: {}}]
      })
    });
    console.log('Gemini GoogleSearch status:', resp2.status);
    console.log(await resp2.text());
  } else {
    console.log('No GEMINI_API_KEY');
  }
}

test();
