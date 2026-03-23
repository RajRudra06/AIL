import React from 'react';
import './SummaryPanel.css';

interface SummaryPanelProps {
    markdown: string;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({ markdown }) => {
    if (!markdown) {
        return (
            <div className="summary-panel">
                <p style={{ color: '#888' }}>Loading architecture analysis...</p>
            </div>
        );
    }

    // A very lightweight custom parser to break the LLM markdown into Segments 
    // without pulling in a heavy markdown library since we have strict styling requirements.
    const segments: React.ReactNode[] = [];
    const lines = markdown.split('\n');
    
    let currentHeading = '';
    let currentContent: React.ReactNode[] = [];
    let isCodeBlock = false;
    let blockQuoteLevel = 0;

    const flushSegment = () => {
        if (currentHeading || currentContent.length > 0) {
            segments.push(
                <div key={segments.length} className="summary-segment">
                    {currentHeading && <h3 className="segment-heading">{currentHeading}</h3>}
                    <div className="segment-content">{currentContent}</div>
                </div>
            );
            currentContent = [];
            currentHeading = '';
            blockQuoteLevel = 0;
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        
        // Handle code blocks (ignore formatting inside)
        if (trimmed.startsWith('```')) {
            isCodeBlock = !isCodeBlock;
            return;
        }
        if (isCodeBlock) return; // Skip raw code blocks in the summary

        // Handle Headings (H1/H2/H3) -> Trigger a new segment
        if (trimmed.startsWith('#')) {
            flushSegment();
            currentHeading = trimmed.replace(/^#+\s*/, '');
            return;
        }

        // Handle blockquotes
        if (trimmed.startsWith('>')) {
            blockQuoteLevel++;
            currentContent.push(<div key={index} className="blockquote">{trimmed.replace(/^>\s*/, '')}</div>);
            return;
        }

        // Handle list items
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            currentContent.push(<li key={index}>{trimmed.substring(2)}</li>);
            return;
        }

        // Handle bolding (*text* or **text**) - very basic regex
        let formattedLine = trimmed;
        // Just push standard paragraphs if there's text
        if (trimmed.length > 0) {
            // we use dangerouslySetInnerHTML for a tiny bit of bold parsing
            const html = formattedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            currentContent.push(<p key={index} dangerouslySetInnerHTML={{ __html: html }} />);
        }
    });

    flushSegment(); // Flush the final segment

    return (
        <div className="summary-panel">
            {segments}
        </div>
    );
};
