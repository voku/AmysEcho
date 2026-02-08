# Creative Commons Licensed DGS Resources

This document catalogs available Deutsche Gebärdensprache (DGS) video resources with open licenses suitable for training data expansion.

## ⚠️ CRITICAL: Video Source Consistency

**Different DGS dictionaries show different sign variations. The training videos MUST match the signs Amy has been taught.**

If Amy learned with **Kestner** (https://www.kestner.app/), the SignDict videos may not match. See **[VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md)** for:
- Why this matters for Amy's communication
- How to record custom videos matching Amy's learning
- How to verify and replace mismatched videos

**Bottom line: Recognition only works if training videos match what Amy learned.**

## Amy First Note

Additional training data from these resources can help Amy learn more signs and improve recognition accuracy. When expanding training data, always prioritize:
1. **Consistency with Amy's learning** - Use the same sign system/variants Amy knows
2. **Core vocabulary first** - Focus on everyday communication needs
3. **Kid-appropriate content** - Signs relevant to children's daily life
4. **Quality over quantity** - Well-recorded videos with clear signing

---

## Available Datasets

### 0. Kestner System (Professional, Paid)

- **Source**: [Kestner App](https://www.kestner.app/)
- **Content**: Over 29,000 professionally standardized DGS signs
- **License**: ⚠️ Commercial/Proprietary - subscription required
- **Status**: ⚠️ Not integrated - no API or bulk download available
- **Notes**:
  - Most comprehensive and professionally curated DGS dictionary
  - Used widely in German schools and therapy
  - **If Amy learned with Kestner, SignDict videos may not match**
  - Videos are copyrighted - no programmatic access
  - For personal use: Screen record from app with valid subscription
  - For bulk use: Contact publisher (info@kestner.de) for licensing
  - **Best solution**: Record custom videos matching Amy's teacher's signing

### 1. SignDict.org (Currently Used)

- **Source**: [SignDict.org](https://signdict.org)
- **Content**: Isolated DGS sign videos, community-contributed
- **License**: Videos are generally under CC licenses (verify per video)
- **Status**: ✅ Currently integrated - base training videos sourced from here
- **Videos**: 126 videos for 12 core labels

---

### 2. Custom Video Sources (Configurable Fallback)

- **Source**: Configurable via `server/data/config/dgsVideoSources.json`
- **Content**: Any publicly accessible DGS video URLs
- **License**: Verify per video source
- **Status**: ✅ Used as fallback when SignDict has no match
- **Notes**:
  - Extensible configuration-based approach
  - Add custom URLs for labels not available on SignDict
  - Useful for testing and offline development
  - Example configuration:
    ```json
    {
      "labels": {
        "kindergarten": {
          "sources": [
            {
              "name": "custom_source",
              "urls": ["https://example.com/kindergarten_sign.mp4"]
            }
          ]
        }
      }
    }
    ```

---

### 3. Hugging Face: sign-language-avatar-gloss-dgs

- **Source**: [fhswf/sign-language-avatar-gloss-dgs](https://huggingface.co/datasets/fhswf/sign-language-avatar-gloss-dgs)
- **Content**: Curated SignDict.org resources with pose estimation data
- **License**: CC BY-NC-SA 4.0 (Creative Commons Attribution-NonCommercial-ShareAlike)
- **Includes**: 
  - Raw video clips
  - Pose estimation data (MediaPipe compatible)
  - Glosses and annotations
- **Status**: 🔍 Recommended for future expansion
- **Notes**: 
  - Non-commercial use only
  - Ideal for research and educational projects like Amy's Echo
  - Pre-processed pose data reduces extraction overhead

---

### 4. DGS-Fabeln-1 Corpus

- **Source**: [Zenodo: DGS-Fabeln-1](https://doi.org/10.5281/zenodo.10822096)
- **Content**: Fairy tales interpreted in DGS by native signer
- **Size**: 573 segments, 1 hour 32 minutes, filmed from 7 angles
- **License**: Research/open access (verify specific terms)
- **Publication**: [LREC 2024](https://aclanthology.org/2024.lrec-main.434)
- **Status**: 🔍 Potential future resource
- **Notes**:
  - Multi-angle recordings excellent for training robustness
  - Connected signs (not isolated) - may require segmentation

---

### 5. DGS-Korpus (Public Access)

- **Source**: [meine-dgs.de](https://meine-dgs.de)
- **Content**: 50+ hours of annotated natural DGS conversations
- **License**: Open access for research
- **Annotations**: ELAN, iLex, SRT formats available
- **Status**: 🔍 Large-scale resource for advanced training
- **Notes**:
  - Very large corpus from 330+ signers across Germany
  - Natural conversations - more complex than isolated signs
  - Would require significant preprocessing

---

### 6. SIGNUM Database

- **Source**: [Phonetik BAS](https://www.phonetik.uni-muenchen.de/Bas/BasSIGNUMdeu.html)
- **Content**: 450 isolated DGS signs, 780 sentences
- **Signers**: 25 different signers
- **Size**: ~55 hours total
- **License**: Free for scientific research
- **Status**: 🔍 Excellent for vocabulary expansion
- **Notes**:
  - Multiple signers provides natural variation
  - Commercial license available for fee
  - Well-documented academic resource

---

## Recommended Expansion Priority

For Amy's Echo, prioritize data expansion in this order:

1. **Hugging Face Dataset** (Immediate)
   - Already processed with pose data
   - Compatible with current pipeline
   - Expands existing SignDict vocabulary

2. **Custom Video Sources** (Short-term)
   - Direct video URLs via dgsVideoSources.json
   - Great fallback for missing labels
   - Easy to configure and test

3. **SIGNUM Database** (Short-term)
   - High-quality isolated signs
   - Multiple signers for robustness
   - Academic standard

4. **DGS-Fabeln-1** (Medium-term)
   - Multi-angle recordings
   - Continuous signing for sequence models

5. **DGS-Korpus** (Long-term)
   - Natural language data
   - Requires more preprocessing

---

## License Compliance Checklist

When adding new training data, ensure:

- [ ] License allows intended use (educational, non-commercial for Amy's Echo)
- [ ] Attribution requirements documented and displayed
- [ ] Source URLs and dataset versions recorded
- [ ] No personal data included without consent
- [ ] Compliance with German data protection laws (GDPR)

---

## Current Training Data Status

| Label | Video Count | Sources |
|-------|-------------|---------|
| alle | 7 | SignDict |
| blau | 6 | SignDict |
| essen | 17 | SignDict |
| fertig | 11 | SignDict |
| gelb | 6 | SignDict |
| gruen | 5 | SignDict |
| nochmal | 7 | SignDict |
| rot | 11 | SignDict |
| satt | 10 | SignDict |
| schwester | 6 | SignDict |
| spielen | 9 | SignDict |
| trinken | 31 | SignDict |
| **Total** | **126** | |

> Note: Additional labels can be added via dgsVideoSources.json configuration.
> The auto-pretrain feature will automatically download and process videos
> from configured custom sources when labels are enabled.

---

## Integration Notes

### Hugging Face Dataset Integration

The Hugging Face dataset includes pose estimation data that could be directly loaded:

```python
from datasets import load_dataset

# Load the dataset (requires accepting license terms)
dataset = load_dataset("fhswf/sign-language-avatar-gloss-dgs")

# Access video clips and pose data
for sample in dataset["train"]:
    video_path = sample["video"]
    pose_data = sample["pose"]
    gloss = sample["gloss"]
```

### Manifest Updates

When adding new videos, update:
1. `server/data/dgs_manifest.json` - Add video entries
2. `server/data/config/defaultBaselineLabels.json` - Add new labels
3. `server/data/config/kid_starter_preset.json` - Update vocabulary if appropriate
4. `server/data/config/dgsVideoSources.json` - Record the source URLs when using
   additional datasets outside SignDict/DW-DGS

---

*Last updated: 2026-02-08*
