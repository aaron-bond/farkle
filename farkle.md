# **Mobile Farkle Game Architecture & Implementation Plan**

This document serves as the production blueprint for a lightweight, mobile-optimized, Progressive Web App (PWA) adaptation of the classic dice game **Farkle**.  
Designed for scalability, cross-platform portability, and explicit separation of concerns, this plan leverages modern web APIs and clean software engineering patterns appropriate for a professional developer production pipeline.

## **1\. Architectural Overview**

The application follows an asynchronous, unidirectional data-flow architecture where the UI layer, animation layer, and deterministic game state engine are decoupled via explicit boundaries.

\+-------------------------------------------------------------------+  
|                           UI Layer (HTML/CSS)                     |  
|  \- Renders dice faces using CSS 3D transforms                     |  
|  \- Fires UI events; listens for State Commitments                 |  
\+-------------------------------------------------------------------+  
                                 |  
                                 v  
\+-------------------------------------------------------------------+  
|                       Animation & Stage Gate                      |  
|  \- Blocks user input during active CSS transitions                |  
|  \- Receives NextState payload \-\> Holds in Staging Variable        |  
|  \- Resolves transition events \-\> Promotes Staging State           |  
\+-------------------------------------------------------------------+  
                                 |  
                                 v  
\+-------------------------------------------------------------------+  
|                     State Machine & Logic Engine                  |  
|  \- Core Loop: Async transitions                                   |  
|  \- Scoring: Recursive pattern matching (Highest \-\> Lowest)        |  
|  \- Persists validated state changes via Storage Shim              |  
\+-------------------------------------------------------------------+  
                                 |  
                                 v  
\+-------------------------------------------------------------------+  
|                  Storage Shim  /  Player Engine Interface         |  
|  \- LocalStorage (JSON Proxy)   \- Pluggable AI / Remote Interface  |  
\+-------------------------------------------------------------------+

### **Core Design Philosophy**

* **Async by Default:** All state alterations and external system touches (Storage, Player moves) are wrapped in async operations (Promises/Observables). This guarantees that moving the game from client-side local play to an authoritative remote server requires zero structural rewriting of the core UI.  
* **Headless-First Engine:** The core scoring math and state-machine flow exist entirely independently of any UI framework, enabling $100\\%$ unit test coverage and alternative interface attachments (e.g., CLI runner).  
* **CSS over Engine:** Avoidance of bulky rendering engines (Unity/Godot) in favor of semantic DOM nodes manipulated via CSS 3D Transforms and hardware-accelerated animations.

## **2\. Technical Component Design**

### **2.1 The Recursive Scoring Engine**

Farkle relies on subset verification where combinations change the remaining pool available to lower-tier rules. The engine uses a prioritized pattern-matching configuration array checked from highest-to-lowest point value to enforce deterministic, non-greedy validation.

#### **Core Interfaces**

TypeScript  
export interface Die {  
  id: string;  
  value: number;  
  isLocked: boolean;  
  isSelected: boolean;  
}

export interface MatchResult {  
  isValid: boolean;  
  score: number;  
  usedIndices: number\[\];  
  remainingDice: number\[\];  
}

export interface ScoringRule {  
  name: string;  
  priority: number; // Higher numbers run first  
  evaluate: (diceValues: number\[\]) \=\> MatchResult | null;  
}

#### **Evaluation Algorithm Lifecycle**

1. The user selects a subset of dice to check for points and submits.  
2. The ScoringEngine copies the input array and sorts the active ScoringRule list by priority.  
3. Loop through rules:  
   * If a rule matches, accumulate the score and remove the matched indices from the evaluation pool.  
   * Recursively pass the remainingDice back into the matching pipeline.  
4. If the evaluation pool is empty ($0$ remaining dice) and the accumulated score is $\> 0$, validation succeeds.  
5. If dice remain that match no rules, the selection is deemed invalid, and the transition transaction is rejected.

