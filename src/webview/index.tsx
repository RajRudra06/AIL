import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// In VS Code Webviews, we need to acquire the VS Code API once for message passing
// We make it globally available so any component can use it to talk to the extension host.
declare global {
  interface Window {
    vscode: any;
    acquireVsCodeApi: () => any;
  }
}

// Initialize the VS Code API
if (typeof window.acquireVsCodeApi === 'function') {
  window.vscode = window.acquireVsCodeApi();
} else {
  // Mock for browser testing if needed
  window.vscode = {
    postMessage: (message: any) => console.log('Mock postMessage:', message)
  };
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Failed to find root element");
}
