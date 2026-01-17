"""
Chord Converter Script
Converts between different chord notation formats
"""

from typing import Dict, List


# Chord mappings for different notations
ROMAN_TO_SEMITONES = {
    'I': 0, 'ii': 2, 'iii': 4, 'IV': 5, 'V': 7, 'vi': 9, 'vii°': 11,
    'I maj7': 0, 'ii min7': 2, 'iii min7': 4, 'IV maj7': 5, 'V7': 7, 'vi min7': 9
}

CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

CHORD_INTERVALS = {
    # Major chords
    'maj': [0, 4, 7],
    'M': [0, 4, 7],
    # Minor chords
    'min': [0, 3, 7],
    'm': [0, 3, 7],
    # Dominant 7th
    '7': [0, 4, 7, 10],
    # Major 7th
    'maj7': [0, 4, 7, 11],
    'M7': [0, 4, 7, 11],
    # Minor 7th
    'min7': [0, 3, 7, 10],
    'm7': [0, 3, 7, 10],
    # Diminished
    'dim': [0, 3, 6],
    '°': [0, 3, 6],
    # Augmented
    'aug': [0, 4, 8],
    '+': [0, 4, 8],
    # Suspended
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
}


def parse_chord(chord: str) -> Dict:
    """
    Parse a chord string to extract root note and chord type
    
    Args:
        chord: Chord string (e.g., 'Cmaj7', 'F#min', 'Gsus4')
        
    Returns:
        Dictionary with root, chord_type, intervals, and notes
    """
    chord = chord.strip()
    
    # Extract root note (first 1-2 characters)
    root = chord[0]
    if len(chord) > 1 and chord[1] in ['#', 'b']:
        root = chord[:2]
    
    # Get chord type (remaining part)
    chord_type = chord[len(root):].strip()
    if not chord_type:
        chord_type = 'maj'  # Default to major
    
    # Get intervals for this chord type
    intervals = CHORD_INTERVALS.get(chord_type, [0, 4, 7])
    
    # Find root index in chromatic scale
    if root.upper() not in CHROMATIC_SCALE:
        return {"error": f"Unknown root note: {root}"}
    
    root_idx = CHROMATIC_SCALE.index(root.upper())
    
    # Calculate chord notes
    notes = [CHROMATIC_SCALE[(root_idx + interval) % 12] for interval in intervals]
    
    return {
        "root": root.upper(),
        "chord_type": chord_type,
        "intervals": intervals,
        "notes": notes,
        "semitones": [root_idx + i for i in intervals]
    }


def convert_chord(chord_input: str, output_format: str = 'notes') -> Dict:
    """
    Convert chord between different formats
    
    Args:
        chord_input: Input chord (e.g., 'Cmaj7')
        output_format: Output format - 'notes', 'degrees', 'intervals'
        
    Returns:
        Dictionary with converted chord information
    """
    try:
        parsed = parse_chord(chord_input)
        
        if "error" in parsed:
            return parsed
        
        root = parsed['root']
        intervals = parsed['intervals']
        notes = parsed['notes']
        chord_type = parsed['chord_type']
        
        result = {
            "input": chord_input,
            "root": root,
            "chord_type": chord_type,
            "standard_notation": f"{root}{chord_type}",
            "notes": notes,
            "intervals": intervals
        }
        
        if output_format == 'intervals':
            result['as_intervals'] = [f"+{i}" if i > 0 else "root" for i in intervals]
        
        elif output_format == 'degrees':
            # Roman numeral representation
            result['as_roman'] = chord_type  # Simplified
        
        return result
        
    except Exception as e:
        return {"error": str(e)}


def get_chord_variations(root: str, chord_type: str = 'maj') -> Dict:
    """
    Get variations of a chord (inversions, extensions, etc.)
    
    Args:
        root: Root note (e.g., 'C')
        chord_type: Chord type (e.g., 'maj', 'min7')
        
    Returns:
        Dictionary with chord variations
    """
    try:
        chord = f"{root}{chord_type}"
        parsed = parse_chord(chord)
        
        if "error" in parsed:
            return parsed
        
        notes = parsed['notes']
        
        # Root position
        root_pos = {'notation': f"{root}{chord_type}", 'notes': notes}
        
        # First inversion
        first_inv = {'notation': f"{root}{chord_type}/{notes[1]}", 'notes': [notes[1], notes[2], notes[0]]}
        
        # Second inversion (if 3+ notes)
        variations = {'root_position': root_pos, 'first_inversion': first_inv}
        if len(notes) >= 3:
            second_inv = {'notation': f"{root}{chord_type}/{notes[2]}", 'notes': [notes[2], notes[0], notes[1]]}
            variations['second_inversion'] = second_inv
        
        return variations
        
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        chord = sys.argv[1]
        result = convert_chord(chord)
        print(result)
