# Training Documentation for Amy's Echo

This directory contains guides for training Amy's gesture recognition system.

## 🚨 Start Here If You're Having Recognition Issues

**Is Amy signing correctly but the system doesn't recognize it?**

The most common issue is **video source mismatch**:
- Amy learned with Kestner → Videos are from SignDict → Signs don't match
- Solution: Record custom videos matching Amy's learning

**Quick fix (30 min):** [QUICK_START_CUSTOM_VIDEOS.md](QUICK_START_CUSTOM_VIDEOS.md)

## Documentation Overview

### Critical Reading (Start Here)

1. **[VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md)** ⚠️ CRITICAL
   - Why different DGS resources show different signs
   - How this breaks recognition even when Amy signs correctly
   - Three solutions to fix the mismatch

2. **[QUICK_START_CUSTOM_VIDEOS.md](QUICK_START_CUSTOM_VIDEOS.md)** ⚡ QUICK
   - 30-minute fast track to recording custom videos
   - Essential for Kestner users
   - Minimal equipment needed

3. **[RECORDING_CUSTOM_VIDEOS.md](RECORDING_CUSTOM_VIDEOS.md)** 📹 DETAILED
   - Comprehensive guide to recording sign videos
   - Equipment, lighting, camera setup
   - Step-by-step process with examples

### Training Guides

4. **[PER_USER_LABEL_TRAINING.md](PER_USER_LABEL_TRAINING.md)**
   - How Amy's personalized training works
   - User-specific vs server pre-training modes
   - Training workflow and best practices

5. **[DGS_CC_RESOURCES.md](DGS_CC_RESOURCES.md)**
   - Available DGS video resources
   - Kestner, SignDict, and other sources
   - Licensing and copyright information

### Technical Documentation

6. **[README_PRETRAINING.md](../../scripts/README_PRETRAINING.md)**
   - Server-side pre-training pipeline
   - Downloading and processing videos
   - Creating baseline models

## Common Scenarios

### "Amy uses Kestner at school"

**Problem:** SignDict videos don't match Kestner signs
**Solution:** 
1. Record Amy's teacher demonstrating each sign
2. Add custom videos to system
3. See: [QUICK_START_CUSTOM_VIDEOS.md](QUICK_START_CUSTOM_VIDEOS.md)

### "Recognition works sometimes, not always"

**Possible causes:**
1. Video source mismatch (see above)
2. Amy's sign variation (normal, needs more training data)
3. Lighting or camera angle issues
4. Insufficient training data

**Solutions:**
1. Verify signs match training videos exactly
2. Record multiple variants of each sign
3. Add more training examples with Amy

### "Starting from scratch"

**Recommended approach:**
1. Identify Amy's learning source (Kestner, SignDict, school)
2. Record 10-15 core signs matching that source
3. Test recognition with Amy
4. Expand gradually as Amy learns more signs

See: [VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md) for full guidance

### "Want to use SignDict videos as-is"

**When this works:**
- Amy's school/therapist uses SignDict
- Signs match between SignDict and Amy's learning
- Verify each sign before relying on it

**When this doesn't work:**
- Amy learned with Kestner (different variants)
- Regional sign differences
- School uses specialized curriculum

## Key Principles

### 1. Consistency Over Quantity
**Better: 10 videos matching Amy's learning**
**Worse: 100 videos from mismatched source**

### 2. Test With Amy
**The only test that matters is whether Amy can communicate successfully.**

Document reviews and theoretical models are secondary to real-world testing.

### 3. Amy First
**Every decision should prioritize Amy's communication needs.**

- Use her learning system's signs
- Test with her frequently
- Adjust based on her feedback
- Focus on her core vocabulary

## Getting Help

### For Recognition Issues
1. Check [VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md)
2. Compare videos to Amy's learning material
3. Record custom videos if needed

### For Technical Issues
1. Check [PER_USER_LABEL_TRAINING.md](PER_USER_LABEL_TRAINING.md)
2. Review training logs
3. Verify landmark extraction

### For Video Recording
1. See [RECORDING_CUSTOM_VIDEOS.md](RECORDING_CUSTOM_VIDEOS.md)
2. Use quick start guide for basics
3. Test with Amy after recording

## Workflow Summary

```
1. Identify Amy's learning system (Kestner, SignDict, etc.)
                    ↓
2. Audit current videos vs. Amy's learned signs
                    ↓
3. Record custom videos for mismatched signs
                    ↓
4. Process videos to extract landmarks
                    ↓
5. Test recognition with Amy
                    ↓
6. Iterate: Add more videos, adjust as needed
```

## Priority Reading Order

**If Amy learned with Kestner (or system other than SignDict):**
1. [VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md)
2. [QUICK_START_CUSTOM_VIDEOS.md](QUICK_START_CUSTOM_VIDEOS.md)
3. [RECORDING_CUSTOM_VIDEOS.md](RECORDING_CUSTOM_VIDEOS.md)

**If Amy's signs match SignDict:**
1. [PER_USER_LABEL_TRAINING.md](PER_USER_LABEL_TRAINING.md)
2. [DGS_CC_RESOURCES.md](DGS_CC_RESOURCES.md)

**For system setup/maintenance:**
1. [README_PRETRAINING.md](../../scripts/README_PRETRAINING.md)
2. [DGS_CC_RESOURCES.md](DGS_CC_RESOURCES.md)

## Remember

**Amy's successful communication is the only metric that matters.**

All technical decisions should serve that goal. When in doubt, test with Amy and let her communication success guide your choices.
