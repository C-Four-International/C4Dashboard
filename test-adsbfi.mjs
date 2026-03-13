const url = 'https://api.adsb.fi/v2/lat/35/lon/35/dist/250';
fetch(url, { headers: { 'User-Agent': 'WorldMonitor/EdgeProxy' } })
  .then(res => {
    console.log("Status:", res.status);
    return res.text();
  })
  .then(data => {
    try {
      const j = JSON.parse(data);
      console.log("Keys:", Object.keys(j));
      console.log("Found:", j.ac?.length || 0);
      if (j.ac?.length) console.log(j.ac[0]);
    } catch(e) {
      console.log("Not JSON:", data.substring(0, 200));
    }
  })
  .catch(console.error);
