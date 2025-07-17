# Amy's Echo - Detailed Implementation TODO

This document provides a detailed, actionable checklist for implementing the features outlined in the project roadmap. It is designed to be easily followed by a developer or an advanced LLM.

## Phase 1: Core Intelligence & Accessibility (Current Priority)

### 1.1: Enhance Dialog Engine with LLM Integration

**Objective**: To make the app's suggestion capabilities dynamic by integrating a live Large Language Model.

**File to Modify**: `services/dialogEngine.ts`

* **Action**: Replace the placeholder `getLLMSuggestions` function with a live `fetch` call to the OpenAI API.
* **Implementation Details**:
    * The function should securely retrieve an API key. **LLM Hint**: For now, you can temporarily hardcode a placeholder key, but add a `// TODO: Replace with secure storage` comment.
    * Construct a clear, role-based prompt. The prompt engineering is key to getting good results.
    * Handle the API response, parse the JSON, and include robust `try...catch` error handling to return an empty object if the API call fails.

* **Code Example (`services/dialogEngine.ts`)**:

    ```typescript
    public async getLLMSuggestions({ input, context, language, age }: { input: string, context: string[], language: string, age: number }) {
      // TODO: Replace with secure storage (e.g., from a settings screen)
      const apiKey = 'sk-YOUR_API_KEY_HERE';
      if (!apiKey) return { nextWords: [], caregiverPhrases: [] };

      const prompt = `An ${age}-year-old child who speaks ${language} just communicated the word "${input}". The surrounding context is [${context.join(', ')}]. Provide helpful, simple, one-to-three word suggestions for the child's next likely words. Also provide encouraging, full-sentence phrases a caregiver could say. Return ONLY a valid JSON object with two keys: "nextWords": string[] and "caregiverPhrases": string[].`;

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

        if (!response.ok) {
          console.error(`API call failed with status: ${response.status}`);
          return { nextWords: [], caregiverPhrases: [] };
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        return content;
      } catch (error) {
        console.error('LLM suggestion fetch error:', error);
        return { nextWords: [], caregiverPhrases: [] }; // Return empty on error
      }
    }
    ```

**File to Modify**: `screens/LearningScreen.tsx`

* **Action**: Add state management to handle the async nature of the API call and display the results.
* **LLM Hint**: You will need to add two new state variables: `llmSuggestions` to hold the data and `llmLoading` to show a spinner. Trigger the fetch call within the `handlePress` function.

* **Code Snippet (`screens/LearningScreen.tsx`)**:

    ```typescript
    // Add new state variables
    const [llmSuggestions, setLlmSuggestions] = useState<{ nextWords: string[], caregiverPhrases: string[] } | null>(null);
    const [llmLoading, setLlmLoading] = useState(false);

    // Inside the handlePress function
    const handlePress = async (symbol: Symbol) => {
      // ... existing code for setSelectedSymbol, ttsService, usageTracker ...
      setLlmLoading(true);
      setLlmSuggestions(null); // Clear old suggestions
      const llm = await dialogEngine.getLLMSuggestions({
        input: symbol.name,
        context: symbol.contextTags,
        language: 'de',
        age: 4
      });
      setLlmSuggestions(llm);
      setLlmLoading(false);
    };

    // Inside the return JSX, within the suggestions section
    {llmLoading && <ActivityIndicator />}
    {llmSuggestions && (
      <>
        <Text style={styles.suggestionsTitle}>Ideen (KI):</Text>
        {/* Render the nextWords and caregiverPhrases */}
      </>
    )}
    ```

### 1.2: Add German Sign Language (DGS) Video Integration

**Objective**: To make the app a multimodal learning tool by adding DGS videos.

**Connecting the Dots**: This task requires changes in the database, the UI, and the asset management system.

**1. Database Changes**
* **File**: `db/schema.ts` -> `symbols` table
* **Action**: Add a new column for the DGS video path.
    ```diff
    + { name: 'dgs_video_asset_path', type: 'string', isOptional: true },
    ```
* **File**: `db/models.ts` -> `Symbol` model
* **Action**: Add the corresponding field decorator.
    ```diff
    + @text('dgs_video_asset_path') dgsVideoAssetPath?: string;
    ```

**2. UI Changes**
* **File**: `screens/LearningScreen.tsx`
* **Action**: Add state to manage which video type is active and a `Switch` component to toggle it.
* **LLM Hint**: The `SymbolVideoPlayer` will need a new prop to receive the DGS video path. Conditionally pass either the standard `videoAssetPath` or the new `dgsVideoAssetPath` based on the toggle's state.

* **Code Snippet (`screens/LearningScreen.tsx`)**:

    ```typescript
    // Add new state for the toggle
    const [showDgsVideo, setShowDgsVideo] = useState(false);

    // Add the toggle to the UI
    <View style={styles.toggleContainer}>
        <Text>DGS Video anzeigen</Text>
        <Switch value={showDgsVideo} onValueChange={setShowDgsVideo} />
    </View>

    // Update the SymbolVideoPlayer call
    <SymbolVideoPlayer
      videoAssetPath={showDgsVideo ? selectedSymbol.dgsVideoAssetPath : selectedSymbol.videoAssetPath}
      paused={videoPaused}
      onEnd={() => setVideoPaused(true)}
    />
    ```

---
