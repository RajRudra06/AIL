import React, { useState } from 'react';
import './ChatPanel.css';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatPanelProps {
    node?: { id: string; label: string; file: string } | null;
    history?: Message[];
    isLoading?: boolean;
    onSendMessage?: (message: string) => void;
    onClose?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
    node, 
    history = [], 
    isLoading,
    onSendMessage,
    onClose
}) => {
    const [inputValue, setInputValue] = useState('');

    const handleSend = () => {
        if (inputValue.trim() && onSendMessage) {
            onSendMessage(inputValue.trim());
            setInputValue('');
        }
    };

    const renderMessageContent = (content: string) => {
        // Simple regex-based markdown-ish parser
        let html = content;

        // 1. Code Blocks (fenced with ```)
        html = html.replace(/```(?:\w+)?\n([\s\S]*?)\n```/g, (match, code) => {
            const escapedCode = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `<div class="code-block-header">Source Snippet</div><pre class="code-block"><code>${escapedCode}</code></pre>`;
        });

        // 2. Inline Code
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 3. Headings (strip #)
        html = html.replace(/^### (.*$)/gm, '<div class="h3-style">$1</div>');
        html = html.replace(/^#### (.*$)/gm, '<div class="h4-style">$1</div>');

        // 4. Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 5. Lists
        html = html.replace(/^\* (.*$)/gm, '<li class="list-item">$1</li>');
        html = html.replace(/^- (.*$)/gm, '<li class="list-item">$1</li>');
        
        // Wrap consecutive li items in ul (simplified)
        html = html.replace(/(<li class="list-item">.*<\/li>\n?)+/g, (match) => {
            return `<ul class="message-list">${match}</ul>`;
        });

        // 6. Line breaks (excluding those inside blocks handled above)
        html = html.replace(/\n(?!<pre|<ul|<li|<\/ul|<\/li|<\/pre)/g, '<br/>');

        return { __html: html };
    };

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <div className="header-info">
                    <span className="header-icon">🤖</span>
                    <div className="header-text">
                        <span className="header-title">AIL Explainer</span>
                        <span className="header-subtitle">
                            {node?.id === 'multi-selection' ? 'Multi-Node Selection' : node?.label}
                        </span>
                    </div>
                </div>

                <button className="close-panel-btn" onClick={onClose} title="Close Chat">✕</button>
            </div>

            <div className="chat-messages">
                {history.length === 0 && !isLoading && (
                    <div className="chat-welcome">
                        <div className="welcome-card">
                            <p>I've analyzed <strong>{node?.label}</strong> and its transitive dependencies up to depth 3.</p>
                            <p className="hint">Ask how it handles logic, errors, or data flow.</p>
                        </div>
                    </div>
                )}
                
                {history.map((msg, i) => (
                    <div key={i} className={`message-wrapper ${msg.role === 'user' ? 'user-wrapper' : 'assistant-wrapper'}`}>
                        <div className={`message-bubble ${msg.role}`}>
                            <div className="message-content" dangerouslySetInnerHTML={renderMessageContent(msg.content)} />
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="message-wrapper assistant-wrapper">
                        <div className="message-bubble assistant loading">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="chat-input-container">
                <div className="chat-input-wrapper">
                    <input 
                        type="text" 
                        placeholder={`Ask about ${node?.label}...`}
                        value={inputValue}
                        onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button 
                        className="send-btn" 
                        onClick={handleSend} 
                        disabled={isLoading || !inputValue.trim()}
                    >
                        {isLoading ? '...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};
