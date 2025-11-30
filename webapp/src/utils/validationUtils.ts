/**
 * Validation utilities for Amy's Echo webapp
 * Provides consistent validation patterns for data integrity
 */

import { logger } from '../services/logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ValidationRule<T = unknown> {
  name: string;
  validate: (value: T) => boolean;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validates a value against multiple rules
 */
export function validateWithRules<T>(
  value: T,
  rules: ValidationRule<T>[],
  context: string = 'validation'
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    try {
      const isValid = rule.validate(value);

      if (!isValid) {
        const message = `${rule.name}: ${rule.message}`;

        if (rule.severity === 'error') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    } catch (error) {
      const errorMessage = `Validation rule '${rule.name}' threw an error: ${error}`;
      errors.push(errorMessage);
      logger.error(`Validation error in ${context}:`, error);
    }
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

/**
 * Common validation rules
 */
export const commonValidationRules = {
  required: (fieldName: string): ValidationRule<unknown> => ({
    name: `${fieldName}_required`,
    validate: (value) => value !== null && value !== undefined && value !== '',
    message: `${fieldName} is required`,
    severity: 'error'
  }),

  string: (fieldName: string, minLength?: number, maxLength?: number): ValidationRule<string> => ({
    name: `${fieldName}_string`,
    validate: (value) => {
      if (typeof value !== 'string') return false;
      if (minLength !== undefined && value.length < minLength) return false;
      if (maxLength !== undefined && value.length > maxLength) return false;
      return true;
    },
    message: `${fieldName} must be a string${minLength ? ` with minimum length ${minLength}` : ''}${maxLength ? ` with maximum length ${maxLength}` : ''}`,
    severity: 'error'
  }),

  number: (fieldName: string, min?: number, max?: number): ValidationRule<number> => ({
    name: `${fieldName}_number`,
    validate: (value) => {
      if (typeof value !== 'number' || isNaN(value)) return false;
      if (min !== undefined && value < min) return false;
      if (max !== undefined && value > max) return false;
      return true;
    },
    message: `${fieldName} must be a number${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` <= ${max}` : ''}`,
    severity: 'error'
  }),

  array: (fieldName: string, minLength?: number, maxLength?: number): ValidationRule<unknown[]> => ({
    name: `${fieldName}_array`,
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      if (minLength !== undefined && value.length < minLength) return false;
      if (maxLength !== undefined && value.length > maxLength) return false;
      return true;
    },
    message: `${fieldName} must be an array${minLength ? ` with minimum length ${minLength}` : ''}${maxLength ? ` with maximum length ${maxLength}` : ''}`,
    severity: 'error'
  }),

  object: (fieldName: string): ValidationRule<object> => ({
    name: `${fieldName}_object`,
    validate: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    message: `${fieldName} must be an object`,
    severity: 'error'
  }),

  email: (fieldName: string): ValidationRule<string> => ({
    name: `${fieldName}_email`,
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return typeof value === 'string' && emailRegex.test(value);
    },
    message: `${fieldName} must be a valid email address`,
    severity: 'error'
  }),

  url: (fieldName: string): ValidationRule<string> => ({
    name: `${fieldName}_url`,
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: `${fieldName} must be a valid URL`,
    severity: 'error'
  }),

  base64: (fieldName: string): ValidationRule<string> => ({
    name: `${fieldName}_base64`,
    validate: (value) => {
      if (typeof value !== 'string') return false;
      if (value.length === 0) return true;
      if (value.length % 4 !== 0) return false;
      const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
      return base64Regex.test(value);
    },
    message: `${fieldName} must be valid base64`,
    severity: 'error'
  }),

  gesture: (fieldName: string): ValidationRule<string> => ({
    name: `${fieldName}_gesture`,
    validate: (value) => {
      if (typeof value !== 'string') return false;
      // Basic gesture name validation
      return value.length > 0 && value.length <= 50 && /^[a-zA-Z0-9_\-\s]+$/.test(value);
    },
    message: `${fieldName} must be a valid gesture name (alphanumeric, underscore, hyphen, space only, 1-50 chars)`,
    severity: 'error'
  }),

  confidence: (fieldName: string): ValidationRule<number> => ({
    name: `${fieldName}_confidence`,
    validate: (value) => typeof value === 'number' && value >= 0 && value <= 1,
    message: `${fieldName} must be a number between 0 and 1`,
    severity: 'error'
  }),

  landmarkData: (fieldName: string): ValidationRule<unknown> => ({
    name: `${fieldName}_landmark_data`,
    validate: (value) => {
      if (!Array.isArray(value)) return false;

      // Check if it's landmark data (array of frames)
      return value.every(frame =>
        Array.isArray(frame) &&
        frame.every(hand =>
          Array.isArray(hand) &&
          hand.every(point =>
            Array.isArray(point) &&
            point.length === 3 &&
            point.every(coord => typeof coord === 'number')
          )
        )
      );
    },
    message: `${fieldName} muss gültige Landmarken-Daten enthalten (Array von Frames mit Hand-Landmarken)`,
    severity: 'error'
  })
};

/**
 * Validates gesture data
 */
