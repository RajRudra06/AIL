import React, { useState } from 'react';
import './SummaryPanel.css';

interface SummaryPanelProps {
    markdown: string;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({ 
    markdown
}) => {
    if (!markdown || markdown === '<LOADING>') {

        return (
            <div className="summary-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div className="ail-spinner"></div>
            </div>
        );
    }

    // A very lightweight custom parser to break the LLM markdown into Segments 
    const segments: React.ReactNode[] = [];
    const lines = markdown.split('\n');
    
    let currentHeading = '';
    let currentContent: React.ReactNode[] = [];
    let isCodeBlock = false;
    let inList = false;
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
        if (inList && listItems.length > 0) {
            currentContent.push(<ul key={`ul-${segments.length}-${currentContent.length}`} className="segment-list">{listItems}</ul>);
            listItems = [];
            inList = false;
        }
    };

    const flushSegment = () => {
        flushList();
        if (currentHeading || currentContent.length > 0) {
            segments.push(
                <div key={segments.length} className="summary-segment">
                    {currentHeading && <h3 className="segment-heading">{currentHeading}</h3>}
                    <div className="segment-content">{currentContent}</div>
                </div>
            );
            currentContent = [];
            currentHeading = '';
        }
    };

    const formatText = (text: string) => {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) { isCodeBlock = !isCodeBlock; return; }
        if (isCodeBlock) return; 

        if (trimmed.startsWith('#')) {
            flushSegment();
            currentHeading = trimmed.replace(/^#+\s*/, '');
            return;
        }

        if (trimmed.startsWith('>')) {
            flushList();
            currentContent.push(<div key={index} className="blockquote">{trimmed.replace(/^>\s*/, '')}</div>);
            return;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            inList = true;
            const contentHtml = formatText(trimmed.substring(2));
            listItems.push(<li key={index} dangerouslySetInnerHTML={{ __html: contentHtml }} />);
            return;
        }

        flushList();
        if (trimmed.length > 0) {
            const html = formatText(trimmed);
            currentContent.push(<p key={index} dangerouslySetInnerHTML={{ __html: html }} />);
        }
    });

    flushSegment();

    return (
        <div className="summary-panel">
            <h2 className="panel-title">Repository Architecture</h2>
            {segments}
        </div>
    );
};
