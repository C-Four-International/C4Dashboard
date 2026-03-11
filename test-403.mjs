async function test() {
  const resp = await fetch('https://new.c4dash.org/api/intelligence/v1/get-country-intel-brief', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://new.c4dash.org',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: JSON.stringify({ countryCode: 'US' })
  });
  console.log('Status:', resp.status);
  console.log('Headers:', Object.fromEntries(resp.headers.entries()));
  const text = await resp.text();
  console.log('Body:', text);
}
test().catch(console.error);
