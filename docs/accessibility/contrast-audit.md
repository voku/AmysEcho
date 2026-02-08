# Contrast Audit

This audit documents the contrast defects identified while addressing recent caregiver feedback and the associated fixes. Ratios are calculated with the WCAG 2.1 contrast algorithm (normal text requires ≥ 4.5:1).

| UI area | Before (fg / bg) | Ratio | After (fg / bg) | Ratio |
| --- | --- | --- | --- | --- |
| Timeline badges (completed steps) | `#FCFEFE` on `#46C49D` | 2.15:1 | `#0D3A3D` on `#46C49D` | 5.71:1 |
| Hero primary CTAs (disabled state via PrimaryButton) | `#FCFEFE` on `#FF8A5B` | 2.30:1 | `#14363A` on `#FF8A5B` | 5.58:1 |
| Admin cancel button (CorrectionPanel) | `#FCFEFE` on `#FF8A5B` | 2.30:1 | `#14363A` on `#FF8A5B` | 5.58:1 |
| Confidence badge (CorrectionPanel) | `#FCFEFE` on `#46C49D` | 2.15:1 | `#0D3A3D` on `#46C49D` | 5.71:1 |
| Recommended label (CorrectionPanel) | `#46C49D` on `#FFFFFF` | 2.18:1 | `#0F5257` on `#FFFFFF` | 8.77:1 |
| Visual feedback toast – success | `#FCFEFE` on `#46C49D` | 2.15:1 | `#0D3A3D` on `#46C49D` | 5.71:1 |
| Visual feedback toast – warning | `#FCFEFE` on `#E3B13C` | 1.98:1 | `#0D3A3D` on `#E3B13C` | 6.29:1 |
| Visual feedback toast – error | `#FCFEFE` on `#DC5B57` | 3.70:1 | `#000000` on `#DC5B57` | 5.68:1 |
| Secondary accent buttons (Recording, Training, Learning CTA states) | `#FCFEFE` on `#FF8A5B` | 2.30:1 | `#14363A` on `#FF8A5B` | 5.58:1 |
| GestureMeaningSelector active button | `#FCFEFE` on `#FF8A5B` | 2.30:1 | `#14363A` on `#FF8A5B` | 5.58:1 |
| Progress tracker completion message | `#46C49D` on `#FFFFFF` | 2.18:1 | `#0F5257` on `#FFFFFF` | 8.77:1 |
| Teaching screen “Weiter üben” secondary action | `#14363A` on `#05363A` | 1.01:1 | `#FCFEFE` on `#05363A` | 13.01:1 |
| Training recorder detector notice (info state) | `#0D1B1B` on `#14474A` | 1.71:1 | `#0D1B1B` on `#F8FAFC` | 16.87:1 |

The updated palette keeps contrast-compliant text colors co-located in the relevant components so future changes inherit the improved accessibility defaults.

Note: The detector notice ratio used the blended background of the translucent info tint over the dark detector surface (`rgba(47, 142, 162, 0.15)` on `#0F3A3B` ≈ `#14474A`).
