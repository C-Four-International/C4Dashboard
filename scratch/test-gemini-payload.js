const payload = {
  systemInstruction: {
    parts: [{ text: "test" }]
  },
  contents: [{
    role: 'user',
    parts: [{ text: `test` }]
  }],
  tools: [{
    invalid_tool_name_to_test: {}
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
.then(async r => {
  const status = r.status;
  const data = await r.json();
  console.log(JSON.stringify({ status, data }, null, 2));
})
.catch(console.error);
