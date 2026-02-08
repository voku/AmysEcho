# Recording Custom Sign Videos for Amy

This guide explains how to record custom sign language videos that match exactly what Amy has learned.

## Why Record Custom Videos?

**The training videos must match Amy's learned signs exactly.**

If Amy learned with Kestner, SignDict, or her school's curriculum, the default videos may use different sign variants. Custom videos ensure perfect matching.

## Equipment Needed

### Minimal Setup
- 📱 **Smartphone or tablet** (any modern device)
- 💡 **Good lighting** (natural daylight or bright room lights)
- 📐 **Plain background** (wall, sheet, or solid color)
- 🎤 **Built-in microphone** (audio not critical but helpful)

### Optional Improvements
- 📹 Tripod or phone stand (for stability)
- 🎬 Better camera (DSLR, webcam with good resolution)
- 🔆 Ring light or softbox (for consistent lighting)

## Recording Guidelines

### Camera Setup

**Position:**
- Camera at **chest height** of the signer
- **1-2 meters** distance from signer
- Frame should show: **full torso, arms, hands, and face**
- Keep camera **steady** (use tripod if possible)

**Settings:**
- **Resolution**: 720p minimum, 1080p preferred
- **Frame rate**: 30 FPS minimum
- **Orientation**: Landscape (horizontal)
- **Format**: MP4 (H.264 codec)

### Lighting

- **Face the light source** - don't have light behind the signer
- **Avoid shadows** on hands and body
- **Consistent lighting** - same setup for all videos
- **Natural daylight** from a window works great

### Background

- **Plain, solid color** (white, light gray, or light blue)
- **Contrasting with skin tone** for hand visibility
- **No distractions** - remove objects, patterns, or people
- **Consistent** - same background for all signs

### Signer Guidelines

**Who should sign:**
- ✅ **Amy's teacher/therapist** (best - Amy knows their signing)
- ✅ **Parent/caregiver** who taught Amy
- ✅ **Amy herself** (if she can perform consistently)
- ⚠️ Someone who knows the Kestner/school system Amy uses

