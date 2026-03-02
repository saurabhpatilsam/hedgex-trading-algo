"""
Utility for generating random funny names for bot runs.
"""
import random
from typing import Optional


def generate_funny_name() -> str:
    """
    Generate a random funny name starting with Max_.
    Returns a name in the format: Max_{Adjective}{Animal}
    """
    adjectives = [
        "Happy", "Speedy", "Clever", "Mighty", "Silent", "Thunder",
        "Golden", "Silver", "Cosmic", "Quantum", "Turbo", "Hyper",
        "Mystic", "Epic", "Savage", "Genius", "Stealth", "Ninja",
        "Laser", "Ultra", "Mega", "Giga", "Nano", "Alpha", "Omega",
        "Cyber", "Digital", "Binary", "Pixel", "Matrix", "Neural",
        "Atomic", "Galactic", "Stellar", "Lunar", "Solar", "Astro",
        "Super", "Magic", "Wonder", "Amazing", "Fantastic", "Incredible",
        "Flying", "Running", "Jumping", "Dancing", "Spinning", "Rolling"
    ]
    
    animals = [
        "Shark", "Eagle", "Tiger", "Lion", "Bear", "Wolf", "Dragon",
        "Phoenix", "Falcon", "Hawk", "Panther", "Cheetah", "Jaguar",
        "Dolphin", "Whale", "Octopus", "Mantis", "Cobra", "Viper",
        "Rhino", "Elephant", "Gorilla", "Monkey", "Penguin", "Owl",
        "Raven", "Crow", "Fox", "Badger", "Wolverine", "Raccoon",
        "Squirrel", "Hamster", "Rabbit", "Kangaroo", "Koala", "Panda",
        "Turtle", "Tortoise", "Gecko", "Iguana", "Chameleon", "Lizard",
        "Spider", "Scorpion", "Beetle", "Ant", "Bee", "Wasp",
        "Butterfly", "Dragonfly", "Firefly", "Platypus", "Narwhal", "Unicorn"
    ]
    
    adjective = random.choice(adjectives)
    animal = random.choice(animals)
    
    return f"Max_{adjective}{animal}"


def get_custom_name(provided_name: Optional[str] = None) -> str:
    """
    Get a custom name for a bot run.
    If provided_name is given, use it.
    Otherwise, generate a funny random name.
    
    Args:
        provided_name: Optional custom name provided by the user
        
    Returns:
        The custom name to use for the run
    """
    if provided_name and provided_name.strip():
        return provided_name.strip()
    return generate_funny_name()
