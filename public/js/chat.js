
import { sendAIChatMessage } from './api.js';

window.toggleAIChat = function() {
  const panel = document.getElementById('aiChatPanel');
  if (panel) {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      document.getElementById('aiChatInput')?.focus();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('aiChatForm');
  const chatInput = document.getElementById('aiChatInput');
  const chatMessages = document.getElementById('aiChatMessages');
  const chatSubmitBtn = document.getElementById('aiChatSubmit');

  if (!chatForm || !chatInput || !chatMessages) return;

  const statusIndicator = document.getElementById('aiStatusIndicator');
  const statusText = document.getElementById('aiStatusText');
  const inputArea = document.querySelector('.ai-chat-input-area');

  function updateConnectivityUI() {
    const isOnline = navigator.onLine;
    
    if (isOnline) {
      statusIndicator?.classList.remove('offline');
      if (statusText) statusText.textContent = 'Online';
      inputArea?.classList.remove('offline');
      chatInput.placeholder = "Ask me anything about your finances...";
    } else {
      statusIndicator?.classList.add('offline');
      if (statusText) statusText.textContent = 'Offline';
      inputArea?.classList.add('offline');
      chatInput.placeholder = "Connection required to chat";
    }
  }

  // Listen for connectivity changes
  window.addEventListener('online', updateConnectivityUI);
  window.addEventListener('offline', updateConnectivityUI);
  
  // Initial check
  updateConnectivityUI();

  function appendMessage(text, isAi = false) {
    const div = document.createElement('div');
    div.className = `chat-message ${isAi ? 'ai' : 'user'}`;
    
    // Convert markdown bot lines to HTML simply if needed
    // But text is plain for now
    let formattedText = text.replace(/\n/g, '<br>');

    div.innerHTML = `<div class="msg-bubble">${formattedText}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function appendLoader() {
    const div = document.createElement('div');
    div.className = `chat-message ai loader-msg`;
    div.innerHTML = `
      <div class="msg-bubble" style="display:flex; gap:4px; align-items:center;">
        <i class="fa-solid fa-circle form-spinner" style="font-size:6px; animation: blink 1.4s infinite alternate; animation-delay: 0s;"></i>
        <i class="fa-solid fa-circle form-spinner" style="font-size:6px; animation: blink 1.4s infinite alternate; animation-delay: 0.2s;"></i>
        <i class="fa-solid fa-circle form-spinner" style="font-size:6px; animation: blink 1.4s infinite alternate; animation-delay: 0.4s;"></i>
      </div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!navigator.onLine) {
       console.warn('[Chat] Cannot send message while offline');
       return;
    }

    const user = window.currentUser;
    if (!user) return;

    const message = chatInput.value.trim();
    if (!message) return;

    // 1. Add User Message
    appendMessage(message, false);
    chatInput.value = '';
    chatSubmitBtn.disabled = true;

    // 2. Add Loader
    const loaderNode = appendLoader();

    try {
      // 3. Send to unified AI backend
      const res = await sendAIChatMessage(user.uid, message);
      
      // Remove loader
      loaderNode.remove();

      if (res && res.reply) {
        appendMessage(res.reply, true);
      } else {
        appendMessage("Sorry, I encountered an issue processing that. Please try again.", true);
      }

    } catch (err) {
      console.error("Chat API Error:", err);
      loaderNode.remove();
      appendMessage("Sorry, the Finova AI service is temporarily unavailable.", true);
    } finally {
      chatSubmitBtn.disabled = false;
      chatInput.focus();
    }
  });

});
