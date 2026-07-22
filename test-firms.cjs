require('dotenv').config();
process.env.NASA_FIRMS_API_KEY = 'test';
const { listFireDetections } = require('./server/worldmonitor/wildfire/v1/list-fire-detections');

(async () => {
  try {
    const res = await listFireDetections({}, {});
    console.log('API returned successfully. Data length:', res?.fireDetections?.length);
    console.log('Result:', JSON.stringify(res).substring(0, 500));
  } catch(e) {
    console.error('API failed with ERROR:', e);
  }
})();