*Edge Case Guard:* When four or more dice of the same value appear in one roll, the engine must evaluate the full run-length for that value (applying the doubling-per-additional-die rule) rather than peeling off exactly three at a time, which would under-score the roll.

*Worked example (canonical Milestone 1 test case):* Roll \= \[1, 1, 1, 1, 1, 5\]. Five 1s score as one doubled group (4000), plus the single 5 (50), for a total of **4050**. Since all six dice were consumed, this also triggers Hot Dice \- the player may roll all six again and keep accumulating on the same turn.

#### **Turn Structure: Partial Scoring is the Core Gambit**

Partial selection-and-continue is the central strategic mechanic of the game, not an incidental feature. On any roll, the player may select **any subset of the scoring dice presented** (not just all of them), bank that subset's points onto the turn accumulator, and choose to either:

* **Bank the turn:** end the turn and commit the accumulated turn score to their total, or  
* **Press their luck:** re-roll the remaining, un-selected dice to try to score more, risking a Farkle (no scoring dice on the re-roll) that wipes the *entire* turn's accumulated score \- including points already validated and set aside earlier in the same turn.

The scoring engine's job (Section 2.1) is narrower than the turn loop: it only validates that a *submitted subset* of dice fully resolves to a legal score with no leftover unscored dice within that subset. The turn state machine sits one level above this and is responsible for the accumulate-or-bust loop, since this is where the game's actual decision-making tension lives.

**Mandatory set-aside:** On every roll, the player must set aside at least one newly-scoring die before they are permitted to re-roll the remainder. If a roll produces **no** scoring dice at all, the player Farkles ("busts") immediately: the entire turn's accumulated score is lost, and the turn passes to the next player.

**Escape hatch \- passing with nothing selected:** The mandatory-set-aside rule only gates *continuing to roll* \- it does not force a selection when the player instead wants to bank and end the turn. "Pass" can be pressed with zero dice selected, in which case it simply banks whatever turn score was already accumulated earlier in the turn and ignores the current roll entirely. This exists as a safety valve for a player who can't tell what's scoreable in the current roll, rather than trapping them into a forced guess.

#### **Scoring Table**

| Combination | Points |
| :---- | :---- |
| Single 1 | 100 |
| Single 5 | 50 |
| 1-2-3-4-5 (low straight) | 500 |
| 2-3-4-5-6 (high straight) | 750 |
| 1-2-3-4-5-6 (full straight) | 1500 |

**Three of a kind:**

| Combination | Points |
| :---- | :---- |
| 1 1 1 | 1000 |
| 2 2 2 | 200 |
| 3 3 3 | 300 |
| 4 4 4 | 400 |
| 5 5 5 | 500 |
| 6 6 6 | 600 |

**Beyond three of a kind:** each additional matching die after the third **doubles** the value of the triple. For example, for 2s:

| Combination | Points |
| :---- | :---- |
| 2 2 2 | 200 |
| 2 2 2 2 | 400 |
| 2 2 2 2 2 | 800 |
| 2 2 2 2 2 2 | 1600 |

This doubling-per-additional-die rule applies uniformly across all six face values (e.g., four 1s \= 2000, five 1s \= 4000, six 1s \= 8000).

**Hot Dice:** If a roll results in all six dice scoring (whether via a full straight, six-of-a-kind, or a combination of smaller scoring groups that together consume all six dice), the player immediately regains all six dice and may roll again, continuing to accumulate points on the same turn.

### **2.2 Animation & State Synchronization (The Staging Gate)**

To avoid the standard web-app pitfall where data updates instantaneously but rendering lags behind due to animation timelines, a **Staging Gate** pattern is implemented.

