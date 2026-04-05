import { FEATURE_SCHEMA, HAND_LANDMARKS_PER_HAND } from "./featureSchema.js";

type HandFeatureContractSchema = {
	version: string;
	normalization: string;
	handOrder: string[];
	missingHandStrategy: string;
	vectorLength: number;
};

const rawHandContract = FEATURE_SCHEMA.handFeatureContract as HandFeatureContractSchema | undefined;

if (
	!rawHandContract ||
	typeof rawHandContract.version !== "string" ||
	typeof rawHandContract.normalization !== "string" ||
	!Array.isArray(rawHandContract.handOrder) ||
	typeof rawHandContract.missingHandStrategy !== "string" ||
	typeof rawHandContract.vectorLength !== "number"
) {
	throw new Error("spec/feature_schema.json missing valid handFeatureContract");
}

export const HAND_FEATURE_CONTRACT_VERSION = rawHandContract.version;
export const HAND_FEATURE_NORMALIZATION = rawHandContract.normalization;
export const HAND_FEATURE_HAND_ORDER = Object.freeze(
	rawHandContract.handOrder.map((entry) => String(entry)),
);
export const HAND_FEATURE_MISSING_HAND_STRATEGY = rawHandContract.missingHandStrategy;
export const HAND_FEATURE_VECTOR_LENGTH = rawHandContract.vectorLength;
export const HAND_FEATURE_COORDINATES_PER_POINT = FEATURE_SCHEMA.coordinatesPerLandmark;
export const HAND_FEATURE_POINTS_PER_HAND = HAND_LANDMARKS_PER_HAND;
