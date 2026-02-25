import importlib

import pytest


@pytest.fixture
def module():
    return importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))


class TestNormalizeTrainingLabel:
    """Verify that trailing UUID suffixes are stripped from training labels."""

    def test_plain_label_unchanged(self, module):
        assert module.normalize_training_label("Trinken") == "trinken"

    def test_strips_trailing_uuid_with_hyphen(self, module):
        label = "Trinken-05d6e861-36e0-4ca2-91f1-e6d9bf591726"
        assert module.normalize_training_label(label) == "trinken"

    def test_strips_trailing_uuid_with_underscore(self, module):
        label = "Blau_05d6e861-36e0-4ca2-91f1-e6d9bf591726"
        assert module.normalize_training_label(label) == "blau"

    def test_strips_uppercase_uuid(self, module):
        label = "Rot-05D6E861-36E0-4CA2-91F1-E6D9BF591726"
        assert module.normalize_training_label(label) == "rot"

    def test_preserves_label_with_hyphens_no_uuid(self, module):
        assert module.normalize_training_label("mein-zeichen") == "mein-zeichen"

    def test_whitespace_trimmed(self, module):
        assert module.normalize_training_label("  Hallo  ") == "hallo"

    def test_multiple_spaces_collapsed(self, module):
        assert module.normalize_training_label("Zwei  Wörter") == "zwei wörter"

    def test_empty_label(self, module):
        assert module.normalize_training_label("") == ""

    def test_uuid_only_stripped_at_end(self, module):
        # A UUID in the middle should not be stripped
        label = "05d6e861-36e0-4ca2-91f1-e6d9bf591726-Trinken"
        assert module.normalize_training_label(label) == label.lower()

    def test_nfkc_normalization(self, module):
        # Fullwidth A → ASCII A via NFKC
        assert module.normalize_training_label("\uff21bc") == "abc"
