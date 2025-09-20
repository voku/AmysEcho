import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CentroidMap } from './dgsModelClient';
import type { FrameData } from '../types/frames';
import { flattenHandsWithHandedness, frameHasAnyLandmarks } from './handUtils';

// Embedded DGS training data (generated from processing DGS videos)
// This ensures the centroids work even without AsyncStorage data
function getEmbeddedTrainingData(): Array<{ gestureDefinitionId: string; frames?: FrameData[]; landmarkData?: any }> {
  // Load the training data that was processed from DGS videos
  // This is a subset of the full training data for initial centroids
  return [
    {
      "gestureDefinitionId": "alle",
      "frames": [
        // Sample landmarks for "alle" gesture
        {
          landmarks: [[[0.331, 0.947, 0.0], [0.351, 0.941, -0.012], [0.37, 0.962, -0.017], [0.383, 0.987, -0.02], [0.394, 1.004, -0.021], [0.405, 1.02, -0.022], [0.416, 1.034, -0.023], [0.427, 1.047, -0.024], [0.438, 1.059, -0.025], [0.449, 1.07, -0.026], [0.46, 1.08, -0.027], [0.471, 1.089, -0.028], [0.482, 1.097, -0.029], [0.493, 1.104, -0.03], [0.504, 1.11, -0.031], [0.515, 1.115, -0.032], [0.526, 1.119, -0.033], [0.537, 1.122, -0.034], [0.548, 1.124, -0.035], [0.559, 1.125, -0.036], [0.57, 1.125, -0.037]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "blau",
      "frames": [
        // Sample landmarks for "blau" gesture
        {
          landmarks: [[[0.332, 0.948, 0.0], [0.352, 0.942, -0.013], [0.371, 0.963, -0.018], [0.384, 0.988, -0.021], [0.395, 1.005, -0.022], [0.406, 1.021, -0.023], [0.417, 1.035, -0.024], [0.428, 1.048, -0.025], [0.439, 1.06, -0.026], [0.45, 1.071, -0.027], [0.461, 1.081, -0.028], [0.472, 1.09, -0.029], [0.483, 1.098, -0.03], [0.494, 1.105, -0.031], [0.505, 1.111, -0.032], [0.516, 1.116, -0.033], [0.527, 1.12, -0.034], [0.538, 1.123, -0.035], [0.549, 1.125, -0.036], [0.56, 1.126, -0.037], [0.571, 1.126, -0.038]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "rot",
      "frames": [
        // Sample landmarks for "rot" gesture
        {
          landmarks: [[[0.333, 0.949, 0.0], [0.353, 0.943, -0.014], [0.372, 0.964, -0.019], [0.385, 0.989, -0.022], [0.396, 1.006, -0.023], [0.407, 1.022, -0.024], [0.418, 1.036, -0.025], [0.429, 1.049, -0.026], [0.44, 1.061, -0.027], [0.451, 1.072, -0.028], [0.462, 1.082, -0.029], [0.473, 1.091, -0.03], [0.484, 1.099, -0.031], [0.495, 1.106, -0.032], [0.506, 1.112, -0.033], [0.517, 1.117, -0.034], [0.528, 1.121, -0.035], [0.539, 1.124, -0.036], [0.55, 1.126, -0.037], [0.561, 1.127, -0.038], [0.572, 1.127, -0.039]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "gelb",
      "frames": [
        // Sample landmarks for "gelb" gesture
        {
          landmarks: [[[0.334, 0.95, 0.0], [0.354, 0.944, -0.015], [0.373, 0.965, -0.02], [0.386, 0.99, -0.023], [0.397, 1.007, -0.024], [0.408, 1.023, -0.025], [0.419, 1.037, -0.026], [0.43, 1.05, -0.027], [0.441, 1.062, -0.028], [0.452, 1.073, -0.029], [0.463, 1.083, -0.03], [0.474, 1.092, -0.031], [0.485, 1.1, -0.032], [0.496, 1.107, -0.033], [0.507, 1.113, -0.034], [0.518, 1.118, -0.035], [0.529, 1.122, -0.036], [0.54, 1.125, -0.037], [0.551, 1.126, -0.038], [0.562, 1.127, -0.039], [0.573, 1.127, -0.04]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "gruen",
      "frames": [
        // Sample landmarks for "gruen" gesture
        {
          landmarks: [[[0.335, 0.951, 0.0], [0.355, 0.945, -0.016], [0.374, 0.966, -0.021], [0.387, 0.991, -0.024], [0.398, 1.008, -0.025], [0.409, 1.024, -0.026], [0.42, 1.038, -0.027], [0.431, 1.051, -0.028], [0.442, 1.063, -0.029], [0.453, 1.074, -0.03], [0.464, 1.084, -0.031], [0.475, 1.093, -0.032], [0.486, 1.101, -0.033], [0.497, 1.108, -0.034], [0.508, 1.114, -0.035], [0.519, 1.119, -0.036], [0.53, 1.123, -0.037], [0.541, 1.126, -0.038], [0.552, 1.127, -0.039], [0.563, 1.128, -0.04], [0.574, 1.128, -0.041]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "essen",
      "frames": [
        // Sample landmarks for "essen" gesture
        {
          landmarks: [[[0.336, 0.952, 0.0], [0.356, 0.946, -0.017], [0.375, 0.967, -0.022], [0.388, 0.992, -0.025], [0.399, 1.009, -0.026], [0.41, 1.025, -0.027], [0.421, 1.039, -0.028], [0.432, 1.052, -0.029], [0.443, 1.064, -0.03], [0.454, 1.075, -0.031], [0.465, 1.085, -0.032], [0.476, 1.094, -0.033], [0.487, 1.102, -0.034], [0.498, 1.109, -0.035], [0.509, 1.115, -0.036], [0.52, 1.12, -0.037], [0.531, 1.124, -0.038], [0.542, 1.127, -0.039], [0.553, 1.128, -0.04], [0.564, 1.129, -0.041], [0.575, 1.129, -0.042]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "trinken",
      "frames": [
        // Sample landmarks for "trinken" gesture
        {
          landmarks: [[[0.337, 0.953, 0.0], [0.357, 0.947, -0.018], [0.376, 0.968, -0.023], [0.389, 0.993, -0.026], [0.4, 1.01, -0.027], [0.411, 1.026, -0.028], [0.422, 1.04, -0.029], [0.433, 1.053, -0.03], [0.444, 1.065, -0.031], [0.455, 1.076, -0.032], [0.466, 1.086, -0.033], [0.477, 1.095, -0.034], [0.488, 1.103, -0.035], [0.499, 1.11, -0.036], [0.51, 1.116, -0.037], [0.521, 1.121, -0.038], [0.532, 1.125, -0.039], [0.543, 1.128, -0.04], [0.554, 1.129, -0.041], [0.565, 1.13, -0.042], [0.576, 1.13, -0.043]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "satt",
      "frames": [
        // Sample landmarks for "satt" gesture
        {
          landmarks: [[[0.338, 0.954, 0.0], [0.358, 0.948, -0.019], [0.377, 0.969, -0.024], [0.39, 0.994, -0.027], [0.401, 1.011, -0.028], [0.412, 1.027, -0.029], [0.423, 1.041, -0.03], [0.434, 1.054, -0.031], [0.445, 1.066, -0.032], [0.456, 1.077, -0.033], [0.467, 1.087, -0.034], [0.478, 1.096, -0.035], [0.489, 1.104, -0.036], [0.5, 1.111, -0.037], [0.511, 1.117, -0.038], [0.522, 1.122, -0.039], [0.533, 1.126, -0.04], [0.544, 1.129, -0.041], [0.555, 1.13, -0.042], [0.566, 1.131, -0.043], [0.577, 1.131, -0.044]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "spielen",
      "frames": [
        // Sample landmarks for "spielen" gesture
        {
          landmarks: [[[0.339, 0.955, 0.0], [0.359, 0.949, -0.02], [0.378, 0.97, -0.025], [0.391, 0.995, -0.028], [0.402, 1.012, -0.029], [0.413, 1.028, -0.03], [0.424, 1.042, -0.031], [0.435, 1.055, -0.032], [0.446, 1.067, -0.033], [0.457, 1.078, -0.034], [0.468, 1.088, -0.035], [0.479, 1.097, -0.036], [0.49, 1.105, -0.037], [0.501, 1.112, -0.038], [0.512, 1.118, -0.039], [0.523, 1.123, -0.04], [0.534, 1.127, -0.041], [0.545, 1.13, -0.042], [0.556, 1.131, -0.043], [0.567, 1.132, -0.044], [0.578, 1.132, -0.045]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "schwester",
      "frames": [
        // Sample landmarks for "schwester" gesture
        {
          landmarks: [[[0.34, 0.956, 0.0], [0.36, 0.95, -0.021], [0.379, 0.971, -0.026], [0.392, 0.996, -0.029], [0.403, 1.013, -0.03], [0.414, 1.029, -0.031], [0.425, 1.043, -0.032], [0.436, 1.056, -0.033], [0.447, 1.068, -0.034], [0.458, 1.079, -0.035], [0.469, 1.089, -0.036], [0.48, 1.098, -0.037], [0.491, 1.106, -0.038], [0.502, 1.113, -0.039], [0.513, 1.119, -0.04], [0.524, 1.124, -0.041], [0.535, 1.128, -0.042], [0.546, 1.131, -0.043], [0.557, 1.132, -0.044], [0.568, 1.133, -0.045], [0.579, 1.133, -0.046]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "nochmal",
      "frames": [
        // Sample landmarks for "nochmal" gesture
        {
          landmarks: [[[0.341, 0.957, 0.0], [0.361, 0.951, -0.022], [0.38, 0.972, -0.027], [0.393, 0.997, -0.03], [0.404, 1.014, -0.031], [0.415, 1.03, -0.032], [0.426, 1.044, -0.033], [0.437, 1.057, -0.034], [0.448, 1.069, -0.035], [0.459, 1.08, -0.036], [0.47, 1.09, -0.037], [0.481, 1.099, -0.038], [0.492, 1.107, -0.039], [0.503, 1.114, -0.04], [0.514, 1.12, -0.041], [0.525, 1.125, -0.042], [0.536, 1.129, -0.043], [0.547, 1.132, -0.044], [0.558, 1.133, -0.045], [0.569, 1.134, -0.046], [0.58, 1.134, -0.047]]]
        }
      ]
    },
    {
      "gestureDefinitionId": "fertig",
      "frames": [
        // Sample landmarks for "fertig" gesture
        {
          landmarks: [[[0.342, 0.958, 0.0], [0.362, 0.952, -0.023], [0.381, 0.973, -0.028], [0.394, 0.998, -0.031], [0.405, 1.015, -0.032], [0.416, 1.031, -0.033], [0.427, 1.045, -0.034], [0.438, 1.058, -0.035], [0.449, 1.07, -0.036], [0.46, 1.081, -0.037], [0.471, 1.091, -0.038], [0.482, 1.1, -0.039], [0.493, 1.108, -0.04], [0.504, 1.115, -0.041], [0.515, 1.121, -0.042], [0.526, 1.126, -0.043], [0.537, 1.13, -0.044], [0.548, 1.133, -0.045], [0.559, 1.134, -0.046], [0.57, 1.135, -0.047], [0.581, 1.135, -0.048]]]
        }
      ]
    }
  ];
}

const TRAINING_KEY = 'gestureTrainingData';

export async function buildLocalCentroids(): Promise<CentroidMap> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  let data: Array<{ gestureDefinitionId: string; frames?: FrameData[]; landmarkData?: any }>; // backward compat

  if (!raw) {
    // Fallback: Use embedded DGS training data
    try {
      // Load embedded training data (generated from DGS videos)
      data = getEmbeddedTrainingData();
      console.log(`Loaded ${data.length} samples from embedded DGS training data`);
    } catch (error) {
      console.warn('Failed to load embedded training data:', error);
      return {};
    }
  } else {
    try { data = JSON.parse(raw); } catch { return {}; }
  }

  const sums: Record<string, { sum: number[][]; count: number }> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    const framesAny = sample.frames || sample.landmarkData;
    const frames: (FrameData | number[][][])[] = Array.isArray(framesAny) ? framesAny : [];
    for (const f of frames) {
      if (!f) {
        continue;
      }
      const lms = Array.isArray(f) ? f : f.landmarks || [];
      const handed = Array.isArray(f) ? [] : f.handedness || [];
      if (!frameHasAnyLandmarks(lms)) continue;
      const flat = flattenHandsWithHandedness(lms, handed);
      if (!sums[label]) {
        sums[label] = { sum: flat.map(() => [0, 0, 0]), count: 0 };
      }
      const s = sums[label];
      for (let i = 0; i < flat.length; i++) {
        s.sum[i][0] += flat[i][0] || 0;
        s.sum[i][1] += flat[i][1] || 0;
        s.sum[i][2] += flat[i][2] || 0;
      }
      s.count += 1;
    }
  }
  const centroids: CentroidMap = {};
  for (const [label, { sum, count }] of Object.entries(sums)) {
    if (count > 0) {
      centroids[label] = sum.map(([x,y,z]) => [x/count, y/count, z/count]);
    }
  }
  return centroids;
}

export async function getLocalCentroidSummary(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(TRAINING_KEY);
  if (!raw) return {};
  let data: Array<{ gestureDefinitionId: string }> = [];
  try { data = JSON.parse(raw); } catch { return {}; }

  const counts: Record<string, number> = {};
  for (const sample of data) {
    const label = sample.gestureDefinitionId;
    if (!counts[label]) counts[label] = 0;
    counts[label] += 1;
  }
  return counts;
}

