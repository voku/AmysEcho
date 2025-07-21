import os
import sys
import types

# Stub tensorflow so load_samples can be imported without heavy deps
sys.modules['tensorflow'] = types.ModuleType('tensorflow')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))
from train import load_samples


def test_load_samples_shapes():
    sample = {'landmarkData': list(range(63)), 'gestureDefinitionId': 'wave'}
    X, y, label_map = load_samples([sample])
    assert X.shape == (1, 30, 63)
    assert y.tolist() == [0]
    assert label_map == {'wave': 0}


def test_load_samples_multiple_labels():
    samples = [
        {'landmarkData': list(range(63)), 'gestureDefinitionId': 'a'},
        {'landmarkData': list(range(63)), 'gestureDefinitionId': 'b'},
    ]
    X, y, label_map = load_samples(samples)
    assert len(label_map) == 2
    assert X.shape == (2, 30, 63)


def test_load_samples_empty():
    try:
        load_samples([])
    except ValueError:
        assert True
    else:
        assert False


def test_load_samples_padding_and_truncation():
    long_seq = list(range(63 * 40))
    short_seq = list(range(63 * 5))
    samples = [
        {'landmarkData': long_seq, 'gestureDefinitionId': 'long'},
        {'landmarkData': short_seq, 'gestureDefinitionId': 'short'},
    ]
    X, y, label_map = load_samples(samples)
    assert X.shape == (2, 30, 63)
    assert label_map == {'long': 0, 'short': 1}
    # second sample should be padded with zeros after frame 5
    assert (X[1, 5:] == 0).all()

def test_load_samples_ignore_invalid():
    samples = [
        {'landmarkData': None, 'gestureDefinitionId': 'bad'},
        {'gestureDefinitionId': 'missing'},
        {'landmarkData': list(range(63)), 'gestureDefinitionId': 'ok'},
    ]
    X, y, label_map = load_samples(samples)
    assert X.shape == (1, 30, 63)
    assert y.tolist() == [0]
    assert label_map == {'ok': 0}
