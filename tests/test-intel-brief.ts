import { getCountryIntelBrief } from '../server/worldmonitor/intelligence/v1/get-country-intel-brief.js';

async function testBrief() {
  console.log('Testing intelligence brief for US...');
  const ctx: any = {};
  const req = { countryCode: 'US' };

  try {
    const response = await getCountryIntelBrief(ctx, req);
    console.log('--- RESPONSE ---');
    console.log(`Model: ${response.model}`);
    console.log(`Generated At: ${new Date(response.generatedAt).toLocaleString()}`);
    console.log('--- BRIEF ---');
    console.log(response.brief);
    
    // Save to file for full verification
    const fs = await import('node:fs');
    fs.writeFileSync('brief_output.txt', response.brief);
    console.log('\nBrief saved to brief_output.txt');
    
    if (response.brief) {
      console.log('\n✅ Success: Brief generated.');
      if (response.brief.includes('DISCLAIMER')) {
        console.log('✅ Success: Disclaimer present.');
      } else {
        console.log('❌ Error: Disclaimer missing.');
      }
    } else {
      console.log('\n❌ Error: Brief is empty.');
    }
  } catch (error) {
    console.error('❌ Error testing brief:', error);
  }
}

testBrief();
