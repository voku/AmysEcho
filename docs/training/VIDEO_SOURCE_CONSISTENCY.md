# Video Source Consistency: Critical for Amy's Communication

## The Problem

**Different DGS dictionaries and resources show different variations of the same signs.**

Amy's Echo currently uses videos from **SignDict.org**, but if Amy has been learning with the **Kestner system** (https://www.kestner.app/), the signs may be different. This creates a critical problem:

- ❌ Amy learns one sign variant at home/school (Kestner)
- ❌ The training model expects a different variant (SignDict)
- ❌ Recognition fails even though Amy signs correctly
- ❌ Amy gets frustrated and communication breaks down

## Why This Happens

DGS (Deutsche Gebärdensprache) has **regional variations** and different **signing styles**:
- Different dictionaries may show different preferred variants
- Kestner uses professionally standardized signs
- SignDict is community-contributed with more variation
- Both are valid DGS, but consistency matters for recognition

## The Solution

### 🎯 Critical Rule: Match Amy's Learning Source

**The training videos MUST match the sign system Amy is learning with.**

If Amy learns with Kestner → Use Kestner-compatible videos
If Amy learns with SignDict → Use SignDict videos
If Amy learns at school → Use videos matching their teaching material

### Option 1: Record Custom Videos (Recommended)

The most reliable solution is to **record videos of the exact signs Amy is learning**:

1. **Have Amy's teacher/therapist demonstrate** each sign
2. **Record short videos** (5-10 seconds each) on a phone/tablet
3. **Add videos to the system** using the custom video workflow

**Advantages:**
- ✅ Perfect match to what Amy learns
- ✅ Same person/style Amy recognizes
- ✅ No copyright issues
- ✅ Can update as Amy learns new signs

**How to add custom videos:**
```bash
# 1. Place video files in: server/data/dgs_video_examples/
#    Name format: labelname_custom_0.mp4

# 2. Process to extract landmarks:
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --split-output \
  --labels labelname

# 3. Commit both .mp4 and _landmarks.json files
```

### Option 2: Use Kestner App Manually

If Amy's family has a Kestner subscription:

1. **Look up each sign** in the Kestner app
2. **Screen record** the video demonstration
3. **Extract the video file** from the recording
4. **Add to the system** as custom videos (see Option 1)

**Note:** Kestner videos are copyrighted. Only use for personal/educational use with a valid subscription.

### Option 3: Mixed Approach

For signs where SignDict matches what Amy knows:
- ✅ Keep the SignDict videos
- ✅ Faster, no recording needed

For signs where they differ:
- ✅ Replace with custom recordings
- ✅ Use dgsVideoSources.json to add custom URLs

## How to Configure Custom Video Sources

Edit `server/data/config/dgsVideoSources.json`:

```json
{
  "version": "1.0",
  "description": "Custom video sources matching Amy's learning system",
  "labels": {
    "mama": {
      "sources": [
        {
          "name": "amy_custom",
          "urls": [
            "file:///path/to/mama_custom.mp4"
          ]
        }
      ]
    }
  }
}
```

Or place videos directly in `server/data/dgs_video_examples/` with proper naming.

## Verifying Consistency

**Before training, verify each sign:**

1. Have Amy demonstrate the sign
2. Compare to the training video
3. If they match → Good!
4. If they differ → Replace the video

**Testing recognition:**
1. Amy signs a label
2. System should recognize it
3. If not recognized → Video mismatch likely

## Amy First Principle

**Consistency trumps everything else.**

It's better to have 10 perfectly matching videos than 100 mismatched ones. Amy's communication depends on the system recognizing the exact signs she's been taught.

## Action Items

- [ ] Identify which sign system Amy uses (Kestner, SignDict, school curriculum)
- [ ] Audit current videos against Amy's known signs
- [ ] Record/source replacement videos where needed
- [ ] Document the source system in labelMetadata.json
- [ ] Test recognition with Amy's actual signing

## Resources

- **Kestner App**: https://www.kestner.app/ (paid subscription)
- **SignDict**: https://signdict.org (free, community-driven)
- **Recording Setup**: Any smartphone/tablet camera
- **Video Format**: MP4, 720p or higher, well-lit, clear view of hands/body

## Contact

For questions about video sources or Amy's specific needs, coordinate with:
- Amy's sign language teacher/therapist
- Amy's parents/caregivers
- The person who trained Amy initially

**Remember: Amy's successful communication is the only metric that matters.**
