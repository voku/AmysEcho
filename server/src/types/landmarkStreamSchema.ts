import { z } from "zod";

export const LandmarkStreamSchema = z
  .object({
    type: z.literal("landmarks"),
    schemaVersion: z.number().int().min(1),
    timestamp: z.number(),
    landmarks: z.array(z.array(z.array(z.number()).length(3))),
    visibility: z.array(z.array(z.number())),
    handednesses: z.array(z.string()),
    handedness: z.array(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.visibility.length !== value.landmarks.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "visibility must match landmark hand count",
        path: ["visibility"],
      });
    }

    value.landmarks.forEach((hand, index) => {
      const visibilityRow = value.visibility[index];
      if (!visibilityRow) {
        return;
      }
      if (visibilityRow.length !== hand.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "visibility must match landmark point count",
          path: ["visibility", index],
        });
      }
    });
  });

export type LandmarkStreamPayload = z.infer<typeof LandmarkStreamSchema>;