1. When a state change occurs (e.g., ROLL\_DICE), the Core State Machine calculates the deterministic resulting state immediately.  
2. Instead of publishing this new state straight to the active game view, it writes the result to a StagingState pointer variable and emits a visual event (TRIGGER\_ROLL\_ANIMATION).  
3. The UI blocks interactions (adds an overlay or disables buttons) and begins executing CSS 3D animations (transform: rotate3d(...)).  
4. Upon receiving the native DOM event animationend or a framework animation completion callback, an animation gatekeeper fires an event signaling visual settlement.  
5. The staging gate promotes StagingState to ActiveState, which unlocks the UI for user input in the new state context.

### **2.3 The Storage Shim**

To secure game continuity against aggressive mobile browser tab termination, a storage interface abstracts serialization operations.

TypeScript  
export interface StorageAccessProvider {  
  saveGameState(state: SerializableGameState): Promise\<void\>;  
  loadGameState(): Promise\<SerializableGameState | null\>;  
  clearSession(): Promise\<void\>;  
}

* **First Pass:** Implementation uses localStorage with JSON serialization.  
* **Future Expansion:** Swappable to IndexDB or a remote NoSQL API (Firestore/Supabase) without updating the state machine consumers.  
* **Persistence policy:** Only committed `ActiveState` is ever persisted \- `StagingState` (Section 2.2) is never written to storage. If the app is killed mid-animation (after a result is computed into `StagingState` but before the gate promotes it), that in-flight roll is discarded on reload and the player resumes from the last saved `ActiveState`, simply re-rolling. To keep this discard window as small as possible, `saveGameState` should be called on every `ActiveState` promotion, not just at coarse checkpoints (e.g., only at turn end).

### **2.4 Pluggable Strategy Opponent (AI Framework)**

**Scope for v1:** Strictly 1v1, human player vs. a single AI opponent. No local hotseat, no free-for-all, no networked multiplayer.

Opponents conform to an async player interaction contract, allowing human and automated behaviors to share the same operational footprint. The `'remote'` player type exists in the interface purely so networked multiplayer *could* be added later without reworking the state machine \- it is an unimplemented stretch goal, not v1 scope, and should not influence current milestone planning.

TypeScript  
export interface GamePlayer {  
  id: string;  
  name: string;  
  getType(): 'human' | 'ai' | 'remote';  
  requestTurnAction(currentSnapshot: GameStateSnapshot): Promise\<TurnAction\>;  
}

The AI strategy uses a **Heuristic-Driven Utility Agent**:

* **Finite Probability Matrices:** Uses fixed arrays modeling the statistical risk of "Farkling" given the number of dice remaining:  
  * 1 die remaining: $66.6\\%$ risk  
  * 2 dice remaining: $44.4\\%$ risk  
  * 3 dice remaining: $27.8\\%$ risk  
* **Personality Matrix:** Implements variance via customizable thresholds (riskToleranceMultiplier, greedIndex) to determine whether to bank points or continue rolling based on current turn score versus opposing score metrics.

### **2.5 Match Structure & Win Condition**

Win condition is **first to bank the target score**, checked at the moment a player banks (ends their turn on a non-Farkle roll) \- there is no final "last chance" round for trailing players once the target is crossed.

This is **not** a best-of-series match. At the start of a session, the player selects a **difficulty tier**, which fixes both the target score for that single game and the AI opponent's tuning for the duration of that game:

| Difficulty | Target Score | AI Behavior |
| :---- | :---- | :---- |
| Easy | 1500 | Lower riskToleranceMultiplier, banks conservatively |
| Medium | 3000 | Balanced risk/greed thresholds |
| Hard | 5000 | Higher riskToleranceMultiplier / greedIndex, presses its luck more aggressively, likely banks later relative to Farkle risk |

The AI's Personality Matrix (Section 2.4) is therefore parameterized by the selected difficulty tier at session start, rather than being a single fixed personality.

## **3\. Mobile PWA Integration Layer**

**Installability & Offline Support:** This is a real PWA, not just a responsive page \- it must be installable to the home screen and playable offline. This requires:

