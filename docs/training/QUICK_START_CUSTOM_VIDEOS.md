# Quick Start: Custom Videos for Amy

**Problem:** Amy learned with Kestner but videos are from SignDict → Signs don't match → Recognition fails

**Solution:** Record videos matching Amy's learning

## Fast Track (30 minutes)

### 1. Equipment
- 📱 Phone/tablet
- 💡 Good lighting (window or bright room)
- 🖼️ Plain wall background

### 2. Record (15 min for 10 signs)
```bash
# For each sign:
# - Look up in Kestner app
# - Record Amy's teacher/parent doing the sign
# - 5-10 seconds per video
# - Save as: labelname_custom_0.mp4
```

### 3. Process (10 min)
```bash
cd AmysEcho
cp *.mp4 server/data/dgs_video_examples/
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --split-output
```

### 4. Test (5 min)
- Start server
- Have Amy sign
- Check recognition

## Camera Setup

```
     ┌─────────────┐
     │  Phone/     │  ← 1-2m away
     │  Camera     │  ← Chest height
     └─────────────┘
           ↓
     ┌─────────────┐
     │             │
     │   Signer    │  ← Show full torso,
     │   🙋        │     arms, hands, face
     │             │
     └─────────────┘
           ↓
     ═════════════  ← Plain background
```

## File Naming

✅ Correct:
```
mama_custom_0.mp4
essen_custom_0.mp4
rot_custom_0.mp4
```

❌ Wrong:
```
mama.mp4
MamaVideo.mp4
20240101_mama.mp4
```

## Quality Check

Each video should have:
- ✅ Full body visible (torso, arms, hands, face)
- ✅ Bright, even lighting
- ✅ Plain background
- ✅ Clear hand movements
- ✅ 5-10 seconds long
- ✅ MP4 format

## Priority Signs

Start with these (Amy's most common):
1. mama, papa
2. essen, trinken
3. mehr, fertig
4. ja, nein
5. bitte, danke

## If It Doesn't Work

### Recognition fails?
- Check: Does sign match Kestner exactly?
- Check: Are hands clearly visible?
- Check: Did landmark extraction succeed?

### Video quality issues?
- Better lighting (face the window)
- Plain background (hang a white sheet)
- Steady camera (use a stand/tripod)

### Need help?
See full guides:
- [RECORDING_CUSTOM_VIDEOS.md](RECORDING_CUSTOM_VIDEOS.md) - Detailed recording guide
- [VIDEO_SOURCE_CONSISTENCY.md](VIDEO_SOURCE_CONSISTENCY.md) - Why this matters

## Key Principle

**It's better to have 5 perfect videos matching Amy's learning than 50 mismatched ones.**

Recognition depends on exact sign matching. Take the time to do it right.

## Next Steps

1. **Audit current videos**: Compare to Kestner
2. **Record mismatches**: Replace differing signs
3. **Test with Amy**: Real-world verification
4. **Expand gradually**: Add more signs as Amy learns

## Support

Questions? Check:
- Amy's teacher/therapist for correct signs
- Kestner app for sign demonstrations
- Full documentation in this directory

**Remember: Amy's successful communication is the goal.**
