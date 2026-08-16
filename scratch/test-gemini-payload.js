const payload = {
  systemInstruction: {
    parts: [{ text: "test" }]
  },
  contents: [{
    role: 'user',
    parts: [{ text: `test` }]
  }],
  tools: [{
    googleSearch: {}
  }],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1024,
    topP: 0.8
  }
};

fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=invalid_key', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(r => r.json().then(data => ({ status: r.status, data })))
.then(console.log)
.catch(console.error);
