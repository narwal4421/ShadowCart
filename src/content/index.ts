import browser from 'webextension-polyfill';
import type { MoodTag } from '../types';

const SELECTORS = [
  "#add-to-cart-button",           // Amazon
  "#addToCart",
  'button[name="add"]',            // Shopify
  'button[aria-label*="add to cart" i]',
  'button[aria-label*="Add to Bag" i]',
  'button[data-action="add-to-cart"]',
];

const NAME_SELECTORS = [
  "#productTitle",
  "h1.product-title",
  "h1[itemprop='name']",
  ".product-name",
  "h1",
];

const PRICE_SELECTORS = [
  ".a-price-whole",
  "#price_inside_buybox",
  "[data-price]",
  ".price",
  ".product-price",
  "[itemprop='price']",
];

const IMAGE_SELECTORS = [
  "#landingImage",
  ".product-image img",
  "[itemprop='image']",
  "img.product-img",
  "meta[property='og:image']",
];

function scrapeElement(selectors: string[], attr: string = 'innerText'): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      if (attr === 'innerText') return (el as HTMLElement).innerText.trim();
      if (attr === 'src') return (el as HTMLImageElement).src || '';
      if (attr === 'content') return el.getAttribute('content') || '';
    }
  }
  return '';
}

function scrapeData() {
  const name = scrapeElement(NAME_SELECTORS) || document.title;
  let price = scrapeElement(PRICE_SELECTORS);
  if (!price) price = "Price unavailable";
  
  let imageUrl = scrapeElement(IMAGE_SELECTORS.slice(0, 4), 'src');
  if (!imageUrl) imageUrl = scrapeElement(["meta[property='og:image']"], 'content');
  if (!imageUrl) imageUrl = "";

  return { name, price, imageUrl };
}

let modalContainer: HTMLElement | null = null;

