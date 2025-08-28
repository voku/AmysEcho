import { API_URL, API_TOKEN } from '../constants';

// Define the structure of the landmark data for clarity
import {Hand } from '../types';

// Base URL and token from shared app constants
const API_BASE_URL = API_URL;

export async function detectLandmarksRemotely(base64Image: string): Promise<Hand[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/detect-landmarks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
      throw new Error(`Server error: ${response.status} - ${errorBody.error || 'Unknown error'}`);
    }

    const result = await response.json();
    return result.landmarks as Hand[];
  } catch (error: any) {
    console.error('[remoteHandDetectionService] Error:', error.message);
    // Return an empty array or re-throw, depending on desired error handling
    return [];
  }
}