export function validateGestureData(data: {
  gesture?: string;
  confidence?: number;
  landmarks?: unknown;
  timestamp?: number;
}): ValidationResult {
  const rules: ValidationRule<typeof data>[] = [
    {
      name: 'gesture_valid',
      validate: (value) => !value.gesture || commonValidationRules.gesture('gesture').validate(value.gesture),
      message: 'gesture muss einen gültigen Gestennamen enthalten',
      severity: 'error'
    },
    {
      name: 'confidence_valid',
      validate: (value) =>
        value.confidence === undefined || commonValidationRules.confidence('confidence').validate(value.confidence),
      message: 'confidence muss eine Zahl zwischen 0 und 1 sein',
      severity: 'error'
    },
    {
      name: 'landmarks_valid',
      validate: (value) => !value.landmarks || commonValidationRules.landmarkData('landmarks').validate(value.landmarks),
      message: 'Landmarks müssen gültig sein, wenn sie angegeben werden',
      severity: 'warning'
    },
    {
      name: 'timestamp_valid',
      validate: (value) =>
        value.timestamp === undefined || commonValidationRules.number('timestamp', 0).validate(value.timestamp),
      message: 'timestamp muss eine Zahl >= 0 sein',
      severity: 'error'
    }
  ];

  return validateWithRules(data, rules, 'gesture_data');
}

/**
 * Validates API response data
 */
export function validateApiResponse<T>(
  data: T,
  requiredFields: (keyof T)[],
  fieldValidators: Partial<Record<keyof T, ValidationRule<unknown>>> = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields when data is an object
  if (data && typeof data === 'object') {
    for (const field of requiredFields) {
      const present = (data as Record<string, unknown>)[field as string] !== undefined;
      if (!present) {
        errors.push(`Required field '${String(field)}' is missing`);
      }
    }
  }

  // Validate individual fields
  for (const [field, validator] of Object.entries(fieldValidators) as [keyof T, ValidationRule<unknown>][]) {
    if (data && typeof data === 'object' && (data as Record<string, unknown>)[field as string] !== undefined) {
      const fieldValue = (data as Record<string, unknown>)[field as string];
      const result = validator.validate(fieldValue);

      if (!result) {
        const message = `${String(field)}: ${validator.message}`;
        if (validator.severity === 'error') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

/**
 * Validates training sample data
 */
export function validateTrainingSample(sample: {
  gestureId?: string;
  landmarkData?: unknown;
  frameMetadata?: unknown;
}): ValidationResult {
  const rules: ValidationRule<typeof sample>[] = [
    {
      name: 'gestureId_required',
      validate: (value) => value.gestureId !== undefined && value.gestureId !== '',
      message: 'gestureId ist erforderlich',
      severity: 'error'
    },
    {
      name: 'gestureId_valid',
      validate: (value) => !value.gestureId || commonValidationRules.gesture('gestureId').validate(value.gestureId),
      message: 'gestureId muss ein gültiger Gestenname sein',
      severity: 'error'
    },
    {
      name: 'landmarkData_required',
      validate: (value) => value.landmarkData !== undefined,
      message: 'landmarkData ist erforderlich',
      severity: 'error'
    },
    {
      name: 'landmarkData_valid',
      validate: (value) =>
        !value.landmarkData || commonValidationRules.landmarkData('landmarkData').validate(value.landmarkData),
      message: 'landmarkData muss gültige Landmarken-Daten enthalten',
      severity: 'error'
    },
    {
      name: 'frameMetadata_valid',
      validate: (value) => !value.frameMetadata || commonValidationRules.object('frameMetadata').validate(value.frameMetadata as object),
      message: 'Frame-Metadaten müssen ein gültiges Objekt sein, falls angegeben',
      severity: 'warning'
    }
  ];

  return validateWithRules(sample, rules, 'training_sample');
}

/**
 * Validates profile data
 */
export function validateProfile(profile: {
  id?: string;
  name?: string;
  settings?: unknown;
}): ValidationResult {
  const rules: ValidationRule<typeof profile>[] = [
    {
      name: 'id_required',
      validate: (value) => value.id !== undefined && value.id !== '',
      message: 'id ist erforderlich',
      severity: 'error'
    },
    {
      name: 'id_valid',
      validate: (value) => !value.id || commonValidationRules.string('id', 1, 50).validate(value.id),
      message: 'id muss eine Zeichenkette mit 1 bis 50 Zeichen sein',
      severity: 'error'
    },
    {
      name: 'name_required',
      validate: (value) => value.name !== undefined && value.name !== '',
      message: 'name ist erforderlich',
      severity: 'error'
    },
    {
      name: 'name_valid',
      validate: (value) => !value.name || commonValidationRules.string('name', 1, 100).validate(value.name),
      message: 'name muss eine Zeichenkette mit 1 bis 100 Zeichen sein',
      severity: 'error'
    },
    {
      name: 'settings_valid',
      validate: (value) => !value.settings || commonValidationRules.object('settings').validate(value.settings as object),
      message: 'Settings müssen ein gültiges Objekt sein, falls angegeben',
      severity: 'warning'
    }
  ];

  return validateWithRules(profile, rules, 'profile');
}