function injectMoodModal(product: { name: string, price: string, imageUrl: string }) {
  if (modalContainer) {
    modalContainer.remove();
  }

  modalContainer = document.createElement('div');
  modalContainer.style.position = 'fixed';
  modalContainer.style.bottom = '24px';
  modalContainer.style.right = '24px';
  modalContainer.style.zIndex = '999999';
  modalContainer.style.opacity = '0';
  modalContainer.style.transform = 'translateY(20px)';
  modalContainer.style.transition = 'opacity 250ms ease, transform 250ms ease';
  
  const shadowRoot = modalContainer.attachShadow({ mode: 'closed' });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #2e2e2e;
    border-radius: 16px;
    width: 320px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: Inter, sans-serif;
    color: #ffffff;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  `;

  // Product Preview
  const preview = document.createElement('div');
  preview.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #2e2e2e;
  `;
  
  const img = document.createElement('img');
  img.src = product.imageUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // empty fallback
  img.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    background: #2a2a2a;
  `;
  
  const nameEl = document.createElement('div');
  nameEl.innerText = product.name;
  nameEl.style.cssText = `
    font-size: 13px;
    color: #dddddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  `;

  preview.appendChild(img);
  preview.appendChild(nameEl);
  wrapper.appendChild(preview);

  // Header
  const title = document.createElement('div');
  title.innerText = 'Added to ShadowCart \uD83D\uDC7B';
  title.style.cssText = `font-size: 15px; font-weight: 600;`;
  
  const subtitle = document.createElement('div');
  subtitle.innerText = 'Quick — why do you want this?';
  subtitle.style.cssText = `font-size: 12px; color: #888888; margin-top: 4px; margin-bottom: 16px;`;

  wrapper.appendChild(title);
  wrapper.appendChild(subtitle);

  // Buttons
  const buttonsGrid = document.createElement('div');
  buttonsGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  `;

  const moodOptions: { label: string, value: MoodTag, emoji: string }[] = [
    { label: 'Bored', value: 'bored', emoji: '\uD83D\uDE34' },
    { label: 'Stressed', value: 'stressed', emoji: '\uD83D\uDE24' },
    { label: 'Actually need it', value: 'genuinely_need', emoji: '\u2705' },
    { label: 'Treating myself', value: 'treating_myself', emoji: '\uD83C\uDF81' },
    { label: 'Saw it somewhere', value: 'saw_it_somewhere', emoji: '\uD83D\uDC40' },
  ];

  let dismissed = false;

  const handleSelect = (mood: MoodTag) => {
    if (dismissed) return;
    dismissed = true;
    
    browser.runtime.sendMessage({
      type: "SAVE_ITEM",
      payload: {
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        productUrl: window.location.href,
        siteName: window.location.hostname.replace("www.", ""),
        mood,
      }
    });

    if (modalContainer) {
      modalContainer.style.opacity = '0';
      modalContainer.style.transform = 'translateY(20px)';
      setTimeout(() => modalContainer?.remove(), 250);
    }
  };

  moodOptions.forEach(opt => {
    const btn = document.createElement('button');
    btn.innerHTML = `${opt.emoji} ${opt.label}`;
    btn.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 10px;
      padding: 10px 8px;
      font-size: 12px;
      color: #ffffff;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    `;
    btn.onmouseenter = () => {
      btn.style.background = '#6c63ff';
      btn.style.borderColor = '#6c63ff';
    };
    btn.onmouseleave = () => {
      btn.style.background = '#2a2a2a';
      btn.style.borderColor = '#3a3a3a';
    };
    btn.onclick = () => handleSelect(opt.value);
    buttonsGrid.appendChild(btn);
  });

  const skipBtn = document.createElement('button');
  skipBtn.innerText = 'Skip';
  skipBtn.style.cssText = `
    width: 100%;
    background: transparent;
    border: none;
    color: #555555;
    font-size: 11px;
    margin-top: 12px;
    text-decoration: underline;
    cursor: pointer;
  `;
  skipBtn.onclick = () => handleSelect('untagged');

  wrapper.appendChild(buttonsGrid);
  wrapper.appendChild(skipBtn);

  // Progress bar
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: #2e2e2e;
  `;
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    height: 100%;
    width: 100%;
    background: #6c63ff;
    transition: width 15s linear;
    transform-origin: left;
  `;
  progressContainer.appendChild(progressBar);
  wrapper.appendChild(progressContainer);

  shadowRoot.appendChild(wrapper);
  document.body.appendChild(modalContainer);

  // Trigger animations
  requestAnimationFrame(() => {
    if (modalContainer) {
      modalContainer.style.opacity = '1';
      modalContainer.style.transform = 'translateY(0)';
    }
    // Start progress bar
    setTimeout(() => {
      progressBar.style.width = '0%';
    }, 50);
  });

  // Auto dismiss
  setTimeout(() => {
    if (!dismissed) handleSelect('untagged');
  }, 15000);
}

function handleAddToCartClick() {
  const data = scrapeData();
  injectMoodModal(data);
}

function attachListeners() {
  const buttons = document.querySelectorAll(SELECTORS.join(', '));
  buttons.forEach(btn => {
    if (!btn.hasAttribute('data-shadowcart-attached')) {
      btn.addEventListener('click', handleAddToCartClick);
      btn.setAttribute('data-shadowcart-attached', 'true');
    }
  });

  // Generic fallback
  const allButtons = document.querySelectorAll('button, a[role="button"], div[role="button"]');
  const genericRegex = /add to cart|add to bag|add to basket|buy now|add to trolley/i;
  allButtons.forEach(btn => {
    if (!btn.hasAttribute('data-shadowcart-attached')) {
      if (genericRegex.test((btn as HTMLElement).innerText || '')) {
        btn.addEventListener('click', handleAddToCartClick);
        btn.setAttribute('data-shadowcart-attached', 'true');
      }
    }
  });
}

// Initial attachment
attachListeners();

// Mutation observer for SPAs
const observer = new MutationObserver(() => {
  attachListeners();
});
observer.observe(document.body, { childList: true, subtree: true });
