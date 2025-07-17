# Amy's Echo - Detailed Implementation TODO

This document provides a detailed, actionable checklist for implementing the features outlined in the project roadmap. It is designed to be easily followed by a developer or an advanced LLM.

## Phase 1: Activate Core Functionality (Immediate Priority)

### 1.1: Implement Live Gesture Recognition
*Status: ✅ Completed*

**Objective**: To activate the camera-based interaction by implementing the machine learning service. This is the most critical next step to make the app's core feature functional.

**File to Modify**: `services/mlService.ts`

* **Action**: Implement the `loadModels` and `classifyGesture` methods using `react-native-fast-tflite`.
* **Code Example**:

```typescript
import { Tflite } from 'react-native-fast-tflite';

class MachineLearningService {
  private isReady = false;
  private gestureModel: Tflite | null = null;

  constructor() {
    this.gestureModel = new Tflite();
  }

  async loadModels(): Promise<void> {
    try {
      await this.gestureModel?.loadModel({
        path: 'gestures.tflite', // This model must be in the correct native assets folder.
        numThreads: 4,
      });
      this.isReady = true;
      console.log('ML model loaded successfully.');
    } catch (error) {
      console.error('Failed to load ML model:', error);
      this.isReady = false;
    }
  }

  isServiceReady = (): boolean => this.isReady;

  async classifyGesture(frame: any): Promise<any[] | null> {
    if (!this.isReady || !this.gestureModel) return null;
    const output = await this.gestureModel.runOnModel(frame);
    return output;
  }
}

export const mlService = new MachineLearningService();
```

## Phase 2: Enhance with Intelligence & Accessibility

### 2.1: Enhance Dialog Engine with LLM Integration
*Status: ✅ Completed*

**Objective**: To make the app's suggestion capabilities dynamic by integrating a live Large Language Model.

**File to Modify**: `services/dialogEngine.ts`

* **Action**: Replace the placeholder `getLLMSuggestions` function with a live `fetch` call to the OpenAI API.
* **Code Example**:

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
    return { nextWords: [], caregiverPhrases: [] };
  }
}
```
