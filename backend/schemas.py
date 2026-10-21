from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=0, max_length=50)
    password: str = Field(min_length=0, max_length=128)


class SupervisorCreate(BaseModel):
    username: str = Field(min_length=0, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=0, max_length=128)
    display_name: str | None = Field(default=None, max_length=100)
    role: str = Field(default="supervisor", pattern=r"^(supervisor|engineer|admin)$")


class SupervisorUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, min_length=0, max_length=128)
    is_active: bool | None = None
    role: str | None = Field(default=None, pattern=r"^(supervisor|engineer|admin)$")


class EventImprovedUpdate(BaseModel):
    is_improved: bool
