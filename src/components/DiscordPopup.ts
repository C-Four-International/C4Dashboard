import '../styles/discord-popup.css';

export class DiscordPopup {
  private element: HTMLElement;
  private onClose: () => void;

  constructor(options?: { onClose?: () => void }) {
    this.onClose = options?.onClose || (() => {});

    this.element = document.createElement('div');
    this.element.className = 'discord-popup-overlay';
    this.element.innerHTML = `
      <div class="discord-popup-banner">
        <div class="discord-popup-close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <div class="discord-popup-content">
          <div class="discord-popup-icon">
            <svg width="32" height="32" viewBox="0 0 127.14 96.36" fill="currentColor">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
          </div>
          <div class="discord-popup-text-content">
            <div class="discord-popup-title">Join our Discord Community!</div>
            <div class="discord-popup-text">
              Connect with other viewers, discuss global events, and get real-time updates.
            </div>
          </div>
        </div>
        <div class="discord-popup-actions">
          <button class="discord-btn discord-reject-btn">Maybe Later</button>
          <a href="https://www.dsc.gg/c-four" target="_blank" class="discord-btn discord-accept-btn">Join Discord</a>
        </div>
      </div>
    `;

    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.element.querySelector('.discord-accept-btn')?.addEventListener('click', () => {
      localStorage.setItem('wm-discord-popup', 'seen');
      this.hide();
      this.onClose();
    });

    this.element.querySelector('.discord-reject-btn')?.addEventListener('click', () => {
      localStorage.setItem('wm-discord-popup', 'seen');
      this.hide();
      this.onClose();
    });
    
    this.element.querySelector('.discord-popup-close')?.addEventListener('click', () => {
      localStorage.setItem('wm-discord-popup', 'seen');
      this.hide();
      this.onClose();
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

  public static hasSeen(): boolean {
    return localStorage.getItem('wm-discord-popup') === 'seen';
  }
}
