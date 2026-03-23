export class CookieConsent {
  private element: HTMLElement;
  private onAccept: () => void;
  private onReject: () => void;

  constructor(options: { onAccept: () => void; onReject: () => void }) {
    this.onAccept = options.onAccept;
    this.onReject = options.onReject;

    this.element = document.createElement('div');
    this.element.className = 'cookie-consent-overlay';
    this.element.innerHTML = `
      <div class="cookie-consent-banner">
        <div class="cookie-consent-content">
          <div class="cookie-consent-title">🍪 Cookie Consent</div>
          <div class="cookie-consent-text">
            We use cookies to enhance your experience, analyze site functionality, and provide relevant insights. 
            By clicking "Accept All", you agree to the storing of cookies on your device.
          </div>
        </div>
        <div class="cookie-consent-actions">
          <button class="cookie-btn cookie-reject-btn">Reject Non-Essential</button>
          <button class="cookie-btn cookie-accept-btn">Accept All</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.element.querySelector('.cookie-accept-btn')?.addEventListener('click', () => {
      localStorage.setItem('wm-cookie-consent', 'accepted');
      this.hide();
      this.onAccept();
    });

    this.element.querySelector('.cookie-reject-btn')?.addEventListener('click', () => {
      localStorage.setItem('wm-cookie-consent', 'rejected');
      this.hide();
      this.onReject();
    });
  }

  public show() {
    // Small delay to allow CSS transitions
    setTimeout(() => {
      this.element.classList.add('visible');
    }, 100);
  }

  public hide() {
    this.element.classList.remove('visible');
    setTimeout(() => {
      this.element.remove();
    }, 400); // match transition duration
  }

  public static getConsentStatus(): 'accepted' | 'rejected' | null {
    return localStorage.getItem('wm-cookie-consent') as 'accepted' | 'rejected' | null;
  }
}
