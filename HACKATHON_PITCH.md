# AIL - Microsoft Hackathon Pitch Materials

This README contains the structure for a 5-minute pitch video and a corresponding presentation deck (PPT) for **AIL (Architectural Intelligence Layer)**.

---

## 🎬 Video Structure (Sub 5-Minutes)

**Target Duration:** ~4:30 to 4:45 (giving buffer for transitions)

### 1. The Hook & Problem (0:00 - 0:45)
*   **Visual:** A developer scrolling endlessly through a messy, massive codebase on VS Code, looking frustrated.
*   **Audio/Script:** "We've all been there. You join a new project, or inherit an old one, and you're faced with thousands of files. Finding where to start, understanding the blast radius of a change, or just figuring out how components connect is a nightmare. Traditional search isn't enough."

### 2. The Solution: Enter AIL (0:45 - 1:15)
*   **Visual:** High-energy title card: "AIL - Architectural Intelligence Layer". Transition to a wide shot of the beautiful AIL interactive knowledge graph.
*   **Audio/Script:** "Meet AIL. It's not just a search tool; it's a structural brain for your repository. AIL automatically ingests your codebase and builds a unified Knowledge Graph of your entire architecture right inside VS Code."

### 3. Quick Demo / The 4-Layer Pipeline (1:15 - 3:00)
*   **Visual:** Screen recording of the extension in action.
    *   *Show Ingestion:* Parsing files and extracting ASTs incredibly fast.
    *   *Show the Graph:* Exploring the interactive `vis-network` topology. Zooming into a complex node.
    *   *Show Risk Heatmap:* Highlighting red nodes (Risk Priority Index/RPI). 
    *   *Show GraphRAG:* Asking the Copilot assistant a highly technical architectural question and getting a precise answer grounded in the graph context.
*   **Audio/Script:** "Under the hood, AIL uses a 4-layer intelligence pipeline. It extracts Abstract Syntax Trees locally, calculates codebase complexity, and merges it with Git intelligence like co-change coupling. It then ranks files by our proprietary Risk Priority Index. Finally, our GraphRAG assistant, powered by Azure OpenAI, uses this exact graph—not just fuzzy semantic search—to give you implementation-level precise answers."

### 4. Microsoft Hackathon Context & Tech Stack (3:00 - 3:45)
*   **Visual:** Architectural diagram (VS Code + Azure OpenAI logo + AST tree representation).
*   **Audio/Script:** "Built natively for Visual Studio Code, AIL deeply integrates with Microsoft's ecosystem. By leveraging Azure OpenAI for our hybrid code-aware RAG, we ensure enterprise-grade security and blazing fast, context-aware reasoning."

### 5. Testimonials Section (3:45 - 4:30)
*   **Visual:** Quick jump-cuts of friends/teammates (or "beta users"). Screen split or full screen for each person talking to the camera.
*   **Friend 1 (Focus on Onboarding):** "I used AIL on a legacy project, and what usually takes me a week to understand took about 20 minutes just by exploring the dependencies on the graph."
*   **Friend 2 (Focus on AI Precision):** "Most coding assistants hallucinate when asking about system architecture. Because AIL uses the actual structural graph, the answers from the GraphRAG are insanely accurate."
*   **Friend 3 (Focus on Risk/Refactoring):** "The Risk Priority Index heatmap literally showed us which files were ticking time bombs before we shipped. It's a game-changer."

### 6. Call to Action / Outro (4:30 - 4:45)
*   **Visual:** AIL Logo, "Try it now", Microsoft Hackathon Team Name / Details.
*   **Audio/Script:** "Stop guessing how your code works. Map it, understand it, and refactor with confidence. Thank you!"

---

## 📊 Presentation (PPT) Structure

**Target:** 10-12 Slides (Simple, clean, minimal text, high visual impact)

### Slide 1: Title Slide
*   **Content:** AIL (Architectural Intelligence Layer) Logo. 
*   **Subtitle:** "The structural brain for your codebase."
*   **Visual:** A sleek abstract network graph in the background.

### Slide 2: The Problem
*   **Content:** 
    *   Codebases grow faster than human understanding.
    *   Onboarding takes weeks.
    *   Standard Vector RAG/AI hallucinates on complex architectural queries.
*   **Visual:** A messy "spaghetti code" diagram or a frustrated developer stat.

### Slide 3: The Solution
*   **Content:** AIL transforms raw files into an interactive Knowledge Graph, powering a deterministic, code-aware AI assistant.
*   **Visual:** A simple "Code -> Graph -> Insights" flowchart.

### Slide 4: The 4-Layer Pipeline (How it works)
*   **Content:** 
    1. Local Ingestion
    2. AST Parsing (`web-tree-sitter`)
    3. Git Intelligence (Co-change & Blast Radius)
    4. Knowledge Graph + Risk Scoring
*   **Visual:** 4 sleek icons representing each layer stacked vertically or horizontally.

### Slide 5: GraphRAG vs. Standard RAG (The Secret Sauce)
*   **Content:** We don't guess relationships with fuzzy embeddings. We mathematically verify them using Abstract Syntax Trees, feeding the AI exact neighbor dependencies.
*   **Visual:** Side-by-side comparison: "Vector RAG (Fuzzy)" vs "Graph RAG (Deterministic)".

### Slide 6: Risk Priority Index (RPI)
*   **Content:** `(Complexity * 0.4) + (Churn * 0.4) + (Coupling * 0.2)`
*   **Visual:** A screenshot of the AIL Graph View in "Risk Heatmap" mode, showing bright red "hotspot" nodes.

### Slide 7: Live Demo / Screenshots
*   **Content:** Let the product speak.
*   **Visual:** High-resolution screenshot of the VS Code extension dashboard, showing the Graph, the Pipeline status, and the Assistant chat.

### Slide 8: Built on Microsoft 
*   **Content:** Highlighting the tech stack's synergy with Microsoft.
    *   Visual Studio Code Native Extension
    *   Azure OpenAI Integration (Secure, fast LLM inference for GraphRAG)
    *   TypeScript/Node.js ecosystem
*   **Visual:** VS Code + Azure OpenAI logos.

### Slide 9: What People Are Saying (Testimonials)
*   **Content:** Short quotes from the friends in your video.
    *   *"Saved me weeks of onboarding."* - [Friend Name]
    *   *"The most accurate architectural AI I've used."* - [Friend Name]
*   **Visual:** Headshots of friends with quote bubbles.

### Slide 10: Future Roadmap
*   **Content:** Next steps for the project (e.g., CI/CD PR blocking based on RPI risk, multi-repo support, live collaboration).
*   **Visual:** A simple 3-step timeline.

### Slide 11: Q&A / Thank You
*   **Content:** Team names, contact info, GitHub repo link.
*   **Visual:** QR Code to the repository or a demo link.