* A **Web App Manifest** (manifest.json) declaring name, icons, start\_url, and display: standalone.  
* A **Service Worker** precaching the app shell (HTML/CSS/JS bundle) so the game loads and is fully playable with no network connection, consistent with the Headless-First Engine's zero server-dependency design.

To provide native-app sensory integration directly through the browser shell, the implementation leverages specific web hardware APIs:

* **Haptic Feedback (navigator.vibrate):**  
  * Dice clatter impact: Short, rapid low-latency staccatos (\[20, 10, 15, 10\]).  
  * Locking a die in: Single dense click (\[40\]).  
  * Scoring a Farkle (Turn Loss): Distinct heavy double rumble (\[150, 100, 200\]).  
* **Display Stability (navigator.wakeLock):**  
  * Acquires a screen wake lock when a game session transitions to ACTIVE to prevent the device display from dimming or locking while the player computes tactical choices.  
* **Acoustic feedback (Web Audio API):**  
  * Decouples sound triggers from native audio channels using low-latency AudioContext buffers to mix tactile rolling effects.

## **UI Screens & Game-Flow Storyboard**

Everything built so far is deliberately unstyled placeholder UI (Milestone 3's wireframe, plus the Milestone 4 dice cubes). This is a text-based storyboard of what a player actually moves through in a play session, used to plan the remaining "CSS Aesthetics" work in Milestone 4 \- no visual mockups yet, this is the flow reference to design against.

1. **Landing / Difficulty Select** \- shown when there's no active game and no saved session. Three difficulty buttons (Easy 1500 / Medium 3000 / Hard 5000).

1a. **Resume or New Game** *(built, rough pass)* \- a modal (per the user's mockup) shown instead of plain Landing when a saved session exists on load: title, a short explanation, a three-row score summary (your banked total, opponent's banked total, current turn's unbanked score), and two actions \- "Continue Saved Game" (applies the pending state, resuming an in-progress AI turn automatically if that's what was mid-flight) or "Start New Game" (discards the saved session via `clearSession()`, proceeds to Landing/Difficulty Select). A finished (already-won) saved match is discarded automatically rather than ever being offered. Replaces the old silent auto-resume. Not yet matched to the mockup's full visual treatment (photographic background, dimmed live board behind the modal) \- currently a plain dim backdrop with a styled card, deferred until the rest of Milestone 4's aesthetic pass. That basic card/button styling (white rounded card, green primary buttons, neutral secondary buttons) has since been extended consistently to the rest of the app \- Landing, the main board, and all its sub-states \- rather than staying modal-only.

2. **Active Play** \- one persistent screen/board, cycling through sub-states rather than navigating away:  
   \- **2a. Ready to roll** \- turn score so far (if any carried over), a Roll button showing dice count.  
   \- **2b. Dice revealed / selection** \- rolled dice shown, player picks which to keep, then Roll Again or Pass.  
   \- **2c. AI's turn** \- same board, human input disabled, AI visibly selecting dice one at a time.  
   \- **2d. Farkle (bust)** \- turn lost, single Continue action.  
   \- **2e. Banked** \- turn score committed, single Continue action.

3. **Game Over** \- win/loss banner, final scores, Play Again. Currently the *only* way out of an in-progress match \- there's no way to abandon a game and start over except by finishing it.

4. **Rules / Help** \- referenced in the original concept art (a "Rules" button) but not built in any form yet. Open question: modal, separate screen, or skip for v1.

**Known gaps from this pass** (tracked in Current Status & Next Steps below):

* No way to quit/abandon an in-progress game and start over.  
* No settings screen (sound/haptics toggles would eventually live here).  
* Rules/Help doesn't exist yet.

## **Current Status & Next Steps**

**Done:** Milestones 1, 2, and 3 in full. Milestone 4 is mostly done \- 3D CSS dice with user-provided pixel-art textures, and a working AI opponent (heuristic bank/continue decisions, paced to be watchable, difficulty-tiered). The GitHub Pages deploy pipeline (separate from these milestones) is also live and working.

**Open, in priority order:**

1. **Build the real per-screen UI** (Milestone 4's remaining "CSS Aesthetics" work), against the storyboard above. Resume-vs-New-Game is done as a rough pass; still need proper visual treatment for it plus the rest of the screens (Landing, Active Play, Game Over), and a decision on Rules/Help.
2. **Milestone 5: PWA packaging** \- manifest.json, service worker, offline verification. Nothing built yet.
3. **Deferred Milestone 4 items** (explicitly lower priority, agreed not to block a playable game):  
   \- Real `transitionend`\-driven staging gate, replacing the artificial `setTimeout` delay.  
   \- Hardware hooks (vibrate, wakeLock) \- nice-to-have, deferred to a much later stage.

## **4\. Production Milestones & Execution Plan**

### **Milestone 1: The Headless Core (Pure JS/TS Logic)**

* \[x\] Code the pure data schemas and interfaces.  
* \[x\] Implement the ScoringEngine recursive pattern-matching logic.  
* \[x\] Write full unit test suites for edge-case score arrays (straights, matching pairs, partial scores).  
* \[ \] ~~Create a terminal-based CLI loop~~ \- deliberately skipped; Vitest coverage plus the Angular wireframe (Milestone 3) made this redundant for now.

### **Milestone 2: Storage & Session Resilience**

* \[x\] Build out the abstract StorageAccessProvider interface.  
* \[x\] Implement the LocalStorage adapter proxy.  
* \[x\] Verify through automated round-trip tests that a serialized game state (including an in-progress turn) hydrates back byte-identical.  
* \[x\] Wired into `GameService`: persists after every committed ActiveState promotion (per the policy above), restores on construction, and resumes an in-progress AI turn automatically if that's what was mid-flight when the state was saved. `SerializableGameState` was folded into `MatchState` directly rather than kept as a separate, now-redundant type. Verified in a real browser: reloading mid-AI-turn resumes play with no interaction needed.

### **Milestone 3: Frame, State Gate, & Wireframe**

* \[x\] Scaffold the UI structure (Angular, unstyled interaction elements).  
* \[x\] Implement the async StagingState transaction gatekeeper (`GameService`'s stage/promote pattern).  
* \[x\] Use artificial timers (setTimeout promises) to guarantee that user inputs are locked correctly while the staging phase resolves.

### **Milestone 4: CSS Aesthetics, Hardware Hooks & AI**

* \[x\] Replace plain numerical buttons with DOM cubes styled with CSS 3D transforms.  
* \[x\] Die-face textures sourced (user-provided pixel art) and wired in as the CSS cube face backgrounds.  
* \[ \] Bind state machine staging variables directly to the animationend lifecycle hooks \- still using the artificial setTimeout delay from Milestone 3, not real transition-driven gating.  
* \[ \] Inject hardware API bindings (vibrate, wakeLock) inside corresponding event streams \- deferred for now, nice-to-have for later.  
* \[x\] Write the Heuristic AI Opponent implementation and hook it into the turn/match state machine. Bust-probability table is derived by brute-force enumeration against the real scoring rules (not hardcoded guesses); difficulty tiers map to risk-tolerance/greed personality parameters; the AI drives itself through GameService's existing staging gate.  
* \[x\] AI turn pacing tuned from playtesting: the AI reveals its dice selection one die at a time (pause before the first pick, pause after each pick including the last) rather than the whole selection appearing at once, so a human watching can actually follow what it's doing. "Currently selected dice" moved out of the UI component and into `GameService` as shared state, since both the human's real clicks and the AI's simulated ones now drive the same signal.

### **Milestone 5: PWA Packaging**

* \[ \] Author manifest.json (icons, name, start\_url, display: standalone).  
* \[ \] Implement a Service Worker that precaches the app shell for full offline play.  
* \[ \] Verify installability (Lighthouse PWA audit / add-to-homescreen prompt) and confirm the app loads and is playable with no network connection.