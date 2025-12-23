"""
Shared ML utilities for Amy's Echo gesture recognition.
This module provides consistent data preparation and filtering logic
used by both the server training pipeline and local scripts.
"""

from typing import Iterable, List, Optional, TypeVar, Protocol

T = TypeVar("T")

class ProfileSample(Protocol):
    """Protocol for objects that have label and profile_id properties."""
    @property
    def label(self) -> str: ...
    @property
    def profile_id(self) -> Optional[str]: ...

def filter_by_profile_logic(items: List[T], profile_id: str, get_label, get_profile_id) -> List[T]:
    """
    Generic logic to filter samples for a profile-specific model.
    Includes:
    1. All samples explicitly belonging to this profile.
    2. All global samples (no profile_id) whose labels are NOT overridden by this profile.
    """
    profile_items = [i for i in items if get_profile_id(i) == profile_id]
    profile_labels = {get_label(i) for i in profile_items}

    global_items = [
        i for i in items
        if not get_profile_id(i) and get_label(i) not in profile_labels
    ]

    return profile_items + global_items
