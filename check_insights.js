import { chromium } from "playwright";

async function checkWidget() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logToFile = async (msg) => {
    const fs = await import('fs');
    fs.appendFileSync('playwright_log.txt', msg + '\n');
    console.log(msg);
  };
  
  (await import('fs')).writeFileSync('playwright_log.txt', '');

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      logToFile(`[Browser Console Error] ${msg.text()}`);
    } else if (msg.text().includes("WebGPU") || msg.text().includes("ONNX") || msg.text().includes("MLWorker")) {
      logToFile(`[Browser ML Log] ${msg.text()}`);
    } else if (msg.type() === "warning") {
      logToFile(`[Browser Console Warning] ${msg.text()}`);
    } else {
      logToFile(`[Browser Console] ${msg.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    logToFile(`[Browser Uncaught Error] ${error.message} \n ${error.stack}`);
  });

  logToFile("Navigating to http://localhost:5176...");
  try {
    const res = await page.goto("http://localhost:5176", { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(`Page Load Status: ${res?.status()} ${res?.statusText()}`);

    console.log("Waiting for panel-widgets to render...");
    await page.waitForTimeout(10000); // 10s wait for ML models and animations

    console.log("Locating Insights widget...");
    const content = await page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll(".panel"));
      const insightsWidget = widgets.find(w => w.innerHTML.includes("AI Insights") || w.innerHTML.includes("insights") || w.innerHTML.includes("Insights"));
      if (insightsWidget) {
         return insightsWidget.innerHTML.slice(0, 1000);
      }
      return "Insights Widget Not Found. Total Widgets: " + widgets.length + "\nBody Snippet: " + document.body.innerHTML.slice(0, 500);
    });
    
    await import('fs').then(fs => fs.writeFileSync('insights_dump.txt', content));
    console.log("Wrote panel HTML snippet to insights_dump.txt");

  } catch (err) {
    console.error("Navigation/Wait error:", err.message);
  } finally {
    console.log("Closing browser.");
    await browser.close();
  }
}

checkWidget().catch(console.error);