**How to sign:**
- **Clear, deliberate movements** (slower than conversation)
- **Full range of motion** (don't abbreviate)
- **Neutral expression** first, then can add emotion
- **Consistent performance** - do 3-5 takes per sign
- **Pause** 1 second before and after the sign
- **Face the camera** with hands visible

### Video Duration

- **5-10 seconds** per video
- **1-2 seconds** of neutral position
- **2-4 seconds** performing the sign
- **1-2 seconds** returning to neutral
- **Can repeat** the sign 2-3 times in one video

## Recording Process

### 1. Preparation

```bash
# Create a list of signs to record
echo "mama" > signs_to_record.txt
echo "papa" >> signs_to_record.txt
echo "essen" >> signs_to_record.txt
# ... add all signs Amy uses
```

**Check each sign** in Amy's learning resource (Kestner app, school materials) before recording.

### 2. Recording Session

**For each sign:**

1. **Review** the sign in Amy's learning system
2. **Practice** 2-3 times to get it right
3. **Record** 3-5 takes
4. **Review** immediately - check framing, lighting, clarity
5. **Select best take** or keep multiple variants

**Tips:**
- Record in batches (10-15 signs per session)
- Take breaks to maintain quality
- Keep a log of which signs are done
- Label files immediately while you remember

### 3. File Naming

Name files consistently:
```
labelname_custom_0.mp4
labelname_custom_1.mp4
labelname_custom_2.mp4
```

Examples:
```
mama_custom_0.mp4
essen_custom_0.mp4
rot_custom_0.mp4
```

The `_custom_0` part is important for the system to recognize them.

## Adding Videos to Amy's Echo

### Step 1: Transfer Files

Copy video files to the videos directory:

```bash
# On your computer
cp mama_custom_0.mp4 /path/to/AmysEcho/server/data/dgs_video_examples/
cp essen_custom_0.mp4 /path/to/AmysEcho/server/data/dgs_video_examples/
# ... copy all videos
```

### Step 2: Extract Landmarks

Process videos to extract hand/pose landmarks:

```bash
cd /path/to/AmysEcho

# Process all custom videos
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --split-output \
  --max-frames 150

# Or process just one label
python3 scripts/process_dgs_videos.py \
  --videos-dir server/data/dgs_video_examples \
  --models-dir server/data/models \
  --split-output \
  --labels mama
```

This creates `labelname_custom_0_landmarks.json` files with the pose data.

### Step 3: Update Manifest

The processing script updates the manifest automatically. Verify:

```bash
# Check that your labels are listed
cat server/data/dgs_manifest.json | grep "mama"
```

### Step 4: Test Recognition

1. Start the server
2. Enable the label for Amy's profile
3. Have Amy perform the sign
4. Check if it recognizes correctly

If recognition fails, check:
- ✅ Video quality (lighting, framing)
- ✅ Sign performance (clear, consistent)
- ✅ Landmark extraction (check the JSON file)

## Quality Checklist

Before using a video, verify:

- [ ] **Framing**: Full torso, arms, hands, face visible
- [ ] **Lighting**: Even, no harsh shadows
- [ ] **Background**: Plain, contrasting, no distractions
- [ ] **Focus**: Sharp, not blurry
- [ ] **Sign clarity**: Full, clear movements
- [ ] **Duration**: 5-10 seconds
- [ ] **File format**: MP4, 720p+
- [ ] **Filename**: Correct pattern (labelname_custom_0.mp4)

## Multiple Variants

Recording 3-5 different takes per sign improves recognition:

```
mama_custom_0.mp4  # First take
mama_custom_1.mp4  # Second take (slightly different angle)
mama_custom_2.mp4  # Third take (different speed)
```

The model trains on all variants, making it more robust.

## Replacing Existing Videos

To replace SignDict videos with custom ones:

1. Keep both initially (for comparison)
2. Test recognition with Amy
3. If custom works better, remove SignDict versions
4. Or keep both for more training data

## Troubleshooting

### "Landmark extraction failed"
- Check video quality and lighting
- Ensure hands are fully visible
- Try re-recording with clearer movements

### "Recognition doesn't improve"
- Verify sign matches what Amy learned
- Check if Amy performs the sign consistently
- May need more training data (more videos)

### "Video file too large"
- Compress video (keep quality high enough)
- Shorter duration (5-7 seconds)
- Use H.264 codec with reasonable bitrate

## Best Practices

1. **Batch recording**: Do 10-15 signs per session
2. **Consistency**: Same lighting, background, signer
3. **Quality over quantity**: 3 good videos > 10 poor ones
4. **Test often**: Verify recognition after adding videos
5. **Document**: Keep notes on which system/variant used
6. **Backup**: Keep original recordings safe

## Example Recording Script

```bash
#!/bin/bash
# Record all custom signs for Amy

SIGNS="mama papa essen trinken rot blau gelb"
OUTPUT_DIR="./custom_signs"

mkdir -p $OUTPUT_DIR

echo "Recording custom signs for Amy"
echo "Press Enter after each sign is recorded..."

for sign in $SIGNS; do
  echo ""
  echo "=== Recording: $sign ==="
  echo "1. Check sign in Kestner app"
  echo "2. Practice 2-3 times"
  echo "3. Press Enter to record (3 takes)"
  read
  
  for i in 0 1 2; do
    echo "Recording take $i for $sign..."
    # Your recording command here (e.g., using ffmpeg, screen record, etc.)
    # mv recording.mp4 "$OUTPUT_DIR/${sign}_custom_${i}.mp4"
  done
  
  echo "✓ Completed $sign"
done

echo ""
echo "All signs recorded!"
echo "Next steps:"
echo "1. Copy files to server/data/dgs_video_examples/"
echo "2. Run process_dgs_videos.py"
echo "3. Test with Amy"
```

## Support

For help with recording or integration:
- Review Amy's learning materials
- Consult Amy's teacher/therapist
- Test with Amy frequently
- Document what works

**Remember: The goal is Amy's successful communication, not perfect video production.**
