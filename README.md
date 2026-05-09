# ShadowCart 👻

A privacy-first browser extension that adds intentional friction to impulse purchases across all e-commerce sites.

## Features

- Intercepts "Add to Cart" buttons.
- Captures the mood behind your purchase.
- Holds items in a "Pending" state for 48 hours.
- Reminds you to review your items, giving you the choice to buy or drop them.
- All data is stored locally in IndexedDB. No backend, no accounts, 100% private.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- Manifest V3 Service Worker + Content Scripts
- IndexedDB (via `idb`)

## Installation

### For Chrome (Developer Mode)

1. Clone this repository or download the source code.
2. Run `npm install` to install dependencies.
3. Run `npm run build`. This will generate a `dist` folder.
4. Open Chrome and navigate to `chrome://extensions`.
5. Enable **Developer mode** in the top right corner.
6. Click **Load unpacked** and select the `dist` folder.

### For Firefox (Developer Mode)

1. Follow steps 1-3 above to build the extension.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file inside the `dist` folder.

## Development

To run the extension in development mode with Hot Module Replacement (HMR):

1. Run `npm run dev`.
2. Load the `dist` directory into Chrome as described above. The CRXJS Vite plugin will automatically handle reloading the extension when you make changes.

## License

MIT
