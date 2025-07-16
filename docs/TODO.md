# Amy's Echo: Detailed Implementation Plan

Of course. Here is a more detailed and actionable implementation plan, designed to be easily understood and executed by an LLM or a developer.

This plan breaks down each phase into specific, actionable tasks with file references and code-level implementation details.

## Phase 1: Solidify the Foundation (Est. 1-2 Weeks)

**Objective:** Resolve foundational conflicts in the codebase, establish data integrity, and create a stable, navigable application shell.

### Task 1.1: Unify and Finalize Database Schema & Models
- **Objective:** Create a single source of truth for the application's data structure.
- **File to Modify:** `db/schema.ts`
  - Delete the entire contents of the file and replace it with the unified schema from "File 1 of 8" (using `version: 3`).
- **File to Modify:** `db/models.ts`
  - Delete the contents and replace them with the corrected models from "File 2 of 8".
- **File to Modify:** `db/index.ts`
  - Update the `modelClasses` array in the `Database` constructor to include the new models: `[Profile, Symbol, VocabularySet, UsageStat, VocabularySetSymbol, GestureDefinition, GestureTrainingData, InteractionLog, LearningAnalytic]`.
- **Expected Outcome:** The project has a single valid schema and matching models.

### Task 1.2: Implement Database Seeding
- **Objective:** Ensure the app has valid default data on first launch.
- **File to Modify:** `db/index.ts`
  - Replace the existing `setupDatabase` function with the version from "File 3 of 8". It checks for a profile and seeds default symbols and vocabulary sets if none exist.
- **Expected Outcome:** The first app launch populates the DB with default data.

### Task 1.3: Implement Stable Navigation
- **Objective:** Replace the fragile, state-based screen switching with `react-navigation`.
- **File to Modify:** `App.tsx`
  - Replace the file with the implementation from "File 4 of 8".
- **Files to Create:**
  - `screens/ProfileSelectScreen.tsx`
  - `screens/AdminScreen.tsx`
  - `screens/ParentScreen.tsx`
  - Populate each using the corrected code (files 7, 6, and the placeholder ParentScreen).
- **Expected Outcome:** Stable navigation flow with profile selection, learning, and admin screens.

## Phase 2: Building the Interactive Loop (Est. 2-3 Weeks)

**Objective:** Bring the core communication features of the app to life.

### Task 2.1: Activate the LearningScreen Interactivity
- **File to Modify:** `screens/LearningScreen.tsx`
  - Use the corrected code from "File 5 of 8".
  - In `handlePress`, call `ttsService.speak(symbol.name)` and `usageTracker.incrementUsage(symbol, profile.id)`.
  - Tie the `<SymbolVideoPlayer>` `paused` prop to `videoPaused` state and handle `onEnd` to toggle play/pause.
- **Expected Outcome:** Tapping a symbol speaks its name, plays video, and logs usage.

### Task 2.2: Implement Gesture Recognition
- **File to Modify:** `services/mlService.ts`
  - Implement the placeholder methods using `react-native-fast-tflite`.
- **File to Modify:** `screens/LearningScreen.tsx`
  - Ensure `handleGesture` processes output from `mlService.classifyGesture` and selects the matching symbol.
- **Expected Outcome:** The camera view responds to recognized gestures by selecting the corresponding symbol.

## Phase 3 & 4: Caregiver Tools & Advanced Features

### Task 3.1: Build Out the AdminScreen
- **Objective:** Provide a complete management interface for caregivers.
- **File to Modify:** `screens/AdminScreen.tsx`
  - Use the corrected implementation from "File 6 of 8".
  - "Edit" sets `editingSymbol` and opens `SymbolEditModal`; save via `handleSaveSymbol` (update action).
  - Adding a new symbol opens the modal with `editingSymbol` as `null` and creates via `create` action.
- **Expected Outcome:** Caregivers can add, edit, and assign symbols within the app.

### Task 4.2: LLM-Powered Suggestions
- **File to Modify:** `services/dialogEngine.ts`
  - Replace `getLLMSuggestions` placeholder with a real API call to a model such as GPT-4 Turbo (see code snippet below).
```ts
public async getLLMSuggestions({ input, context, language, age }: { input: string, context: string[], language: string, age: number }) {
  const apiKey = 'YOUR_API_KEY';
  const prompt = `A ${age}-year-old child who speaks ${language} just selected the word "${input}". The current context is [${context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: "nextWords": string[] and "caregiverPhrases": string[].`;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    return content;
  } catch (error) {
    console.error('LLM suggestion error:', error);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
```
- **File to Modify:** `screens/LearningScreen.tsx`
  - After selecting a symbol in `handlePress`, call `dialogEngine.getLLMSuggestions()`.
  - Store results in state and display them in a dedicated UI section.
- **Expected Outcome:** After selecting a symbol, the UI shows context-aware suggestions for the child and caregiver.

---

This document is a starting point for the remaining work. Each task references specific files and expected behavior so contributors can easily follow along.
