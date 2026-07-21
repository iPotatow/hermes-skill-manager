"""Business logic for the Hermes Desktop skill manager."""

from .errors import SkillManagerError
from .service import SkillManager

__all__ = ["SkillManager", "SkillManagerError"]
