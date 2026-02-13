/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export var ProjectType;
(function (ProjectType) {
    ProjectType["FICTION"] = "fiction";
    ProjectType["NON_FICTION"] = "non-fiction";
    ProjectType["DND_ADVENTURE"] = "dnd-adventure";
    ProjectType["DND_HOMEBREW"] = "dnd-homebrew";
    ProjectType["HEALTH_ADVICE"] = "health-advice";
    ProjectType["RESEARCH"] = "research";
})(ProjectType || (ProjectType = {}));
export var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["DRAFT"] = "draft";
    ProjectStatus["IN_PROGRESS"] = "in-progress";
    ProjectStatus["REVIEW"] = "review";
    ProjectStatus["COMPLETED"] = "completed";
    ProjectStatus["PUBLISHED"] = "published";
})(ProjectStatus || (ProjectStatus = {}));
export var ContentType;
(function (ContentType) {
    ContentType["TEXT"] = "text";
    ContentType["OUTLINE"] = "outline";
    ContentType["CHAPTER"] = "chapter";
    ContentType["SECTION"] = "section";
    ContentType["CHARACTER"] = "character";
    ContentType["LOCATION"] = "location";
    ContentType["ITEM"] = "item";
    ContentType["STAT_BLOCK"] = "stat-block";
    ContentType["FACT"] = "fact";
    ContentType["STORY_ARC"] = "story-arc";
    ContentType["MONSTER"] = "monster";
})(ContentType || (ContentType = {}));
export var PromptCategory;
(function (PromptCategory) {
    PromptCategory["CREATIVE_WRITING"] = "creative-writing";
    PromptCategory["FACT_CHECKING"] = "fact-checking";
    PromptCategory["RESEARCH"] = "research";
    PromptCategory["DND_CONTENT"] = "dnd-content";
    PromptCategory["EDITING"] = "editing";
    PromptCategory["FORMATTING"] = "formatting";
})(PromptCategory || (PromptCategory = {}));
export var FactCheckStatus;
(function (FactCheckStatus) {
    FactCheckStatus["PENDING"] = "pending";
    FactCheckStatus["VERIFIED"] = "verified";
    FactCheckStatus["DISPUTED"] = "disputed";
    FactCheckStatus["NEEDS_REVIEW"] = "needs-review";
})(FactCheckStatus || (FactCheckStatus = {}));
export var SourceType;
(function (SourceType) {
    SourceType["ACADEMIC"] = "academic";
    SourceType["NEWS"] = "news";
    SourceType["GOVERNMENT"] = "government";
    SourceType["EXPERT"] = "expert";
    SourceType["WIKI"] = "wiki";
    SourceType["OTHER"] = "other";
})(SourceType || (SourceType = {}));
