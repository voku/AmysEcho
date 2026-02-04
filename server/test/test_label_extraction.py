#!/usr/bin/env python3
"""Tests for video filename label extraction in train_mlp.py."""

import pytest
import sys
import os

# Add the amyserver_tools directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'amyserver_tools'))

from train_mlp import extract_base_label_from_video_filename


class TestExtractBaseLabelFromVideoFilename:
    """Tests for extract_base_label_from_video_filename function."""
    
    def test_base_video_with_extension(self):
        """Base videos like 'alle.mp4' should return 'alle'."""
        assert extract_base_label_from_video_filename("alle.mp4") == "alle"
        assert extract_base_label_from_video_filename("blau.mp4") == "blau"
        assert extract_base_label_from_video_filename("trinken.mp4") == "trinken"
    
    def test_base_video_without_extension(self):
        """Base videos without extension should work."""
        assert extract_base_label_from_video_filename("alle") == "alle"
        assert extract_base_label_from_video_filename("gruen") == "gruen"
    
    def test_main_variation_videos(self):
        """Main variation videos like 'alle_main_alle.mp4' should return 'alle'."""
        assert extract_base_label_from_video_filename("alle_main_alle.mp4") == "alle"
        assert extract_base_label_from_video_filename("alle_main_alles") == "alle"
        assert extract_base_label_from_video_filename("alle_main_jeder.mp4") == "alle"
        assert extract_base_label_from_video_filename("trinken_main_wasser.mp4") == "trinken"
        assert extract_base_label_from_video_filename("essen_main_frühstück") == "essen"
    
    def test_variant_videos(self):
        """Variant videos like 'trinken_var_wasser_0.mp4' should return base label."""
        assert extract_base_label_from_video_filename("alle_var_alle_0.mp4") == "alle"
        assert extract_base_label_from_video_filename("trinken_var_wasser_0") == "trinken"
        assert extract_base_label_from_video_filename("trinken_var_wasser_3.mp4") == "trinken"
        assert extract_base_label_from_video_filename("blau_var_blau_1") == "blau"
        assert extract_base_label_from_video_filename("essen_var_hunger_2.mp4") == "essen"
    
    def test_all_baseline_labels(self):
        """All 12 baseline labels should be correctly extracted."""
        baseline_labels = [
            "alle", "blau", "essen", "fertig", "gelb", "gruen",
            "nochmal", "rot", "satt", "schwester", "spielen", "trinken"
        ]
        
        for label in baseline_labels:
            # Base video
            assert extract_base_label_from_video_filename(f"{label}.mp4") == label
            # Main variation
            assert extract_base_label_from_video_filename(f"{label}_main_test.mp4") == label
            # Variant
            assert extract_base_label_from_video_filename(f"{label}_var_test_0.mp4") == label
    
    def test_edge_cases(self):
        """Edge cases should be handled gracefully."""
        # Just underscore
        assert extract_base_label_from_video_filename("test_video") == "test_video"
        # Multiple underscores without main/var pattern
        assert extract_base_label_from_video_filename("some_label_here.mp4") == "some_label_here"
    
    def test_umlauts_in_variants(self):
        """German umlauts in variant names should be handled."""
        assert extract_base_label_from_video_filename("essen_main_frühstück.mp4") == "essen"
        assert extract_base_label_from_video_filename("gruen_main_grün.mp4") == "gruen"
        assert extract_base_label_from_video_filename("trinken_var_getränk_0.mp4") == "trinken"
