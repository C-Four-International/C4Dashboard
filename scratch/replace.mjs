import fs from 'fs/promises';
import path from 'path';

const filesToReplaceGroqApi = [
  'src/services/runtime-config.ts',
  'src/services/analytics.ts',
  'src/app/country-intel.ts',
  'src/components/RuntimeConfigPanel.ts',
  'src/settings-main.ts',
  'src/config/ai-datacenters.ts',
  'src/config/tech-companies.ts',
  'src/services/news/index.ts',
  'src/services/desktop-readiness.ts',
  'src/services/summarization.ts'
];

async function run() {
  for (const file of filesToReplaceGroqApi) {
    const fullPath = path.resolve(process.cwd(), file);
    try {
      let content = await fs.readFile(fullPath, 'utf8');
      content = content.replace(/GROQ_API_KEY/g, 'GEMINI_API_KEY');
      content = content.replace(/groqApiKey/g, 'geminiApiKey');
      content = content.replace(/'groq'/g, "'gemini'");
      content = content.replace(/Groq/g, 'Gemini');
      await fs.writeFile(fullPath, content);
      console.log(`Updated ${file}`);
    } catch (e) {
      console.error(`Skipped ${file} - ${e.message}`);
    }
  }

  // Locale files
  const localesDir = path.resolve(process.cwd(), 'src/locales');
  const localeFiles = await fs.readdir(localesDir);
  for (const file of localeFiles) {
    if (file.endsWith('.json')) {
      const fullPath = path.join(localesDir, file);
      let content = await fs.readFile(fullPath, 'utf8');
      content = content.replace(/GROQ_API_KEY/g, 'GEMINI_API_KEY');
      content = content.replace(/Groq/g, 'Gemini');
      await fs.writeFile(fullPath, content);
      console.log(`Updated locale ${file}`);
    }
  }
}

run();
