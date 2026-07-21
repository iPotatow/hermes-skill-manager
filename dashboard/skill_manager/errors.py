"""Expected domain errors exposed by the HTTP adapter."""


class SkillManagerError(Exception):
    """An operation failure with a stable HTTP status and user-facing detail."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
