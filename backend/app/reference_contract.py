from pydantic import BaseModel, Field


class DocumentationSearch(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=4, ge=1, le=8)


class TemplatePreview(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    template_id: str = Field(min_length=1, max_length=80)
